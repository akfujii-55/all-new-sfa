import { createAdminClient } from "@/lib/supabase/server";
import { APP_NAME, DEFAULT_MAIL_TEMPLATES, INVITE_EXPIRES, renderTemplate, type MailTemplate, type MailTemplateKey, type MailTemplateVars } from "./templates-shared";

export * from "./templates-shared";

/** 保存済みのテンプレート(無ければ既定)。全テナント共通の設定なので service role で読む */
export async function loadMailTemplate(key: MailTemplateKey): Promise<MailTemplate> {
  const { data } = await createAdminClient().from("mail_templates").select("subject, body").eq("key", key).maybeSingle();
  return data ? { subject: data.subject as string, body: data.body as string } : DEFAULT_MAIL_TEMPLATES[key];
}

/** テンプレートを読み込んで差し込み、件名と本文を返す */
export async function buildMail(key: MailTemplateKey, vars: Omit<MailTemplateVars, "app_name" | "expires"> & Partial<MailTemplateVars>) {
  const t = await loadMailTemplate(key);
  const full: MailTemplateVars = { app_name: APP_NAME, expires: INVITE_EXPIRES, ...vars };
  return { subject: renderTemplate(t.subject, full), text: renderTemplate(t.body, full) };
}
