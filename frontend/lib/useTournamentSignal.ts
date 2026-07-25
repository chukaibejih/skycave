"use client";
import { useEffect, useState } from "react";
import { getCurrentTournament, getMyMatch, type Tournament } from "@/lib/api";
import { useAuth } from "@/lib/store";

/**
 * One read of "what should the rest of the app know about the tournament".
 *
 * Two consumers share it: the world switch (does the Tournament tab wear a live
 * pip) and the hub's last-day countdown strip. Keeping it in one hook means the
 * pip and the strip can never disagree about whether something is on.
 *
 * The my-match call only fires when there is genuinely a live event the viewer
 * is in, which is rare and exactly when the extra read is worth it. Most of the
 * week this is a single public request, or nothing at all.
 */
export interface TournamentSignal {
  tournament: Tournament | null;
  /** The viewer has a fixture still to play in a live tournament. */
  livePip: boolean;
  /** Ms until registration closes, or null when that is not the current phase. */
  closesInMs: number | null;
}

const POLL_MS = 60_000;

export function useTournamentSignal(): TournamentSignal {
  const { identity } = useAuth();
  const [sig, setSig] = useState<TournamentSignal>({
    tournament: null,
    livePip: false,
    closesInMs: null,
  });

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const t = await getCurrentTournament();
        if (!alive) return;
        if (!t) {
          setSig({ tournament: null, livePip: false, closesInMs: null });
          return;
        }

        const closesInMs =
          t.status === "registering"
            ? Math.max(0, new Date(t.registration_closes_at).getTime() - Date.now())
            : null;

        // Only chase the personal signal when there is a live event this viewer
        // has entered - otherwise there is nothing a pip could point at.
        let livePip = false;
        const live = t.status === "in_progress" || t.status === "locked";
        if (live && t.you_registered && identity && !identity.is_guest) {
          try {
            const m = await getMyMatch(t.id);
            livePip = !!m && !m.won_match && !m.eliminated && !m.is_champion && !m.is_bye;
          } catch {
            /* the pip is a nicety; never let it break the nav */
          }
        }
        if (alive) setSig({ tournament: t, livePip, closesInMs });
      } catch {
        /* leave the last good signal in place */
      }
    };

    read();
    const iv = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [identity]);

  return sig;
}
