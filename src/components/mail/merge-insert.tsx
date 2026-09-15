"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MergeKey, MergeVars } from "@/lib/mail/merge";

/**
 * テンプレートを使わないときの差し込み。本文の右上の「差し込む」から項目を選ぶと、
 * カーソルの位置に値そのものが入る。値が分からない項目は {{項目名}} のまま入り、送信前の確認で赤く止まる。
 */

/** 本文 Textarea のカーソル位置を覚えておき、メニューから選んだ値をそこに入れる */
export function useCaretInsert(ref: RefObject<HTMLTextAreaElement | null>, setBody: (update: (body: string) => string) => void) {
  const caret = useRef<{ start: number; end: number } | null>(null);
  const pending = useRef<number | null>(null);

  /** Textarea の onSelect / onBlur から呼ぶ(メニューを開くとフォーカスが外れるので、その前の位置を覚える) */
  function remember() {
    const el = ref.current;
    if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  function insert(text: string) {
    setBody((body) => {
      // 一度もカーソルを置いていなければ先頭(署名の上)に入れる
      const { start, end } = caret.current ?? { start: 0, end: 0 };
      pending.current = start + text.length;
      return body.slice(0, start) + text + body.slice(end);
    });
  }

  // 本文が更新されたあとで、入れた値の直後にカーソルを戻す。メニューが閉じてトリガーにフォーカスが戻った後に行うため 1 拍置く
  useEffect(() => {
    if (pending.current == null) return;
    const pos = pending.current;
    pending.current = null;
    const timer = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      caret.current = { start: pos, end: pos };
    }, 0);
    return () => clearTimeout(timer);
  });

  return { remember, insert };
}

const PARTY_ITEMS: { key: MergeKey; label: string }[] = [
  { key: "取引先", label: "取引先" },
  { key: "担当者名", label: "担当者名" },
  { key: "担当者メール", label: "担当者メール" },
  { key: "案件名", label: "案件名" },
  { key: "元の件名", label: "元の件名" },
  { key: "受信日時", label: "受信日時" },
  { key: "問い合わせ本文", label: "メールを引用" },
];

const SELF_ITEMS: { key: MergeKey; label: string }[] = [
  { key: "自社担当者", label: "自社担当者" },
  { key: "自社会社名", label: "自社会社名" },
  { key: "自社メール", label: "自社メール" },
];

/** 宛名(会社名 + 氏名 様 + 空行)。担当者名が無ければ作れない */
export function buildSalutation(vars: MergeVars): string | null {
  const name = vars.担当者名?.trim();
  if (!name) return null;
  const company = vars.取引先?.trim();
  return `${company ? `${company}\n` : ""}${name} 様\n\n`;
}

export function MergeInsertMenu({ vars, onInsert, disabled }: { vars: MergeVars; onInsert: (text: string) => void; disabled?: boolean }) {
  const salutation = buildSalutation(vars);
  const item = ({ key, label }: { key: MergeKey; label: string }) => {
    const value = vars[key]?.trim() ?? "";
    return (
      <DropdownMenuItem key={key} onSelect={() => onInsert(value || `{{${key}}}`)} className="grid grid-cols-[6.5rem_1fr] gap-2">
        <span>{label}</span>
        <ValueCell value={value} />
      </DropdownMenuItem>
    );
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={disabled} className="h-7 text-xs">
          <Plus className="size-3.5" /> 差し込む
        </Button>
      </DropdownMenuTrigger>
      {/* 閉じたときにボタンへフォーカスを戻さず、本文のカーソル位置(useCaretInsert)に任せる */}
      <DropdownMenuContent align="end" className="w-80" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">まとめて</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onInsert(salutation ?? "{{取引先}}\n{{担当者名}} 様\n\n")} className="grid grid-cols-[6.5rem_1fr] gap-2">
          <span>宛名</span>
          <ValueCell value={salutation ? "会社名 + 氏名 様" : ""} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">相手</DropdownMenuLabel>
        {PARTY_ITEMS.map(item)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">自社</DropdownMenuLabel>
        {SELF_ITEMS.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ValueCell({ value }: { value: string }) {
  if (!value) return <span className="truncate text-xs text-amber-700 dark:text-amber-400">この画面では不明</span>;
  // 引用のような複数行の値は 1 行目だけ見せる
  return <span className="truncate text-xs text-muted-foreground">{value.split("\n")[0]}</span>;
}

/** 宛先の下に出す「相手: 担当者名 / 取引先 / 案件」。分かっている項目だけ並べる */
export function RecipientLine({ vars, to }: { vars: MergeVars; to: string }) {
  const name = vars.担当者名?.trim();
  const company = vars.取引先?.trim();
  const deal = vars.案件名?.trim();
  if (!name && !company) {
    if (!to.trim().includes("@")) return null;
    return <p className="text-xs text-muted-foreground">この宛先は担当者として登録されていません(担当者名・取引先は差し込めません)</p>;
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span>相手:</span>
      {name && <span className="rounded bg-muted px-1.5 text-foreground">{name}</span>}
      {company && <span className="rounded bg-muted px-1.5 text-foreground">{company}</span>}
      {deal && <span>案件: {deal}</span>}
    </p>
  );
}
