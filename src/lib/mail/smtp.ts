import nodemailer from "nodemailer";
import type { MailAccountConfig } from "./accounts";

/**
 * 465 は接続時から TLS(SMTPS)、それ以外(587 / 25)は STARTTLS で暗号化してから認証する。
 * requireTLS で、STARTTLS に対応しないサーバーへ平文でパスワードを送らないようにする。
 */
export function createTransport(account: MailAccountConfig) {
  const secure = account.smtpPort === 465;
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure,
    requireTLS: !secure,
    auth: { user: account.loginUser, pass: account.password },
    connectionTimeout: 15000,
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
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
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
    attachments: input.attachments && input.attachments.length ? input.attachments : undefined,
  });
  return { messageId: info.messageId as string, from: account.email };
}

/** SMTP にログインできるか確認する(設定画面の接続テスト用) */
export async function verifySmtp(account: MailAccountConfig) {
  await createTransport(account).verify();
}
