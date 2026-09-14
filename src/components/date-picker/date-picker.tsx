"use client";

import { useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, startOfDay } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { holidayName } from "@/lib/holidays";
import { cn } from "@/lib/utils";

/**
 * 期限・アポ日時・受注予定日の入力部品。ブラウザ標準の datetime-local の代わり。
 *
 * 近い日付は「今日・明日・来週◯曜」のボタン、それ以外は「日付を選ぶ」で 2 週間分のタイル(週送り)から選ぶ。
 * 日時モードでは時刻を「午前中・午後・夕方」のボタンか 30 分刻みのプルダウンで選び、
 * 「時刻なし(終日)」はその日の 23:59 として保存する(表示は fmtDue で日付だけにする)。
 *
 * フォームには hidden input で今までと同じ形式の値を渡す(日時: yyyy-MM-ddTHH:mm、日付: yyyy-MM-dd)。
 * サーバー側の parseLocalInput はそのまま使える。
 */

export type DatePickerMode = "datetime" | "date";

export interface DatePickerProps {
  /** hidden input の name */
  name: string;
  mode: DatePickerMode;
  /** 初期値。日時モードは yyyy-MM-ddTHH:mm(toLocalInput の出力)、日付モードは yyyy-MM-dd */
  defaultValue?: string | null;
  /** 近い日付のボタンの種類。near: 今日〜1 週間後、month-end: 今月末〜再来月末 */
  quick?: "near" | "month-end";
  /** 時刻ボタン(日時モード)。[値, 表示] */
  timePresets?: [string, string][];
  /** 「時刻なし(終日)」を出すか(日時モード)。true なら既定は終日 */
  allowNoTime?: boolean;
  /** 未選択のときの表示 */
  emptyLabel?: string;
  /** id の接頭辞(同じページに複数置くとき) */
  idPrefix?: string;
  className?: string;
}

