"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveSendAccount } from "@/lib/mail/accounts";
import { sendMail } from "@/lib/mail/smtp";
import { tenantIdOf } from "@/lib/supabase/tenant";
import { assertCanAddUser, assertTenantWritable } from "@/lib/tenant-quota";

function s(v: FormDataEntryValue | null) {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

function revalidate() {
  revalidatePath("/members");
  revalidatePath("/deals");
}

export async function createMember(formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("氏名は必須です");
  const { count } = await supabase.from("members").select("id", { count: "exact", head: true });
  const { data, error } = await supabase
    .from("members")
    .insert({
      name,
      email: s(formData.get("email"))?.toLowerCase() ?? null,
      memo: s(formData.get("memo")),
      is_active: true,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidate();
  // 「招待メールを送る」にチェックがあれば続けて招待
  if (formData.get("invite") === "true") {
    const r = await inviteMember(data.id);
    return { id: data.id as string, message: r.message };
  }
  return { id: data.id as string, message: null };
}

export async function updateMember(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = s(formData.get("name"));
  if (!name) throw new Error("氏名は必須です");
  const { error } = await supabase
    .from("members")
    .update({
      name,
      email: s(formData.get("email"))?.toLowerCase() ?? null,
      memo: s(formData.get("memo")),
      is_active: formData.get("is_active") !== "false",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

/**
 * 営業担当者を削除する。ログインできる利用者なら auth ユーザーごと削除してログインを無効化する
 * (利用ユーザー数は課金対象なので、削除した分の枠を空ける)。担当していた案件の担当は「未設定」になる。
 */
export async function deleteMember(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const { data: member } = await supabase.from("members").select("id, profile_id").eq("id", id).maybeSingle();
  if (!member) throw new Error("営業担当者が見つかりません");
  if (member.profile_id === auth.user.id) throw new Error("自分自身は削除できません。他の営業担当者に削除してもらってください");

  if (member.profile_id) {
    // auth ユーザーの削除だけは service role が必要。profiles は cascade で消え、セッションも無効になる
    const { error: delErr } = await createAdminClient().auth.admin.deleteUser(member.profile_id);
    if (delErr && !/not found/i.test(delErr.message)) throw new Error(`ログインの無効化に失敗しました: ${delErr.message}`);
  }
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidate();
}

/** 案件の営業担当を変更 */
export async function setDealOwner(dealId: string, memberId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("deals").update({ owner_id: memberId }).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath("/deals");
  revalidatePath(`/deals/${dealId}`);
}

/**
 * 営業担当者に招待メールを送る。
 * Supabase の招待リンク(token_hash)を作り、登録済みのメールアカウントから自アプリ宛のリンク付きメールを送る。
 * リンクを開くと /auth/confirm でセッションを作り、パスワード設定画面に進む。
 */
export async function inviteMember(memberId: string): Promise<{ message: string }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("ログインが必要です");
  const inviterName = (await supabase.from("members").select("name").eq("profile_id", auth.user.id).maybeSingle()).data?.name ?? auth.user.email ?? "管理者";

  const { data: member } = await supabase.from("members").select("id, name, email, profile_id, invited_at").eq("id", memberId).maybeSingle();
  if (!member) throw new Error("営業担当者が見つかりません");
  if (!member.email) throw new Error("招待するにはメールアドレスを登録してください");
  if (member.profile_id) throw new Error("この営業担当者は既にログインできます");
  const email = member.email.toLowerCase();
  // 招待中の営業担当者もユーザー数に数える。再送は枠を消費しない
  if (member.invited_at) await assertTenantWritable(supabase);
  else await assertCanAddUser(supabase);
  const tenantId = await tenantIdOf(supabase);

  // auth ユーザーの作成だけは service role が必要。テーブルの読み書きはログインユーザーのクライアントで行う
  const admin = createAdminClient();
  // 招待リンク。既に auth ユーザーがいる(招待済みで未設定)場合はマジックリンクで再送する
  // member_id / tenant_id は DB 側(handle_new_user)が所属テナントと営業担当者の結び付けに使う
  let tokenHash: string | null = null;
  let type: "invite" | "magiclink" = "invite";
  const first = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: member.name, member_id: member.id, tenant_id: tenantId } },
  });
  if (first.error) {
    if (!/already|exists|registered/i.test(first.error.message)) throw new Error(first.error.message);
    const again = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (again.error) throw new Error(again.error.message);
    tokenHash = again.data.properties.hashed_token;
    type = "magiclink";
  } else {
    tokenHash = first.data.properties.hashed_token;
  }
  if (!tokenHash) throw new Error("招待リンクを作成できませんでした");

  const origin = await siteOrigin();
  const link = `${origin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}&next=${encodeURIComponent("/set-password")}`;

  const account = await resolveSendAccount(supabase, {});
  const text = [
    `${member.name} 様`,
    "",
    `${inviterName} さんから営業支援ツール「SFA」に招待されました。`,
    "以下のリンクを開いてパスワードを設定すると、ログインできるようになります。",
    "",
    link,
    "",
    "※ リンクの有効期限は 24 時間です。期限が切れた場合は招待をもう一度送ってもらってください。",
    "※ 心当たりがない場合はこのメールを破棄してください。",
  ].join("\n");
  await sendMail(account, { to: [email], subject: `【SFA】${inviterName} さんから招待が届いています`, text });

  await supabase.from("members").update({ invited_at: new Date().toISOString(), email }).eq("id", member.id);
  revalidate();
  return { message: `${email} に招待メールを送りました` };
}

/** 招待リンクに使う自アプリの URL */
async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
