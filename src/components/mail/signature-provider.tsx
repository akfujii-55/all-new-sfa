"use client";

import { createContext, useContext, type ReactNode } from "react";

const SignatureContext = createContext<string>("");

/** ログイン中の営業担当者の署名を、返信フォームや新規作成ダイアログに配る */
export function SignatureProvider({ signature, children }: { signature: string; children: ReactNode }) {
  return <SignatureContext.Provider value={signature}>{children}</SignatureContext.Provider>;
}

export function useSignature() {
  return useContext(SignatureContext);
}
