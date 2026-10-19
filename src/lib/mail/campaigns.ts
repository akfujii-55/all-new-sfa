import type { SupabaseClient } from "@supabase/supabase-js";
import { TZDate } from "@date-fns/tz";
import { getMailAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { renderMerge } from "@/lib/mail/merge";
import { siteOriginForPreview } from "@/lib/mail/notify";
import { campaignDailyLimitOf, getCampaignSettings } from "@/lib/settings";
import { buildCampaignFooter, CAMPAIGN_BATCH_SIZE, unsubscribeUrl } from "@/lib/campaigns-shared";
import { errorMessage, logSystem } from "@/lib/log";
import { APP_TZ } from "@/lib/format";
import type { MailCampaign, MailCampaignRecipient } from "@/lib/types";

type Db = SupabaseClient;

/**
 * 一斉配信(0043)の送信。配信リストの担当者に、自社の SMTP アカウントから 1 通ずつ個別に送る。
 * - 定期処理(/api/mail/sync、5 分おき)が runDueCampaigns でテナントごとに呼ぶ。1 回で 1 配信あたり CAMPAIGN_BATCH_SIZE 通、
 *   アカウントごとに 1 日 campaign_daily_limit 通まで(Gmail などの送信上限に合わせる)。
 * - 「すぐ送る」の直後は Server Action の after() から runCampaignBatch を 1 回呼び、最初の分をすぐ送る。
 * - 送った 1 通ずつは emails に入れない(受信トレイが配信で埋まるため)。宛先ごとの結果は mail_campaign_recipients に残す。
 * - 本文は宛先ごとに差し込み({{取引先}} {{担当者名}} {{担当者メール}})を置き換え、末尾に送信者情報と配信停止リンクを付ける。
 * - 配信停止(contacts.unsubscribed_at)は宛先を写すときと送る直前の両方で確認する(予約中に停止した相手にも送らない)。
 */

const LOCK_MINUTES = 10;

/** 配信リストから宛先を写す(予約・開始時)。配信停止・アドレス無し・重複は skipped として残し、一覧で理由が分かるようにする */
export async function snapshotRecipients(db: Db, campaign: Pick<MailCampaign, "id" | "list_id">): Promise<{ total: number; pending: number; skipped: number }> {
  if (!campaign.list_id) return { total: 0, pending: 0, skipped: 0 };
  const { data } = await db
    .from("mailing_list_contacts")
    .select("contact:contacts(id, name, email, unsubscribed_at, company:companies(name))")
    .eq("list_id", campaign.list_id)
    .limit(10000);
  type Row = { contact: { id: string; name: string; email: string | null; unsubscribed_at: string | null; company: { name: string } | { name: string }[] | null } | null };
  const seen = new Set<string>();
  const rows: Omit<MailCampaignRecipient, "id" | "created_at" | "message_id" | "sent_at">[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const c = r.contact;
    if (!c) continue;
    const company = Array.isArray(c.company) ? c.company[0] : c.company;
    const email = (c.email ?? "").trim().toLowerCase();
    const base = { campaign_id: campaign.id, contact_id: c.id, email: email || `(なし)-${c.id}`, name: c.name ?? "", company_name: company?.name ?? "" };
    if (!email || !email.includes("@")) rows.push({ ...base, status: "skipped", reason: "メールアドレスが未登録" });
    else if (seen.has(email)) rows.push({ ...base, email: `${email}#${c.id.slice(0, 8)}`, status: "skipped", reason: "同じアドレスの担当者が重複" });
    else if (c.unsubscribed_at) {
      seen.add(email);
      rows.push({ ...base, status: "skipped", reason: "配信停止" });
    } else {
      seen.add(email);
      rows.push({ ...base, status: "pending", reason: null });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("mail_campaign_recipients").insert(rows.slice(i, i + 500));
    if (error) throw new Error(`宛先の登録に失敗しました: ${error.message}`);
  }
  const pending = rows.filter((r) => r.status === "pending").length;
  const skipped = rows.length - pending;
  await db.from("mail_campaigns").update({ total_count: rows.length, skipped_count: skipped }).eq("id", campaign.id);
  return { total: rows.length, pending, skipped };
}

/** JST の今日 0:00(アカウントごとの 1 日の送信数を数える起点) */
function startOfTodayJst(): string {
  const now = new TZDate(Date.now(), APP_TZ);
  return new TZDate(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, APP_TZ).toISOString();
}

/** そのアカウントから今日(JST)送った通数 */
export async function sentTodayByAccount(db: Db, accountId: string): Promise<number> {
  const { count } = await db
    .from("mail_campaign_recipients")
    .select("id, campaign:mail_campaigns!inner(account_id)", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startOfTodayJst())
    .eq("campaign.account_id", accountId);
  return count ?? 0;
}

/** 予約時刻が来た配信を送信中にし、送信中の配信を 1 回分ずつ進める(定期処理から) */
export async function runDueCampaigns(db: Db): Promise<{ campaigns: number; sent: number; failed: number }> {
  const out = { campaigns: 0, sent: 0, failed: 0 };
  const now = new Date().toISOString();
  const { data: due } = await db.from("mail_campaigns").select("id").eq("status", "scheduled").lte("scheduled_at", now);
  for (const c of due ?? []) {
    await db.from("mail_campaigns").update({ status: "sending", started_at: now }).eq("id", c.id).eq("status", "scheduled");
  }
  const { data: sending } = await db.from("mail_campaigns").select("id").eq("status", "sending").order("started_at");
  for (const c of sending ?? []) {
    const r = await runCampaignBatch(db, c.id as string);
    out.campaigns++;
    out.sent += r.sent;
    out.failed += r.failed;
  }
  return out;
}

/**
 * 送信中の配信から 1 回分(CAMPAIGN_BATCH_SIZE 通、1 日の残り以内)を送る。
 * 同時実行を避けるため locked_at を取り、取れなければ何もしない。未送信が無くなったら done にする。
 */
export async function runCampaignBatch(db: Db, campaignId: string): Promise<{ sent: number; failed: number; remaining: number }> {
  const out = { sent: 0, failed: 0, remaining: 0 };
  const lockBefore = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
  // ロック: locked_at が無いか期限切れのときだけ取れる(update の件数で判定)
  const { data: locked } = await db
    .from("mail_campaigns")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending")
    .or(`locked_at.is.null,locked_at.lt.${lockBefore}`)
    .select("id, account_id, subject, body, list_name, sent_count, failed_count");
  const campaign = locked?.[0] as Pick<MailCampaign, "id" | "account_id" | "subject" | "body" | "list_name" | "sent_count" | "failed_count"> | undefined;
  if (!campaign) return out;

  try {
    const account = campaign.account_id ? await getMailAccount(db, campaign.account_id) : null;
    if (!account) {
      await db.from("mail_campaigns").update({ status: "paused", last_error: "送信元のメールアカウントが削除または無効になっています。配信を編集して送信元を選び直してください", locked_at: null }).eq("id", campaignId);
      return out;
    }
    const settings = await getCampaignSettings(db);
    const footer = settings.campaign_footer.trim();
    if (!footer) {
      await db.from("mail_campaigns").update({ status: "paused", last_error: "設定の「一斉配信」で送信者情報(会社名・住所・連絡先)を入力してから再開してください", locked_at: null }).eq("id", campaignId);
      return out;
    }
    const dailyLimit = campaignDailyLimitOf(settings);
    const sentToday = await sentTodayByAccount(db, account.id);
    const quota = Math.min(CAMPAIGN_BATCH_SIZE, Math.max(0, dailyLimit - sentToday));
    if (quota === 0) {
      // 今日の上限に達した。明日の定期処理で続きを送る(状態は sending のまま)
      await db.from("mail_campaigns").update({ last_error: `送信元アカウントの 1 日の上限(${dailyLimit} 通)に達したため、翌日に続きを送ります`, locked_at: null }).eq("id", campaignId);
      return out;
    }

    const { data: pendingRows } = await db
      .from("mail_campaign_recipients")
      .select("id, contact_id, email, name, company_name")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at")
      .limit(quota);
    const recipients = (pendingRows ?? []) as Pick<MailCampaignRecipient, "id" | "contact_id" | "email" | "name" | "company_name">[];
    const origin = siteOriginForPreview();

    for (const r of recipients) {
      // 送る直前にも配信停止を確認し、トークンを引く(予約中に停止した相手に送らない)
      const { data: contact } = r.contact_id
        ? await db.from("contacts").select("unsubscribe_token, unsubscribed_at, email").eq("id", r.contact_id).maybeSingle()
        : { data: null };
      if (!contact) {
        await db.from("mail_campaign_recipients").update({ status: "skipped", reason: "担当者が削除された" }).eq("id", r.id);
        continue;
      }
      if (contact.unsubscribed_at) {
        await db.from("mail_campaign_recipients").update({ status: "skipped", reason: "配信停止" }).eq("id", r.id);
        continue;
      }
      const vars = { 取引先: r.company_name, 担当者名: r.name, 担当者メール: r.email };
      const subject = renderMerge(campaign.subject, vars);
      const text = renderMerge(campaign.body, vars) + buildCampaignFooter(footer, unsubscribeUrl(origin, contact.unsubscribe_token as string));
      try {
        const info = await sendMail(account, { to: [r.email], subject, text });
        await db.from("mail_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), message_id: info.messageId, reason: null }).eq("id", r.id);
        out.sent++;
      } catch (e) {
        const msg = errorMessage(e);
        await db.from("mail_campaign_recipients").update({ status: "failed", reason: msg.slice(0, 500) }).eq("id", r.id);
        out.failed++;
        // 認証エラーなど、アカウント全体で送れない状態なら続けても失敗が積み上がるだけなので止める
        if (/auth|login|credential|535|534/i.test(msg)) {
          await db.from("mail_campaigns").update({ status: "paused", last_error: `送信元アカウントで送信できませんでした: ${msg.slice(0, 300)}`, locked_at: null }).eq("id", campaignId);
          await logSystem({ level: "warn", source: "campaign.send", message: `一斉配信を一時停止しました(${campaign.list_name}): ${msg}`, detail: { campaignId }, notify: false }, db);
          break;
        }
      }
    }

    const { count: remaining } = await db.from("mail_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");
    out.remaining = remaining ?? 0;
    const { count: sentCount } = await db.from("mail_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "sent");
    const { count: failedCount } = await db.from("mail_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "failed");
    const { count: skippedCount } = await db.from("mail_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "skipped");
    const patch: Record<string, unknown> = { sent_count: sentCount ?? 0, failed_count: failedCount ?? 0, skipped_count: skippedCount ?? 0, locked_at: null };
    if (out.remaining === 0) {
      patch.status = "done";
      patch.finished_at = new Date().toISOString();
      patch.last_error = null;
    } else if (out.sent > 0) {
      patch.last_error = null;
    }
    // 一時停止にした場合は status を上書きしない
    await db.from("mail_campaigns").update(patch).eq("id", campaignId).eq("status", "sending");
    if (patch.status !== "done") await db.from("mail_campaigns").update({ sent_count: patch.sent_count, failed_count: patch.failed_count, skipped_count: patch.skipped_count, locked_at: null }).eq("id", campaignId);
  } catch (e) {
    await db.from("mail_campaigns").update({ locked_at: null, last_error: errorMessage(e).slice(0, 500) }).eq("id", campaignId);
    await logSystem({ level: "warn", source: "campaign.send", message: `一斉配信の送信でエラー: ${errorMessage(e)}`, detail: { campaignId }, notify: false }, db);
  }
  return out;
}

/** 本文の差し込みと末尾の文を含めた、1 人分の送信内容(テスト送信・プレビュー用) */
export function renderCampaignPreview(campaign: Pick<MailCampaign, "subject" | "body">, footer: string, sample: { company: string; name: string; email: string }, origin: string): { subject: string; text: string } {
  const vars = { 取引先: sample.company, 担当者名: sample.name, 担当者メール: sample.email };
  return {
    subject: renderMerge(campaign.subject, vars),
    text: renderMerge(campaign.body, vars) + buildCampaignFooter(footer, unsubscribeUrl(origin, "x".repeat(32))),
  };
}
