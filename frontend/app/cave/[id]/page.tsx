"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CaveShell, Hint } from "@/components/cave/CaveShell";
import { CaveSignIn } from "@/components/cave/SignIn";
import { useAuth } from "@/lib/store";
import { claimRoom, getCasePreview, CaveError, type CaseCard } from "@/lib/cave";

const INK = "var(--color-text-primary)";
const MUTED = "#8888AA";

export default function CasePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [c, setC] = useState<CaseCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const authed = loaded && identity && !identity.is_guest;

  useEffect(() => {
    getCasePreview(id).then(setC).catch((e) => setErr(e instanceof Error ? e.message : "Not found"));
  }, [id]);

  const claim = async () => {
    setClaiming(true);
    setErr(null);
    try {
      const r = await claimRoom(id);
      router.push(`/cave/room/${r.room_id}`);
    } catch (e) {
      setErr(e instanceof CaveError ? e.message : "Could not claim a spot");
      setClaiming(false);
    }
  };

  if (err && !c) {
    return (
      <CaveShell back="/cave">
        <p className="py-20 text-center text-sm" style={{ color: MUTED }}>{err}</p>
      </CaveShell>
    );
  }
  if (!c) {
    return (
      <CaveShell back="/cave">
        <p className="py-20 text-center text-sm" style={{ color: MUTED }}>loading the case...</p>
      </CaveShell>
    );
  }

  return (
    <CaveShell back="/cave">
      <div className="flex items-center gap-2">
        <span className="rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[10px] uppercase" style={{ borderColor: "var(--color-border)", color: MUTED }}>{c.difficulty}</span>
        <span className="text-[12px]" style={{ color: MUTED }}>by @{c.architect_handle}</span>
      </div>
      <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold leading-tight" style={{ color: INK }}>{c.title}</h1>

      <section className="mt-5 rounded-[16px] border p-5" style={{ borderColor: "var(--color-border)", background: "#12100d" }}>
        <div className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]" style={{ color: MUTED }}>the setup</div>
        <p className="font-[var(--font-display)] text-[17px] leading-8" style={{ color: INK }}>{c.premise}</p>
      </section>

      <div className="mt-5 rounded-[12px] border px-4 py-3 text-[13px] leading-6" style={{ borderColor: "var(--color-border)", background: "#100e0b", color: MUTED }}>
        You will hold half the clues. Your partner holds the other half, hidden from you. You solve it together in a
        shared notepad, then confirm one answer as a team.
      </div>

      {!loaded ? (
        <div className="mt-5 h-12" />
      ) : authed ? (
        <>
          <button
            onClick={claim}
            disabled={claiming}
            className="mt-5 h-12 w-full rounded-[12px] text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            {claiming ? "claiming your spot..." : "Take a solver spot"}
          </button>
          <Hint>Claiming pairs you into a room. If a spot is already open, you become the second solver and the case begins.</Hint>
          {err && <p className="mt-3 text-sm" style={{ color: "#ff725e" }}>{err}</p>}
        </>
      ) : (
        <div className="mt-5">
          <CaveSignIn returnTo={`/cave/${id}`} />
        </div>
      )}

      <div className="mt-6 text-center text-[12px]" style={{ color: MUTED }}>{c.attempts} attempts · {c.solves} solved</div>
    </CaveShell>
  );
}
