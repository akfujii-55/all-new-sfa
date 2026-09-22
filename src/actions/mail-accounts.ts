"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tenantIdOf } from "@/lib/supabase/tenant";
import { syncTenantBilling } from "@/lib/stripe";
import { encryptSecret } from "@/lib/mail/crypto";
import { getMailAccount } from "@/lib/mail/accounts";
import { verifySmtp } from "@/lib/mail/smtp";
import { verifyImap } from "@/lib/mail/sync";
import { generateInboundToken, inboundAddress, inboundConfig } from "@/lib/mail/inbound";
import { syncMail } from "@/lib/mail/sync";
import { assertCanAddMailAccount, assertTenantWritable } from "@/lib/tenant-quota";

import { userError } from "@/lib/errors";
function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}
function port(v: FormDataEntryValue | null, fallback: number) {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** ログイン済みのセッションで動くクライアント(RLS で自テナントのアカウントだけを扱う) */
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  return supabase;
}

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

/**
 * メールアカウントを追加・更新する。パスワード欄が空なら既存のものを維持する。
 * 転送で受信するアカウントを新しく追加したときは、続けて転送の設定を案内できるように id と受け口アドレスを返す。
 */
export async function saveMailAccount(id: string | null, formData: FormData): Promise<{ forward: { id: string; address: string; smtpError: string | null } | null }> {
  const db = await requireUser();
  // 上限(tenants.max_mail_accounts)は新規追加のときだけ確認する
  if (id) await assertTenantWritable(db);
  else await assertCanAddMailAccount(db);
  const email = s(formData.get("email"))?.toLowerCase();
  const label = s(formData.get("label")) ?? email;
  const password = String(formData.get("password") ?? "").replace(/\s+/g, "");
  if (!email || !email.includes("@")) throw userError("メールアドレスを入力してください");
  if (!id && !password) throw userError("パスワードを入力してください");
  // 転送で受信するアカウントは IMAP を使わない(列は既定値のまま)。受け口アドレスのトークンは初回の保存で発行する
  const forward = formData.get("receive_mode") === "forward";
  if (forward && !inboundConfig()) throw userError("メール転送による受信は現在ご利用いただけません。運営にお問い合わせください");
  const imapHost = (forward ? null : s(formData.get("imap_host"))?.toLowerCase()) ?? "imap.gmail.com";
  const smtpHost = s(formData.get("smtp_host"))?.toLowerCase() ?? "smtp.gmail.com";
  if (!/^[a-z0-9.-]+$/.test(imapHost) || !/^[a-z0-9.-]+$/.test(smtpHost)) throw userError("サーバー名はホスト名だけを入力してください(例: imap.example.jp)");
  const loginUser = s(formData.get("login_user"));

  const values: Record<string, unknown> = {
    label,
    email,
    from_name: s(formData.get("from_name")),
    // アカウント専用の署名。空なら共通の署名
    signature: s(formData.get("signature")),
    imap_host: imapHost,
    imap_port: forward ? 993 : port(formData.get("imap_port"), 993),
    receive_mode: forward ? "forward" : "imap",
    smtp_host: smtpHost,
    smtp_port: port(formData.get("smtp_port"), 465),
    // メールアドレスと同じなら空にしておく(既定の動作と区別しない)
    login_user: loginUser && loginUser.toLowerCase() !== email ? loginUser : null,
    is_active: formData.get("is_active") !== "false",
  };
  if (password) values.password_enc = encryptSecret(password);
  if (forward) {
    const { data: current } = id ? await db.from("mail_accounts").select("inbound_token").eq("id", id).maybeSingle() : { data: null };
    if (!current?.inbound_token) values.inbound_token = generateInboundToken();
  }

  const { count } = await db.from("mail_accounts").select("id", { count: "exact", head: true });
  if (!id && (count ?? 0) === 0) values.is_default = true;

  const { data: saved, error } = id
    ? await db.from("mail_accounts").update(values).eq("id", id).select("id, inbound_token").maybeSingle()
    : await db.from("mail_accounts").insert(values).select("id, inbound_token").single();
  if (error) {
    if (error.code === "23505") throw userError("このメールアドレスは既に登録されています");
    throw userError(error.message);
  }
  // メールアカウント数は課金対象なので、追加後に Stripe の数量を合わせる(応答後に実行)
  if (!id) {
    const tenantId = await tenantIdOf(db);
    after(() => syncTenantBilling(tenantId));
  }
  revalidate();
  const address = forward ? inboundAddress(saved?.inbound_token) : null;
  if (id || !saved || !address) return { forward: null };
  // 続けて出す案内で送信の可否も伝える(SMTP 認証が無効なサービスでは受信だけで使い始められる)
  let smtpError: string | null = null;
  try {
    const account = await getMailAccount(db, saved.id as string);
    if (account) await verifySmtp(account);
  } catch (e) {
    smtpError = (e as Error).message;
    await db.from("mail_accounts").update({ last_error: smtpError }).eq("id", saved.id);
  }
  return { forward: { id: saved.id as string, address, smtpError } };
}

