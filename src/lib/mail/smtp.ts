import nodemailer from "nodemailer";

export function mailAccount() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD が設定されていません");
  return { user, pass, fromName: process.env.GMAIL_FROM_NAME || user };
}

export function createTransport() {
  const { user, pass } = mailAccount();
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export interface SendMailInput {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
}

export async function sendViaGmail(input: SendMailInput) {
  const { user, fromName } = mailAccount();
  const transport = createTransport();
  const info = await transport.sendMail({
    from: { name: fromName, address: user },
    to: input.to,
    cc: input.cc && input.cc.length ? input.cc : undefined,
    subject: input.subject,
    text: input.text,
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references && input.references.length ? input.references : undefined,
  });
  return { messageId: info.messageId as string, from: user };
}
