"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  getMyMatch,
  getSeries,
  nextSeriesGame,
  startMatchGame,
  type MyMatch,
  type Series,
} from "@/lib/api";
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

  // A tournament leg ends differently to a friendly. There is nothing to
  // rematch and no reason to go back to the hub: the next thing that happens is
  // the next game of the series, so that is the only thing this screen should
  // offer. Everything else here stays exactly as it was for ordinary rooms.
  if (room.tournament) {
    return (
      <TournamentGameOver
        roomId={roomId}
        tournamentId={room.tournament.id}
        headline={headline}
        players={room.players}
        scores={gameEnd.scores}
        myId={myId}
      />
    );
  }

  // A standalone series leg ends the same way: nothing to rematch, and the next
  // move is the next game of the series.
  if (room.series_match) {
    return (
      <SeriesGameOver
        roomId={roomId}
        seriesId={room.series_match.id}
        headline={headline}
        players={room.players}
        scores={gameEnd.scores}
        myId={myId}
      />
    );
  }

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

/**
 * The end of a tournament leg.
 *
 * The result is recorded server-side just after GAME_END is broadcast, so this
 * screen can arrive a beat before the bracket knows about it. Rather than show
 * a stale series and hope, it waits until the fixture actually lists this room
 * among its played games, then shows the real state. That wait is short, and it
 * is the difference between "1-0" being the truth and being a guess.
 */
