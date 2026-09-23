import { getStepMailSender, listStepMails } from "@/actions/step-mails";
import { PageHeader } from "@/components/layout/page-header";
import { StepMailSettings } from "@/components/admin/step-mail-settings";
import { StepMailSenderForm } from "@/components/admin/step-mail-sender-form";
import { STEP_MAIL_GRACE_DAYS } from "@/lib/step-mails-shared";

export const metadata = { title: "ステップメール | 運営管理" };

export default async function StepMailsPage() {
  const [steps, sender] = await Promise.all([listStepMails(), getStepMailSender()]);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="ステップメール"
        description="お試し中の顧客(テナントの連絡先)へ、テナント作成からの日数に合わせて自動で送るメール。毎朝の定期処理(7:00 ごろ)に、下の「送信元」で決めたアカウント・差出人で送ります。"
      />
      <StepMailSettings steps={steps} />
      <div className="mt-6">
        <StepMailSenderForm settings={sender.settings} accounts={sender.accounts} />
      </div>
      <div className="mt-6 space-y-1 text-xs text-muted-foreground">
        <p>・カード登録(課金開始)・停止・解約になったテナントには、「課金開始後も送る」の回以外は送りません。テナントごとの停止と送信履歴はテナント詳細にあります。</p>
        <p>・予定日から {STEP_MAIL_GRACE_DAYS} 日以上過ぎた回は送らずに「見送り」として記録します(この機能を入れる前からあるテナントに、まとめて届くことはありません)。</p>
        <p>・宛先はテナントの連絡先メール(無ければ最初の利用者)。本文の末尾に運営の会社名と問い合わせ先が自動で付きます。</p>
      </div>
    </div>
  );
}
