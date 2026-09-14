"use client";

import { useState, useTransition } from "react";
import { completeSignup } from "@/actions/signup";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { actionErrorMessage } from "@/lib/errors";

export function CompleteSignupButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const r = await completeSignup(token);
              if (r && "error" in r) setError(r.error);
            } catch (e) {
              // redirect() は例外として伝わるので、それ以外だけ表示する(本番では message が伏せられるので digest で判定)
              if ((e as Error & { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
              setError(actionErrorMessage(e, "アカウントを作成できませんでした"));
            }
          })
        }
      >
        {pending ? "作成中..." : "アカウントを開設する"}
      </Button>
    </div>
  );
}
