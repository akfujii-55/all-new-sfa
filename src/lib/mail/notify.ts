import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
import { errorMessage, logSystem, postWebhook } from "@/lib/log";
import { DELETE_LIST_TAG_NAME } from "@/lib/tag-rules";
import {
  buildNewMailText,
  type MailNotificationKind,
  type MailNotificationMode,
  type NewMailNotice,
} from "@/lib/mail-notifications-shared";

type Db = SupabaseClient;

/**
 * 新着メールのチャット通知(0033)。同期(syncMail)が取り込んだ受信メールを、設定画面「新着メールの通知」の通知先へ送る。
 * 通知先の種類ごとの送り方はここに集約する(Lark / Slack / 汎用 Webhook は log.ts の postWebhook、Chatwork は REST API)。
 */

/** 送信に必要な通知先の情報(復号済み) */
export interface NotificationTarget {
  kind: MailNotificationKind;
  url: string;
  /** Lark の署名シークレット / Chatwork の API トークン */
  secret: string | null;
  roomId: string | null;
}

/** 同期が取り込んだメール 1 通(ingestParsedMail の戻り値) */
export interface IngestedMail {
  id: string;
  direction: "inbound" | "outbound";
  threadKey: string;
  fromName: string | null;
  fromAddress: string;
  subject: string | null;
  companyId: string | null;
  accountId: string | null;
  receivedAt: string;
}

/** これより古い受信日時のメールは、初回同期などの過去分とみなして通知しない */
const NOTIFY_MAX_AGE_HOURS = 72;

function siteOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return url.replace(/\/$/, "");
}

export function threadUrl(emailId: string): string {
  return `${siteOrigin()}/inbox/${emailId}`;
}

export function siteOriginForPreview(): string {
  return siteOrigin();
}

/** 通知先に文面を送る。成功なら null、失敗なら理由を返す(例外は投げない) */
export async function sendChatMessage(target: NotificationTarget, text: string): Promise<string | null> {
  if (target.kind === "chatwork") return postChatwork(target, text);
  return postWebhook(target.url, target.kind === "lark" ? target.secret : null, text);
}

