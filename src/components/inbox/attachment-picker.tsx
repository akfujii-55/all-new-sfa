"use client";

import { useRef, useState, type DragEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_ATTACHMENT_COUNT, MAX_ATTACHMENT_TOTAL, fmtBytes } from "@/lib/mail/attachments";
import { cn } from "@/lib/utils";

/** メール作成・返信フォームの添付ファイル欄。ファイルはフォームの状態に持ち、送信時にアップロードする。
 * 「ファイルを追加」ボタンのほか、この欄へのドラッグ&ドロップでも追加できる */
export function AttachmentPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 子要素をまたぐと dragenter/dragleave が連続して起きるので、深さを数えて判定する
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const total = files.reduce((n, f) => n + f.size, 0);
  const over = total > MAX_ATTACHMENT_TOTAL || files.length > MAX_ATTACHMENT_COUNT;

  function add(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      // 同じ名前・サイズのものは二重に足さない
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    // フォルダをドロップすると size 0 で type 空の File になることがあるので除く
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.size > 0 || f.type !== "");
    add(dropped);
  }

  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-md border border-dashed border-transparent p-1.5 -m-1.5 transition-colors",
        dragging && "border-primary bg-primary/5",
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
        <ul className="divide-y rounded-md border bg-background text-sm">
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
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Paperclip className="size-4" /> ファイルを追加
        </Button>
        <span className={cn("text-xs text-muted-foreground", dragging && "text-primary")}>
          {dragging ? "ここにドロップして追加" : "ここにファイルをドラッグ&ドロップでも追加できます"}
        </span>
      </div>
    </div>
  );
}
