import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { fmtDue } from "@/lib/format";
import { errorMessage, logSystem } from "@/lib/log";
import { notifyNewTodo, siteOriginForPreview } from "@/lib/mail/notify";

/**
 * 行動(Todo)を新しく登録したことをチャット(設定画面「新着メールの通知」の通知先で「行動(Todo)の登録も通知する」がオンのもの)へ知らせる(0042)。
 * 行動を登録する Server Action(addActivity / addInquiryActivity、アポイント日時からの自動登録)から呼ぶ。
 * 画面の応答を待たせないよう after() で送り、失敗しても登録は止めない(記録だけ残す)。
 * 対象は未完了の行動だけ(「済んだ行動として記録する」は通知しない)。編集・担当者変更・完了は通知しない。
 * 通知先のアカウント指定(「○○ のみ」)は新着メールと同じく見る: 付け先の問い合わせ・案件に紐付くメール、それも無ければ取引先のメールの
 * アカウントを調べ、そのアカウントの通知先と「すべてのアカウント」の通知先にだけ送る。取引先にもメールが無くアカウントが決まらないときは全部に送る。
 * 結果は成功・失敗・送り先なしのどれも system_logs(source=todo.notify)に残し、設定 → ログ で「届いたはずか」を後から確かめられるようにする。
 */
export function notifyTodoCreated(
  db: SupabaseClient,
  a: {
    dealId: string | null;
    inquiryId: string | null;
    kindId: string;
    body: string;
    dueAt: string | null;
    ownerId: string | null;
    actorUserId: string | null | undefined;
  },
): void {
  after(async () => {
    try {
      // 通知先が 1 つも無ければ何も引かずに終わる(ほとんどのテナントはここで終わる)
      const { count } = await db.from("mail_notifications").select("id", { count: "exact", head: true }).eq("is_active", true).eq("notify_todo", true);
      if (!count) return;

      const [{ data: kind }, owner, actorName, target, accountIds] = await Promise.all([
        db.from("activity_kinds").select("name").eq("id", a.kindId).maybeSingle(),
        a.ownerId
          ? db.from("members").select("name, lark_user_id").eq("id", a.ownerId).maybeSingle().then((r) => r.data as { name: string; lark_user_id: string | null } | null)
          : Promise.resolve(null),
        actorNameOf(db, a.actorUserId),
        targetOf(db, a),
        accountIdsOf(db, a),
      ]);
      const result = await notifyNewTodo(db, {
        kindName: (kind?.name as string | null) ?? null,
        body: a.body,
        due: a.dueAt ? fmtDue(a.dueAt) : null,
        ownerName: owner?.name ?? null,
        ownerLarkId: owner?.lark_user_id ?? null,
        actorName,
        target: target.label,
        companyName: target.companyName,
        url: `${siteOriginForPreview()}${target.path}`,
      }, accountIds);
      if (result.sent === 0 && result.failed === 0) {
        // 通知先はあるのに、付け先のメールアカウントに合う通知先が 1 つも無い(例: 通知先の無いアカウントの問い合わせ)。黙って終わらず残す
        await logSystem({
          level: "warn",
          source: "todo.notify",
          message: `行動(Todo)の通知を送る先がありませんでした: 付け先のメールアカウントに合う通知先が無いため(${result.skipped.join("、") || "通知先なし"} は別のアカウント指定)。そのアカウントの通知先か「すべてのアカウント」の通知先を設定してください`,
          detail: { accountIds, target: target.label, body: a.body.slice(0, 80), owner: owner?.name ?? null },
          notify: false,
        }, db);
      }
    } catch (e) {
      // ここで落ちると画面には何も出ないので、設定 → ログ で気づけるように残す
      await logSystem({ level: "warn", source: "todo.notify", message: `行動(Todo)の通知の処理に失敗しました: ${errorMessage(e)}`, detail: { dealId: a.dealId, inquiryId: a.inquiryId, body: a.body.slice(0, 80) }, notify: false }, db);
    }
  });
}

async function actorNameOf(db: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: member } = await db.from("members").select("name").eq("profile_id", userId).maybeSingle();
  if (member?.name) return member.name as string;
  const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return (profile?.full_name as string | null) || (profile?.email as string | null)?.split("@")[0] || null;
}

/**
 * 付け先のアカウント(重複なし)。案件の Todo は案件に持たせたメールアカウント(deals.account_id、0044)で決める。
 * 無ければ(古い案件など)問い合わせの Todo はその問い合わせのメール、案件の Todo は案件に紐付くメール → 案件の元の問い合わせのメールから引き、
 * どこにもメールが無ければ付け先の取引先に届いた・送ったメールのアカウントで代える(取引先にもメールが無ければ空 = 全部の通知先に送る)
 */
async function accountIdsOf(db: SupabaseClient, a: { dealId: string | null; inquiryId: string | null }): Promise<string[]> {
  const fromEmails = async (column: "inquiry_id" | "deal_id" | "company_id", id: string): Promise<string[]> => {
    const { data } = await db.from("emails").select("account_id").eq(column, id).not("account_id", "is", null).order("received_at", { ascending: false }).limit(200);
    return Array.from(new Set((data ?? []).map((r) => r.account_id as string)));
  };
  let companyId: string | null = null;
  if (a.dealId) {
    const { data: deal } = await db.from("deals").select("account_id").eq("id", a.dealId).maybeSingle();
    if (deal?.account_id) return [deal.account_id as string];
  }
  if (a.inquiryId) {
    const ids = await fromEmails("inquiry_id", a.inquiryId);
    if (ids.length > 0) return ids;
    const { data: inq } = await db.from("inquiries").select("company_id").eq("id", a.inquiryId).maybeSingle();
    companyId = (inq?.company_id as string | null) ?? null;
  }
  if (a.dealId) {
    const ids = await fromEmails("deal_id", a.dealId);
    if (ids.length > 0) return ids;
    const { data: deal } = await db.from("deals").select("inquiry_id, company_id").eq("id", a.dealId).maybeSingle();
    const inquiryId = (deal?.inquiry_id as string | null) ?? null;
    if (inquiryId && inquiryId !== a.inquiryId) {
      const fromInquiry = await fromEmails("inquiry_id", inquiryId);
      if (fromInquiry.length > 0) return fromInquiry;
    }
    companyId = (deal?.company_id as string | null) ?? companyId;
  }
  // 案件・問い合わせにメールが無ければ取引先のメールで決める
  if (companyId) return fromEmails("company_id", companyId);
  return [];
}

/** 付け先の表示と開く先。案件の行動は案件へ、問い合わせだけの行動は問い合わせ一覧のその問い合わせへ */
async function targetOf(db: SupabaseClient, a: { dealId: string | null; inquiryId: string | null }): Promise<{ label: string | null; companyName: string | null; path: string }> {
  if (a.dealId) {
    const { data: deal } = await db.from("deals").select("title, company:companies(name)").eq("id", a.dealId).maybeSingle();
    return {
      label: deal?.title ? `案件: ${deal.title}` : null,
      companyName: (deal?.company as unknown as { name: string } | null)?.name ?? null,
      path: `/deals/${a.dealId}`,
    };
  }
  if (a.inquiryId) {
    const { data: inq } = await db.from("inquiries").select("subject, company:companies(name)").eq("id", a.inquiryId).maybeSingle();
    return {
      label: inq?.subject ? `問い合わせ: ${inq.subject}` : null,
      companyName: (inq?.company as unknown as { name: string } | null)?.name ?? null,
      path: `/inquiries/${a.inquiryId}`,
    };
  }
  return { label: null, companyName: null, path: "/activities" };
}
