"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * 一斉配信の配信停止(0043)。メール末尾のリンク /u/<token> から、ログイン無しで呼ぶ。
 * トークンだけで相手を特定するため、DB 側は security definer 関数(unsubscribe_peek / unsubscribe_apply)で
 * 伏せたアドレスと会社名だけを返し、更新は unsubscribed_at を入れるだけにしている。
 */

export interface UnsubscribeInfo {
  maskedEmail: string;
  tenantName: string;
  unsubscribed: boolean;
}

const TOKEN_RE = /^[0-9a-f]{32}$/;

export async function peekUnsubscribe(token: string): Promise<UnsubscribeInfo | null> {
  if (!TOKEN_RE.test(token)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("unsubscribe_peek", { p_token: token });
  const row = (data as { masked_email: string; tenant_name: string; unsubscribed: boolean }[] | null)?.[0];
  if (!row) return null;
  return { maskedEmail: row.masked_email, tenantName: row.tenant_name, unsubscribed: row.unsubscribed };
}

export async function applyUnsubscribe(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_apply", { p_token: token });
  if (error) return false;
  return Boolean(data);
}
