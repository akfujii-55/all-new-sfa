"use client";

import { createContext, useContext, type ReactNode } from "react";

interface MailDefaults {
  /** ログイン中の営業担当者の署名 */
  signature: string;
  /** 返信メールの件名の初期値 */
  replySubject: string;
}

const MailDefaultsContext = createContext<MailDefaults>({ signature: "", replySubject: "" });

/** 署名と返信件名を、返信フォームや新規作成ダイアログに配る */
export function SignatureProvider({ signature, replySubject, children }: MailDefaults & { children: ReactNode }) {
  return <MailDefaultsContext.Provider value={{ signature, replySubject }}>{children}</MailDefaultsContext.Provider>;
}

export function useSignature() {
  return useContext(MailDefaultsContext).signature;
}

export function useReplySubject() {
  return useContext(MailDefaultsContext).replySubject;
}
