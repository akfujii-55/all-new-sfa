import { stripQuotes } from "@/lib/mail/extract";

export function EmailBody({ text, full = false }: { text: string | null; full?: boolean }) {
  const body = text ?? "";
  const shown = full ? body : stripQuotes(body);
  const hasQuote = !full && shown.length < body.trim().length;
  return (
    <div className="text-sm leading-relaxed">
      <pre className="whitespace-pre-wrap break-words font-sans">{shown || "(本文なし)"}</pre>
      {hasQuote && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">引用部分を表示</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-muted-foreground border-l-2 pl-3">{body}</pre>
        </details>
      )}
    </div>
  );
}
