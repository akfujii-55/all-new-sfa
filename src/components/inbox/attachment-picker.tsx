"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_TOTAL, fmtBytes } from "@/lib/mail/attachments";
import { cn } from "@/lib/utils";

/** メール作成・返信フォームの添付ファイル欄。ファイルはフォームの状態に持ち、送信時にアップロードする */
export function AttachmentPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const total = files.reduce((n, f) => n + f.size, 0);
  const over = total > MAX_ATTACHMENT_TOTAL || files.length > MAX_ATTACHMENT_COUNT;

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      // 同じ名前・サイズのものは二重に足さない
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>添付ファイル</Label>
        <span className={cn("text-xs text-muted-foreground", over && "text-destructive")}>
          {files.length > 0 ? `${files.length}件 / ${fmtBytes(total)}` : ""}(合計 {fmtBytes(MAX_ATTACHMENT_TOTAL)} まで)
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 px-2 py-1">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtBytes(f.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                disabled={disabled}
                aria-label={`${f.name} を外す`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Paperclip className="size-4" /> ファイルを追加
        </Button>
      </div>
    </div>
  );
}
