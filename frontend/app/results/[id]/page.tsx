"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ScoreCard } from "@/components/ui/ScoreCard";
import { ShareButton } from "@/components/lobby/ShareButton";
import { Button } from "@/components/ui/Button";
import { createRoom, getRoom, getScorecard } from "@/lib/api";
import { downloadScoreCard } from "@/lib/scorecard-image";
import { useAuth } from "@/lib/store";
import type { Room } from "@/lib/types";

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useAuth((s) => s.identity?.id);
  const [room, setRoom] = useState<Room | null>(null);
  const [shareText, setShareText] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch from the API so a direct load / refresh works (not just post-game).
  useEffect(() => {
    (async () => {
      try {
        const r = await getRoom(id);
        setRoom(r);
        getScorecard(id).then((s) => setShareText(s.text)).catch(() => {});
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
        <Button variant="secondary" onClick={() => router.push("/")}>
          Back to hub
        </Button>
      </Centered>
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
