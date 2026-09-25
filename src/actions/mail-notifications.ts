"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { userError } from "@/lib/errors";
import { encryptSecret } from "@/lib/mail/crypto";
import { sendChatMessage, siteOriginForPreview, toTarget, type NotificationTarget } from "@/lib/mail/notify";
import {
  MAIL_NOTIFICATION_MODES,
  MAX_MAIL_NOTIFICATIONS,
  buildNewMailText,
  kindDef,
  sampleNotices,
  type MailNotificationKind,
  type MailNotificationMode,
} from "@/lib/mail-notifications-shared";

/** 新着メールのチャット通知先(設定画面「新着メールの通知」、0033)。ログインユーザーのクライアントで動き、RLS で自テナントに絞られる */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return supabase;
}

interface Parsed {
  kind: MailNotificationKind;
  name: string;
  url: string;
  /** null = 入力なし(更新時は変更しない) */
  secret: string | null;
  room_id: string | null;
  mail_account_id: string | null;
  mode: MailNotificationMode;
}

function parseForm(fd: FormData): Parsed {
  const kind = String(fd.get("kind") ?? "").trim() as MailNotificationKind;
  const def = kindDef(kind);
  if (!def) throw userError("通知先のサービスを選んでください");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw userError("名前を入力してください");
  if (name.length > 50) throw userError("名前は 50 文字以内にしてください");

  const url = String(fd.get("url") ?? "").trim();
  const secret = String(fd.get("secret") ?? "").trim() || null;
  const room_id = String(fd.get("room_id") ?? "").trim() || null;
  const usesUrl = def.fields.some((f) => f.key === "url");
  if (usesUrl) {
    if (!url) throw userError("Webhook URL を入力してください");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw userError("Webhook URL の形式が正しくありません(https:// から始まる URL を貼り付けてください)");
    }
    if (parsed.protocol !== "https:") throw userError("Webhook URL は https:// から始まる必要があります");
    if (kind === "slack" && !/(^|\.)slack\.com$/.test(parsed.hostname)) throw userError("Slack の Incoming Webhook URL(https://hooks.slack.com/…)を貼り付けてください");
    if (kind === "lark" && !/(^|\.)(larksuite\.com|feishu\.cn)$/.test(parsed.hostname)) throw userError("Lark のカスタム Bot の Webhook URL(https://open.larksuite.com/…)を貼り付けてください");
  }
  if (kind === "chatwork") {
    if (!room_id || !/^\d+$/.test(room_id)) throw userError("Chatwork のルーム ID(数字)を入力してください");
  }
  const mail_account_id = String(fd.get("mail_account_id") ?? "").trim() || null;
  const mode = String(fd.get("mode") ?? "digest").trim() as MailNotificationMode;
  if (!MAIL_NOTIFICATION_MODES.some((m) => m.key === mode)) throw userError("送り方を選んでください");
  return { kind, name, url: usesUrl ? url : "", secret, room_id: kind === "chatwork" ? room_id : null, mail_account_id, mode };
}

/** 保存済みの通知先から、テストや更新のときに引き継ぐ値を読む */
async function loadStored(db: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const { data } = await db.from("mail_notifications").select("id, kind, url, secret_enc, room_id").eq("id", id).maybeSingle();
  if (!data) throw userError("通知先が見つかりません");
  return data as { id: string; kind: MailNotificationKind; url: string; secret_enc: string | null; room_id: string | null };
}

export async function createMailNotification(fd: FormData) {
  const db = await requireUser();
  const { count } = await db.from("mail_notifications").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_MAIL_NOTIFICATIONS) throw userError(`通知先は ${MAX_MAIL_NOTIFICATIONS} 件までです`);
  const p = parseForm(fd);
  const def = kindDef(p.kind)!;
  const needsSecret = def.fields.some((f) => f.key === "secret" && f.required);
  if (needsSecret && !p.secret) throw userError(`${def.fields.find((f) => f.key === "secret")!.label}を入力してください`);
  const { error } = await db.from("mail_notifications").insert({
    kind: p.kind,
    name: p.name,
    url: p.url,
    secret_enc: p.secret ? encryptSecret(p.secret) : null,
    room_id: p.room_id,
    mail_account_id: p.mail_account_id,
    mode: p.mode,
  });
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

export async function updateMailNotification(id: string, fd: FormData) {
  const db = await requireUser();
  const p = parseForm(fd);
  const stored = await loadStored(db, id);
  const def = kindDef(p.kind)!;
  const needsSecret = def.fields.some((f) => f.key === "secret" && f.required);
  // サービスを変えたときは前のシークレットを引き継がない
  const keepSecret = !p.secret && stored.kind === p.kind && Boolean(stored.secret_enc);
  if (needsSecret && !p.secret && !keepSecret) throw userError(`${def.fields.find((f) => f.key === "secret")!.label}を入力してください`);
  const patch: Record<string, unknown> = {
    kind: p.kind,
    name: p.name,
    url: p.url,
    room_id: p.room_id,
    mail_account_id: p.mail_account_id,
    mode: p.mode,
    last_error: null,
  };
  if (p.secret) patch.secret_enc = encryptSecret(p.secret);
  else if (!keepSecret) patch.secret_enc = null;
  const { error } = await db.from("mail_notifications").update(patch).eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

export async function deleteMailNotification(id: string) {
  const db = await requireUser();
  const { error } = await db.from("mail_notifications").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

export async function setMailNotificationActive(id: string, active: boolean) {
  const db = await requireUser();
  const { error } = await db.from("mail_notifications").update({ is_active: active }).eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/settings");
}

/**
 * テスト送信。フォームの入力内容で送る(id があり、シークレットが空なら保存済みのシークレットを使う)。
 * 行の「テスト送信」からは id だけを渡す。
 */
export async function testMailNotification(fd: FormData): Promise<{ ok: boolean; message: string }> {
  const db = await requireUser();
  const id = String(fd.get("id") ?? "").trim() || null;
  let target: NotificationTarget;
  let kind: MailNotificationKind;
  let accountId: string | null;
  if (id && !fd.has("kind")) {
    const stored = await loadStored(db, id);
    const { data: row } = await db.from("mail_notifications").select("mail_account_id").eq("id", id).maybeSingle();
    target = toTarget(stored);
    kind = stored.kind;
    accountId = (row?.mail_account_id as string | null) ?? null;
  } else {
    const p = parseForm(fd);
    kind = p.kind;
    accountId = p.mail_account_id;
    let secret = p.secret;
    if (!secret && id) {
      const stored = await loadStored(db, id);
      if (stored.kind === p.kind && stored.secret_enc) secret = toTarget(stored).secret;
    }
    const def = kindDef(kind)!;
    if (!secret && def.fields.some((f) => f.key === "secret" && f.required)) throw userError(`${def.fields.find((f) => f.key === "secret")!.label}を入力してください`);
    target = { kind, url: p.url, secret, roomId: p.room_id };
  }
  let accountEmail: string | null = null;
  if (accountId) {
    const { data } = await db.from("mail_accounts").select("email").eq("id", accountId).maybeSingle();
    accountEmail = (data?.email as string | undefined) ?? null;
  }
  const text = `【テスト送信】この通知先に新着メールの通知が届くことを確認しています。\n\n${buildNewMailText(kind, sampleNotices(siteOriginForPreview(), accountEmail))}`;
  const err = await sendChatMessage(target, text);
  if (id) await db.from("mail_notifications").update(err ? { last_error: err } : { last_error: null, last_sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/settings");
  return err ? { ok: false, message: err } : { ok: true, message: `${kindDef(kind)?.label ?? kind} に送りました` };
}
