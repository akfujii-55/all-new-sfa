import type { SupabaseClient } from "@supabase/supabase-js";
import { format, subMonths, startOfMonth } from "date-fns";

export async function monthlyRevenueSeries(supabase: SupabaseClient, months = 12) {
  const start = startOfMonth(subMonths(new Date(), months - 1));
  const { data } = await supabase
    .from("revenues")
    .select("year_month, amount")
    .gte("year_month", format(start, "yyyy-MM-dd"));
  const map = new Map<string, number>();
  for (let i = 0; i < months; i++) {
    const d = subMonths(startOfMonth(new Date()), months - 1 - i);
    map.set(format(d, "yyyy-MM"), 0);
  }
  for (const r of data ?? []) {
    const key = String(r.year_month).slice(0, 7);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(r.amount));
  }
  return Array.from(map.entries()).map(([month, amount]) => ({
    month,
    label: `${Number(month.slice(5, 7))}月`,
    amount,
  }));
}
