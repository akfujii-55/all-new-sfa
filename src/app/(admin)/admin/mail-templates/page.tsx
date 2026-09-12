import { listMailTemplates } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { MailTemplateEditor } from "@/components/admin/mail-template-editor";

export const metadata = { title: "メールテンプレート | 運営管理" };

export default async function MailTemplatesPage() {
  const templates = await listMailTemplates();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="メールテンプレート"
        description="アプリが送る招待メールの件名と本文(全テナント共通)。{{name}} などの差し込み項目は送信時に置き換わります。パスワード再設定など Supabase が直接送るメールは Supabase の設定で変更します。"
      />
      <div className="space-y-4">
        {templates.map((t) => (
          <MailTemplateEditor key={t.key} template={t} />
        ))}
      </div>
    </div>
  );
}
