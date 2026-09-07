import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./crypto";
import type { MailAccount } from "@/lib/types";

type Db = SupabaseClient;

/** 接続に使う復号済みのアカウント情報(サーバー内部専用。クライアントへ渡さない) */
export interface MailAccountConfig {
  id: string;
  label: string;
  email: string;
  fromName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  password: string;
  isDefault: boolean;
  isActive: boolean;
}

function toConfig(row: MailAccount): MailAccountConfig {
  return {
    id: row.id,
    label: row.label,
    email: row.email.toLowerCase(),
    fromName: row.from_name || row.label || row.email,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    password: decryptSecret(row.password_enc),
    isDefault: row.is_default,
    isActive: row.is_active,
  };
}

/**
 * 環境変数(GMAIL_USER / GMAIL_APP_PASSWORD)で設定されていた1アカウントを、
 * メールアカウント表がまだ空のときに一度だけ取り込む。既存のメール・同期位置もそのアカウントに紐付ける。
 */
export async function bootstrapEnvAccount(db: Db): Promise<void> {
  const user = process.env.GMAIL_USER?.trim().toLowerCase();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return;
  const { count } = await db.from("mail_accounts").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;
  const { data: created, error } = await db
    .from("mail_accounts")
    .insert({
      label: process.env.GMAIL_FROM_NAME || user,
      email: user,
      from_name: process.env.GMAIL_FROM_NAME || null,
      password_enc: encryptSecret(pass),
      is_active: true,
      is_default: true,
    })
    .select("id")
    .single();
  if (error || !created) return;
  await db.from("emails").update({ account_id: created.id }).is("account_id", null);
  await db.from("mail_sync_state").update({ account_id: created.id }).is("account_id", null);
}

/** 有効なメールアカウントを既定 → 作成順で返す(復号済み) */
export async function listMailAccounts(db: Db, opts: { includeInactive?: boolean } = {}): Promise<MailAccountConfig[]> {
  await bootstrapEnvAccount(db);
  let q = db.from("mail_accounts").select("*").order("is_default", { ascending: false }).order("created_at");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as MailAccount[]).map(toConfig);
}

export async function getMailAccount(db: Db, id: string): Promise<MailAccountConfig | null> {
  const { data } = await db.from("mail_accounts").select("*").eq("id", id).maybeSingle();
  return data ? toConfig(data as MailAccount) : null;
}

/**
 * 送信に使うアカウントを決める: 指定 → 返信元メールを受信したアカウント → 既定 → 先頭。
 */
export async function resolveSendAccount(db: Db, opts: { accountId?: string | null; replyToAccountId?: string | null }): Promise<MailAccountConfig> {
  const accounts = await listMailAccounts(db);
  if (accounts.length === 0) throw new Error("送信用のメールアカウントが設定されていません。設定画面から追加してください。");
  const pick = (id?: string | null) => (id ? accounts.find((a) => a.id === id) : undefined);
  return pick(opts.accountId) ?? pick(opts.replyToAccountId) ?? accounts.find((a) => a.isDefault) ?? accounts[0];
}
