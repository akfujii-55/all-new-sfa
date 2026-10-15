import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { fmtDue } from "@/lib/format";
import { notifyNewTodo, siteOriginForPreview } from "@/lib/mail/notify";

/**
 * 行動(Todo)を新しく登録したことをチャット(設定画面「新着メールの通知」の通知先で「行動(Todo)の登録も通知する」がオンのもの)へ知らせる(0042)。
 * 行動を登録する Server Action(addActivity / addInquiryActivity、アポイント日時からの自動登録)から呼ぶ。
 * 画面の応答を待たせないよう after() で送り、失敗しても登録は止めない(記録だけ残す)。
 * 対象は未完了の行動だけ(「済んだ行動として記録する」は通知しない)。編集・担当者変更・完了は通知しない。
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

      const [{ data: kind }, owner, actorName, target] = await Promise.all([
        db.from("activity_kinds").select("name").eq("id", a.kindId).maybeSingle(),
        a.ownerId ? db.from("members").select("name").eq("id", a.ownerId).maybeSingle().then((r) => (r.data?.name as string | null) ?? null) : Promise.resolve(null),
        actorNameOf(db, a.actorUserId),
        targetOf(db, a),
      ]);
      await notifyNewTodo(db, {
        kindName: (kind?.name as string | null) ?? null,
        body: a.body,
        due: a.dueAt ? fmtDue(a.dueAt) : null,
        ownerName: owner,
        actorName,
        target: target.label,
        companyName: target.companyName,
        url: `${siteOriginForPreview()}${target.path}`,
      });
    } catch (e) {
      console.warn("[todo-notify] 行動(Todo)の通知に失敗:", (e as Error).message);
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
      path: `/inquiries?status=all&focus=${a.inquiryId}#${a.inquiryId}`,
    };
  }
  return { label: null, companyName: null, path: "/activities" };
}
