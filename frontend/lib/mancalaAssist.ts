// Client-side Mancala rules, used only for the SOLO assist (move markers and the
// "Hint" button). It mirrors the server's _sow so the guidance matches the real
// game; it never drives play, which stays server-authoritative. Kept out of 1v1
// entirely by the caller, so nothing here helps a tournament opponent.
const TOTAL = 14;
const STORE = [6, 13];

const ownPits = (p: number): number[] =>
  p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
const ownStore = (p: number): number => STORE[p];
const oppStore = (p: number): number => STORE[1 - p];
const sideEmpty = (pits: number[], p: number): boolean =>
  ownPits(p).every((i) => pits[i] === 0);

function sweep(pits: number[]): void {
  for (const p of [0, 1]) {
    if (sideEmpty(pits, p)) {
      const other = 1 - p;
      for (const i of ownPits(other)) {
        pits[ownStore(other)] += pits[i];
        pits[i] = 0;
      }
    }
  }
}

interface SowResult {
  pits: number[];
  extra: boolean;
  captured: boolean;
  last: number;
}

/** One move for player p sowing from `pit`, or null if illegal. Pure. */
export function sow(pits: number[], p: number, pit: number): SowResult | null {
  if (!ownPits(p).includes(pit) || pits[pit] === 0) return null;
  const out = pits.slice();
  let seeds = out[pit];
  out[pit] = 0;
  const oppS = oppStore(p);
  let i = pit;
  while (seeds > 0) {
    i = (i + 1) % TOTAL;
    if (i === oppS) continue;
    out[i] += 1;
    seeds -= 1;
  }
  const myStore = ownStore(p);
  const extra = i === myStore;
  let captured = false;
  if (!extra && ownPits(p).includes(i) && out[i] === 1) {
    const opp = 12 - i;
    if (out[opp] > 0) {
      out[myStore] += out[opp] + 1;
      out[opp] = 0;
      out[i] = 0;
      captured = true;
    }
  }
  if (sideEmpty(out, 0) || sideEmpty(out, 1)) sweep(out);
  return { pits: out, extra, captured, last: i };
}

export interface MoveHint {
  extra: boolean; // lands in your store, so you go again
  gain: number; // seeds this move banks (capture or landing in your store)
}

/** What each of player p's playable pits would do, keyed by pit index. */
export function moveHints(pits: number[], p: number): Record<number, MoveHint> {
  const store = ownStore(p);
  const hints: Record<number, MoveHint> = {};
  for (const pit of ownPits(p)) {
    if (pits[pit] === 0) continue;
    const r = sow(pits, p, pit);
    if (!r) continue;
    hints[pit] = { extra: r.extra, gain: r.pits[store] - pits[store] };
  }
  return hints;
}

/**
 * The strongest move for `me`, by minimax. Extra turns keep the same player
 * moving; depth 6 is more than enough to guide a struggling player and stays
 * instant on a 14-pit board.
 */
export function bestMove(pits: number[], me: number, depth = 6): number | null {
  const heuristic = (b: number[]) => b[ownStore(me)] - b[ownStore(1 - me)];

  const search = (b: number[], p: number, d: number): { score: number; move: number | null } => {
    if (d === 0 || sideEmpty(b, 0) || sideEmpty(b, 1)) {
      return { score: heuristic(b), move: null };
    }
    const moves = ownPits(p).filter((i) => b[i] > 0);
    if (moves.length === 0) return { score: heuristic(b), move: null };

    let best: { score: number; move: number | null } | null = null;
    for (const m of moves) {
      const r = sow(b, p, m);
      if (!r) continue;
      const next = r.extra ? p : 1 - p;
      const { score } = search(r.pits, next, d - 1);
      const better = best === null || (p === me ? score > best.score : score < best.score);
      if (better) best = { score, move: m };
    }
    return best ?? { score: heuristic(b), move: null };
  };

  return search(pits, me, depth).move;
}
