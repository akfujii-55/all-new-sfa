"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import {
  createMailNotification,
  deleteMailNotification,
  setMailNotificationActive,
  testMailNotification,
  updateMailNotification,
} from "@/actions/mail-notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionErrorMessage } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MAIL_NOTIFICATION_KINDS,
  MAIL_NOTIFICATION_MODES,
  MAX_MAIL_NOTIFICATIONS,
  describeDestination,
  kindDef,
  type MailNotification,
  type MailNotificationKind,
} from "@/lib/mail-notifications-shared";

export interface NotifyAccountOption {
  id: string;
  email: string;
}

const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";

const KIND_COLOR: Record<MailNotificationKind, string> = {
  lark: "bg-[#3370ff]",
  slack: "bg-[#611f69]",
  chatwork: "bg-[#e8462c]",
  webhook: "bg-slate-500",
};

function KindMark({ kind }: { kind: MailNotificationKind }) {
  return <span className={cn("inline-block size-2.5 rounded-sm", KIND_COLOR[kind])} aria-hidden />;
}

/** 追加・編集のフォーム。テスト送信はフォームの内容で送る */
function NotificationForm({
  initial,
  accounts,
  onDone,
  onCancel,
}: {
  initial?: MailNotification;
  accounts: NotifyAccountOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<MailNotificationKind>(initial?.kind ?? "lark");
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const def = kindDef(kind)!;
  const formId = initial ? `mail-notification-edit-${initial.id}` : "mail-notification-create";

  return (
    <form
      id={formId}
      className="space-y-4 rounded-md border border-dashed bg-muted/30 p-4"
      action={(fd) =>
        start(async () => {
          try {
            if (initial) await updateMailNotification(initial.id, fd);
            else await createMailNotification(fd);
            toast.success(initial ? "保存しました" : "通知先を追加しました");
            onDone();
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">サービス</p>
        <div className="flex flex-wrap gap-1.5">
          {MAIL_NOTIFICATION_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm",
                kind === k.key ? "border-primary ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <KindMark kind={k.key} /> {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${formId}-name`}>名前</Label>
        <Input id={`${formId}-name`} name="name" defaultValue={initial?.name ?? ""} placeholder="営業チーム" maxLength={50} required />
        <p className="text-xs text-muted-foreground">一覧に表示する名前です。</p>
      </div>

      {def.fields.map((f) => {
        const stored = initial && initial.kind === kind;
        const storedValue = f.key === "url" ? initial?.url ?? "" : f.key === "room_id" ? initial?.room_id ?? "" : "";
        return (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`${formId}-${f.key}`}>{f.label}</Label>
            <Input
              id={`${formId}-${f.key}`}
              name={f.key}
              type={f.secret ? "password" : f.key === "url" ? "url" : "text"}
              autoComplete={f.secret ? "new-password" : "off"}
              defaultValue={stored && !f.secret ? storedValue : ""}
              placeholder={f.secret && stored && initial?.has_secret ? "(変更しないときは空のまま)" : f.placeholder}
              required={f.required && !(f.secret && stored && initial?.has_secret)}
              className={f.key === "url" ? "font-mono text-xs" : undefined}
              inputMode={f.key === "room_id" ? "numeric" : undefined}
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-account`}>対象のメールアカウント</Label>
          <select id={`${formId}-account`} name="mail_account_id" defaultValue={initial?.mail_account_id ?? ""} className={selectClass}>
            <option value="">すべてのアカウント</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-mode`}>送り方</Label>
          <select id={`${formId}-mode`} name="mode" defaultValue={initial?.mode ?? "digest"} className={selectClass}>
            {MAIL_NOTIFICATION_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        {def.help.map((h, i) => <li key={i}>{h}</li>)}
      </ol>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>やめる</Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing || pending}
          onClick={() => {
            const form = document.getElementById(formId) as HTMLFormElement | null;
            if (!form) return;
            if (!form.reportValidity()) return;
            const fd = new FormData(form);
            startTest(async () => {
              try {
                const r = await testMailNotification(fd);
                if (r.ok) toast.success(`テスト通知を送りました(${r.message})`);
                else toast.error(`テスト通知に失敗: ${r.message}`);
              } catch (e) {
                toast.error(actionErrorMessage(e));
              }
            });
          }}
        >
          <BellRing className="size-4" /> {testing ? "送信中..." : "テスト送信"}
        </Button>
        <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
      </div>
    </form>
  );
}

function NotificationRow({ item, accounts }: { item: MailNotification; accounts: NotifyAccountOption[] }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const def = kindDef(item.kind);
  const account = item.mail_account_id ? accounts.find((a) => a.id === item.mail_account_id) : null;

  if (editing) {
    return (
      <div className="py-2">
        <NotificationForm initial={item} accounts={accounts} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="inline-flex min-w-24 items-center gap-1.5 font-medium"><KindMark kind={item.kind} />{def?.label ?? item.kind}</span>
      <span className={cn(!item.is_active && "text-muted-foreground line-through")}>{item.name}</span>
      <span className="max-w-64 truncate font-mono text-xs text-muted-foreground" title={item.kind === "chatwork" ? undefined : item.url}>{describeDestination(item)}</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{account ? `${account.email} のみ` : item.mail_account_id ? "(削除されたアカウント)" : "すべてのアカウント"}</span>
      <span className="text-xs text-muted-foreground">{MAIL_NOTIFICATION_MODES.find((m) => m.key === item.mode)?.label.split("(")[0]}</span>
      {item.last_error ? (
        <span className="inline-flex items-center gap-1 text-xs text-destructive" title={item.last_error}><XCircle className="size-3.5" /> 前回失敗</span>
      ) : item.last_sent_at ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5 text-emerald-500" /> 最後の送信 {fmtDateTime(item.last_sent_at)}</span>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {confirm ? (
          <>
            <span className="text-xs text-muted-foreground">この通知先を削除しますか?</span>
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteMailNotification(item.id); toast.success("通知先を削除しました"); } catch (e) { toast.error(actionErrorMessage(e)); } })}>削除する</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>やめる</Button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={item.is_active}
              aria-label={item.is_active ? "有効(押すと停止)" : "停止中(押すと有効)"}
              disabled={pending}
              onClick={() => start(async () => { try { await setMailNotificationActive(item.id, !item.is_active); toast.success(item.is_active ? "通知を停止しました" : "通知を有効にしました"); } catch (e) { toast.error(actionErrorMessage(e)); } })}
              className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", item.is_active ? "bg-emerald-500" : "bg-muted-foreground/30")}
            >
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", item.is_active ? "left-[18px]" : "left-0.5")} />
            </button>
            <Button
              size="sm" variant="ghost" disabled={testing || pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", item.id);
                startTest(async () => {
                  try {
                    const r = await testMailNotification(fd);
                    if (r.ok) toast.success(`テスト通知を送りました(${r.message})`);
                    else toast.error(`テスト通知に失敗: ${r.message}`);
                  } catch (e) {
                    toast.error(actionErrorMessage(e));
                  }
                });
              }}
            >
              <BellRing className="size-4" /> {testing ? "送信中..." : "テスト送信"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label="編集"><Pencil className="size-4" /></Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm(true)} aria-label="削除"><Trash2 className="size-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}

/** 設定画面「新着メールの通知」: 同期で新しい受信メールを取り込んだら Lark / Slack / Chatwork / Webhook に知らせる通知先の一覧 */
export function MailNotificationSettings({ items, accounts }: { items: MailNotification[]; accounts: NotifyAccountOption[] }) {
  const [adding, setAdding] = useState(false);
  const full = items.length >= MAX_MAIL_NOTIFICATIONS;
  return (
    <div className="space-y-3 text-sm">
      <div className="divide-y rounded-md border px-3">
        {items.length === 0 && <p className="py-3 text-muted-foreground">通知先がありません。「通知先を追加」から Lark / Slack / Chatwork の Webhook を登録してください。</p>}
        {items.map((n) => <NotificationRow key={n.id} item={n} accounts={accounts} />)}
      </div>
      {adding ? (
        <NotificationForm accounts={accounts} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={full}><Plus className="size-4" /> 通知先を追加</Button>
      )}
      <p className="text-xs text-muted-foreground">
        通知するのは同期で新しく取り込んだ受信メールだけです。自分が送ったメールの控えと、自動タグで「削除リスト」が付いたメール、3 日より前に届いたメール(初回同期の過去分など)は通知しません。
        通知には差出人・件名・取引先名と、そのスレッドを開くリンクが入ります。通知先は {MAX_MAIL_NOTIFICATIONS} 件まで(現在 {items.length} 件)。
      </p>
    </div>
  );
}
