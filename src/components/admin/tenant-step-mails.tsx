"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTenantStepMailsEnabled } from "@/actions/step-mails";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { actionErrorMessage } from "@/lib/errors";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { STEP_MAIL_LOG_STATUS_LABEL, type StepMailLog } from "@/lib/step-mails-shared";

/** テナント詳細: ステップメールの送る/送らないと送信履歴 */
export function TenantStepMails({ tenantId, enabled, logs }: { tenantId: string; enabled: boolean; logs: StepMailLog[] }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  function toggle(v: boolean) {
    setOn(v);
    start(async () => {
      try {
        await setTenantStepMailsEnabled(tenantId, v);
        toast.success(v ? "ステップメールを送ります" : "ステップメールを送りません");
      } catch (e) {
        setOn(!v);
        toast.error(actionErrorMessage(e));
      }
    });
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={on} disabled={pending} onCheckedChange={(v) => toggle(v === true)} />
        このテナントにステップメールを送る
      </label>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ送信の記録はありません。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>回</TableHead>
              <TableHead>予定日</TableHead>
              <TableHead>結果</TableHead>
              <TableHead>宛先</TableHead>
              <TableHead>日時 / 理由</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">{l.step ? `${l.step.day_offset} 日目 ${l.step.name}` : "(削除済みの回)"}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(l.due_on)}</TableCell>
                <TableCell><Badge variant={l.status === "sent" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{STEP_MAIL_LOG_STATUS_LABEL[l.status]}</Badge></TableCell>
                <TableCell className="text-xs">{l.to_email ?? "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDateTime(l.sent_at)}{l.error && <span className="block">{l.error}</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
