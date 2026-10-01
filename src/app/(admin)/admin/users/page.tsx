import { listOperators, listTenantsWithUsage, requireOperator } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperatorUsers } from "@/components/admin/operator-users";

export const metadata = { title: "ユーザー管理 | 運営管理" };

export default async function AdminUsersPage() {
  const [operators, { user, isSuper }, tenants] = await Promise.all([listOperators(), requireOperator(), listTenantsWithUsage()]);
  return (
    <div className="max-w-5xl">
      <PageHeader title="ユーザー管理" description="運営管理に入れる利用者。スーパーユーザーがメールで招待し、パスワードを設定してログインします。" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">運営者</CardTitle>
          <CardDescription>
            運営者は運営専用のアカウントで、どのテナントにも所属せずテナント側の画面にはログインできません。削除するとログインもできなくなります。
            テナントの利用者と同じメールアドレスは使えません。
            テナントの画面に入る必要がある人には「入れるテナント」を設定します(運営サポート。同じログインでテナントを切り替えて使え、テナントのユーザー数には数えません)。
            区分が「運営サポート専用」の人は入れるテナントの画面だけを使い、この運営管理には入れません(他社テナントの利用者も追加できます)。
          </CardDescription>
        </CardHeader>
        <CardContent><OperatorUsers operators={operators} currentUserId={user.id} isSuper={isSuper} tenants={tenants.map((t) => ({ id: t.id, name: t.name }))} /></CardContent>
      </Card>
    </div>
  );
}
