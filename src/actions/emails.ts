"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail/smtp";
import { syncMail } from "@/lib/mail/sync";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { createAdminClient } from "@/lib/supabase/server";
import { removeAttachmentObjects } from "@/lib/mail/attachments";
import { LoggedError, errorDetail, errorMessage, logSystem } from "@/lib/log";

export interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  replyToEmailId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  /** 差出人にするメールアカウント。未指定なら返信元を受信したアカウント → 既定アカウント */
  accountId?: string | null;
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
  let replyToAccountId: string | null = null;

  if (input.replyToEmailId) {
    const { data: parent } = await supabase
      .from("emails")
      .select("message_id, thread_key, deal_id, contact_id, company_id, inquiry_id, account_id")
      .eq("id", input.replyToEmailId)
      .maybeSingle();
    if (parent) {
      replyToAccountId = parent.account_id;
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

  const admin = createAdminClient();
  const account = await resolveSendAccount(admin, { accountId: input.accountId, replyToAccountId });
  let sent: Awaited<ReturnType<typeof sendMail>>;
  try {
    sent = await sendMail(account, {
      to,
      cc,
      subject: input.subject,
      text: input.body,
      inReplyTo,
      references,
    });
  } catch (e) {
    // SMTP の失敗は受信(IMAP)が動いていても起こる。後から追えるように記録して通知する
    await logSystem(
      {
        source: "mail.send",
        message: `メール送信に失敗(${account.email} → ${to.join(", ")}): ${errorMessage(e)}`,
        detail: { ...errorDetail(e), account: account.email, to, cc, subject: input.subject },
        userEmail: auth.user.email ?? null,
      },
      admin,
    );
    throw new LoggedError(`メールを送信できませんでした(${account.email}): ${errorMessage(e)}。このメールは送信されていません。`, e);
  }
  const { messageId, from } = sent;

  const { error } = await supabase.from("emails").insert({
    message_id: messageId,
    thread_key: threadKey ?? messageId,
    in_reply_to: inReplyTo,
    direction: "outbound",
    from_address: from.toLowerCase(),
    from_name: account.fromName,
    account_id: account.id,
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
  if (error) {
    // 相手には届いているのに一覧に残らない状態。次回の送信済みフォルダ同期で取り込まれるが、念のため記録する
    await logSystem(
      {
        source: "mail.send",
        message: `送信は完了しましたが記録に失敗しました(${messageId}): ${error.message}`,
        detail: { messageId, to, subject: input.subject, code: error.code },
        userEmail: auth.user.email ?? null,
      },
      admin,
    );
    throw new LoggedError(`メールは送信されましたが、一覧への記録に失敗しました: ${error.message}`);
  }

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

/** 選択されたメールをスレッド単位で削除する。紐付いた問い合わせ・案件は残る。 */
export async function deleteEmailThreads(emailIds: string[]): Promise<{ deleted: number }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");

  const ids = Array.from(new Set(emailIds.filter(Boolean)));
  if (ids.length === 0) return { deleted: 0 };

  const { data: seeds, error: seedErr } = await supabase.from("emails").select("thread_key").in("id", ids);
  if (seedErr) throw new Error(seedErr.message);
  const threadKeys = Array.from(new Set((seeds ?? []).map((e) => e.thread_key)));
  if (threadKeys.length === 0) return { deleted: 0 };

  // 添付ファイルの実体を先に消す(行は emails の削除で cascade)
  const { data: members } = await supabase.from("emails").select("id").in("thread_key", threadKeys);
  await removeAttachmentObjects(createAdminClient(), (members ?? []).map((m) => m.id));

  const { count, error } = await supabase.from("emails").delete({ count: "exact" }).in("thread_key", threadKeys);
  if (error) throw new Error(error.message);

  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/");
  return { deleted: count ?? 0 };
}
