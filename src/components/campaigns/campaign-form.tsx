"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Save, FlaskConical, CalendarClock } from "lucide-react";
import { saveCampaignDraft, scheduleCampaign, sendCampaignTest } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MailAccountSelect } from "@/components/inbox/mail-account-select";
import { TemplateSelect } from "@/components/mail/template-select";
import { useMailDefaults } from "@/components/mail/signature-provider";
import { DatePicker } from "@/components/date-picker/date-picker";
import { buildCampaignFooter, CAMPAIGN_LIMITS, estimateMinutes } from "@/lib/campaigns-shared";
import { initialBodyWithSignature, swapSignature } from "@/lib/mail/signature";
import { mergeInsertText, type MergeKey } from "@/lib/mail/merge";
import { actionErrorMessage } from "@/lib/errors";
import type { MailAccountOption, MailCampaign, MailingList } from "@/lib/types";

const CAMPAIGN_MERGE_KEYS: MergeKey[] = ["取引先", "担当者名", "担当者メール"];

/**
 * 配信の作成・編集。送信元・配信先リスト・件名・本文(テンプレート・差し込み)、末尾に付く文の確認、
 * 自分にテスト送信、下書き保存、すぐ送る / 日時を予約。
 */
export function CampaignForm({
  campaign,
  defaultListId = null,
  accounts,
  lists,
  footer,
  siteUrl,
  dailyLimit,
}: {
  campaign: Pick<MailCampaign, "id" | "list_id" | "account_id" | "subject" | "body"> | null;
  /** 新規作成時に選んでおく配信リスト(リスト画面の「このリストに配信」から) */
  defaultListId?: string | null;
  accounts: MailAccountOption[];
  lists: (Pick<MailingList, "id" | "name"> & { sendable: number })[];
  footer: string;
  siteUrl: string;
  dailyLimit: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { signature: commonSignature, signatures, templates } = useMailDefaults();
  const signatureOf = (id: string) => signatures[id] || commonSignature;
  const [accountId, setAccountId] = useState(campaign?.account_id ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? "");
  const [listId, setListId] = useState(campaign?.list_id ?? (defaultListId && lists.some((l) => l.id === defaultListId) ? defaultListId : lists[0]?.id ?? ""));
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.body ?? initialBodyWithSignature(signatureOf(accountId)));
  const [templateId, setTemplateId] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pending, start] = useTransition();
  const list = lists.find((l) => l.id === listId);

  function changeAccount(id: string) {
    setBody((b) => swapSignature(b, signatureOf(accountId), signatureOf(id)));
    setAccountId(id);
  }
  function pickTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    // 差し込みは送るときに相手ごとに置き換えるので、そのまま残す
    if (t.subject.trim()) setSubject(t.subject);
    setBody(`${t.body}\n\n${signatureOf(accountId)}`);
  }
  function insertMerge(key: MergeKey) {
    const el = bodyRef.current;
    const text = mergeInsertText(key);
    if (!el) return setBody((b) => b + text);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? s;
    const next = body.slice(0, s) + text + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  }
  function formData(extra?: Record<string, string>) {
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("account_id", accountId);
    fd.set("list_id", listId);
    fd.set("subject", subject);
    fd.set("body", body);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    return fd;
  }
  function saveDraft() {
    start(async () => {
      try {
        const r = await saveCampaignDraft(campaign?.id ?? null, formData());
        toast.success("下書きを保存しました");
        if (!campaign) router.push(`/campaigns/${r.id}`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  function test() {
    start(async () => {
      try {
        const r = await sendCampaignTest(formData());
        toast.success(`${r.to} にテスト送信しました`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  function send(scheduledAt?: string) {
    start(async () => {
      try {
        const r = await scheduleCampaign(campaign?.id ?? null, formData(scheduledAt ? { scheduled_at: scheduledAt } : {}));
        toast.success(scheduledAt ? `${r.pending} 名への配信を予約しました` : `${r.pending} 名への配信を始めました`);
        setScheduleOpen(false);
        router.push(`/campaigns/${r.id}`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  const sendable = list?.sendable ?? 0;
  const minutes = estimateMinutes(sendable);

  return (
    <form ref={formRef} className="grid gap-4 lg:grid-cols-[1fr_300px]" onSubmit={(e) => e.preventDefault()}>
      <div className="space-y-4 min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>送信元</Label>
            {accounts.length === 0 ? <p className="text-sm text-destructive">メールアカウントがありません。設定で連携してください</p> : <MailAccountSelect accounts={accounts} value={accountId} onChange={changeAccount} />}
          </div>
          <div className="grid gap-1.5">
            <Label>配信先のリスト</Label>
            {lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">配信リストがありません。<Link href="/campaigns/lists" className="underline">配信リストを作る</Link></p>
            ) : (
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue placeholder="リストを選択" /></SelectTrigger>
                <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}(送れる宛先 {l.sendable} 名)</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="cp-subject">件名</Label>
            <TemplateSelect templates={templates} value={templateId} onChange={pickTemplate} disabled={pending} />
          </div>
          <Input id="cp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={CAMPAIGN_LIMITS.subject} placeholder="例: 【ご案内】11 月 EC 運営セミナー" />
        </div>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="cp-body">本文</Label>
            <span className="text-xs text-muted-foreground">差し込む:</span>
            {CAMPAIGN_MERGE_KEYS.map((k) => (
              <Button key={k} type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => insertMerge(k)}>{`{{${k}}}`}</Button>
            ))}
          </div>
          <Textarea id="cp-body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={16} maxLength={CAMPAIGN_LIMITS.body} className="font-mono text-sm" />
          <p className="text-xs text-muted-foreground">送るときに相手ごとに {`{{取引先}}`} は会社名、{`{{担当者名}}`} は氏名、{`{{担当者メール}}`} はメールアドレスに置き換わります。値が無い相手には印のまま届くので、氏名未登録の人がいるリストでは「様」の前に使わないか、CSV で氏名を入れてください。</p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <p className="mb-1 text-muted-foreground">末尾に自動で付く文(送信者情報と配信停止リンク。<Link href="/settings#campaigns" className="underline">設定</Link>で変更)</p>
          <pre className="whitespace-pre-wrap font-sans">{buildCampaignFooter(footer || "(設定の「一斉配信」で送信者情報を入力してください)", `${siteUrl}/u/xxxxxxxx`)}</pre>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
          <p className="font-medium">送る</p>
          <p className="text-muted-foreground text-xs">
            {list ? `「${list.name}」の送れる宛先 ${sendable} 名に、5 分おきに 30 通ずつ送ります(約 ${minutes} 分)。` : "配信先のリストを選んでください。"}
            {sendable > dailyLimit ? ` 1 日の上限(${dailyLimit} 通)を超える分は翌日に続けて送ります。` : ""}
          </p>
          <div className="grid gap-2">
            <Button type="button" disabled={pending || !listId || !accountId} onClick={() => send()}><Send className="size-4" /> すぐ送る</Button>
            <Button type="button" variant="outline" disabled={pending || !listId || !accountId} onClick={() => setScheduleOpen(true)}><CalendarClock className="size-4" /> 日時を予約</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-sm space-y-2">
          <p className="font-medium">送る前に</p>
          <div className="grid gap-2">
            <Button type="button" variant="outline" disabled={pending || !accountId} onClick={test}><FlaskConical className="size-4" /> 自分にテスト送信</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={saveDraft}><Save className="size-4" /> 下書きを保存</Button>
          </div>
          <p className="text-xs text-muted-foreground">テスト送信はログイン中のメールアドレスに、差し込みをサンプル値にして届きます。</p>
        </div>
      </aside>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>日時を予約</DialogTitle>
            <DialogDescription>指定した日時の次の定期処理(5 分おき)から送り始めます。宛先は今の時点のリストで確定します。</DialogDescription>
          </DialogHeader>
          <ScheduleBody onSubmit={(v) => send(v)} pending={pending} />
        </DialogContent>
      </Dialog>
    </form>
  );
}

function ScheduleBody({ onSubmit, pending }: { onSubmit: (v: string) => void; pending: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("scheduled_at") ?? "");
        if (!v) return toast.error("日時を選んでください");
        onSubmit(v);
      }}
    >
      <DatePicker name="scheduled_at" mode="datetime" allowNoTime={false} emptyLabel="日時を選ぶ" />
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? "予約中..." : "予約する"}</Button>
      </DialogFooter>
    </form>
  );
}
