"use client";

import { useSyncExternalStore } from "react";

/**
 * ブラウザごとの表示設定(localStorage)。サーバー描画では既定値を使い、マウント後に保存値へ切り替わる。
 * 例: カンバンのカードに出す Todo の件数。
 */
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useLocalPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;
  const set = (v: T) => {
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // 保存できない環境(プライベートモードなど)では表示だけ切り替わらない。既定値のまま使える
    }
    for (const cb of listeners) cb();
  };
  return [value, set];
}
