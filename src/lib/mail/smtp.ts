import nodemailer from "nodemailer";
import type { MailAccountConfig } from "./accounts";

export function createTransport(account: MailAccountConfig) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.email, pass: account.password },
  });
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string[];
}

/** 指定アカウントの SMTP で送信する */
export async function sendMail(account: MailAccountConfig, input: SendMailInput) {
  const transport = createTransport(account);
  const info = await transport.sendMail({
    from: { name: account.fromName, address: account.email },
    to: input.to,
    cc: input.cc && input.cc.length ? input.cc : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references && input.references.length ? input.references : undefined,
  });
  return { messageId: info.messageId as string, from: account.email };
}

/** SMTP にログインできるか確認する(設定画面の接続テスト用) */
export async function verifySmtp(account: MailAccountConfig) {
  await createTransport(account).verify();
}
