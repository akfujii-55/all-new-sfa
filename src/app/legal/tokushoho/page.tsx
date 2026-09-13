import { createAdminClient } from "@/lib/supabase/server";
import { pricingFromRows, TAX_PERCENT, withTax } from "@/lib/pricing";
import { yen } from "@/lib/format";
import { LEGAL_EFFECTIVE_DATE, OPERATOR, SERVICE_NAME } from "@/lib/legal";

export const metadata = { title: "特定商取引法に基づく表記" };
export const dynamic = "force-dynamic";

export default async function TokushohoPage() {
  const { data } = await createAdminClient().from("operator_settings").select("key, value");
  const p = pricingFromRows(data as { key: string; value: string }[] | null);
  return (
    <>
      <h1>特定商取引法に基づく表記</h1>
      <p className="meta">最終更新日: {LEGAL_EFFECTIVE_DATE}</p>
      <table>
        <tbody>
          <tr>
            <th>販売業者</th>
            <td>{OPERATOR.name}</td>
          </tr>
          <tr>
            <th>代表者</th>
            <td>{OPERATOR.representative}</td>
          </tr>
          <tr>
            <th>所在地</th>
            <td>〒{OPERATOR.postalCode} {OPERATOR.address}</td>
          </tr>
          <tr>
            <th>電話番号</th>
            <td>
              {OPERATOR.tel}(受付時間 {OPERATOR.businessHours})
              <br />
              お問い合わせは原則としてメールでお願いいたします。
            </td>
          </tr>
          <tr>
            <th>メールアドレス</th>
            <td>{OPERATOR.email}</td>
          </tr>
          <tr>
            <th>サービス名</th>
            <td>営業支援ツール「{SERVICE_NAME}」(クラウドサービス)</td>
          </tr>
          <tr>
            <th>販売価格</th>
            <td>
              <ul>
                <li>月額基本料金: {yen(p.price_base_monthly)}(税込 {yen(withTax(p.price_base_monthly).gross)})。ユーザー 1 名、メールアカウント 1 件、保存容量 {p.default_max_storage_gb}GB を含みます。</li>
                <li>ユーザー追加: 1 名あたり月額 {yen(p.price_per_extra_user)}(税込 {yen(withTax(p.price_per_extra_user).gross)})</li>
                <li>メールアカウント追加: 1 件あたり月額 {yen(p.price_per_extra_mail_account)}(税込 {yen(withTax(p.price_per_extra_mail_account).gross)})</li>
                {p.price_per_extra_storage_gb > 0 && (
                  <li>保存容量追加: 1GB あたり月額 {yen(p.price_per_extra_storage_gb)}(税込 {yen(withTax(p.price_per_extra_storage_gb).gross)})</li>
                )}
              </ul>
              料金は各月の実際の利用数(ログインできるユーザー数、連携しているメールアカウント数)にもとづいて計算します。最新の料金はお申し込み画面および設定画面の「ご契約・お支払い」でご確認ください。
            </td>
          </tr>
          <tr>
            <th>商品代金以外の必要料金</th>
            <td>消費税({TAX_PERCENT}%)。インターネット接続にかかる通信料・プロバイダー料金はお客様のご負担となります。</td>
          </tr>
          <tr>
            <th>お支払い方法</th>
            <td>クレジットカード(決済代行: Stripe, Inc. の決済サービスを利用します)。</td>
          </tr>
          <tr>
            <th>お支払い時期</th>
            <td>
              無料お試し期間({p.trial_days} 日間)の終了後、月ごとの自動決済となります。初回はお試し期間終了日に、以降は毎月同じ日に、ご登録のクレジットカードへ請求します。
            </td>
          </tr>
          <tr>
            <th>サービスの提供時期</th>
            <td>お申し込み後、確認メールのリンクからアカウントを開設した時点で、直ちにご利用いただけます。</td>
          </tr>
          <tr>
            <th>契約期間・更新</th>
            <td>契約期間は 1 か月で、解約のお手続きがない限り自動的に更新されます。</td>
          </tr>
          <tr>
            <th>解約について</th>
            <td>
              設定画面の「ご契約・お支払い」からいつでも解約できます。解約後は、お支払い済みの利用期間の終了日までご利用いただけ、利用期間の終了と同時にお客様のデータをすべて削除します。
              <br />
              無料お試し期間の終了までにお支払い方法の登録がない場合は、お試し期間の終了と同時に利用契約が終了し、お客様のデータをすべて削除します。
            </td>
          </tr>
          <tr>
            <th>返品・キャンセル</th>
            <td>
              サービスの性質上、お支払い済みの利用料金の返金や、利用期間途中での解約による日割り返金はいたしかねます。無料お試し期間中の解約に費用はかかりません。
            </td>
          </tr>
          <tr>
            <th>動作環境</th>
            <td>
              インターネットに接続できる環境と、最新版の Google Chrome、Microsoft Edge、Safari、Firefox などのウェブブラウザー。メールの取り込みには、IMAP/SMTP が利用できるメールアカウント(Gmail など)が必要です。
            </td>
          </tr>
          <tr>
            <th>特別条件</th>
            <td>本サービスは事業者(法人・個人事業主)向けのサービスです。個人のお客様はお申し込みいただけません。</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
