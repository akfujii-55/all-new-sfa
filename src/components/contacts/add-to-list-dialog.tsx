"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";
import { addContactsToMailingList, createMailingList } from "@/actions/mailing-lists";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actionErrorMessage } from "@/lib/errors";
import type { MailingList } from "@/lib/types";

const NEW = "__new__";

/** 担当者一覧の選択から配信リストに追加する。リストが無ければその場で作れる */
export function AddToListDialog({ contactIds, lists, onDone }: { contactIds: string[]; lists: Pick<MailingList, "id" | "name">[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [listId, setListId] = useState(lists[0]?.id ?? NEW);
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      try {
        let id = listId;
        if (id === NEW) {
          const fd = new FormData();
          fd.set("name", newName);
          id = (await createMailingList(fd)).id;
        }
        const r = await addContactsToMailingList(id, contactIds);
        toast.success(`${r.added} 名を配信リストに追加しました${r.skipped ? `(${r.skipped} 名は既に入っています)` : ""}`);
        setOpen(false);
        onDone?.();
      } catch (e) {
        toast.error(actionErrorMessage(e));
      }
    });
  }
  return (
    <>
      <Button size="sm" variant="outline" disabled={contactIds.length === 0} onClick={() => setOpen(true)}><ListPlus className="size-4" /> 配信リストに追加</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>配信リストに追加</DialogTitle>
            <DialogDescription>選択した {contactIds.length} 名を配信リストに入れます。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>配信リスト</Label>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  <SelectItem value={NEW}>＋ 新しいリストを作る</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {listId === NEW && (
              <div className="grid gap-1.5">
                <Label htmlFor="new-list-name">新しいリスト名</Label>
                <Input id="new-list-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例: 展示会 2026 名刺交換" autoFocus />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button type="button" disabled={pending || (listId === NEW && !newName.trim())} onClick={run}>{pending ? "追加中..." : "追加"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
