"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mail/smtp";
import { syncMail } from "@/lib/mail/sync";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { purgeEmails } from "@/lib/mail/trash";
import { unresolvedMerges } from "@/lib/mail/merge";
import { tenantIdOf } from "@/lib/supabase/tenant";
import { assertStorageAvailable, assertTenantWritable } from "@/lib/tenant-quota";
import {
  attachOutgoing,
  discardOutgoing,
  loadOutgoingAttachments,
  validateOutgoingRefs,
  type OutgoingAttachmentRef,
} from "@/lib/mail/attachments";
import { LoggedError, errorDetail, errorMessage, logSystem } from "@/lib/log";

import { userError } from "@/lib/errors";
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
  /** ブラウザから Storage の outbox にアップロード済みの添付ファイル */
  attachments?: OutgoingAttachmentRef[];
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
  if (!auth.user) throw userError("ログインが必要です");

  await assertTenantWritable(supabase);
  const to = splitAddrs(input.to);
  const cc = splitAddrs(input.cc);
  if (to.length === 0) throw userError("宛先を入力してください");
  if (!input.subject.trim()) throw userError("件名を入力してください");
  // テンプレートの差し込み項目が残ったまま送らない(画面の確認ダイアログでも止めている)
  const unresolved = unresolvedMerges(`${input.subject}\n${input.body}`);
  if (unresolved.length > 0) throw userError(`差し込み項目が反映されていません: ${unresolved.join(" ")}。本文を直してから送信してください`);
  const attachmentRefs = validateOutgoingRefs(input.attachments, await tenantIdOf(supabase));
  const bodyBytes = Buffer.byteLength(input.body, "utf8");
  const attachmentBytes = attachmentRefs.reduce((a, r) => a + (Number(r.size) || 0), 0);
  try {
    await assertStorageAvailable(supabase, bodyBytes + attachmentBytes);
  } catch (e) {
    await discardOutgoing(attachmentRefs);
    throw e;
  }

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

  const account = await resolveSendAccount(supabase, { accountId: input.accountId, replyToAccountId });
  let sent: Awaited<ReturnType<typeof sendMail>>;
  try {
    const attachments = await loadOutgoingAttachments(attachmentRefs);
    sent = await sendMail(account, {
      to,
      cc,
      subject: input.subject,
      text: input.body,
      inReplyTo,
      references,
      attachments,
    });
  } catch (e) {
    // 送信していないので、アップロード済みの添付は残さない
    await discardOutgoing(attachmentRefs);
    // SMTP の失敗は受信(IMAP)が動いていても起こる。後から追えるように記録して通知する
    await logSystem(
      {
        source: "mail.send",
        message: `メール送信に失敗(${account.email} → ${to.join(", ")}): ${errorMessage(e)}`,
        detail: { ...errorDetail(e), account: account.email, to, cc, subject: input.subject, attachments: attachmentRefs.map((a) => a.filename) },
        userEmail: auth.user.email ?? null,
      },
      supabase,
    );
    throw new LoggedError(`メールを送信できませんでした(${account.email}): ${errorMessage(e)}。このメールは送信されていません。`, e);
  }
  const { messageId, from } = sent;

  const { data: inserted, error } = await supabase.from("emails").insert({
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
  }).select("id").single();
  if (error) {
    // 相手には届いているのに一覧に残らない状態。次回の送信済みフォルダ同期で取り込まれるが、念のため記録する
    await logSystem(
      {
        source: "mail.send",
        message: `送信は完了しましたが記録に失敗しました(${messageId}): ${error.message}`,
        detail: { messageId, to, subject: input.subject, code: error.code },
        userEmail: auth.user.email ?? null,
      },
      supabase,
    );
    throw new LoggedError(`メールは送信されましたが、一覧への記録に失敗しました: ${error.message}`);
  }

  if (attachmentRefs.length > 0) {
    // 相手には添付付きで届いている。ここで失敗しても送信済みフォルダの同期で添付は補完されるので、記録だけ残す
    const failed = await attachOutgoing(supabase, inserted.id, attachmentRefs);
    if (failed.length > 0) {
      await logSystem(
        {
          level: "warn",
          source: "mail.send",
          message: `送信は完了しましたが添付ファイルの記録に失敗しました(${messageId}): ${failed.join(" / ")}`,
          detail: { messageId, emailId: inserted.id, failed },
          userEmail: auth.user.email ?? null,
        },
        supabase,
      );
    }
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
  if (!auth.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  // ログインユーザーのセッションで実行する(RLS で自テナントに絞られる)
  const results = await syncMail(supabase);
  revalidatePath("/inbox");
  revalidatePath("/inquiries");
  revalidatePath("/companies");
  revalidatePath("/");
  return results;
}

function revalidateAfterTrashChange() {
  revalidatePath("/inbox", "layout");
  revalidatePath("/inquiries");
  revalidatePath("/");
}

/**
 * 選択されたメールをスレッド単位でゴミ箱に移動する(deleted_at を入れるだけ。添付・タグ・紐付けはそのまま残す)。
 * 紐付いた問い合わせ・案件は残る。TRASH_RETENTION_DAYS 日以内なら restoreEmailThreads で元に戻せる。
 */
export async function deleteEmailThreads(emailIds: string[]): Promise<{ deleted: number; threadKeys: string[] }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");

  const ids = Array.from(new Set(emailIds.filter(Boolean)));
  if (ids.length === 0) return { deleted: 0, threadKeys: [] };

  const { data: seeds, error: seedErr } = await supabase.from("emails").select("thread_key").in("id", ids);
  if (seedErr) throw userError(seedErr.message);
  const threadKeys = Array.from(new Set((seeds ?? []).map((e) => e.thread_key as string)));
  if (threadKeys.length === 0) return { deleted: 0, threadKeys: [] };

  const { data, error } = await supabase.rpc("email_trash_move", { p_thread_keys: threadKeys });
  if (error) throw userError(error.message);

  revalidateAfterTrashChange();
  return { deleted: Number(data ?? 0), threadKeys };
}

/** ゴミ箱のスレッドを元に戻す。戻したメールの件数を返す */
export async function restoreEmailThreads(threadKeys: string[]): Promise<{ restored: number }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");
  const keys = Array.from(new Set(threadKeys.filter(Boolean)));
  if (keys.length === 0) return { restored: 0 };

  const { data, error } = await supabase.rpc("email_trash_restore", { p_thread_keys: keys });
  if (error) throw userError(error.message);
  revalidateAfterTrashChange();
  return { restored: Number(data ?? 0) };
}

/** ゴミ箱のスレッドを今すぐ完全に削除する(添付の実体も消す)。消したメールの件数を返す */
export async function purgeEmailThreads(threadKeys: string[]): Promise<{ purged: number }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");
  const keys = Array.from(new Set(threadKeys.filter(Boolean)));
  if (keys.length === 0) return { purged: 0 };

  const { data, error } = await supabase.from("email_trash").select("id").in("thread_key", keys);
  if (error) throw userError(error.message);
  let purged = 0;
  try {
    purged = await purgeEmails(supabase, (data ?? []).map((r) => r.id as string));
  } catch (e) {
    throw userError(`完全な削除に失敗しました: ${errorMessage(e)}`);
  }
  revalidateAfterTrashChange();
  return { purged };
}
