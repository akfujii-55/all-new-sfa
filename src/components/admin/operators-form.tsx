"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { UserMinus } from "lucide-react";
import { addOperator, removeOperator, type OperatorRow } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export function OperatorsForm({ operators, currentUserId }: { operators: OperatorRow[]; currentUserId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>氏名</TableHead>
            <TableHead>メール</TableHead>
            <TableHead>メモ</TableHead>
            <TableHead>追加日</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {operators.map((o) => (
            <TableRow key={o.user_id}>
              <TableCell className="font-medium">{o.full_name ?? "-"}{o.user_id === currentUserId && <span className="ml-2 text-xs text-muted-foreground">(自分)</span>}</TableCell>
              <TableCell className="text-muted-foreground">{o.email ?? "-"}</TableCell>
              <TableCell className="text-muted-foreground">{o.note ?? ""}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(o.created_at)}</TableCell>
              <TableCell className="text-right">
                {o.user_id !== currentUserId && (
                  <Button
                    size="sm" variant="ghost" className="text-destructive" disabled={pending}
                    onClick={() =>
                      start(async () => {
                        try {
                          await removeOperator(o.user_id);
                          toast.success("運営者から外しました");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      })
                    }
                  >
                    <UserMinus className="size-4" /> 外す
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form
        className="flex flex-wrap items-end gap-2"
        action={(fd) =>
          start(async () => {
            try {
              await addOperator(fd);
              toast.success("運営者を追加しました");
              (document.getElementById("operator-add-form") as HTMLFormElement | null)?.reset();
            } catch (e) {
              toast.error((e as Error).message);
            }
          })
        }
        id="operator-add-form"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="op_email">メールアドレス</Label>
          <Input id="op_email" name="email" type="email" className="w-64" placeholder="ログイン済みの利用者のメール" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="op_note">メモ</Label>
          <Input id="op_note" name="note" className="w-48" placeholder="役割など" />
        </div>
        <Button type="submit" size="sm" disabled={pending}>運営者に追加</Button>
      </form>
      <p className="text-xs text-muted-foreground">運営者になれるのは、いずれかのテナントの営業担当者として招待されログインできる利用者です。運営者はアクセスコードを知っている必要があります。</p>
    </div>
  );
}
