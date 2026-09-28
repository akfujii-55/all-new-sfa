import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { buildMail } from "@/lib/mail/templates";
import { getCurrentTenant } from "@/lib/supabase/tenant";
import { logSystem } from "@/lib/log";
import type { NotificationKind } from "@/lib/notifications-shared";

/**
 * 担当者へのお知らせ(0036)。問い合わせ・案件・行動の担当者に付けられたとき、その営業担当者(members)に知らせる。
 * - ログインしている営業担当者(profile_id あり)には notifications 行を作り、ヘッダーのベルとダッシュボードに出す
 * - まだログインしていない営業担当者(profile_id なし、email あり)にはテンプレート member_assigned のメールを送る
 * - 自分で自分を担当者にしたときは知らせない
 * 失敗しても呼び出し元の処理は止めない(記録だけ残す)。
 */
export interface AssignNotice {
  /** 担当者に付けられた営業担当者(members.id)。null なら何もしない */
  memberId: string | null | undefined;
  /** 以前の担当者。同じなら何もしない */
  previousMemberId?: string | null;
  kind: NotificationKind;
  /** 付けられたものの名前(問い合わせの件名・案件名・行動の内容) */
  title: string;
  /** 補足(取引先名・期限など) */
  body?: string | null;
  /** 開く先(アプリ内のパス) */
  href: string;
  /** 担当者を付けた人(auth.users.id) */
  actorUserId: string | null | undefined;
}

const KIND_TEXT: Record<NotificationKind, string> = {
  inquiry_assigned: "問い合わせの担当者になりました",
  deal_assigned: "案件の担当者になりました",
  activity_assigned: "行動の担当者になりました",
};

function siteOrigin() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
}

export async function notifyAssigned(db: SupabaseClient, n: AssignNotice): Promise<void> {
  try {
    if (!n.memberId || n.memberId === n.previousMemberId) return;
    const { data: member } = await db.from("members").select("id, name, profile_id, email, is_active").eq("id", n.memberId).maybeSingle();
    if (!member || !member.is_active) return;
    if (member.profile_id && member.profile_id === n.actorUserId) return;

    const actorName = await actorNameOf(db, n.actorUserId);
    const title = `${KIND_TEXT[n.kind]}: ${n.title}`;
    const body = [n.body, actorName ? `${actorName} さんが設定` : null].filter(Boolean).join(" ・ ") || null;

    if (member.profile_id) {
      // RETURNING は本人しか読めない(select ポリシー)ので .select() は付けない
      const { error } = await db.from("notifications").insert({
        recipient_id: member.profile_id,
        actor_id: n.actorUserId ?? null,
        kind: n.kind,
        title,
        body,
        href: n.href,
      });
      if (error) throw new Error(error.message);
      return;
    }
    if (!member.email) return;
    // ログイン前の担当者にはメール(応答を待たせないよう後で送る)
    const email = member.email as string;
    const name = member.name as string;
    after(async () => {
      try {
        const [account, tenant] = await Promise.all([resolveSendAccount(db, {}), getCurrentTenant(db)]);
        const mail = await buildMail("member_assigned", {
          name,
          company: tenant?.name ?? "",
          inviter: actorName || "担当者",
          link: `${siteOrigin()}${n.href}`,
          title: n.title,
          detail: n.body ?? "",
        });
        await sendMail(account, { to: [email], subject: mail.subject, text: mail.text });
      } catch (e) {
        await logSystem({ level: "warn", source: "notifications.mail", message: `担当者へのお知らせメールを送れませんでした: ${(e as Error).message}`, detail: { memberId: member.id, kind: n.kind } }, db);
      }
    });
  } catch (e) {
    await logSystem({ level: "warn", source: "notifications", message: `担当者へのお知らせを作れませんでした: ${(e as Error).message}`, detail: { kind: n.kind, memberId: n.memberId ?? null } }, db);
  }
}

async function actorNameOf(db: SupabaseClient, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data: member } = await db.from("members").select("name").eq("profile_id", userId).maybeSingle();
  if (member?.name) return member.name as string;
  const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return (profile?.full_name as string | null) || (profile?.email as string | null)?.split("@")[0] || null;
}
