"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { UserRound } from "lucide-react";
import { setActivityOwner } from "@/actions/activities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actionErrorMessage } from "@/lib/errors";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export const NO_OWNER = "__none__";

type MemberOption = Pick<Member, "id" | "name">;

/**
 * 行動(Todo)の担当者の選択肢。フォーム(登録・編集)では name 付きの hidden input として値を渡し、
 * 一覧の行ではその場で保存する(ActivityOwnerInline)。
 */
export function ActivityOwnerField({
  members,
  value,
  onChange,
  name = "owner_id",
  id,
  className,
}: {
  members: MemberOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  name?: string;
  id?: string;
  className?: string;
}) {
  return (
    <>
      <input type="hidden" name={name} value={value ?? ""} />
      <Select value={value ?? NO_OWNER} onValueChange={(v) => onChange(v === NO_OWNER ? null : v)}>
        <SelectTrigger id={id} size="sm" className={cn("w-full sm:w-44", className)} aria-label="担当者">
          <UserRound className="size-3.5 text-muted-foreground" />
          <SelectValue placeholder="担当者" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OWNER}>担当者なし</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/** 一覧の行に置く担当者。押すとその場で付け替えられる(文字のように見える小さなトリガー) */
export function ActivityOwnerInline({
  activityId,
  dealId,
  ownerId,
  ownerName,
  members,
}: {
  activityId: string;
  dealId: string;
  ownerId: string | null;
  ownerName: string | null;
  members: MemberOption[];
}) {
  const [pending, start] = useTransition();
  // 退職などで選択肢に無い担当者が付いているときも名前は出す
  const options = ownerId && !members.some((m) => m.id === ownerId) ? [...members, { id: ownerId, name: ownerName ?? "(不明)" }] : members;
  return (
    <Select
      value={ownerId ?? NO_OWNER}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try {
            await setActivityOwner(activityId, dealId, v === NO_OWNER ? null : v);
            toast.success(v === NO_OWNER ? "担当者を外しました" : "担当者を変更しました");
          } catch (e) {
            toast.error(actionErrorMessage(e));
          }
        })
      }
    >
      <SelectTrigger
        size="sm"
        aria-label="担当者"
        className={cn(
          "h-5 gap-1 rounded border-0 bg-transparent px-1 py-0 text-xs shadow-none hover:bg-muted data-[size=sm]:h-5 [&_svg:last-child]:size-3",
          ownerId ? "text-muted-foreground" : "text-muted-foreground/70 italic",
        )}
      >
        <UserRound className="size-3" />
        <SelectValue placeholder="担当者なし" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_OWNER}>担当者なし</SelectItem>
        {options.map((m) => (
          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
