import type { SupabaseClient } from "@supabase/supabase-js";
import { getFormSettings, splitList, type FormSettings } from "@/lib/settings";
import type { FormProfile } from "./extract";

/** 設定値(文字列)から、抽出処理に渡す形(配列)にする */
export function formProfileFrom(settings: FormSettings): FormProfile {
  return {
    labels: {
      name: splitList(settings.form_labels_name),
      company: splitList(settings.form_labels_company),
      email: splitList(settings.form_labels_email),
      phone: splitList(settings.form_labels_phone),
      message: splitList(settings.form_labels_message),
    },
    senders: splitList(settings.form_senders).map((a) => a.toLowerCase()).filter((a) => a.includes("@")),
  };
}

/** テナントのフォーム通知設定を読み込む(同期や問い合わせ登録の最初に 1 回呼ぶ)。失敗しても既定で動く */
export async function loadFormProfile(db: SupabaseClient): Promise<FormProfile | null> {
  try {
    return formProfileFrom(await getFormSettings(db));
  } catch {
    return null;
  }
}
