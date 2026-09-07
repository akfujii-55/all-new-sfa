import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailAccountOption } from "@/lib/types";

/** 画面に渡す用のアカウント一覧(認証情報を含まない)。既定 → 作成順 */
export async function getMailAccountOptions(db: SupabaseClient): Promise<MailAccountOption[]> {
  const { data } = await db
    .from("mail_accounts")
    .select("id, label, email, is_default")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at");
  return (data ?? []) as MailAccountOption[];
}
