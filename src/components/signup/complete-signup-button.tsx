"use client";

import { useState, useTransition } from "react";
import { completeSignup } from "@/actions/signup";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
              // redirect() は例外として伝わるので、それ以外だけ表示する
              const msg = (e as Error)?.message ?? "";
              if (!/NEXT_REDIRECT/.test(msg)) setError(msg || "アカウントを作成できませんでした");
              else throw e;
            }
          })
        }
      >
        {pending ? "作成中..." : "アカウントを開設する"}
      </Button>
    </div>
  );
}
