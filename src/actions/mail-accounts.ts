"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/mail/crypto";
import { getMailAccount } from "@/lib/mail/accounts";
import { verifySmtp } from "@/lib/mail/smtp";
import { verifyImap } from "@/lib/mail/sync";
import { assertCanAddMailAccount, assertTenantWritable } from "@/lib/tenant-quota";

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
  if (!data.user) throw new Error("ログインが必要です");
  return supabase;
}

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/inbox");
}

/** メールアカウントを追加・更新する。パスワード欄が空なら既存のものを維持する */
export async function saveMailAccount(id: string | null, formData: FormData) {
  const db = await requireUser();
  // 上限(tenants.max_mail_accounts)は新規追加のときだけ確認する
  if (id) await assertTenantWritable(db);
  else await assertCanAddMailAccount(db);
  const email = s(formData.get("email"))?.toLowerCase();
  const label = s(formData.get("label")) ?? email;
  const password = String(formData.get("password") ?? "").replace(/\s+/g, "");
  if (!email || !email.includes("@")) throw new Error("メールアドレスを入力してください");
  if (!id && !password) throw new Error("アプリパスワードを入力してください");

  const values: Record<string, unknown> = {
    label,
    email,
    from_name: s(formData.get("from_name")),
    imap_host: s(formData.get("imap_host")) ?? "imap.gmail.com",
    imap_port: port(formData.get("imap_port"), 993),
    smtp_host: s(formData.get("smtp_host")) ?? "smtp.gmail.com",
    smtp_port: port(formData.get("smtp_port"), 465),
    is_active: formData.get("is_active") !== "false",
  };
  if (password) values.password_enc = encryptSecret(password);

  const { count } = await db.from("mail_accounts").select("id", { count: "exact", head: true });
  if (!id && (count ?? 0) === 0) values.is_default = true;

  const { error } = id
    ? await db.from("mail_accounts").update(values).eq("id", id)
    : await db.from("mail_accounts").insert(values);
  if (error) {
    if (error.code === "23505") throw new Error("このメールアドレスは既に登録されています");
    throw new Error(error.message);
  }
  revalidate();
}

export async function deleteMailAccount(id: string) {
  const db = await requireUser();
  const { data: target } = await db.from("mail_accounts").select("is_default").eq("id", id).maybeSingle();
  const { error } = await db.from("mail_accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
  revalidate();
}

/** IMAP と SMTP の両方にログインできるか確認する */
export async function testMailAccount(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await requireUser();
  const account = await getMailAccount(db, id);
  if (!account) return { ok: false, error: "アカウントが見つかりません" };
  try {
    await verifyImap(account);
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
