"use server";

import { createClient } from "@/lib/supabase/server";
import { userError } from "@/lib/errors";
import { ilikePattern } from "@/lib/search-filter";
import type { AddressOption } from "@/lib/mail/addresses";

/**
 * 宛先・CC の入力中に出すアドレスの候補。社内(営業担当者)→ 取引先の担当者の順に、名前かアドレスの部分一致で探す。
 * 自テナントの分だけ(RLS)。運営サポートの行は社内の人ではないので出さない。
 */
export async function searchAddresses(query: string): Promise<AddressOption[]> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw userError("ログインが必要です");
  const q = query.normalize("NFKC").trim().slice(0, 60);
  if (!q) return [];
  const pattern = ilikePattern(q);
  const filter = `name.ilike.${pattern},email.ilike.${pattern}`;
  const [{ data: members }, { data: contacts }] = await Promise.all([
    supabase.from("members").select("name, email").eq("is_active", true).eq("is_support", false).not("email", "is", null).or(filter).order("sort_order").limit(5),
    supabase.from("contacts").select("name, email, company:companies(name)").not("email", "is", null).or(filter).order("name").limit(8),
  ]);
  const out: AddressOption[] = [];
  for (const m of members ?? []) if (m.email) out.push({ email: m.email, name: m.name, hint: "社内" });
  for (const c of contacts ?? []) {
    if (!c.email) continue;
    const company = c.company as unknown as { name: string } | { name: string }[] | null;
    const companyName = Array.isArray(company) ? company[0]?.name : company?.name;
    out.push({ email: c.email, name: c.name, hint: companyName ?? "担当者" });
  }
  return out;
}
