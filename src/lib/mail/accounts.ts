import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
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

/** 有効なメールアカウントを既定 → 作成順で返す(復号済み) */
export async function listMailAccounts(db: Db, opts: { includeInactive?: boolean } = {}): Promise<MailAccountConfig[]> {
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
