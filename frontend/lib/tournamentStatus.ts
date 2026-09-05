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
 * The tournament world's own look, themed per season. Everywhere else in Skycave
 * is cool and violet; the tournament wears its own palette so stepping into it
 * feels like stepping somewhere else. The chrome (tabs, buttons, hero glow, the
 * hub card) always wears this; only the status label shifts colour to carry the
 * state of the event. Swapping the whole world for a new week is this one object.
 *
 * This week: Tropical Jungle — an emerald canopy, gold light shafts and low
 * mist. DARK scene, so the ink is light. (Past palettes live in git history,
 * not here.)
 *
 * The scene is dark, so text colours are routed through `ink` / `inkSoft` rather
 * than hardcoded: swapping this object re-themes the whole tournament world,
 * card and announcement image included.
 */
export const TOURNEY = {
  accent: "#1fbf7a", // canopy emerald, the world's signature
  accentSoft: "#7ff0b0", // fresh leaf-green for text and pips
  gradient: "linear-gradient(135deg, #1fbf7a 0%, #0f7a48 52%, #7ff0b0 100%)",
  ink: "#eafff4", // near-white against the dark canopy
  inkSoft: "#b8ddc4", // muted mist for secondary lines
  panel: "rgba(3, 28, 16, 0.66)", // deep jungle glass behind the countdown

  // Tropical Jungle: a shaded canopy lit by gold shafts, with mist below.
  sky: "linear-gradient(180deg, #052817 0%, #073b22 50%, #0f5a34 100%)",
  leaf: "#0a4a2a",
  leafDeep: "#042315",
  shaft: "#ffe9a3",
  mist: "#a6e7c3",
  ground: "#062d1b",
  coral: "#e5533d", // urgency remains a universal state signal
} as const;

export type TournamentPhase = "open" | "live" | "finals" | "finished";

export interface StatusMeta {
  phase: TournamentPhase;
  label: string; // the headline status ("Registration open", "Bracket is live"...)
  color: string; // the state colour, as a CSS var
  cta: string; // the single action
  countdownTo: string | null; // an instant worth counting down to, or null
  countdownCaption: string | null;
  // The clock only starts ticking once it means something. Before this instant
  // the banner reads calmly ("Closes Thursday"); from it, the live countdown
  // runs. Set to the Wednesday 00:00 before the close, in the viewer's own week,
  // so a five-day-out "4d 3h 2m 1s" never sits nagging on the hub all week.
  countdownFrom: string | null;
}

/** Wednesday 00:00 (viewer-local) before a Thursday close. */
function clockStart(closeIso: string): string {
  const from = new Date(closeIso);
  from.setDate(from.getDate() - 1); // Thursday -> Wednesday
  from.setHours(0, 0, 0, 0); // local midnight
  return from.toISOString();
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
      cta: "Enter Tournament",
      countdownTo: t.registration_closes_at,
      countdownCaption: "Entries close in",
      // A launch event carries its own start (tick from go-live); a normal
      // week falls back to the Wednesday-before-close gate.
      countdownFrom: t.countdown_from ?? clockStart(t.registration_closes_at),
    };
  }
  if (t.status === "finished") {
    return {
      phase: "finished",
      label: t.champion ? `${t.champion.display_name} wins` : "Tournament over",
      color: "var(--color-gold)",
      cta: "See results & bracket",
      countdownTo: null,
      countdownCaption: null,
      countdownFrom: null,
    };
  }
  // locked or in_progress: the bracket exists and is being played.
  const round = activeRound(t);
  const isFinal = round !== null && round === t.rounds && t.rounds > 0;
  return {
    phase: isFinal ? "finals" : "live",
    label: isFinal ? "The final is on" : "Bracket is live",
    color: isFinal ? "var(--color-warm)" : "var(--color-success)",
    cta: "View Live Bracket",
    countdownTo: null,
    countdownCaption: null,
    countdownFrom: null,
  };
}
