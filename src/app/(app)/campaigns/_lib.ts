import type { SupabaseClient } from "@supabase/supabase-js";

/** 配信リストの一覧と「送れる宛先」(メールあり・配信停止でない)の人数 */
export async function listMailingListsWithCounts(db: SupabaseClient): Promise<{ id: string; name: string; description: string | null; total: number; sendable: number; created_at: string }[]> {
  const [{ data: lists }, { data: rows }] = await Promise.all([
    db.from("mailing_lists").select("id, name, description, created_at").order("name"),
    db.from("mailing_list_contacts").select("list_id, contact:contacts(email, unsubscribed_at)").limit(50000),
  ]);
  const total = new Map<string, number>();
  const sendable = new Map<string, number>();
  for (const r of (rows ?? []) as unknown as { list_id: string; contact: { email: string | null; unsubscribed_at: string | null } | { email: string | null; unsubscribed_at: string | null }[] | null }[]) {
    const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
    total.set(r.list_id, (total.get(r.list_id) ?? 0) + 1);
    if (c?.email && !c.unsubscribed_at) sendable.set(r.list_id, (sendable.get(r.list_id) ?? 0) + 1);
  }
  return (lists ?? []).map((l) => ({ id: l.id as string, name: l.name as string, description: (l.description as string | null) ?? null, created_at: l.created_at as string, total: total.get(l.id as string) ?? 0, sendable: sendable.get(l.id as string) ?? 0 }));
}

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") || "https://sfa.art-trading.net";
}
