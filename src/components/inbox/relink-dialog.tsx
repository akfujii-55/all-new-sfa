"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { relinkThread, type RelinkTarget } from "@/actions/links";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PickerList } from "@/components/links/picker-list";

type Mode = "contact" | "company" | "new" | "none";
const MODE_LABEL: Record<Mode, string> = {
  contact: "登録済みの担当者を選ぶ",
  company: "取引先だけを指定する(担当者なし)",
  new: "新しい担当者を登録する",
  none: "紐付けを外す",
};

/** スレッドの担当者・取引先を付け替える(自動登録が間違っていたときの修正用) */
export function RelinkDialog({
  emailId,
  contacts,
  companies,
  currentContactId,
  currentCompanyId,
}: {
  emailId: string;
  contacts: { id: string; name: string; company_id: string | null; email?: string | null }[];
  companies: { id: string; name: string }[];
  currentContactId: string | null;
  currentCompanyId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("contact");
  const [contactId, setContactId] = useState<string | null>(currentContactId);
  const [companyId, setCompanyId] = useState<string | null>(currentCompanyId);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompanyId, setNewCompanyId] = useState<string>(currentCompanyId ?? "");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [pending, start] = useTransition();
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  function submit() {
    let target: RelinkTarget;
    if (mode === "contact") {
      if (!contactId) return toast.error("担当者を選んでください");
      target = { kind: "contact", contactId };
    } else if (mode === "company") {
      if (!companyId) return toast.error("取引先を選んでください");
      target = { kind: "company", companyId };
    } else if (mode === "new") {
      target = { kind: "new", name: newName, email: newEmail || null, companyId: newCompanyId === "new" ? null : newCompanyId || null, newCompanyName: newCompanyId === "new" ? newCompanyName : null };
    } else {
      target = { kind: "none" };
    }
    start(async () => {
      try {
        await relinkThread(emailId, target);
        toast.success("担当者・取引先を変更しました");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full"><Link2 className="size-4" /> 担当者・取引先を変更</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>担当者・取引先を変更</DialogTitle>
          <DialogDescription>このスレッドのすべてのメールと、このメールから登録した問い合わせに反映します。別の取引先の案件に紐付いていた場合、案件への紐付けは外れます。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>変更方法</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as Mode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {mode === "contact" && (
            <PickerList
              items={contacts.map((c) => ({ id: c.id, label: c.name, sub: [c.company_id ? companyName.get(c.company_id) : null, c.email].filter(Boolean).join(" · ") || null }))}
              value={contactId}
              onChange={setContactId}
              placeholder="担当者名・会社名・メールで検索"
            />
          )}
          {mode === "company" && (
            <PickerList items={companies.map((c) => ({ id: c.id, label: c.name }))} value={companyId} onChange={setCompanyId} placeholder="会社名で検索" />
          )}
          {mode === "new" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="relink-name">氏名 *</Label>
                  <Input id="relink-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="relink-email">メールアドレス</Label>
                  <Input id="relink-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="今後このアドレスからのメールを紐付けます" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>取引先</Label>
                <Select value={newCompanyId || "none"} onValueChange={(v) => setNewCompanyId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="取引先を選択" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未所属</SelectItem>
                    <SelectItem value="new">新しい取引先を登録する</SelectItem>
                    {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {newCompanyId === "new" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="relink-company">新しい取引先の会社名 *</Label>
                  <Input id="relink-company" value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} required />
                </div>
              )}
            </div>
          )}
          {mode === "none" && <p className="text-sm text-muted-foreground">このスレッドを取引先・担当者・案件から切り離します。取引先や担当者そのものは削除されません。</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
          <Button type="button" onClick={submit} disabled={pending}>{pending ? "変更中..." : "変更する"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
