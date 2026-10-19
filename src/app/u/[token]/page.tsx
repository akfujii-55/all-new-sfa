import { peekUnsubscribe } from "@/actions/unsubscribe";
import { UnsubscribeForm } from "@/components/campaigns/unsubscribe-form";

export const metadata = { title: "配信停止", robots: { index: false, follow: false } };

/**
 * 一斉配信の配信停止ページ(0043)。メール末尾のリンクから開く。ログイン不要(proxy の公開パス)。
 * リンクを開いただけでは止めず、ボタンを押したときに止める(メールのプレビューやリンクの事前取得で止まらないように)。
 */
export default async function UnsubscribePage({ params }: PageProps<"/u/[token]">) {
  const { token } = await params;
  const info = await peekUnsubscribe(token);
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">配信停止</h1>
        {!info ? (
          <p className="mt-3 text-sm text-muted-foreground">このリンクは無効です。メールに記載のリンクをそのまま開いてください。</p>
        ) : (
          <UnsubscribeForm token={token} maskedEmail={info.maskedEmail} tenantName={info.tenantName} alreadyUnsubscribed={info.unsubscribed} />
        )}
      </div>
    </main>
  );
}
