"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Trash2, UserPlus, Search, BellOff } from "lucide-react";
import { addContactsToMailingList, importCsvToMailingList, removeContactsFromMailingList, deleteMailingList, type CsvImportResult } from "@/actions/mailing-lists";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { actionErrorMessage } from "@/lib/errors";
import { fmtDate } from "@/lib/format";

export interface ListContactRow {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  unsubscribed_at: string | null;
  company: { id: string; name: string } | null;
  added_at: string;
}

export interface ContactCandidate {
  id: string;
  name: string;
  email: string | null;
  company_name: string | null;
}

/** 配信リスト 1 件の担当者一覧。選んで外す、担当者から探して追加、CSV の読み込み、リストの削除 */
export function ListContacts({ listId, listName, rows, candidates }: { listId: string; listName: string; rows: ListContactRow[]; candidates: ContactCandidate[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const ids = rows.map((r) => r.id);
  const selectedIds = ids.filter((id) => selected.has(id));
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const sendable = rows.filter((r) => r.email && !r.unsubscribed_at).length;

  function removeSelected() {
    start(async () => {
      try {
        await removeContactsFromMailingList(listId, selectedIds);
        toast.success(`${selectedIds.length} 名をリストから外しました`);
        setSelected(new Set());
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AddContactsDialog listId={listId} candidates={candidates.filter((c) => !ids.includes(c.id))} />
        <CsvImportDialog listId={listId} />
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} 名(送れる宛先 {sendable} 名)</span>
        <DeleteListButton listId={listId} listName={listName} onDeleted={() => router.push("/campaigns/lists")} />
      </div>
      <div className="rounded-lg border bg-card scroll-x">
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <Checkbox checked={allChecked ? true : selectedIds.length > 0 ? "indeterminate" : false} onCheckedChange={(v) => setSelected(v === true ? new Set(ids) : new Set())} aria-label="すべて選択" />
          {selectedIds.length > 0 ? (
            <>
              <span className="text-sm text-muted-foreground">{selectedIds.length} 名選択</span>
              <Button size="sm" variant="outline" disabled={pending} onClick={removeSelected}><Trash2 className="size-4" /> リストから外す</Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">担当者を選んでリストから外せます。担当者そのものは削除されません</span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">まだ担当者が入っていません。「担当者から追加」か「CSV を読み込む」で追加してください。担当者一覧で選択して「配信リストに追加」もできます。</p>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>氏名</TableHead>
                <TableHead>会社</TableHead>
                <TableHead>メール</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>追加日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v === true) n.add(r.id); else n.delete(r.id); return n; })} aria-label="選択" /></TableCell>
                  <TableCell className="font-medium">{r.name}{r.title ? <span className="ml-1 text-xs text-muted-foreground">{r.title}</span> : null}</TableCell>
                  <TableCell>{r.company ? <Link href={`/companies/${r.company.id}`} className="hover:underline">{r.company.name}</Link> : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-muted-foreground">{r.email ?? <span className="text-destructive">未登録</span>}</TableCell>
                  <TableCell>{r.unsubscribed_at ? <Badge variant="outline" className="gap-1 text-muted-foreground"><BellOff className="size-3" /> 配信停止</Badge> : r.email ? <Badge variant="secondary">送れる</Badge> : <Badge variant="outline">送れない</Badge>}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.added_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AddContactsDialog({ listId, candidates }: { listId: string; candidates: ContactCandidate[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = k ? candidates.filter((c) => c.name.toLowerCase().includes(k) || (c.email ?? "").toLowerCase().includes(k) || (c.company_name ?? "").toLowerCase().includes(k)) : candidates;
    return list.slice(0, 200);
  }, [q, candidates]);
  function add() {
    start(async () => {
      try {
        const r = await addContactsToMailingList(listId, Array.from(picked));
        toast.success(`${r.added} 名を追加しました${r.skipped ? `(${r.skipped} 名は既に入っています)` : ""}`);
        setPicked(new Set());
        setOpen(false);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><UserPlus className="size-4" /> 担当者から追加</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>担当者から追加</DialogTitle>
            <DialogDescription>登録済みの担当者を名前・メール・会社名で探して追加します。</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・メール・会社名で探す" className="pl-8" autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border divide-y text-sm">
            {hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-muted-foreground">該当する担当者がいません</p>
            ) : (
              hits.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-accent/50">
                  <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v === true) n.add(c.id); else n.delete(c.id); return n; })} />
                  <span className="min-w-0 flex-1 truncate">{c.name}{c.company_name ? <span className="text-muted-foreground"> / {c.company_name}</span> : null}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.email ?? "メール未登録"}</span>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <span className="mr-auto text-sm text-muted-foreground">{picked.size} 名選択</span>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button type="button" disabled={pending || picked.size === 0} onClick={add}>{pending ? "追加中..." : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CsvImportDialog({ listId }: { listId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [pending, start] = useTransition();
  async function onFile(file: File | undefined) {
    if (!file) return;
    const buf = await file.arrayBuffer();
    // Excel の CSV は Shift_JIS が多いので、UTF-8 で読めなければ Shift_JIS として読み直す
    const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const sjis = /�/.test(utf8) ? new TextDecoder("shift_jis").decode(buf) : utf8;
    setText(sjis);
  }
  function run() {
    start(async () => {
      try {
        const r = await importCsvToMailingList(listId, text);
        setResult(r);
        toast.success(`${r.added} 名を追加しました${r.created ? `(${r.created} 名は担当者として新しく登録)` : ""}`);
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setResult(null); setOpen(true); }}><FileUp className="size-4" /> CSV を読み込む</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>CSV を読み込む</DialogTitle>
            <DialogDescription>1 行に「氏名, メールアドレス, 会社名」の順(会社名は省略可)。1 行目が見出しなら読み飛ばします。メールアドレスで既存の担当者を探し、無ければ担当者として登録してからリストに入れます。</DialogDescription>
          </DialogHeader>
          <Input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"山田 太郎, yamada@example.com, 株式会社サンプル\n佐藤 花子, sato@example.co.jp"} className="font-mono text-xs" />
          {result && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <p>追加 {result.added} 名 / 新規登録 {result.created} 名 / 既に入っていた {result.alreadyIn} 名 / 読めなかった行 {result.invalid}</p>
              {result.errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>閉じる</Button>
            <Button type="button" disabled={pending || !text.trim()} onClick={run}>{pending ? "読み込み中..." : "読み込む"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteListButton({ listId, listName, onDeleted }: { listId: string; listName: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setOpen(true)}><Trash2 className="size-4" /> リストを削除</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>配信リストを削除しますか?</DialogTitle>
            <DialogDescription>「{listName}」を削除します。担当者そのものと、このリストで送った配信の記録は残ります。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => start(async () => { try { await deleteMailingList(listId); toast.success("削除しました"); setOpen(false); onDeleted(); } catch (e) { toast.error(actionErrorMessage(e)); } })}>{pending ? "削除中..." : "削除する"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
