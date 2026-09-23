"use server";

import { revalidatePath } from "next/cache";
import { requireOperator } from "@/actions/admin";
import { userError } from "@/lib/errors";
import { errorMessage } from "@/lib/log";
import { operatorTenantClient } from "@/lib/supabase/tenant";
import { listMailAccounts } from "@/lib/mail/accounts";
import {
  STEP_MAIL_SAMPLE_VARS,
  STEP_MAIL_SENDER_KEYS,
  sendStepMailTest,
  stepMailSenderFromRows,
  stepMailVarsFor,
  type StepMail,
  type StepMailAccountOption,
  type StepMailLog,
  type StepMailSenderSettings,
} from "@/lib/step-mails";

/** ステップメール(運営管理)。運営者だけが service role で読み書きする */

function parseStep(formData: FormData) {
  const day = Number(formData.get("day_offset"));
  if (!Number.isInteger(day) || day < 0 || day > 365) throw userError("送信日は 0〜365 の日数で入力してください");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw userError("名前を入力してください");
  const subject = String(formData.get("subject") ?? "").replace(/\r\n/g, "\n").trim();
  if (!subject) throw userError("件名を入力してください");
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) throw userError("本文を入力してください");
  if (body.length > 10000) throw userError("本文は 10,000 文字以内にしてください");
  return {
    day_offset: day,
    name,
    subject,
    body,
    send_after_paid: formData.get("send_after_paid") === "on",
    is_active: formData.get("is_active") !== "off",
  };
}

export async function listStepMails(): Promise<(StepMail & { sent_count: number })[]> {
  const { admin } = await requireOperator();
  const [{ data: steps, error }, { data: logs }] = await Promise.all([
    admin.from("step_mails").select("*").order("day_offset").order("created_at"),
    admin.from("step_mail_logs").select("step_id").eq("status", "sent"),
  ]);
  if (error) throw userError(error.message);
  const counts = new Map<string, number>();
  for (const l of logs ?? []) counts.set(l.step_id as string, (counts.get(l.step_id as string) ?? 0) + 1);
  return ((steps ?? []) as StepMail[]).map((s) => ({ ...s, sent_count: counts.get(s.id) ?? 0 }));
}

export async function saveStepMail(id: string | null, formData: FormData): Promise<{ id: string }> {
  const { admin } = await requireOperator();
  const values = parseStep(formData);
  if (id) {
    const { error } = await admin.from("step_mails").update(values).eq("id", id);
    if (error) throw userError(error.message);
  } else {
    const { data, error } = await admin.from("step_mails").insert(values).select("id").single();
    if (error) throw userError(error.message);
    id = data.id as string;
  }
  revalidatePath("/admin/step-mails");
  return { id };
}

/** 回を削除する。送信記録も一緒に消える(cascade) */
export async function deleteStepMail(id: string): Promise<void> {
  const { admin } = await requireOperator();
  const { error } = await admin.from("step_mails").delete().eq("id", id);
  if (error) throw userError(error.message);
  revalidatePath("/admin/step-mails");
}

/** 編集中の文面をログイン中の運営者宛てにテスト送信する(サンプルの差し込み) */
export async function sendStepMailTestToMe(formData: FormData): Promise<{ to: string; from: string }> {
  const { user } = await requireOperator();
  const to = user.email;
  if (!to) throw userError("ログイン中のユーザーにメールアドレスがありません");
  const values = parseStep(formData);
  // リンクは本番のものにしておく(サンプル値の example.com ではなく)
  const vars = { ...STEP_MAIL_SAMPLE_VARS, ...linksOnly(stepMailVarsFor({ name: STEP_MAIL_SAMPLE_VARS.company, contact_name: STEP_MAIL_SAMPLE_VARS.name, trial_ends_at: null })) };
  try {
    const r = await sendStepMailTest(values, to, vars);
    return { to, from: r.from };
  } catch (e) {
    throw userError(`テスト送信に失敗しました: ${errorMessage(e)}`);
  }
}

// ---------- 送信元 ----------

/** 送信元の設定と、選べる運営側のメールアカウント(有効なもの。パスワードは返さない) */
export async function getStepMailSender(): Promise<{ settings: StepMailSenderSettings; accounts: StepMailAccountOption[] }> {
  const { admin } = await requireOperator();
  const { data } = await admin.from("operator_settings").select("key, value").in("key", [...STEP_MAIL_SENDER_KEYS]);
  const settings = stepMailSenderFromRows(data as { key: string; value: string }[] | null);
  const operator = await operatorTenantClient();
  const accounts: StepMailAccountOption[] = operator
    ? (await listMailAccounts(operator)).map((a) => ({ id: a.id, label: a.label, email: a.email, from_name: a.fromName, is_default: a.isDefault }))
    : [];
  return { settings, accounts };
}

export async function saveStepMailSender(formData: FormData): Promise<void> {
  const { admin } = await requireOperator();
  const accountId = String(formData.get("account_id") ?? "").trim();
  if (accountId) {
    const operator = await operatorTenantClient();
    const ok = operator ? (await listMailAccounts(operator)).some((a) => a.id === accountId) : false;
    if (!ok) throw userError("選んだメールアカウントが見つかりません。運営側の設定画面で有効になっているか確認してください");
  }
  const fromEmail = String(formData.get("from_email") ?? "").trim().toLowerCase();
  if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw userError("差出人アドレスの形式が正しくありません");
  const fromName = String(formData.get("from_name") ?? "").trim();
  if (fromName.length > 100) throw userError("差出人名は 100 文字以内にしてください");
  const rows = [
    { key: "step_mail_account_id", value: accountId },
    { key: "step_mail_from_email", value: fromEmail },
    { key: "step_mail_from_name", value: fromName },
  ];
  const { error } = await admin.from("operator_settings").upsert(rows, { onConflict: "key" });
  if (error) throw userError(error.message);
  revalidatePath("/admin/step-mails");
}

function linksOnly(v: ReturnType<typeof stepMailVarsFor>) {
  return { login_link: v.login_link, billing_link: v.billing_link, manual_link: v.manual_link };
}

/** テナントの送信履歴(テナント詳細) */
export async function listTenantStepMailLogs(tenantId: string): Promise<StepMailLog[]> {
  const { admin } = await requireOperator();
  const { data, error } = await admin
    .from("step_mail_logs")
    .select("*, step:step_mails(id, day_offset, name)")
    .eq("tenant_id", tenantId)
    .order("due_on", { ascending: false });
  if (error) throw userError(error.message);
  return (data ?? []) as unknown as StepMailLog[];
}

/** テナントごとの「ステップメールを送らない」 */
export async function setTenantStepMailsEnabled(tenantId: string, enabled: boolean): Promise<void> {
  const { admin } = await requireOperator();
  const { error } = await admin.from("tenants").update({ step_mails_enabled: enabled }).eq("id", tenantId);
  if (error) throw userError(error.message);
  revalidatePath(`/admin/tenants/${tenantId}`);
}
