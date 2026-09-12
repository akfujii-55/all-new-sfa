"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateTenantContact } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tenant } from "@/lib/types";

export function TenantContactForm({ tenant }: { tenant: Tenant }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      action={(fd) =>
        start(async () => {
          try {
            await updateTenantContact(tenant.id, fd);
            toast.success("保存しました");
          } catch (e) {
            toast.error((e as Error).message);
          }
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="name">会社名</Label>
        <Input id="name" name="name" defaultValue={tenant.name} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="contact_name">担当者名</Label>
          <Input id="contact_name" name="contact_name" defaultValue={tenant.contact_name ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contact_email">メール</Label>
          <Input id="contact_email" name="contact_email" type="email" defaultValue={tenant.contact_email ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contact_phone">電話</Label>
          <Input id="contact_phone" name="contact_phone" defaultValue={tenant.contact_phone ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="address">住所</Label>
          <Input id="address" name="address" defaultValue={tenant.address ?? ""} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note">運営メモ</Label>
        <Textarea id="note" name="note" rows={3} defaultValue={tenant.note ?? ""} />
      </div>
      <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "保存中..." : "保存"}</Button></div>
    </form>
  );
}
