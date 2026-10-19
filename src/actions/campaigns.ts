"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertTenantWritable } from "@/lib/tenant-quota";
import { getMailAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { unresolvedMerges } from "@/lib/mail/merge";
import { siteOriginForPreview } from "@/lib/mail/notify";
import { renderCampaignPreview, runCampaignBatch, snapshotRecipients } from "@/lib/mail/campaigns";
import { getCampaignSettings } from "@/lib/settings";
import { CAMPAIGN_LIMITS } from "@/lib/campaigns-shared";
import { parseLocalInput } from "@/lib/format";
import { errorMessage } from "@/lib/log";
import { userError } from "@/lib/errors";
import type { MailCampaign } from "@/lib/types";

/**
 * 一斉配信(0043)の Server Action。下書きの保存、予約・すぐ送る、一時停止・再開・取り消し、テスト送信、複製。
 * 送信そのものは src/lib/mail/campaigns.ts(定期処理から)。「すぐ送る」の直後だけ after() で最初の分を送る。
 */

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw userError("ログインが必要です");
  await assertTenantWritable(supabase);
  return { supabase, userId: data.user.id, email: data.user.email ?? null };
}

function revalidate(id?: string | null) {
  revalidatePath("/campaigns", "layout");
  if (id) revalidatePath(`/campaigns/${id}`);
}

function s(v: FormDataEntryValue | null | undefined): string {
  return String(v ?? "").replace(/\r\n/g, "\n").trim();
}

interface CampaignInput {
  list_id: string | null;
  account_id: string | null;
  subject: string;
  body: string;
}

function parseInput(formData: FormData): CampaignInput {
  const subject = s(formData.get("subject"));
  const body = s(formData.get("body"));
  if (subject.length > CAMPAIGN_LIMITS.subject) throw userError(`件名は ${CAMPAIGN_LIMITS.subject} 文字以内にしてください`);
  if (body.length > CAMPAIGN_LIMITS.body) throw userError(`本文は ${CAMPAIGN_LIMITS.body} 文字以内にしてください`);
  return { list_id: s(formData.get("list_id")) || null, account_id: s(formData.get("account_id")) || null, subject, body };
}

/** 送る前に揃っているべきもの(下書き保存では確認しない) */
async function assertSendable(supabase: Awaited<ReturnType<typeof createClient>>, c: CampaignInput): Promise<void> {
  if (!c.subject) throw userError("件名を入力してください");
  if (!c.body) throw userError("本文を入力してください");
  if (!c.list_id) throw userError("配信先のリストを選んでください");
  if (!c.account_id) throw userError("送信元のメールアカウントを選んでください");
  const unresolved = unresolvedMerges(`${c.subject}\n${c.body}`).filter((k) => !["{{取引先}}", "{{担当者名}}", "{{担当者メール}}"].includes(k));
  if (unresolved.length > 0) throw userError(`一斉配信で使える差し込みは {{取引先}} {{担当者名}} {{担当者メール}} です。${unresolved.join(" ")} は使えません`);
  const settings = await getCampaignSettings(supabase);
  if (!settings.campaign_footer.trim()) throw userError("設定の「一斉配信」で送信者情報(会社名・住所・連絡先)を入力してください。法律で表示が必要なため、本文の末尾に自動で付きます");
  const { data: list } = await supabase.from("mailing_lists").select("id").eq("id", c.list_id).maybeSingle();
  if (!list) throw userError("配信先のリストが見つかりません");
  const { data: account } = await supabase.from("mail_accounts").select("id").eq("id", c.account_id).eq("is_active", true).maybeSingle();
  if (!account) throw userError("送信元のメールアカウントが見つかりません");
}

