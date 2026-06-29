"use client";
import type { PlayerSlot } from "@/lib/types";

interface Props {
  gameName: string;
  players: PlayerSlot[];
  scores: Record<string, number>;
  history: { round: number; points: Record<string, number> }[];
  winnerId: string | null;
}

// The shareable result card — clean, typographic, like a match-result printout.
// No gradients, no shadow, no decoration: the border + numbers do the work.
// Renders to look correct as a standalone screenshot, matching the downloaded PNG.
const VIOLET = "#6C63FF";
const CORAL = "#FF6B6B";
const MINT = "#4FFFB0";
const BORDER = "#2A2A3A";
const MUTED = "#8888AA";

export function ScoreCard({ gameName, players, scores, history, winnerId }: Props) {
  const p1 = players[0];
  const p2 = players[1];
  const winner = players.find((p) => p.id === winnerId);

  const resultColor = !winnerId ? MINT : winnerId === p1?.id ? VIOLET : CORAL;
  const resultText = winner ? `${winner.display_name} wins`.toLowerCase() : "draw";

  const ScoreRow = ({ pid, color }: { pid?: string; color: string }) => (
    <div className="flex gap-2">
      {history.map((h) => (
        <span
          key={h.round}
          className="w-9 shrink-0 text-center font-[var(--font-display)] text-base font-bold"
          style={{ color }}
        >
          {pid ? h.points[pid] ?? 0 : 0}
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="rounded-[16px] border bg-[#13131A] px-6 py-8"
      style={{ borderColor: BORDER }}
    >
      {/* Game name */}
      <div
        className="text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
        style={{ color: MUTED }}
      >
        {gameName}
      </div>

      {/* Player names + vs pill */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <span
          className="min-w-0 truncate font-[var(--font-display)] text-[22px] font-bold"
          style={{ color: VIOLET }}
        >
          {p1?.display_name}
        </span>
        <span
          className="shrink-0 self-center rounded-full border px-3 py-1 font-[var(--font-mono)] text-[11px]"
          style={{ borderColor: BORDER, color: MUTED }}
        >
          vs
        </span>
        <span
          className="min-w-0 truncate text-right font-[var(--font-display)] text-[22px] font-bold"
          style={{ color: CORAL }}
        >
          {p2?.display_name}
        </span>
      </div>

      {/* Round breakdown */}
      {history.length > 0 && (
        <div className="mt-6 space-y-2 overflow-x-auto rounded-[8px] bg-[#0A0A0F] p-3">
          <div className="flex gap-2">
            {history.map((h) => (
              <span
                key={h.round}
                className="w-9 shrink-0 text-center font-[var(--font-mono)] text-[11px] uppercase"
                style={{ color: MUTED }}
              >
                R{h.round}
              </span>
            ))}
          </div>
          <ScoreRow pid={p1?.id} color={VIOLET} />
          <ScoreRow pid={p2?.id} color={CORAL} />
        </div>
      )}

      {/* Final score */}
      <div className="mt-6 text-center">
        <div className="font-[var(--font-display)] text-[48px] font-bold leading-none">
          <span style={{ color: VIOLET }}>{p1 ? scores[p1.id] ?? 0 : 0}</span>
          <span className="mx-3" style={{ color: BORDER }}>
            -
          </span>
          <span style={{ color: CORAL }}>{p2 ? scores[p2.id] ?? 0 : 0}</span>
        </div>
        <div
          className="mt-2 font-[var(--font-body)] text-[13px]"
          style={{ color: resultColor }}
        >
          {resultText}
        </div>
      </div>

      {/* Footer */}
      <div
        className="mt-5 flex items-center justify-between font-[var(--font-mono)] text-[11px]"
        style={{ color: MUTED }}
      >
        <span>Skycave</span>
        <span>skycave.space</span>
      </div>
    </div>
  );
}
