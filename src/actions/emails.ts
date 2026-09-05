"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendViaGmail } from "@/lib/mail/smtp";
import { syncMail } from "@/lib/mail/sync";
import { createAdminClient } from "@/lib/supabase/server";

export interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  replyToEmailId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
}

function splitAddrs(v?: string) {
  return (v ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.includes("@"));
}

export async function sendEmail(input: SendEmailInput) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const to = splitAddrs(input.to);
  const cc = splitAddrs(input.cc);
  if (to.length === 0) throw new Error("宛先を入力してください");
  if (!input.subject.trim()) throw new Error("件名を入力してください");

  let inReplyTo: string | null = null;
  let references: string[] = [];
  let threadKey: string | null = null;
  let dealId = input.dealId ?? null;
  let contactId = input.contactId ?? null;
  let companyId = input.companyId ?? null;
  let inquiryId: string | null = null;

  if (input.replyToEmailId) {
    const { data: parent } = await supabase
      .from("emails")
      .select("message_id, thread_key, deal_id, contact_id, company_id, inquiry_id")
      .eq("id", input.replyToEmailId)
      .maybeSingle();
    if (parent) {
      inReplyTo = parent.message_id;
      threadKey = parent.thread_key;
      const { data: chain } = await supabase
        .from("emails")
        .select("message_id")
        .eq("thread_key", parent.thread_key)
        .order("received_at", { ascending: true });
      references = (chain ?? []).map((c) => c.message_id).filter((m): m is string => Boolean(m));
      dealId = dealId ?? parent.deal_id;
      contactId = contactId ?? parent.contact_id;
      companyId = companyId ?? parent.company_id;
      inquiryId = parent.inquiry_id;
    }
  }

  if (!contactId) {
    const { data: c } = await supabase.from("contacts").select("id, company_id").eq("email", to[0]).maybeSingle();
    if (c) {
      contactId = c.id;
      companyId = companyId ?? c.company_id;
    }
  }

  const { messageId, from } = await sendViaGmail({
    to,
    cc,
    subject: input.subject,
    text: input.body,
    inReplyTo,
    references,
  });

  const { error } = await supabase.from("emails").insert({
    message_id: messageId,
    thread_key: threadKey ?? messageId,
    in_reply_to: inReplyTo,
    direction: "outbound",
    from_address: from.toLowerCase(),
    from_name: process.env.GMAIL_FROM_NAME || null,
    to_addresses: to,
    cc_addresses: cc,
    subject: input.subject,
    text_body: input.body,
    snippet: input.body.replace(/\s+/g, " ").slice(0, 160),
    received_at: new Date().toISOString(),
    company_id: companyId,
    contact_id: contactId,
    deal_id: dealId,
    inquiry_id: inquiryId,
    is_read: true,
  });
  if (error) throw new Error(error.message);

  if (inquiryId) {
    await supabase.from("inquiries").update({ status: "in_progress" }).eq("id", inquiryId).eq("status", "new");
  }

  revalidatePath("/inbox");
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function markEmailRead(id: string) {
  const supabase = await createClient();
  await supabase.from("emails").update({ is_read: true }).eq("id", id);
}

export async function linkEmailThreadToDeal(emailId: string, dealId: string | null) {
  const supabase = await createClient();
  const { data: em } = await supabase.from("emails").select("thread_key").eq("id", emailId).maybeSingle();
  if (!em) return;
  await supabase.from("emails").update({ deal_id: dealId }).eq("thread_key", em.thread_key);
  revalidatePath("/inbox");
  if (dealId) revalidatePath(`/deals/${dealId}`);
}

export async function runMailSync() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const results = await syncMail(createAdminClient());
  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/companies");
  revalidatePath("/");
  return results;
}
