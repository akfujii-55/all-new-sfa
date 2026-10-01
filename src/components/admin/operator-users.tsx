"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Send, UserMinus } from "lucide-react";
import { inviteOperator, removeOperator, setOperatorTenants, updateOperator, type OperatorRow } from "@/actions/admin";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

import { actionErrorMessage } from "@/lib/errors";
export function OperatorUsers({ operators, currentUserId, isSuper, tenants }: { operators: OperatorRow[]; currentUserId: string; isSuper: boolean; tenants: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [editing, setEditing] = useState<OperatorRow | null>(null);
  // 「入れるテナント」を編集中の運営者と、チェックの状態
  const [access, setAccess] = useState<OperatorRow | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
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
                    toast.error(actionErrorMessage(e));
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
              {isSuper && !editing.is_super && editing.user_id !== currentUserId && (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit_op_kind">区分</Label>
                  <select id="edit_op_kind" name="kind" defaultValue={editing.support_only ? "support" : "operator"} className="h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="operator">運営者(運営管理も使う)</option>
                    <option value="support">運営サポート専用(テナントの画面だけ)</option>
                  </select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">メールアドレス: {editing.email ?? "-"}(変更できません)</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                <Button type="submit" disabled={pending}>{pending ? "保存中..." : "保存"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(access)} onOpenChange={(o) => { if (!o) setAccess(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>入れるテナント: {access?.full_name ?? access?.email ?? ""}</DialogTitle></DialogHeader>
          {access && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                チェックしたテナントに、この運営者が同じログインで入れるようになります(画面上部でテナントを切り替え)。
                テナントの営業担当者に「運営サポート」として表示され、ユーザー数には数えません。
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                {tenants.map((t) => {
                  const home = t.id === access.home_tenant_id;
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={home || checked.includes(t.id)}
                        disabled={home}
                        onCheckedChange={(v) => setChecked((c) => (v === true ? [...c, t.id] : c.filter((id) => id !== t.id)))}
                      />
                      <span className="truncate">{t.name}</span>
                      {home && <span className="text-xs text-muted-foreground">(所属)</span>}
                    </label>
                  );
                })}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAccess(null)}>キャンセル</Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      try {
                        await setOperatorTenants(access.user_id, checked);
                        toast.success("入れるテナントを保存しました");
                        setAccess(null);
                      } catch (e) {
                        toast.error(actionErrorMessage(e));
                      }
                    })
                  }
                >
                  {pending ? "保存中..." : "保存"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>氏名</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>入れるテナント</TableHead>
            <TableHead>メモ</TableHead>
            <TableHead>追加日</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {operators.map((o) => (
            <TableRow key={o.user_id}>
              <TableCell className="font-medium">{o.full_name ?? "-"}{o.user_id === currentUserId && <span className="ml-2 text-xs text-muted-foreground">(自分)</span>}</TableCell>
              <TableCell className="text-muted-foreground">{o.email ?? "-"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {o.is_super ? <Badge>スーパーユーザー</Badge> : o.support_only ? <Badge variant="outline">運営サポート専用</Badge> : <Badge variant="outline">運営者</Badge>}
                  {!o.is_super && o.pending && <Badge variant="secondary">招待中(未ログイン)</Badge>}
                </div>
              </TableCell>
              <TableCell className="max-w-56 whitespace-normal text-muted-foreground">
                {[o.home_tenant_id, ...o.support_tenant_ids].filter((id): id is string => Boolean(id)).map((id) => tenantName.get(id) ?? "-").join("、") || "なし"}
              </TableCell>
              <TableCell className="max-w-40 whitespace-normal text-muted-foreground">{o.note ?? ""}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {(isSuper || o.user_id === currentUserId) && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(o)} title="氏名・メモを編集">
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {isSuper && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setChecked(o.support_tenant_ids); setAccess(o); }} title="入れるテナントを設定">
                      <Building2 className="size-4" />
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
                            toast.error(actionErrorMessage(e));
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
                toast.error(actionErrorMessage(e));
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
            <Label htmlFor="op_kind">区分</Label>
            <select id="op_kind" name="kind" defaultValue="operator" className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="operator">運営者(運営管理も使う)</option>
              <option value="support">運営サポート専用(テナントの画面だけ)</option>
            </select>
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
