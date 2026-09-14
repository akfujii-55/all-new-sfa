"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EmailTemplate } from "@/lib/types";

interface MailDefaults {
  /** ログイン中の営業担当者の署名 */
  signature: string;
  /** 返信メールの件名の初期値 */
  replySubject: string;
  /** 差し込み項目 {{自社担当者}} に入る、ログイン中の営業担当者の名前 */
  memberName: string;
  /** 差し込み項目 {{自社会社名}} に入る、署名の会社名 */
  companyName: string;
  /** 返信・新規作成で選べるテンプレート(会社共通 + 自分専用) */
  templates: EmailTemplate[];
}

const MailDefaultsContext = createContext<MailDefaults>({ signature: "", replySubject: "", memberName: "", companyName: "", templates: [] });

/** 署名・返信件名・テンプレートを、返信フォームや新規作成ダイアログに配る */
export function SignatureProvider({ children, ...defaults }: MailDefaults & { children: ReactNode }) {
  return <MailDefaultsContext.Provider value={defaults}>{children}</MailDefaultsContext.Provider>;
}

export function useSignature() {
  return useContext(MailDefaultsContext).signature;
}

export function useReplySubject() {
  return useContext(MailDefaultsContext).replySubject;
}

export function useMailDefaults() {
  return useContext(MailDefaultsContext);
}
