"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ALERT_SETTING_KEYS, FORM_SETTING_KEYS, MAIL_SETTING_KEYS, splitAlertEmails, splitList } from "@/lib/settings";
import { getAlertTargets, sendAlert } from "@/lib/log";
import { fmtDateTime } from "@/lib/format";

/** メール署名・返信件名の設定を保存する */
export async function saveMailSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const rows = MAIL_SETTING_KEYS.map((key) => ({ key, value: String(formData.get(key) ?? "").replace(/\r\n/g, "\n").trim() }));
  const email = rows.find((r) => r.key === "signature_email")?.value ?? "";
  if (email && !email.includes("@")) throw new Error("署名のメールアドレスの形式が正しくありません");

  // tenant_id は insert トリガーが補う(主キーは tenant_id + key)
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "tenant_id,key" });
  if (error) {
    if (error.code === "PGRST205" || /app_settings/.test(error.message)) {
      throw new Error("設定テーブルがありません。supabase/migrations/0004_app_settings.sql を適用してください");
    }
    throw new Error(error.message);
  }
  revalidatePath("/", "layout");
}

/** 問い合わせフォームの通知メールの読み取り設定(送信元アドレス・追加ラベル)を保存する */
export async function saveFormSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const rows = FORM_SETTING_KEYS.map((key) => ({ key, value: splitList(String(formData.get(key) ?? "").replace(/\r\n/g, "\n")).join("\n") }));
  const senders = splitList(rows.find((r) => r.key === "form_senders")?.value ?? "");
  const bad = senders.find((a) => !a.includes("@"));
  if (bad) throw new Error(`送信元アドレスの形式が正しくありません: ${bad}`);
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "tenant_id,key" });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/** エラー通知の設定(通知先メールアドレス)を保存する */
export async function saveAlertSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const raw = String(formData.get("alert_emails") ?? "");
  const invalid = raw.split(/[,;\s]+/).map((a) => a.trim()).filter((a) => a && !a.includes("@"));
  if (invalid.length) throw new Error(`メールアドレスの形式が正しくありません: ${invalid.join(", ")}`);

  const rows = ALERT_SETTING_KEYS.map((key) => ({ key, value: key === "alert_emails" ? splitAlertEmails(raw).join(", ") : String(formData.get(key) ?? "").trim() }));
  const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "tenant_id,key" });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/** 通知先へテスト通知を送る(メールと Webhook の両方) */
export async function sendTestAlert(): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const targets = await getAlertTargets(supabase);
  if (targets.emails.length === 0 && !targets.webhook) return { ok: false, message: "通知先が設定されていません" };

  const r = await sendAlert(supabase, {
    subject: "[SFA] テスト通知",
    body: `これはテスト通知です。${fmtDateTime(new Date())} に ${auth.user.email ?? "ユーザー"} が送信しました。\nこのメールが届いていれば、エラー発生時の通知が受け取れます。`,
    targets,
  });
  const parts = [
    r.email === null ? null : `メール: ${r.email ? "送信済み" : "失敗"}`,
    r.webhook === null ? null : `Webhook: ${r.webhook ? "送信済み" : "失敗"}`,
  ].filter(Boolean);
  return { ok: r.errors.length === 0, message: r.errors.length ? `${parts.join(" / ")}(${r.errors.join(" / ")})` : parts.join(" / ") };
}

/** 指定日数より前のシステムログを削除する */
export async function deleteOldSystemLogs(days = 30): Promise<{ deleted: number }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase.from("system_logs").delete({ count: "exact" }).lt("created_at", before);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/logs");
  return { deleted: count ?? 0 };
}

/** ブラウザ側(error.tsx)で捕捉したエラーを記録する。サーバー側で記録済みのもの(digest あり)は除く */
export async function reportClientError(input: { message: string; digest?: string | null; stack?: string | null; path?: string | null }) {
  if (input.digest) return;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { logSystem } = await import("@/lib/log");
  await logSystem(
    {
      source: "client",
      message: input.message.slice(0, 1000),
      detail: { stack: input.stack?.slice(0, 2000) ?? null },
      path: input.path ?? null,
      userEmail: auth.user?.email ?? null,
    },
    // ログイン中ならそのテナントのログとして残す
    auth.user ? supabase : undefined,
  );
}
