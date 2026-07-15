"use client";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { ScoreHeader } from "./ScoreHeader";
import { FeedbackFlash } from "./Feedback";
import { useAuth, useRoom } from "@/lib/store";

// Each game is code-split so entering a room only downloads the one being
// played (the globe stays behind GeoGuess's own dynamic import too). Client-only
// (ssr:false must be an inline literal per next/dynamic's SWC transform).
const ColorClash = dynamic(() => import("./ColorClash").then((m) => m.ColorClash), { ssr: false });
const FlagRush = dynamic(() => import("./FlagRush").then((m) => m.FlagRush), { ssr: false });
const GeoGuess = dynamic(() => import("./GeoGuess").then((m) => m.GeoGuess), { ssr: false });
const OutlineQuiz = dynamic(() => import("./OutlineQuiz").then((m) => m.OutlineQuiz), { ssr: false });
const WordDuel = dynamic(() => import("./WordDuel").then((m) => m.WordDuel), { ssr: false });
const ReactionGrid = dynamic(() => import("./ReactionGrid").then((m) => m.ReactionGrid), { ssr: false });
const MadMath = dynamic(() => import("./MadMath").then((m) => m.MadMath), { ssr: false });
const WordHunt = dynamic(() => import("./WordHunt").then((m) => m.WordHunt), { ssr: false });
const TileTakeover = dynamic(() => import("./TileTakeover").then((m) => m.TileTakeover), { ssr: false });
const Connect4 = dynamic(() => import("./Connect4").then((m) => m.Connect4), { ssr: false });
const DotsAndBoxes = dynamic(() => import("./DotsAndBoxes").then((m) => m.DotsAndBoxes), { ssr: false });

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
    boardState,
    sendAction,
  } = useRoom();
  const meId = useAuth((s) => s.identity?.id);

  if (!room || !game) return null;

  // Turn-based games drive their own full-screen board, not the round-based
  // ScoreHeader flow. Pick the board component by game type.
  if (game.mode === "turn_based") {
    const boardProps = { board: boardState, meId, players: room.players, onAction: sendAction };
    if (game.game_type === "connect4") return <Connect4 {...boardProps} />;
    if (game.game_type === "dots_boxes") return <DotsAndBoxes {...boardProps} />;
    return <TileTakeover {...boardProps} />;
  }

  const phase = game.phase;
  const durationSec = Number((roundData as any)?.round_time ?? 0);
  // Solo = single occupant. Only the round-based solo game (GeoGuess) shows a
  // round counter; the timed/ladder games show score + clock instead.
  const solo = room.players.length === 1;
  const showRounds = !solo || game.game_type === "geoguess";
  const gameProps = {
    roundData: (roundData ?? {}) as any,
    phase,
    locked,
    submitted,
    feedback,
    result: roundResult,
    players: room.players,
    meId,
    solo,
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
        showRounds={showRounds}
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
          {game.game_type === "mad_math" && <MadMath {...gameProps} />}
          {game.game_type === "word_hunt" && <WordHunt {...gameProps} />}
        </>
      )}
    </div>
  );
}
