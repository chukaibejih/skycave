"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { getTournamentHistory, type TournamentCard } from "@/lib/api";

/**
 * Past weeks: every tournament there has been, newest first.
 *
 * This is half of what makes the tournament a world rather than a live event -
 * there is a record of it, and a champion who stays named after their weekend
 * ends. A finished row leads with its winner; a live one is labelled and links
 * back to This weekend rather than pretending to be history.
 */
export default function PastWeeksPage() {
  const [cards, setCards] = useState<TournamentCard[] | null>(null);

  useEffect(() => {
    getTournamentHistory()
      .then(setCards)
      .catch(() => setCards([]));
  }, []);

  return (
    <TournamentShell active="past">
      <h1 className="font-[var(--font-display)] text-2xl font-bold">Past weeks</h1>
      <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
        Every tournament so far, and who took it.
      </p>

      {cards === null ? (
        <p className="mt-8 text-center text-[var(--color-text-secondary)]">Loading...</p>
      ) : cards.length === 0 ? (
        <p className="mt-8 text-center text-[var(--color-text-secondary)]">
          No tournaments yet. The first one will show up here once it is done.
        </p>
      ) : (
        <div className="mt-6 space-y-2.5">
          {cards.map((c, i) => (
            <PastRow key={c.id} c={c} index={i} />
          ))}
        </div>
      )}
    </TournamentShell>
  );
}

function PastRow({ c, index }: { c: TournamentCard; index: number }) {
  const finished = c.status === "finished";
  const live = c.status === "in_progress" || c.status === "locked";
  const registering = c.status === "registering";
  const href = finished ? `/tournament/${c.id}` : "/tournament";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2) }}
    >
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[14px] border p-3.5 transition-[filter] active:brightness-110"
        style={{
          borderColor: c.champion
            ? "color-mix(in srgb, var(--color-gold) 32%, transparent)"
            : "var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        {c.champion ? (
          <div
            className="shrink-0 rounded-full p-[2px]"
            style={{ background: "linear-gradient(135deg, var(--color-gold), var(--color-warm))" }}
          >
            <Avatar
              id={c.champion.did}
              name={c.champion.display_name}
              avatarUrl={c.champion.avatar_url}
              size={40}
            />
          </div>
        ) : (
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border text-[var(--color-text-secondary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            🏆
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-[var(--font-display)] text-sm font-bold">
              {c.champion ? c.champion.display_name : c.name}
            </span>
            {c.champion && (
              <span
                className="shrink-0 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em]"
                style={{ color: "var(--color-gold)" }}
              >
                won
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
            {c.entrants} {c.entrants === 1 ? "entrant" : "entrants"}
            {live && " · playing now"}
            {registering && " · entries open"}
          </div>
        </div>

        <span aria-hidden className="shrink-0 text-[var(--color-text-secondary)]">
          →
        </span>
      </Link>
    </motion.div>
  );
}
