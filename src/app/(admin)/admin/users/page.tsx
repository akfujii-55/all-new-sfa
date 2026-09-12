import { listOperators, requireOperator } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperatorUsers } from "@/components/admin/operator-users";

export const metadata = { title: "ユーザー管理 | 運営管理" };

export default async function AdminUsersPage() {
  const [operators, { user, isSuper }] = await Promise.all([listOperators(), requireOperator()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="ユーザー管理" description="運営管理に入れる利用者。スーパーユーザーがメールで招待し、パスワードを設定してログインします。" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">運営者</CardTitle>
          <CardDescription>
            運営者は運営専用のアカウントで、どのテナントにも所属せずテナント側の画面にはログインできません。削除するとログインもできなくなります。
            テナントの利用者と同じメールアドレスは使えません。
          </CardDescription>
        </CardHeader>
        <CardContent><OperatorUsers operators={operators} currentUserId={user.id} isSuper={isSuper} /></CardContent>
      </Card>
    </div>
  );
}