/** 下書きとして保存する(新規なら id を返す) */
export async function saveCampaignDraft(id: string | null, formData: FormData): Promise<{ id: string }> {
  const { supabase, userId } = await requireUser();
  const c = parseInput(formData);
  if (!c.subject && !c.body) throw userError("件名か本文を入力してください");
  const listName = c.list_id ? ((await supabase.from("mailing_lists").select("name").eq("id", c.list_id).maybeSingle()).data?.name as string | undefined) ?? "" : "";
  if (id) {
    const { data: before } = await supabase.from("mail_campaigns").select("status").eq("id", id).maybeSingle();
    if (!before) throw userError("配信が見つかりません");
    if (!["draft", "paused"].includes(before.status as string)) throw userError("下書きと一時停止中の配信だけ編集できます");
    const { error } = await supabase.from("mail_campaigns").update({ ...c, subject: c.subject || "(件名なし)", list_name: listName }).eq("id", id);
    if (error) throw userError("配信を保存できませんでした");
    revalidate(id);
    return { id };
  }
  const { data, error } = await supabase.from("mail_campaigns").insert({ ...c, subject: c.subject || "(件名なし)", list_name: listName, created_by: userId }).select("id").single();
  if (error) throw userError("配信を保存できませんでした");
  revalidate();
  return { id: data.id as string };
}

/**
 * 送信を予約する。scheduled_at が無ければ「すぐ送る」(直後に最初の分を after() で送る)。
 * 宛先はこの時点でリストから写す(以後リストを変えても、この配信の宛先は変わらない)。
 */
export async function scheduleCampaign(id: string | null, formData: FormData): Promise<{ id: string; total: number; pending: number; skipped: number }> {
  const { supabase, userId } = await requireUser();
  const c = parseInput(formData);
  await assertSendable(supabase, c);
  const scheduledAt = parseLocalInput(s(formData.get("scheduled_at")));
  const now = scheduledAt ? new Date(scheduledAt).getTime() <= Date.now() + 60_000 : true;
  const { data: list } = await supabase.from("mailing_lists").select("name").eq("id", c.list_id!).maybeSingle();

  let campaignId = id;
  if (campaignId) {
    const { data: before } = await supabase.from("mail_campaigns").select("status").eq("id", campaignId).maybeSingle();
    if (!before) throw userError("配信が見つかりません");
    if (before.status !== "draft") throw userError("下書きの配信だけ送信を始められます");
    const { error } = await supabase.from("mail_campaigns").update({ ...c, list_name: list?.name ?? "" }).eq("id", campaignId);
    if (error) throw userError("配信を保存できませんでした");
  } else {
    const { data, error } = await supabase.from("mail_campaigns").insert({ ...c, list_name: list?.name ?? "", created_by: userId }).select("id").single();
    if (error) throw userError("配信を保存できませんでした");
    campaignId = data.id as string;
  }

  // 宛先を写す(やり直しに備えて前回分を消す)
  await supabase.from("mail_campaign_recipients").delete().eq("campaign_id", campaignId);
  const snap = await snapshotRecipients(supabase, { id: campaignId, list_id: c.list_id });
  if (snap.pending === 0) {
    await supabase.from("mail_campaign_recipients").delete().eq("campaign_id", campaignId);
    await supabase.from("mail_campaigns").update({ total_count: 0, skipped_count: 0 }).eq("id", campaignId);
    throw userError(snap.total === 0 ? "配信リストに担当者がいません" : "送れる宛先がありません(全員が配信停止かメールアドレス未登録です)");
  }
  const { error } = await supabase
    .from("mail_campaigns")
    .update(now ? { status: "sending", scheduled_at: new Date().toISOString(), started_at: new Date().toISOString(), last_error: null } : { status: "scheduled", scheduled_at: scheduledAt, last_error: null })
    .eq("id", campaignId);
  if (error) throw userError("配信を開始できませんでした");
  revalidate(campaignId);
  if (now) {
    const db = supabase;
    const cid = campaignId;
    after(async () => {
      try {
        await runCampaignBatch(db, cid);
        revalidatePath(`/campaigns/${cid}`);
      } catch (e) {
        console.warn("[campaigns] 最初の送信に失敗:", errorMessage(e));
      }
    });
  }
  return { id: campaignId, ...snap };
}

export async function pauseCampaign(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("mail_campaigns").update({ status: "paused" }).eq("id", id).in("status", ["scheduled", "sending"]);
  if (error) throw userError("一時停止できませんでした");
  revalidate(id);
}

