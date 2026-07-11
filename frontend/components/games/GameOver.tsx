"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth, useRoom } from "@/lib/store";

const INK = "#F0F0FF";
const MUTED = "#8888AA";
const LINE = "#2A2A3A";

/**
 * In-room end screen for versus games. Both players stay here on the live socket,
 * so "Rematch" restarts the SAME room via the existing WS flow: one taps, the
 * other sees "wants a rematch" and accepts, and the game restarts in place. No new
 * link, no re-invite. Works the same for guests and Bluesky users. A running
 * series tally makes the back-and-forth feel like one match.
 */
export function GameOver({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { identity } = useAuth();
  const { room, gameEnd, series, rematchRequestedBy, sendRematch } = useRoom();

  if (!room || !gameEnd) return null;
  const myId = identity?.id ?? "";
  const me = room.players.find((p) => p.id === myId) ?? null;
  const opp = room.players.find((p) => p.id !== myId) ?? null;

  const won = gameEnd.winner_id === myId;
  const draw = gameEnd.winner_id === null;
  const headline = draw ? "Draw." : won ? "You win." : `${opp?.display_name ?? "Opponent"} wins.`;

  const myWins = series[myId] ?? 0;
  const oppWins = opp ? series[opp.id] ?? 0 : 0;
  const seriesGames = myWins + oppWins;

  const iRequested = rematchRequestedBy.includes(myId);
  const oppRequested = !!opp && rematchRequestedBy.includes(opp.id);
  const oppLeft = !!opp && opp.connected === false;
  const noOpponent = !opp;

  const rematchLabel = iRequested
    ? "Waiting for opponent..."
    : oppRequested
    ? "Accept rematch"
    : "Rematch";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <h1 className="font-[var(--font-display)] text-5xl font-bold leading-none" style={{ color: INK }}>
          {headline}
        </h1>

        {/* Series tally: the running set score across rematches in this room. */}
        {seriesGames > 0 && opp && (
          <div className="mt-6 flex items-stretch gap-3">
            <Tally name={me?.display_name ?? "You"} wins={myWins} lead={myWins > oppWins} you />
            <div className="flex items-center font-[var(--font-mono)] text-sm" style={{ color: MUTED }}>vs</div>
            <Tally name={opp.display_name} wins={oppWins} lead={oppWins > myWins} />
          </div>
        )}

        {/* This game's scoreline. */}
        <div className="mt-5 flex flex-col gap-2">
          {room.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-[10px] border px-4 py-2.5" style={{ borderColor: LINE }}>
              <span className="text-sm" style={{ color: p.id === myId ? INK : MUTED }}>
                {p.id === myId ? "You" : p.display_name}
                {p.connected === false && <span className="ml-2 text-xs" style={{ color: MUTED }}>· left</span>}
              </span>
              <span className="font-[var(--font-mono)] text-base font-semibold" style={{ color: INK }}>
                {gameEnd.scores[p.id] ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Opponent opted in first: nudge to accept. */}
        {oppRequested && !iRequested && (
          <p className="mt-4 text-sm" style={{ color: "var(--color-primary)" }}>
            {opp?.display_name} wants a rematch.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={sendRematch}
            disabled={iRequested || noOpponent}
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-base font-semibold transition-[filter] active:brightness-95 disabled:opacity-60"
            style={{
              background: oppRequested && !iRequested ? "var(--color-primary)" : "transparent",
              border: oppRequested && !iRequested ? "none" : `1px solid ${LINE}`,
              color: oppRequested && !iRequested ? "#05060a" : INK,
            }}
          >
            {rematchLabel}
          </button>

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => router.push(`/results/${roomId}`)}
              className="flex h-12 items-center justify-center rounded-[12px] border px-6 text-base"
              style={{ borderColor: LINE, color: INK }}
            >
              Post result
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex h-12 items-center justify-center px-3 text-sm"
              style={{ color: MUTED }}
            >
              new game
            </button>
          </div>
        </div>

        {(oppLeft || noOpponent) && (
          <p className="mt-4 text-[13px] leading-5" style={{ color: MUTED }}>
            Your opponent left. Post the result to Bluesky, or start a new game. If they come back to this room, your
            rematch will still connect.
          </p>
        )}
      </motion.div>
    </main>
  );
}

function Tally({ name, wins, lead, you }: { name: string; wins: number; lead: boolean; you?: boolean }) {
  return (
    <div
      className="flex flex-1 flex-col items-center rounded-[12px] border px-3 py-3"
      style={{ borderColor: lead ? "var(--color-primary)" : LINE, background: "#0f1018" }}
    >
      <span className="max-w-full truncate text-xs" style={{ color: MUTED }}>{you ? "You" : name}</span>
      <span className="mt-1 font-[var(--font-display)] text-3xl font-bold tabular-nums" style={{ color: lead ? "var(--color-primary)" : INK }}>
        {wins}
      </span>
    </div>
  );
}
