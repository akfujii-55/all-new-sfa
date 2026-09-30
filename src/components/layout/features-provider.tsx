"use client";

import { createContext, useContext, type ReactNode } from "react";
import { featuresOf, type Features } from "@/lib/features";

const FeaturesContext = createContext<Features>(featuresOf(null));

/** テナントの利用タイプで使える機能を、クライアント部品(状態の選択・差し込み項目など)に配る */
export function FeaturesProvider({ features, children }: { features: Features; children: ReactNode }) {
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

export function useFeatures() {
  return useContext(FeaturesContext);
}
