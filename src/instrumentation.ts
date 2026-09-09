import type { Instrumentation } from "next";

/**
 * Next.js がサーバー側で捕捉したエラー(ページ描画・Route Handler・Server Action)を system_logs に記録する。
 * 想定内の入力エラー(「〜してください」など)は warn として残し、通知はしない。
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logSystem, errorMessage, errorDetail, isLoggedError, isUserFacingError } = await import("@/lib/log");

  const message = errorMessage(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  // リダイレクト・404 は正常な制御フロー
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return;
  // 発生箇所で既に記録済み(メール送信失敗など)
  if (isLoggedError(err)) return;

  const userFacing = context.routeType === "action" && isUserFacingError(message);
  await logSystem({
    level: userFacing ? "warn" : "error",
    source: context.routeType,
    message,
    detail: { ...errorDetail(err), routePath: context.routePath, method: request.method, renderSource: context.renderSource },
    path: request.path,
  });
};
