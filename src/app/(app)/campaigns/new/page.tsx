import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { getMailAccountOptions } from "@/lib/mail/options";
import { campaignDailyLimitOf, getCampaignSettings } from "@/lib/settings";
import { listMailingListsWithCounts, siteOrigin } from "../_lib";

export const metadata = { title: "新しい配信" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const defaultListId = typeof sp.list === "string" ? sp.list : null;
  const supabase = await createClient();
  const [accounts, lists, settings] = await Promise.all([getMailAccountOptions(supabase), listMailingListsWithCounts(supabase), getCampaignSettings(supabase)]);
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2"><Link href="/campaigns"><ArrowLeft className="size-4" /> 配信一覧</Link></Button>
      <h1 className="mb-4 text-xl font-semibold tracking-tight">新しい配信</h1>
      <CampaignForm campaign={null} defaultListId={defaultListId} accounts={accounts} lists={lists} footer={settings.campaign_footer} siteUrl={siteOrigin()} dailyLimit={campaignDailyLimitOf(settings)} />
    </div>
  );
}