function TournamentGameOver({
  roomId,
  tournamentId,
  headline,
  players,
  scores,
  myId,
}: {
  roomId: string;
  tournamentId: string;
  headline: string;
  players: { id: string; display_name: string }[];
  scores: Record<string, number>;
  myId: string;
}) {
  const router = useRouter();
  const [m, setM] = useState<MyMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settled once the fixture has counted this room. Until then the numbers on
  // screen would be from before this game.
  const counted = !!m && m.legs.some((l) => l.room_id === roomId);

  const load = useCallback(async () => {
    try {
      setM(await getMyMatch(tournamentId));
    } catch {
      /* keep polling; a blip must not strand the player here */
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 1500);
    return () => clearInterval(iv);
  }, [load]);

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const fresh = await startMatchGame(tournamentId);
      if (fresh.room_id && fresh.room_id !== roomId) {
        router.push(`/room/${fresh.room_id}`);
        return;
      }
      router.push(`/tournament/${tournamentId}/match`);
    } catch {
      setError("Could not open the next game. Try your fixture page.");
      setBusy(false);
    }
  };

  const decided = !!m && (m.won_match || m.eliminated || m.is_champion);

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <span
          className="inline-flex items-center rounded-full border px-3 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-cyan) 45%, transparent)",
            color: "var(--color-cyan)",
          }}
        >
          {m ? `${m.round_name} · best of 3` : "Tournament"}
        </span>

        <h1
          className="mt-3 font-[var(--font-display)] text-5xl font-bold leading-none"
          style={{ color: INK }}
        >
          {headline}
        </h1>

        {/* This game's scoreline. */}
        <div className="mt-5 flex flex-col gap-2">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-[10px] border px-4 py-2.5"
              style={{ borderColor: LINE }}
            >
              <span className="text-sm" style={{ color: p.id === myId ? INK : MUTED }}>
                {p.id === myId ? "You" : p.display_name}
              </span>
              <span
                className="font-[var(--font-mono)] text-base font-semibold"
                style={{ color: INK }}
              >
                {scores[p.id] ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Where the series now stands, and what it takes to win it. */}
        <div
          className="mt-5 rounded-[12px] border px-4 py-3.5"
          style={{ borderColor: LINE, background: "#0f1018" }}
        >
          {!counted ? (
            <p className="text-sm" style={{ color: MUTED }}>
              Putting this on the bracket...
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm" style={{ color: MUTED }}>
                  Series vs {m!.opponent?.display_name ?? "your opponent"}
                </span>
                <span
                  className="font-[var(--font-display)] text-2xl font-bold tabular-nums"
                  style={{ color: INK }}
                >
                  {m!.your_wins} - {m!.their_wins}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>
                {m!.is_champion
                  ? "You won the whole tournament."
                  : m!.won_match
                    ? "That takes the series. You are through."
                    : m!.eliminated
                      ? "That is the series. You are out."
                      : m!.your_wins === 1 && m!.their_wins === 1
                        ? "One game each. The next one decides it."
                        : m!.your_wins > m!.their_wins
                          ? "One more win and you are through."
                          : "They need one more. You need both."}
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={decided ? () => router.push(`/tournament/${tournamentId}/match`) : next}
            disabled={!counted || busy}
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-60"
            style={{
              background: counted ? "var(--color-primary)" : "transparent",
              border: counted ? "none" : `1px solid ${LINE}`,
              color: counted ? "#05060a" : MUTED,
            }}
          >
            {!counted
              ? "One moment..."
              : busy
                ? "Opening the room..."
                : m!.is_champion
                  ? "See your trophy"
                  : decided
                    ? "Back to your fixture"
                    : `Start game ${m!.game_number}: ${m!.current_game_name ?? ""}`}
          </button>

          {error && (
            <p className="text-center text-sm" style={{ color: "var(--color-warm)" }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => router.push(`/results/${roomId}`)}
              className="flex h-12 items-center justify-center rounded-[12px] border px-6 text-base"
              style={{ borderColor: LINE, color: INK }}
            >
              Post result
            </button>
            <button
              onClick={() => router.push(`/tournament/${tournamentId}`)}
              className="flex h-12 items-center justify-center px-3 text-sm"
              style={{ color: MUTED }}
            >
              bracket
            </button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

/**
 * The end of a standalone series leg. Same shape as the tournament version: it
 * waits until the series has actually counted this room before showing the score,
 * so "2-1" is the truth and not a guess, then offers the one next move.
 */
function SeriesGameOver({
  roomId,
  seriesId,
  headline,
  players,
  scores,
  myId,
}: {
  roomId: string;
  seriesId: string;
  headline: string;
  players: { id: string; display_name: string }[];
  scores: Record<string, number>;
  myId: string;
}) {
  const router = useRouter();
  const [s, setS] = useState<Series | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counted = !!s && s.results.some((r) => r.room_id === roomId);

  const load = useCallback(async () => {
    try {
      setS(await getSeries(seriesId));
    } catch {
      /* keep polling; a blip must not strand the player here */
    }
  }, [seriesId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 1500);
    return () => clearInterval(iv);
  }, [load]);

  const mine = s && (s.player1?.did === myId ? s.player1 : s.player2);
  const theirs = s && (s.player1?.did === myId ? s.player2 : s.player1);
  const myWins = mine?.wins ?? 0;
  const theirWins = theirs?.wins ?? 0;
  const over = s?.status === "finished";
  const iWon = over && s?.winner_did === myId;

  const next = async () => {
    setBusy(true);
    setError(null);
    try {
      const { room_id } = await nextSeriesGame(seriesId);
      if (room_id && room_id !== roomId) {
        router.push(`/room/${room_id}`);
        return;
      }
      router.push(`/series/${seriesId}`);
    } catch {
      setError("Could not open the next game. Try your series page.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <span
          className="inline-flex items-center rounded-full border px-3 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-cyan) 45%, transparent)",
            color: "var(--color-cyan)",
          }}
        >
          {s ? `Series · best of ${s.wins_needed * 2 - 1}` : "Series"}
        </span>

        <h1
          className="mt-3 font-[var(--font-display)] text-5xl font-bold leading-none"
          style={{ color: INK }}
        >
          {headline}
        </h1>

        {/* This game's scoreline. */}
        <div className="mt-5 flex flex-col gap-2">
          {players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-[10px] border px-4 py-2.5"
              style={{ borderColor: LINE }}
            >
              <span className="text-sm" style={{ color: p.id === myId ? INK : MUTED }}>
                {p.id === myId ? "You" : p.display_name}
              </span>
              <span
                className="font-[var(--font-mono)] text-base font-semibold"
                style={{ color: INK }}
              >
                {scores[p.id] ?? 0}
              </span>
            </div>
          ))}
        </div>

        {/* Where the series now stands. */}
        <div
          className="mt-5 rounded-[12px] border px-4 py-3.5"
          style={{ borderColor: LINE, background: "#0f1018" }}
        >
          {!counted ? (
            <p className="text-sm" style={{ color: MUTED }}>
              Putting this on the series...
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-sm" style={{ color: MUTED }}>
                  Series vs {theirs?.name ?? "your opponent"}
                </span>
                <span
                  className="font-[var(--font-display)] text-2xl font-bold tabular-nums"
                  style={{ color: INK }}
                >
                  {myWins} - {theirWins}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>
                {over
                  ? iWon
                    ? "That takes the series. Nicely done."
                    : s?.winner_did
                      ? "That is the series. Good run."
                      : "All games played. It ends level."
                  : myWins === theirWins
                    ? "All square. The next game breaks the tie."
                    : myWins > theirWins
                      ? `You lead. ${s!.wins_needed - myWins} more to take it.`
                      : `You trail. ${s!.wins_needed - theirWins} more and they take it.`}
              </p>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={over ? () => router.push(`/series/${seriesId}`) : next}
            disabled={!counted || busy}
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-60"
            style={{
              background: counted ? "var(--color-primary)" : "transparent",
              border: counted ? "none" : `1px solid ${LINE}`,
              color: counted ? "#05060a" : MUTED,
            }}
          >
            {!counted
              ? "One moment..."
              : busy
                ? "Opening the room..."
                : over
                  ? "See the result"
                  : `Start game ${(s?.current_leg ?? 0) + 1}: ${s?.current_game_name ?? ""}`}
          </button>

          {error && (
            <p className="text-center text-sm" style={{ color: "var(--color-warm)" }}>
              {error}
            </p>
          )}

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => router.push(`/results/${roomId}`)}
              className="flex h-12 items-center justify-center rounded-[12px] border px-6 text-base"
              style={{ borderColor: LINE, color: INK }}
            >
              Post result
            </button>
            <button
              onClick={() => router.push(`/series/${seriesId}`)}
              className="flex h-12 items-center justify-center px-3 text-sm"
              style={{ color: MUTED }}
            >
              series
            </button>
          </div>
        </div>
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