/** 一時停止を再開する(未送信の宛先の続きから送る)。予約中に止めたものも、再開するとすぐ送り始める */
export async function resumeCampaign(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data: c } = await supabase.from("mail_campaigns").select("id, status, list_id, account_id, subject, body").eq("id", id).maybeSingle();
  if (!c) throw userError("配信が見つかりません");
  if (c.status !== "paused") throw userError("一時停止中の配信だけ再開できます");
  await assertSendable(supabase, { list_id: c.list_id as string | null, account_id: c.account_id as string | null, subject: c.subject as string, body: c.body as string });
  const { count } = await supabase.from("mail_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "pending");
  if ((count ?? 0) === 0) {
    await supabase.from("mail_campaigns").update({ status: "done", finished_at: new Date().toISOString(), last_error: null }).eq("id", id);
    revalidate(id);
    return;
  }
  const { error } = await supabase.from("mail_campaigns").update({ status: "sending", started_at: new Date().toISOString(), last_error: null, locked_at: null }).eq("id", id);
  if (error) throw userError("再開できませんでした");
  revalidate(id);
  after(async () => {
    try {
      await runCampaignBatch(supabase, id);
      revalidatePath(`/campaigns/${id}`);
    } catch (e) {
      console.warn("[campaigns] 再開後の送信に失敗:", errorMessage(e));
    }
  });
}

/** 取り消す(未送信の宛先には送らない。送った分の記録は残る) */
export async function cancelCampaign(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("mail_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "sending", "paused"]);
  if (error) throw userError("取り消せませんでした");
  await supabase.from("mail_campaign_recipients").update({ status: "skipped", reason: "配信を取り消した" }).eq("campaign_id", id).eq("status", "pending");
  revalidate(id);
}

/** 下書き・取り消し・完了の配信を削除する(送信中は取り消してから) */
export async function deleteCampaign(id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data: c } = await supabase.from("mail_campaigns").select("status").eq("id", id).maybeSingle();
  if (!c) return;
  if (["scheduled", "sending"].includes(c.status as string)) throw userError("予約中・送信中の配信は削除できません。先に取り消してください");
  const { error } = await supabase.from("mail_campaigns").delete().eq("id", id);
  if (error) throw userError("削除できませんでした");
  revalidate();
}

/** 同じ内容で新しい下書きを作る */
export async function duplicateCampaign(id: string): Promise<{ id: string }> {
  const { supabase, userId } = await requireUser();
  const { data: c } = await supabase.from("mail_campaigns").select("list_id, list_name, account_id, subject, body").eq("id", id).maybeSingle();
  if (!c) throw userError("配信が見つかりません");
  const { data, error } = await supabase.from("mail_campaigns").insert({ ...(c as Pick<MailCampaign, "list_id" | "list_name" | "account_id" | "subject" | "body">), created_by: userId }).select("id").single();
  if (error) throw userError("複製できませんでした");
  revalidate();
  return { id: data.id as string };
}

/** 入力中の内容を自分(ログイン中のメールアドレス)に送って確認する。差し込みはサンプル値 */
export async function sendCampaignTest(formData: FormData): Promise<{ to: string }> {
  const { supabase, email } = await requireUser();
  const c = parseInput(formData);
  if (!c.subject || !c.body) throw userError("件名と本文を入力してください");
  if (!c.account_id) throw userError("送信元のメールアカウントを選んでください");
  if (!email) throw userError("ログイン中のメールアドレスが分かりません");
  const settings = await getCampaignSettings(supabase);
  const footer = settings.campaign_footer.trim() || "(設定の「一斉配信」で送信者情報を入力すると、ここに会社名・住所・連絡先が入ります)";
  const account = await getMailAccount(supabase, c.account_id);
  if (!account) throw userError("送信元のメールアカウントが見つかりません");
  const preview = renderCampaignPreview(c, footer, { company: "株式会社サンプル", name: "山田 太郎", email: "sample@example.com" }, siteOriginForPreview());
  try {
    await sendMail(account, { to: [email], subject: `[テスト] ${preview.subject}`, text: preview.text });
  } catch (e) {
    throw userError(`テスト送信に失敗しました: ${errorMessage(e).slice(0, 200)}`);
  }
  return { to: email };
}
