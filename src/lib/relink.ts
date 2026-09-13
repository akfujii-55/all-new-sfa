import type { SupabaseClient } from "@supabase/supabase-js";

/** 担当者の所属を変えたときに、その担当者のメール・問い合わせの取引先も合わせる(旧所属のものだけ。案件は動かさない) */
export async function propagateContactCompany(db: SupabaseClient, contactId: string, fromCompanyId: string | null, toCompanyId: string | null) {
  if (fromCompanyId === toCompanyId) return;
  for (const table of ["emails", "inquiries"] as const) {
    let q = db.from(table).update({ company_id: toCompanyId }).eq("contact_id", contactId);
    q = fromCompanyId ? q.eq("company_id", fromCompanyId) : q.is("company_id", null);
    const { error } = await q;
    if (error) throw new Error(error.message);
  }
}
