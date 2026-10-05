"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { searchAddresses } from "@/actions/addresses";
import { Input } from "@/components/ui/input";
import { lastToken, matchesAddress, replaceLastToken, splitAddresses, type AddressOption } from "@/lib/mail/addresses";
import { cn } from "@/lib/utils";

/** 一度に出す候補の数 */
const MAX_CANDIDATES = 8;

/**
 * 宛先・CC の入力欄。数文字打つと、社内(営業担当者)・取引先の担当者・`options`(このスレッドに出てくるアドレス、自社のアカウント)
 * から名前かアドレスが当てはまる候補を下に出す。↑↓ で選んで Enter(または Tab)、クリックでも入る。
 * 値はこれまでどおりカンマ区切りの文字列で、候補を使わずにそのまま打ってもよい。
 */
export function AddressInput({
  value,
  onChange,
  onBlur,
  options = [],
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** 画面側で分かっている候補(検索結果より先に出す) */
  options?: AddressOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<AddressOption[]>([]);
  const seq = useRef(0);

  const token = lastToken(value);
  // 英数字は 2 文字から、日本語(名前)は 1 文字から探す
  const enough = token.length >= 2 || /[^\x00-\x7f]/.test(token);

  useEffect(() => {
    if (!open || !enough) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const items = await searchAddresses(token);
        if (seq.current === mine) setFound(items);
      } catch {
        // 候補が出なくても手で入力できるので、失敗は無視する
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, enough, token]);

  const candidates = useMemo(() => {
    if (!enough) return [];
    const seen = new Set(splitAddresses(value).map((a) => a.toLowerCase()));
    const out: AddressOption[] = [];
    // 前の文字で探した結果が残っていても、いまの文字に当てはまるものだけ出す
    for (const o of [...options, ...found]) {
      const key = o.email.toLowerCase();
      if (seen.has(key) || !matchesAddress(o, token)) continue;
      seen.add(key);
      out.push(o);
      if (out.length >= MAX_CANDIDATES) break;
    }
    return out;
  }, [enough, value, token, options, found]);

  const showing = open && candidates.length > 0;
  const index = Math.min(active, candidates.length - 1);

  function pick(option: AddressOption) {
    onChange(replaceLastToken(value, option.email));
    setActive(0);
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          // 日本語入力の変換確定の Enter では選ばない
          if (!showing || e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((index + (e.key === "ArrowDown" ? 1 : candidates.length - 1)) % candidates.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(candidates[index]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showing && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
          {candidates.map((o, i) => (
            <li
              key={o.email}
              role="option"
              aria-selected={i === index}
              // クリックで入力欄のフォーカスが外れないようにする
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-baseline gap-2 rounded px-2 py-1.5", i === index && "bg-brand-soft")}
            >
              <span className="min-w-0 flex-1 truncate">
                {o.name && <span className="mr-1.5 font-medium">{o.name}</span>}
                <span className="text-muted-foreground">{o.email}</span>
              </span>
              <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{o.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * このスレッドに出てくるアドレス(これまでの差出人・宛先・CC、本文に書かれたアドレス)のうち、
 * まだ宛先にも CC にも入っていないもの。押すと CC に足す。
 */
export function AddressChips({ options, taken, onAdd }: { options: AddressOption[]; taken: string[]; onAdd: (email: string) => void }) {
  const used = new Set(taken.map((a) => a.toLowerCase()));
  const rest = options.filter((o) => !used.has(o.email.toLowerCase())).slice(0, MAX_CANDIDATES);
  if (rest.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>CC に追加:</span>
      {rest.map((o) => (
        <button
          key={o.email}
          type="button"
          title={`${o.hint}。押すと CC に入ります`}
          onClick={() => onAdd(o.email)}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-brand-line px-2 py-0.5 text-brand-ink hover:bg-brand-soft"
        >
          <Plus className="size-3 shrink-0" />
          <span className="truncate">{o.name ? `${o.name} ${o.email}` : o.email}</span>
          <span className="shrink-0 text-muted-foreground">({o.hint})</span>
        </button>
      ))}
    </div>
  );
}
