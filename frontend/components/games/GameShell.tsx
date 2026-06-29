"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ScoreHeader } from "./ScoreHeader";
import { FeedbackFlash } from "./Feedback";
import { ColorClash } from "./ColorClash";
import { FlagRush } from "./FlagRush";
import { GeoGuess } from "./GeoGuess";
import { OutlineQuiz } from "./OutlineQuiz";
import { WordDuel } from "./WordDuel";
import { ReactionGrid } from "./ReactionGrid";
import { useAuth, useRoom } from "@/lib/store";

export function GameShell() {
  const {
    room,
    game,
    roundData,
    roundResult,
    feedback,
    locked,
    submitted,
    roundEndsAt,
    sendAction,
  } = useRoom();
  const meId = useAuth((s) => s.identity?.id);

  if (!room || !game) return null;

  const phase = game.phase;
  const durationSec = Number((roundData as any)?.round_time ?? 0);
  const gameProps = {
    roundData: (roundData ?? {}) as any,
    phase,
    locked,
    submitted,
    feedback,
    result: roundResult,
    players: room.players,
    meId,
    onAction: sendAction,
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,var(--color-primary-glow),transparent_68%)]" />
      <FeedbackFlash feedback={feedback} />

      <ScoreHeader
        players={room.players}
        scores={game.scores}
        meId={meId}
        round={game.round || 1}
        totalRounds={game.total_rounds}
        endsAt={roundEndsAt}
        durationSec={durationSec}
        active={phase === "active"}
      />

      {/* "Get ready" beat between GAME_START and round 1. */}
      <AnimatePresence>
        {phase === "starting" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 items-center justify-center font-[var(--font-display)] text-3xl font-semibold text-[var(--color-text-secondary)]"
          >
            get ready...
          </motion.div>
        )}
      </AnimatePresence>

      {phase !== "starting" && roundData && (
        <>
          {game.game_type === "color_clash" && <ColorClash {...gameProps} />}
          {game.game_type === "flag_rush" && <FlagRush {...gameProps} />}
          {game.game_type === "geoguess" && <GeoGuess {...gameProps} />}
          {game.game_type === "outline_quiz" && <OutlineQuiz {...gameProps} />}
          {game.game_type === "word_duel" && <WordDuel {...gameProps} />}
          {game.game_type === "reaction_grid" && <ReactionGrid {...gameProps} />}
        </>
      )}
    </div>
  );
}
