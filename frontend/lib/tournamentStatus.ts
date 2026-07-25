import type { Tournament } from "@/lib/api";

/**
 * One place that turns a tournament's state into how it should look and read.
 *
 * The banner on the hub and the hero on the tournament page both answer the same
 * three questions - what is happening, what do I do, how much time - and they
 * must never answer them differently. Colour carries the state: violet while
 * entries are open, mint once the bracket is live, coral when it comes down to
 * the final, gold once it is won.
 */
/**
 * The tournament world's own warmth. Everywhere else in Skycave is cool and
 * violet; the tournament is amber into coral, so stepping into it feels like
 * stepping somewhere else. The chrome (tabs, buttons, hero glow) always wears
 * this; only the status label shifts colour to carry the state of the event.
 */
export const TOURNEY = {
  accent: "#ff8a3d", // the world's signature warm orange
  accentSoft: "#ffab5c", // a lighter tone for text on dark
  gradient: "linear-gradient(135deg, #ffb64d 0%, #ff7a3c 52%, #ff5b5b 100%)",
  ink: "#2a1400", // dark text that holds contrast on the warm gradient
} as const;

export type TournamentPhase = "open" | "live" | "finals" | "finished";

export interface StatusMeta {
  phase: TournamentPhase;
  label: string; // the headline status ("Registration open", "Bracket is live"...)
  color: string; // the state colour, as a CSS var
  cta: string; // the single action
  countdownTo: string | null; // an instant worth counting down to, or null
  countdownCaption: string | null;
}

/** The earliest round still holding an undecided, real match. */
function activeRound(t: Tournament): number | null {
  const live = t.matches
    .filter((m) => m.status !== "done" && m.status !== "bye")
    .sort((a, b) => a.round - b.round);
  return live[0]?.round ?? null;
}

export function statusMeta(t: Tournament): StatusMeta {
  if (t.status === "registering") {
    return {
      phase: "open",
      label: "Registration open",
      color: TOURNEY.accentSoft, // warm, not violet: this is the tournament world
      cta: "Enter",
      countdownTo: t.registration_closes_at,
      countdownCaption: "Entries close in",
    };
  }
  if (t.status === "finished") {
    return {
      phase: "finished",
      label: t.champion ? `${t.champion.display_name} wins` : "Tournament over",
      color: "var(--color-gold)",
      cta: "See how it went",
      countdownTo: null,
      countdownCaption: null,
    };
  }
  // locked or in_progress: the bracket exists and is being played.
  const round = activeRound(t);
  const isFinal = round !== null && round === t.rounds && t.rounds > 0;
  return {
    phase: isFinal ? "finals" : "live",
    label: isFinal ? "The final is on" : "Bracket is live",
    color: isFinal ? "var(--color-warm)" : "var(--color-success)",
    cta: "Follow the bracket",
    countdownTo: null,
    countdownCaption: null,
  };
}