async function postChatwork(target: NotificationTarget, text: string): Promise<string | null> {
  if (!target.secret) return "API トークンが未設定です";
  if (!target.roomId) return "ルーム ID が未設定です";
  try {
    const res = await fetch(`https://api.chatwork.com/v2/rooms/${encodeURIComponent(target.roomId)}/messages`, {
      method: "POST",
      headers: { "X-ChatWorkToken": target.secret, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ body: text, self_unread: "0" }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return null;
    const detail = (await res.json().catch(() => null)) as { errors?: string[] } | null;
    const reason = detail?.errors?.join(" / ") ?? "";
    if (res.status === 401) return `API トークンが正しくありません${reason ? `(${reason})` : ""}`;
    if (res.status === 403 || res.status === 404) return `ルームにアクセスできません。ルーム ID と、トークンのユーザーがルームに参加しているかを確認してください${reason ? `(${reason})` : ""}`;
    return `応答 ${res.status}${reason ? ` ${reason}` : ""}`;
  } catch (e) {
    return errorMessage(e);
  }
}

interface TargetRow {
  id: string;
  kind: MailNotificationKind;
  name: string;
  url: string;
  secret_enc: string | null;
  room_id: string | null;
  mail_account_id: string | null;
  mode: MailNotificationMode;
}

export function toTarget(row: Pick<TargetRow, "kind" | "url" | "secret_enc" | "room_id">): NotificationTarget {
  return { kind: row.kind, url: row.url, secret: row.secret_enc ? decryptSecret(row.secret_enc) : null, roomId: row.room_id };
}

/**
 * 同期で取り込んだメールのうち通知すべきものを、有効な通知先へ送る。失敗は warn として記録し、例外は投げない。
 * 対象: 受信(inbound)で、受信日時が NOTIFY_MAX_AGE_HOURS 以内で、「削除リスト」タグが付いていないもの。
 */
export async function notifyNewMail(db: Db, ingested: IngestedMail[]): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const cutoff = Date.now() - NOTIFY_MAX_AGE_HOURS * 3600_000;
  let mails = ingested.filter((m) => m.direction === "inbound" && Date.parse(m.receivedAt) >= cutoff);
  if (mails.length === 0) return out;

  const { data: targetRows, error } = await db
    .from("mail_notifications")
    .select("id, kind, name, url, secret_enc, room_id, mail_account_id, mode")
    .eq("is_active", true)
    .order("created_at");
  if (error) {
    await logSystem({ level: "warn", source: "mail.notify", message: `新着メール通知の設定を読めませんでした: ${error.message}`, notify: false }, db);
    return out;
  }
  const targets = (targetRows ?? []) as TargetRow[];
  if (targets.length === 0) return out;

  // 「削除リスト」タグが付いたメール(自動タグ付けで不要と判定されたもの)は通知しない
  const { data: deleteTag } = await db.from("tags").select("id").eq("name", DELETE_LIST_TAG_NAME).maybeSingle();
  if (deleteTag) {
    const ids = mails.map((m) => m.id);
    const excluded = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("email_tags").select("email_id").eq("tag_id", deleteTag.id).in("email_id", ids.slice(i, i + 200));
      for (const r of data ?? []) excluded.add(r.email_id as string);
    }
    mails = mails.filter((m) => !excluded.has(m.id));
    if (mails.length === 0) return out;
  }

  // 取引先名とアカウントのアドレスを引く
  const companyIds = Array.from(new Set(mails.map((m) => m.companyId).filter(Boolean))) as string[];
  const companyName = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data } = await db.from("companies").select("id, name").in("id", companyIds);
    for (const c of data ?? []) companyName.set(c.id as string, c.name as string);
  }
  const accountIds = Array.from(new Set(mails.map((m) => m.accountId).filter(Boolean))) as string[];
  const accountEmail = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data } = await db.from("mail_accounts").select("id, email").in("id", accountIds);
    for (const a of data ?? []) accountEmail.set(a.id as string, a.email as string);
  }
  const notices: (NewMailNotice & { accountId: string | null })[] = mails.map((m) => ({
    id: m.id,
    fromName: m.fromName,
    fromAddress: m.fromAddress,
    subject: m.subject,
    companyName: m.companyId ? companyName.get(m.companyId) ?? null : null,
    accountEmail: m.accountId ? accountEmail.get(m.accountId) ?? null : null,
    accountId: m.accountId,
    url: threadUrl(m.id),
  }));

  for (const t of targets) {
    const mine = t.mail_account_id ? notices.filter((n) => n.accountId === t.mail_account_id) : notices;
    if (mine.length === 0) continue;
    let target: NotificationTarget;
    try {
      target = toTarget(t);
    } catch (e) {
      await recordResult(db, t.id, errorMessage(e));
      out.failed++;
      continue;
    }
    const batches = t.mode === "each" ? mine.map((n) => [n]) : [mine];
    let lastError: string | null = null;
    for (const batch of batches) {
      const err = await sendChatMessage(target, buildNewMailText(t.kind, batch));
      if (err) {
        lastError = err;
        break;
      }
    }
    await recordResult(db, t.id, lastError);
    if (lastError) {
      out.failed++;
      await logSystem({ level: "warn", source: "mail.notify", message: `新着メールの通知に失敗しました(${t.name}): ${lastError}`, detail: { notificationId: t.id, kind: t.kind }, notify: false }, db);
    } else {
      out.sent++;
    }
  }
  return out;
}

async function recordResult(db: Db, id: string, error: string | null) {
  await db
    .from("mail_notifications")
    .update(error ? { last_error: error } : { last_error: null, last_sent_at: new Date().toISOString() })
    .eq("id", id);
}
