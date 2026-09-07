"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MailAccountOption } from "@/lib/types";

/** 差出人アカウントの選択。アカウントが1件以下なら何も表示しない */
export function MailAccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: MailAccountOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (accounts.length < 2) return null;
  return (
    <div className="grid gap-1.5">
      <Label>差出人</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="差出人を選択" /></SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}{a.label !== a.email ? ` <${a.email}>` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