export const ALL_DAY_TIME = "23:59";
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const DEFAULT_TIMES: [string, string][] = [
  ["10:00", "午前中 10:00"],
  ["14:00", "午後 14:00"],
  ["17:00", "夕方 17:00"],
];

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function fromYmd(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function fmtJa(d: Date) {
  return `${d.getMonth() + 1}月${d.getDate()}日(${DOW[d.getDay()]})`;
}
function relText(d: Date, today: Date) {
  const n = differenceInCalendarDays(d, today);
  if (n === 0) return "今日";
  if (n === 1) return "明日";
  if (n === 2) return "明後日";
  return n > 0 ? `${n} 日後` : `${-n} 日前`;
}
function nextMonday(today: Date) {
  return addDays(today, ((8 - today.getDay()) % 7) || 7);
}
function isOff(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6 || Boolean(holidayName(ymd(d)));
}

const chip = (active: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
  );

export function DatePicker({ name, mode, defaultValue, quick = "near", timePresets = DEFAULT_TIMES, allowNoTime = true, emptyLabel = "未設定", idPrefix = name, className }: DatePickerProps) {
  const today = startOfDay(new Date());
  const init = (defaultValue ?? "").trim();
  const [date, setDate] = useState<Date | null>(() => fromYmd(init));
  const [time, setTime] = useState<string>(() => {
    if (mode === "date") return "";
    const m = init.match(/T(\d{2}:\d{2})/);
    if (m) return m[1];
    return allowNoTime ? ALL_DAY_TIME : timePresets[0]?.[0] ?? "10:00";
  });
  const [open, setOpen] = useState(false);

  const quickItems: { label: string; d: Date }[] =
    quick === "near"
      ? [
          { label: "今日", d: today },
          { label: "明日", d: addDays(today, 1) },
          { label: "明後日", d: addDays(today, 2) },
          { label: `来週${DOW[nextMonday(today).getDay()]}曜`, d: nextMonday(today) },
          { label: "1 週間後", d: addDays(today, 7) },
        ]
      : [0, 1, 2].map((n) => {
          const d = endOfMonth(addMonths(today, n));
          return { label: `${n === 0 ? "今" : n === 1 ? "来" : "再来"}月末 ${d.getMonth() + 1}/${d.getDate()}`, d: startOfDay(d) };
        });
  const matched = date ? quickItems.find((q) => ymd(q.d) === ymd(date)) : undefined;

  const value = !date ? "" : mode === "date" ? ymd(date) : `${ymd(date)}T${time || ALL_DAY_TIME}`;
  const isPreset = timePresets.some(([v]) => v === time);
  const customTime = !isPreset && time !== ALL_DAY_TIME ? time : "";

  function pick(d: Date, closeTiles = true) {
    setDate(d);
    if (closeTiles) setOpen(false);
  }
  function clear() {
    setDate(null);
    setOpen(false);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="日付">
        {quickItems.map((q) => (
          <button key={q.label} type="button" className={chip(matched?.label === q.label)} onClick={() => pick(q.d)} aria-pressed={matched?.label === q.label}>
            {q.label}
          </button>
        ))}
        <button
          type="button"
          id={`${idPrefix}-open`}
          className={chip(Boolean(date) && !matched)}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <CalendarDays className="size-3.5" /> {date && !matched ? fmtJa(date) : "日付を選ぶ"}
        </button>
      </div>

      {open && <Tiles today={today} selected={date} onPick={(d) => pick(d)} />}

      {mode === "datetime" && date && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="時刻">
          {timePresets.map(([v, label]) => (
            <button key={v} type="button" className={chip(time === v)} onClick={() => setTime(v)} aria-pressed={time === v}>
              {label}
            </button>
          ))}
          {allowNoTime && (
            <button type="button" className={chip(time === ALL_DAY_TIME)} onClick={() => setTime(ALL_DAY_TIME)} aria-pressed={time === ALL_DAY_TIME}>
              時刻なし(終日)
            </button>
          )}
          <select
            id={`${idPrefix}-time`}
            aria-label="時刻を指定"
            value={customTime}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className={cn("h-7 rounded-md border bg-background px-2 text-xs", customTime ? "border-primary font-medium" : "text-muted-foreground")}
          >
            <option value="">時刻を指定…</option>
            {timeOptions().map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs">
        {date ? (
          <>
            <span className="font-medium">
              {fmtJa(date)}
              {mode === "datetime" && (time === ALL_DAY_TIME ? " 終日" : ` ${time}`)}
            </span>
            <span className="text-muted-foreground">
              {relText(date, today)}
              {holidayName(ymd(date)) && ` · ${holidayName(ymd(date))}`}
              {!holidayName(ymd(date)) && (date.getDay() === 0 || date.getDay() === 6) && " · 週末"}
            </span>
            <button type="button" className="text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={clear}>クリア</button>
          </>
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )}
      </p>
    </div>
  );
}

function timeOptions() {
  const out: string[] = [];
  for (let h = 8; h <= 19; h++) for (const m of ["00", "30"]) {
    if (h === 19 && m === "30") break;
    out.push(`${String(h).padStart(2, "0")}:${m}`);
  }
  return out;
}

/** 2 週間分のタイル。‹ › で 1 週間ずつ動く。過去の日は選べない */
function Tiles({ today, selected, onPick }: { today: Date; selected: Date | null; onPick: (d: Date) => void }) {
  const [start, setStart] = useState<Date>(() => {
    // 選択済みの日が 2 週間より先なら、その日が入る週から表示する
    if (selected && differenceInCalendarDays(selected, today) >= 14) return addDays(today, Math.floor(differenceInCalendarDays(selected, today) / 7) * 7);
    return today;
  });
  const end = addDays(start, 13);
  const atToday = differenceInCalendarDays(start, today) <= 0;
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-medium">
        <span>{start.getMonth() + 1}月{start.getDate()}日 〜 {end.getMonth() + 1}月{end.getDate()}日</span>
        <div className="flex gap-1">
          <button type="button" aria-label="前の週" disabled={atToday} onClick={() => setStart(addDays(start, -7))} className="inline-flex size-6 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"><ChevronLeft className="size-3.5" /></button>
          <button type="button" disabled={atToday} onClick={() => setStart(today)} className="rounded-md border px-2 text-[11px] hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent">今日に戻る</button>
          <button type="button" aria-label="次の週" onClick={() => setStart(addDays(start, 7))} className="inline-flex size-6 items-center justify-center rounded-md border hover:bg-muted"><ChevronRight className="size-3.5" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }, (_, i) => addDays(start, i)).map((d, i) => {
          const key = ymd(d);
          const hol = holidayName(key);
          const past = d < today;
          const isToday = key === ymd(today);
          const on = selected ? key === ymd(selected) : false;
          const sub = d.getDate() === 1 || i === 0 ? `${d.getMonth() + 1}月` : hol || "";
          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onPick(d)}
              aria-pressed={on}
              aria-label={`${fmtJa(d)}${hol ? " " + hol : ""}`}
              className={cn(
                "grid min-w-0 justify-items-center rounded-md border px-0.5 py-1 leading-tight transition-colors",
                past ? "opacity-35" : "hover:bg-muted",
                isOff(d) && !on && !isToday && "bg-muted/40",
                isToday && !on && "border-sky-500 bg-sky-50 dark:bg-sky-950/40",
                on && "border-primary bg-primary text-primary-foreground",
              )}
            >
              <span className={cn("text-[10px]", on ? "text-primary-foreground/80" : hol || d.getDay() === 0 ? "text-rose-600 dark:text-rose-300" : d.getDay() === 6 ? "text-sky-600 dark:text-sky-300" : isToday ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground")}>
                {hol ? "祝" : DOW[d.getDay()]}
              </span>
              <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
              <span className={cn("max-w-full truncate text-[9px]", on ? "text-primary-foreground/80" : hol && sub === hol ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>{sub || " "}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
