"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeBluesky } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { Button } from "@/components/ui/Button";

function OAuthInner() {
  const router = useRouter();
  const setIdentity = useAuth((s) => s.setIdentity);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // The sidecar has already set the session cookie and bounced us here;
      // exchange it for a Skycave token.
      const identity = await completeBluesky();
      if (identity) {
        setIdentity(identity);
        router.replace("/");
      } else {
        setError("Couldn't complete Bluesky login.");
      }
    })();
  }, [router, setIdentity]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <p className="text-[var(--color-warm)]">{error}</p>
          <Button variant="secondary" onClick={() => router.replace("/")}>
            Back to hub
          </Button>
        </>
      ) : (
        <p className="text-[var(--color-text-secondary)]">finishing login…</p>
      )}
    </main>
  );
}

export default function OAuthPage() {
  return (
    <Suspense fallback={null}>
      <OAuthInner />
    </Suspense>
  );
}