/**
 * 転送の設定後に「届いたか確認する」: 受け口のメールボックスを同期して、このアカウントで取り込んだメールの件数を返す。
 */
export async function checkForwardArrival(id: string): Promise<{ received: number; error: string | null }> {
  const db = await requireUser();
  await assertTenantWritable(db);
  const results = await syncMail(db, { accountId: id });
  const { count } = await db.from("emails").select("id", { count: "exact", head: true }).eq("account_id", id).eq("direction", "inbound");
  revalidate();
  return { received: count ?? 0, error: results.find((r) => r.error)?.error ?? null };
}

export async function deleteMailAccount(id: string) {
  const db = await requireUser();
  const { data: target } = await db.from("mail_accounts").select("is_default").eq("id", id).maybeSingle();
  const { error } = await db.from("mail_accounts").delete().eq("id", id);
  if (error) throw userError(error.message);
  const tenantId = await tenantIdOf(db);
  after(() => syncTenantBilling(tenantId));
  // 既定アカウントを消したら、残りの先頭を既定にする
  if (target?.is_default) {
    const { data: rest } = await db.from("mail_accounts").select("id").order("created_at").limit(1);
    if (rest?.[0]) await db.from("mail_accounts").update({ is_default: true }).eq("id", rest[0].id);
  }
  revalidate();
}

export async function setDefaultMailAccount(id: string) {
  const db = await requireUser();
  await db.from("mail_accounts").update({ is_default: false }).neq("id", id);
  const { error } = await db.from("mail_accounts").update({ is_default: true, is_active: true }).eq("id", id);
  if (error) throw userError(error.message);
  revalidate();
}

/**
 * 受け口アドレスを作り直す。古いアドレス宛ての転送は取り込まれなくなるので、
 * 利用者はメールサーバー側の転送先を新しいアドレスに変える必要がある(アドレスが外部に漏れたとき用)。
 */
export async function regenerateInboundAddress(id: string) {
  const db = await requireUser();
  await assertTenantWritable(db);
  const { data, error } = await db
    .from("mail_accounts")
    .update({ inbound_token: generateInboundToken() })
    .eq("id", id)
    .eq("receive_mode", "forward")
    .select("id");
  if (error) throw userError(error.message);
  if (!data?.length) throw userError("転送で受信するアカウントが見つかりません");
  revalidate();
}

/** IMAP と SMTP の両方にログインできるか確認する(転送で受信するアカウントは SMTP のみ) */
export async function testMailAccount(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await requireUser();
  const account = await getMailAccount(db, id);
  if (!account) return { ok: false, error: "アカウントが見つかりません" };
  try {
    if (account.receiveMode !== "forward") await verifyImap(account);
    await verifySmtp(account);
    await db.from("mail_accounts").update({ last_error: null }).eq("id", id);
    revalidate();
    return { ok: true };
  } catch (e) {
    const message = (e as Error).message;
    await db.from("mail_accounts").update({ last_error: message }).eq("id", id);
    revalidate();
    return { ok: false, error: message };
  }
}
