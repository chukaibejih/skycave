"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { ShareButton } from "@/components/lobby/ShareButton";
import { Button } from "@/components/ui/Button";
import { createRoom, getRoom, getScorecard } from "@/lib/api";
import { BlueskyConnect } from "@/components/ui/BlueskyConnect";
import { downloadScoreCard } from "@/lib/scorecard-image";
import { resolveSoloBest, soloShareText, gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";
import type { Room } from "@/lib/types";

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useAuth((s) => s.identity?.id);
  const isGuest = useAuth((s) => !!s.identity?.is_guest);
  const hydrate = useAuth((s) => s.hydrate);
  // Resolve identity on a direct/refresh load so the guest nudge (and the
  // "you win" perspective) know who is viewing.
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  const [room, setRoom] = useState<Room | null>(null);
  const [shareText, setShareText] = useState("");
  const [soloBest, setSoloBest] = useState<{
    isBest: boolean;
    prevBest: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch from the API so a direct load / refresh works (not just post-game).
  useEffect(() => {
    (async () => {
      try {
        const r = await getRoom(id);
        setRoom(r);
        if (r.mode === "solo") {
          // Reconcile personal best (server summary for users, localStorage for
          // guests) — runs once, and persists a guest's new best.
          setSoloBest(
            resolveSoloBest(r.game_type, r.game?.solo_summary ?? null)
          );
        } else {
          getScorecard(id).then((s) => setShareText(s.text)).catch(() => {});
        }
      } catch {
        setRoom(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <Centered>
        <p className="text-[var(--color-text-secondary)]">tallying...</p>
      </Centered>
    );
  }

  if (!room || !room.game) {
    return (
      <Centered>
        <p className="text-[var(--color-text-secondary)]">No results found.</p>
        <Button onClick={() => router.push("/")}>Back to hub</Button>
      </Centered>
    );
  }

  // ── Solo results ──
  if (room.mode === "solo") {
    const summary = room.game.solo_summary ?? null;
    const score = summary?.score ?? Object.values(room.game.scores)[0] ?? 0;
    const metric = summary?.metric ?? `${score.toLocaleString()} pts`;
    const isBest = soloBest?.isBest ?? false;
    const prevBest = soloBest?.prevBest ?? null;
    const gameName = room.game_name ?? room.game_type;
    const slug = gameSlug(room.game_type);

    const text = soloShareText({ gameName, gameType: room.game_type, metric, isBest });

    return (
      <main className="mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
            {gameName} · solo
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-5xl font-bold leading-none text-[#F0F0FF] sm:text-6xl">
            {isBest ? "Personal best." : "Nice run."}
          </h1>
          <p className="mt-4 max-w-md font-[var(--font-body)] text-sm leading-6 text-[#8888AA]">
            {isBest
              ? "Your best yet. Post it, and whoever beats it has to tap your link to do it."
              : prevBest !== null
                ? `Your best is ${prevBest.toLocaleString()}. Run it back, or post this and bait a challenger.`
                : "Post it and bait a challenger. The link drops them straight into the game."}
          </p>

          <div className="mt-8 flex flex-col gap-2.5">
            <ShareButton text={text} label="Post to Bluesky" full />
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                onClick={() => router.push(`/play/${slug}`)}
                style={{ borderColor: "#2A2A3A", color: "#F0F0FF" }}
                className="flex h-12 items-center justify-center rounded-[12px] border px-6 font-[var(--font-body)] text-base"
              >
                Play again
              </button>
              <button
                onClick={() => router.push("/")}
                style={{ color: "#8888AA" }}
                className="flex h-12 items-center justify-center px-3 font-[var(--font-body)] text-sm"
              >
                new game
              </button>
            </div>
          </div>
          <GuestNudge show={isGuest} />
        </section>

        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="mx-auto w-full max-w-md"
        >
          <div
            className="rounded-[16px] border bg-[#13131A] px-6 py-10 text-center"
            style={{ borderColor: "#2A2A3A" }}
          >
            <div className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[#8888AA]">
              {gameName}
            </div>
            <div className="mt-6 font-[var(--font-display)] text-[64px] font-bold leading-none text-[#6C63FF]">
              {score.toLocaleString()}
            </div>
            <div className="mt-3 font-[var(--font-body)] text-sm text-[#F0F0FF]">
              {metric}
            </div>
            {isBest && (
              <div className="mt-2 font-[var(--font-body)] text-[13px] text-[#4FFFB0]">
                personal best
              </div>
            )}
            <div className="mt-8 flex items-center justify-between font-[var(--font-mono)] text-[11px] text-[#8888AA]">
              <span>Skycave</span>
              <span>skycave.space</span>
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  const scores = room.game.scores;
  const winnerId = decideWinner(scores);
  const winner = room.players.find((p) => p.id === winnerId);
  const iAmPlayer = !!meId && room.players.some((p) => p.id === meId);

  // Headline reads from the viewer's perspective when they played, else names
  // the winner. The trailing period is intentional — it gives it finality.
  let headline: string;
  let subtext: string;
  if (!winnerId) {
    headline = "Dead heat.";
    subtext = "The scores are level. Run it back, or save the image for sharing.";
  } else if (iAmPlayer) {
    const won = winnerId === meId;
    headline = won ? "You win." : "You lost.";
    subtext = won
      ? "Nice one. Run it back, or save the image for sharing."
      : "So close. Run it back, or save the image for sharing.";
  } else {
    headline = `${winner?.display_name} wins.`;
    subtext = "Run it back, or save the image for sharing.";
  }

  const rematch = async () => {
    // Versus: rejoin the SAME room so both players continue together (its finished
    // screen offers the seamless rematch). Solo: spin up a fresh room to replay.
    if (room.mode !== "solo") {
      router.push(`/room/${id}`);
      return;
    }
    const fresh = await createRoom(room.game_type);
    router.push(`/room/${fresh.id}`);
  };

  return (
    <main className="mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[0.9fr_1.1fr]">
      <section>
        <h1 className="font-[var(--font-display)] text-5xl font-bold leading-none text-[#F0F0FF] sm:text-6xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-md font-[var(--font-body)] text-sm leading-6 text-[#8888AA]">
          {subtext}
        </p>

        {/* Buttons: one primary (Post), the rest ghost. 10px gaps. */}
        <div className="mt-8 flex flex-col gap-2.5">
          {shareText && <ShareButton text={shareText} label="Post to Bluesky" full />}

          <button
            onClick={() =>
              downloadScoreCard({
                gameName: room.game_name ?? room.game_type,
                players: room.players,
                scores,
                history: room.game!.history,
                winnerId,
              })
            }
            style={{ borderColor: "#2A2A3A", color: "#8888AA" }}
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] border bg-transparent font-[var(--font-body)] text-base transition-colors"
          >
            Download score card
          </button>

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={rematch}
              style={{ borderColor: "#2A2A3A", color: "#F0F0FF" }}
              className="flex h-12 items-center justify-center rounded-[12px] border px-6 font-[var(--font-body)] text-base transition-colors"
            >
              Rematch
            </button>
            <button
              onClick={() => router.push("/")}
              style={{ color: "#8888AA" }}
              className="flex h-12 items-center justify-center px-3 font-[var(--font-body)] text-sm transition-colors"
            >
              new game
            </button>
          </div>
        </div>
        <GuestNudge show={isGuest} />
      </section>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="mx-auto w-full max-w-md"
      >
        <ScoreCard
          gameName={room.game_name ?? room.game_type}
          players={room.players}
          scores={scores}
          history={room.game.history}
          winnerId={winnerId}
        />
      </motion.div>
    </main>
  );
}

function decideWinner(scores: Record<string, number>): string | null {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2) return ranked[0]?.[0] ?? null;
  if (ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

// Quiet, contextual nudge for guests — shown after a game, never as a modal.
// Clicking reveals a handle field (required so we resolve the right PDS) rather
// than jumping straight to bsky.social's login.
function GuestNudge({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  if (open) {
    return (
      <div className="mt-6 w-full max-w-md">
        <p className="mb-2 text-left font-[var(--font-body)] text-xs leading-5" style={{ color: "#8888AA" }}>
          Log in with Bluesky to appear on the leaderboard and track your stats.
        </p>
        <BlueskyConnect autoFocus />
      </div>
    );
  }
  return (
    <p className="mt-6 max-w-md font-[var(--font-body)] text-xs leading-5" style={{ color: "#8888AA" }}>
      Playing as a guest.{" "}
      <button
        onClick={() => setOpen(true)}
        style={{ color: "#6C63FF" }}
        className="font-semibold underline underline-offset-2"
      >
        Connect Bluesky
      </button>{" "}
      to appear on the leaderboard and track your stats.
    </p>
  );
}
