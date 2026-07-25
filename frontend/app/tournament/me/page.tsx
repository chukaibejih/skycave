"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { getMyRecord, type PlayerRecord } from "@/lib/api";
import { startBlueskyLogin } from "@/lib/bluesky";
import { useAuth } from "@/lib/store";

/**
 * Your record: the other half of what makes this a world you return to. A place
 * that remembers you were here, how far you got, and what you have won. Empty
 * until you have played one, and gated behind a real account, because a guest
 * has no history to keep.
 */
export default function MyRecordPage() {
  const { identity, loaded, hydrate } = useAuth();
  const [rec, setRec] = useState<PlayerRecord | null>(null);
  const signedIn = !!identity && !identity.is_guest;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!loaded) return;
    if (!signedIn) return;
    getMyRecord()
      .then(setRec)
      .catch(() => setRec({ you: null, played: 0, titles: 0, entries: [] }));
  }, [loaded, signedIn]);

  if (loaded && !signedIn) {
    return (
      <TournamentShell active="record">
        <div className="mt-6 text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-bold">Your record</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Sign in with Bluesky to keep a record of every tournament you enter,
            how far you get, and what you win.
          </p>
          <button
            onClick={() => startBlueskyLogin()}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] px-6 font-bold"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            Sign in with Bluesky
          </button>
        </div>
      </TournamentShell>
    );
  }

  return (
    <TournamentShell active="record">
      <h1 className="font-[var(--font-display)] text-2xl font-bold">Your record</h1>

      {rec === null ? (
        <p className="mt-8 text-center text-[var(--color-text-secondary)]">Loading...</p>
      ) : rec.entries.length === 0 ? (
        <div className="mt-6 rounded-[16px] border p-6 text-center"
             style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <p className="font-[var(--font-display)] text-lg font-bold">
            No tournaments yet.
          </p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--color-text-secondary)]">
            Enter your first one and this fills up with your run through it.
          </p>
          <Link
            href="/tournament"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-[14px] px-5 font-semibold"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            This weekend
          </Link>
        </div>
      ) : (
        <>
          {/* The headline: who you are and the two numbers that matter. */}
          <div
            className="mt-5 flex items-center gap-4 rounded-[18px] border p-4"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            {rec.you && (
              <Avatar
                id={rec.you.did}
                name={rec.you.display_name}
                avatarUrl={rec.you.avatar_url}
                size={52}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-[var(--font-display)] text-lg font-bold">
                {rec.you?.display_name}
              </div>
              <div className="mt-1 flex gap-4">
                <Stat n={rec.played} label={rec.played === 1 ? "tournament" : "tournaments"} />
                <Stat n={rec.titles} label={rec.titles === 1 ? "title" : "titles"} gold={rec.titles > 0} />
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            {rec.entries.map((e, i) => (
              <motion.div
                key={e.tournament_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
              >
                <Link
                  href={e.status === "finished" ? `/tournament/${e.tournament_id}` : "/tournament"}
                  className="flex items-center gap-3 rounded-[14px] border p-3.5 transition-[filter] active:brightness-110"
                  style={{
                    borderColor: e.is_champion
                      ? "color-mix(in srgb, var(--color-gold) 40%, transparent)"
                      : "var(--color-border)",
                    background: "var(--color-surface)",
                  }}
                >
                  <StageBadge stage={e.stage} champion={e.is_champion} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{e.name}</div>
                    <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                      {e.series_won + e.series_lost > 0
                        ? `${e.series_won} ${e.series_won === 1 ? "series" : "series"} won`
                        : "entered"}
                      {e.status !== "finished" && " · in progress"}
                    </div>
                  </div>
                  <span aria-hidden className="shrink-0 text-[var(--color-text-secondary)]">
                    →
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </TournamentShell>
  );
}

function Stat({ n, label, gold }: { n: number; label: string; gold?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="font-[var(--font-display)] text-xl font-bold tabular-nums"
        style={{ color: gold ? "var(--color-gold)" : "var(--color-text-primary)" }}
      >
        {n}
      </span>
      <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
    </div>
  );
}

function StageBadge({ stage, champion }: { stage: string; champion: boolean }) {
  const color = champion
    ? "var(--color-gold)"
    : stage === "Runner-up"
      ? "var(--color-warm)"
      : "var(--color-primary)";
  return (
    <div
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border text-center font-[var(--font-mono)] text-[9px] uppercase leading-tight tracking-wide"
      style={{
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        color,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      {champion ? "👑" : stage}
    </div>
  );
}
