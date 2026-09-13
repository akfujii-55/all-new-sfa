"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Send, UserMinus } from "lucide-react";
import { inviteOperator, removeOperator, updateOperator, type OperatorRow } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export function OperatorUsers({ operators, currentUserId, isSuper }: { operators: OperatorRow[]; currentUserId: string; isSuper: boolean }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<OperatorRow | null>(null);
  return (
    <div className="space-y-4">
      <Dialog open={Boolean(editing)} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>運営者を編集</DialogTitle></DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              action={(fd) =>
                start(async () => {
                  try {
                    await updateOperator(editing.user_id, fd);
                    toast.success("保存しました");
                    setEditing(null);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })
              }
            >
              <div className="grid gap-1.5">
                <Label htmlFor="edit_op_name">氏名</Label>
                <Input id="edit_op_name" name="name" defaultValue={editing.full_name ?? ""} maxLength={50} required autoFocus />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit_op_note">メモ</Label>
                <Input id="edit_op_note" name="note" defaultValue={editing.note ?? ""} placeholder="役割など" />
              </div>
              <p className="text-xs text-muted-foreground">メールアドレス: {editing.email ?? "-"}(変更できません)</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>氏名</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>メモ</TableHead>
            <TableHead>追加日</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {operators.map((o) => (
            <TableRow key={o.user_id}>
              <TableCell className="font-medium">{o.full_name ?? "-"}{o.user_id === currentUserId && <span className="ml-2 text-xs text-muted-foreground">(自分)</span>}</TableCell>
              <TableCell className="text-muted-foreground">{o.email ?? "-"}</TableCell>
              <TableCell>
                {o.is_super ? <Badge>スーパーユーザー</Badge> : o.pending ? <Badge variant="secondary">招待中(未ログイン)</Badge> : <Badge variant="outline">運営者</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{o.note ?? ""}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {(isSuper || o.user_id === currentUserId) && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(o)} title="氏名・メモを編集">
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {isSuper && !o.is_super && (
                    <Button
                      size="sm" variant="ghost" className="text-destructive" disabled={pending}
                      onClick={() =>
                        start(async () => {
                          try {
                            await removeOperator(o.user_id);
                            toast.success("運営者を削除しました");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        })
                      }
                    >
                      <UserMinus className="size-4" /> 削除
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {isSuper ? (
        <form
          id="operator-invite-form"
          className="flex flex-wrap items-end gap-2 rounded-md border p-3"
          action={(fd) =>
            start(async () => {
              try {
                const r = await inviteOperator(fd);
                if (r.mailSent) toast.success("招待メールを送りました");
                else toast.error(`招待メールを送れませんでした(${r.mailError})。表示されたリンクを手動で送ってください`);
                setLink(r.inviteLink);
                (document.getElementById("operator-invite-form") as HTMLFormElement | null)?.reset();
              } catch (e) {
                toast.error((e as Error).message);
              }
            })
          }
        >
          <div className="grid gap-1.5">
            <Label htmlFor="op_name">氏名</Label>
            <Input id="op_name" name="name" className="w-40" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op_email">メールアドレス</Label>
            <Input id="op_email" name="email" type="email" className="w-64" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op_note">メモ</Label>
            <Input id="op_note" name="note" className="w-40" placeholder="役割など" />
          </div>
          <Button type="submit" size="sm" disabled={pending}><Send className="size-4" /> {pending ? "送信中..." : "招待メールを送る"}</Button>
          {link && <p className="w-full break-all text-xs text-muted-foreground">招待リンク: {link}</p>}
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">運営者の招待・削除はスーパーユーザーのみ行えます。</p>
      )}
    </div>
  );
}
