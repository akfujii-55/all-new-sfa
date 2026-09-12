import { Paperclip } from "lucide-react";
import { fmtBytes } from "@/lib/mail/attachment-shared";
import type { EmailAttachment } from "@/lib/types";

/**
 * メール1通分の添付ファイル一覧(クリックでダウンロード)。
 * スマホの Gmail から送られた写真は inline(cid 付き)になるため、inline かどうかで隠さず全件を表示する。
 */
export function AttachmentList({ attachments }: { attachments: EmailAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-4 border-t pt-3">
      <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" /> 添付ファイル {attachments.length}件
      </p>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <li key={a.id} className="max-w-full">
            <a
              href={`/api/attachments/${a.id}`}
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              title={a.filename}
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{a.filename}</span>
              <span className="shrink-0 text-muted-foreground">{fmtBytes(a.size)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
