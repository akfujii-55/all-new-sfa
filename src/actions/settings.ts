"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAIL_SETTING_KEYS } from "@/lib/settings";

/** メール署名・返信件名の設定を保存する */
export async function saveMailSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const rows = MAIL_SETTING_KEYS.map((key) => ({ key, value: String(formData.get(key) ?? "").replace(/\r\n/g, "\n").trim() }));
  const email = rows.find((r) => r.key === "signature_email")?.value ?? "";
  if (email && !email.includes("@")) throw new Error("署名のメールアドレスの形式が正しくありません");

  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) {
    if (error.code === "PGRST205" || /app_settings/.test(error.message)) {
      throw new Error("設定テーブルがありません。supabase/migrations/0004_app_settings.sql を適用してください");
    }
    throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}
