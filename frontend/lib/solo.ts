// Single-player helpers: URL slug, share text, and device-local personal best
// (used for guests, whose PB can't live server-side).
import type { SoloSummary } from "./types";

/** game_type uses underscores internally; URLs use a prettier dash slug. */
export function gameSlug(gameType: string): string {
  return gameType.replace(/_/g, "-");
}

export function gameTypeFromSlug(slug: string): string {
  return slug.replace(/-/g, "_");
}

export function playUrl(gameType: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://skycave.space";
  return `${origin}/play/${gameSlug(gameType)}`;
}

function shortDate(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Build the solo Bluesky post. Reads naturally in a feed and carries the play
 * link so anyone can tap in to beat the score (the invite mechanic itself).
 *
 *   Color Clash · Jun 29
 *
 *   34 correct · 60 seconds
 *   personal best
 *
 *   skycave.space/play/color-clash
 */
export function soloShareText(opts: {
  gameName: string;
  gameType: string;
  metric: string;
  isBest: boolean;
}): string {
  const lines = [`${opts.gameName} · ${shortDate()}`, "", opts.metric];
  if (opts.isBest) lines.push("personal best");
  lines.push("", playUrl(opts.gameType));
  return lines.join("\n");
}

// ── Guest personal best (localStorage) ──
const PB_KEY = "skycave_solo_pb";

function readAll(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PB_KEY) || "{}");
  } catch {
    return {};
  }
}

export function localBest(gameType: string): number | null {
  const v = readAll()[gameType];
  return typeof v === "number" ? v : null;
}

/** Record a score locally; returns whether it beat the prior best. */
export function recordLocalScore(
  gameType: string,
  score: number
): { isBest: boolean; prevBest: number | null } {
  const all = readAll();
  const prev = typeof all[gameType] === "number" ? all[gameType] : null;
  const isBest = prev === null || score > prev;
  if (isBest && typeof window !== "undefined") {
    all[gameType] = score;
    try {
      window.localStorage.setItem(PB_KEY, JSON.stringify(all));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return { isBest, prevBest: prev };
}

/**
 * Resolve personal-best for display + share, reconciling the server summary
 * (logged-in users) with device-local storage (guests).
 */
export function resolveSoloBest(
  gameType: string,
  summary: SoloSummary | null | undefined
): { isBest: boolean; prevBest: number | null } {
  if (summary && summary.is_best !== null) {
    return { isBest: summary.is_best, prevBest: summary.prev_best };
  }
  if (!summary) return { isBest: false, prevBest: null };
  // Guest: decide from localStorage (and persist this run).
  return recordLocalScore(gameType, summary.score);
}
