"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BackButton } from "@/components/nav/BackButton";
import { AuthModal } from "@/components/ui/AuthModal";
import { ShareButton } from "@/components/lobby/ShareButton";
import { composeIntentUrl } from "@/lib/bluesky";
import { downloadSeriesCard, type SeriesLeg } from "@/lib/scorecard-image";
import { seriesUrl, seriesUrlDisplay } from "@/lib/site";
import {
  ApiError,
  getSeries,
  joinSeries,
  nextSeriesGame,
  type Series,
  type SeriesPlayer,
} from "@/lib/api";
import { useAuth } from "@/lib/store";

/**
 * A head-to-head series: two players, a best-of run across random games.
 *
 * This is the one page a player in a series needs open. It carries every state
 * the series moves through - waiting for an opponent, both in and playing, and
 * decided - and always shows the single right next move, read off the server so
 * both players never see contradictory buttons. It polls while the series is
 * unsettled, so the creator watches the opponent arrive and the score climb
 * without touching anything.
 */
const POLL_MS = 3_000;
const INK = "var(--color-text-primary)";
const MUTED = "var(--color-text-secondary)";

export default function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const [s, setS] = useState<Series | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    try {
      const next = await getSeries(id);
      setS(next);
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState("missing");
      else setState((cur) => (cur === "loading" ? "missing" : cur));
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    load();
  }, [load, loaded]);

  // Keep watching until it is decided: an opponent joining and the score moving
  // both happen on someone else's device.
  useEffect(() => {
    if (!s || s.status === "finished") return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [s, load]);

  const join = async () => {
    if (!identity) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setS(await joinSeries(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not join. Try again.");
      void load();
    } finally {
      setBusy(false);
    }
  };

  const enterLeg = async () => {
    setBusy(true);
    setError(null);
    try {
      const { room_id } = await nextSeriesGame(id);
      router.push(`/room/${room_id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the game. Try again.");
      setBusy(false);
      void load();
    }
  };

  if (!loaded || state === "loading") {
    return <Shell><Muted>Loading the series...</Muted></Shell>;
  }
  if (state === "missing" || !s) {
    return (
      <Shell>
        <Empty
          title="This series is gone."
          body="The link may be wrong, or it was never created. Start a fresh one from the hub."
        />
      </Shell>
    );
  }

  const best = s.wins_needed * 2 - 1;
  const iAmPlayer = s.you !== null;
  const openSeat = s.status === "open" && !s.player2;
  const decided = s.status === "finished";
  const iWon = decided && s.winner_did === identity?.id;

  return (
    <Shell>
      {/* ── What this is ─────────────────────────────────────────────── */}
      <div className="text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-cyan) 45%, transparent)",
            color: "var(--color-cyan)",
          }}
        >
          Series · best of {best}
        </span>
        <h1 className="mt-3 font-[var(--font-display)] text-2xl font-bold sm:text-3xl">
          {decided
            ? s.winner_did
              ? `${nameOfWinner(s)} takes it.`
              : "It ends level."
            : s.player2
              ? `${s.player1?.name} vs ${s.player2.name}`
              : "Waiting for a challenger"}
        </h1>
      </div>

      {/* ── The face-off ─────────────────────────────────────────────── */}
      <section className="mt-7">
        <div
          className="rounded-[20px] border p-5"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <Side p={s.player1} you={s.you === "player1"} lead={(s.player1?.wins ?? 0) > (s.player2?.wins ?? 0)} />
            <div className="shrink-0 text-center">
              <div className="font-[var(--font-display)] text-3xl font-bold tabular-nums">
                {s.player1?.wins ?? 0}
                <span className="px-1 text-[var(--color-text-secondary)]">-</span>
                {s.player2?.wins ?? 0}
              </div>
              <div className="mt-0.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                first to {s.wins_needed}
              </div>
            </div>
            <Side p={s.player2} you={s.you === "player2"} lead={(s.player2?.wins ?? 0) > (s.player1?.wins ?? 0)} right />
          </div>
        </div>
      </section>

      {/* ── The one next move ────────────────────────────────────────── */}
      <section className="mt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${s.status}-${s.current_room_id ?? ""}-${iAmPlayer}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {decided ? (
              <Decided s={s} viewerDid={identity?.id ?? null} won={iWon} spectator={!iAmPlayer} />
            ) : openSeat && !iAmPlayer ? (
              <Big onClick={join} disabled={busy} tone="primary">
                {busy ? "Joining..." : "Accept the challenge"}
              </Big>
            ) : openSeat && iAmPlayer ? (
              <ShareToInvite s={s} />
            ) : iAmPlayer ? (
              <Big onClick={enterLeg} disabled={busy} tone="cyan">
                {busy
                  ? "Opening the game..."
                  : s.current_room_id
                    ? "Go to your game"
                    : `Play game ${s.current_leg + 1}: ${s.current_game_name ?? ""}`}
              </Big>
            ) : (
              <Waiting>This series is between {s.player1?.name} and {s.player2?.name}</Waiting>
            )}
          </motion.div>
        </AnimatePresence>
        {error && (
          <p className="mt-2.5 text-center text-sm" style={{ color: "var(--color-warm)" }}>
            {error}
          </p>
        )}
      </section>

      {/* ── The games ────────────────────────────────────────────────── */}
      <section className="mt-9">
        <h2 className="font-[var(--font-display)] text-lg font-bold">The lineup</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {best} games, drawn at random when the series opened. Same for both of you.
        </p>
        <div className="mt-4 space-y-2.5">
          {s.games.map((slug, i) => (
            <GameRow
              key={`${slug}-${i}`}
              index={i}
              name={s.game_names[i] ?? slug}
              result={s.results[i] ?? null}
              current={!decided && s.status === "live" && s.current_leg === i}
              you={s.you}
              p1={s.player1}
              p2={s.player2}
              hostDid={s.hosts?.[i] ?? null}
            />
          ))}
        </div>
      </section>

      <div className="mt-10 text-center">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[14px] border px-5 text-sm font-semibold"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          Back to the hub
        </Link>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Join this series"
        invite={{ hostHandle: s.player1?.name, gameName: `best of ${best}` }}
        onAuthed={() => {
          setAuthOpen(false);
          void join();
        }}
      />
    </Shell>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

function nameOfWinner(s: Series): string {
  if (s.winner_did === s.player1?.did) return s.player1?.name ?? "Player 1";
  if (s.winner_did === s.player2?.did) return s.player2?.name ?? "Player 2";
  return "Nobody";
}

/**
 * The creator's view while the second seat is open: the whole job here is to get
 * the link to the opponent, so that is all this shows - a one-tap Bluesky post
 * and a copy fallback for a DM.
 */
function ShareToInvite({ s }: { s: Series }) {
  const [copied, setCopied] = useState(false);
  const url = seriesUrl(s.id);
  const best = s.wins_needed * 2 - 1;
  const text = `I've started a best-of-${best} series on Skycave. First to ${s.wins_needed} across random games. Come settle it 👉 ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the link is visible below to copy by hand */
    }
  };

  return (
    <div className="space-y-3">
      {/* Action first: the creator's whole job here is to get the link out. */}
      <a href={composeIntentUrl(text)} target="_blank" rel="noopener noreferrer" className="block">
        <Big tone="primary">Invite on Bluesky</Big>
      </a>
      <button
        onClick={copy}
        className="flex h-12 w-full items-center justify-center gap-2 truncate rounded-[14px] border px-4 text-sm font-semibold transition-[filter] active:brightness-95"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: INK }}
      >
        {copied ? "Link copied" : `Copy link · ${seriesUrlDisplay(s.id)}`}
      </button>
      {/* Status second, quieter: says why they are sharing, without competing. */}
      <div className="flex items-center justify-center gap-2 pt-1 text-xs text-[var(--color-text-secondary)]">
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-cyan)" }}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        Waiting for your opponent to join
      </div>
    </div>
  );
}

function Decided({
  s,
  viewerDid,
  won,
  spectator,
}: {
  s: Series;
  viewerDid: string | null;
  won: boolean;
  spectator: boolean;
}) {
  const winnerName = nameOfWinner(s);
  const level = !s.winner_did;
  const tone = level
    ? "var(--color-text-secondary)"
    : won
      ? "var(--color-success)"
      : spectator
        ? "var(--color-cyan)"
        : "var(--color-warm)";
  const label = level
    ? "The series ends level."
    : spectator
      ? `${winnerName} won the series.`
      : won
        ? "You won the series."
        : "You lost the series.";

  const p1w = s.player1?.wins ?? 0;
  const p2w = s.player2?.wins ?? 0;
  const best = s.wins_needed * 2 - 1;
  const url = seriesUrl(s.id);

  // Share text from the viewer's point of view, so it reads as their own post.
  const mineFirst = viewerDid === s.player1?.did;
  const myW = mineFirst ? p1w : p2w;
  const theirW = mineFirst ? p2w : p1w;
  const oppName = mineFirst ? s.player2?.name : s.player1?.name;
  const shareText = level
    ? `Our best-of-${best} series ended level on Skycave. ${url}`
    : spectator
      ? `${winnerName} took the best-of-${best} series ${Math.max(p1w, p2w)}-${Math.min(p1w, p2w)} on Skycave. ${url}`
      : won
        ? `Won my best-of-${best} series ${myW}-${theirW} on Skycave 🏆 ${url}`
        : `Lost a close one, ${oppName} took the best-of-${best} ${theirW}-${myW}. Run it back? ${url}`;

  const legs: SeriesLeg[] = (s.results || []).map((r, i) => ({
    name: s.game_names[i] ?? r.game_type,
    winner:
      r.winner_did === s.player1?.did ? "p1" : r.winner_did === s.player2?.did ? "p2" : "draw",
  }));

  const download = () =>
    downloadSeriesCard({
      p1Name: s.player1?.name ?? "Player 1",
      p2Name: s.player2?.name ?? "Player 2",
      p1Wins: p1w,
      p2Wins: p2w,
      winnerName: level ? null : winnerName,
      best,
      legs,
    });

  return (
    <div className="space-y-3">
      <div
        className="flex min-h-[56px] w-full items-center justify-center rounded-[16px] border px-4 text-center text-base font-bold"
        style={{
          borderColor: `color-mix(in srgb, ${tone} 55%, transparent)`,
          background: `color-mix(in srgb, ${tone} 12%, var(--color-surface))`,
          color: tone,
        }}
      >
        {label}
      </div>

      <ShareButton text={shareText} label="Post the result" full />

      <button
        onClick={download}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border text-sm font-semibold transition-[filter] active:brightness-95"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: INK }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" x2="12" y1="15" y2="3" />
        </svg>
        Download result card
      </button>

      <Link href="/?new=series" className="block pt-1">
        <Big tone="cyan">Start another series</Big>
      </Link>
    </div>
  );
}

function Big({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone: "primary" | "cyan";
}) {
  const style =
    tone === "cyan"
      ? { background: "var(--color-cyan)", color: "#05060a" }
      : {
          background: "linear-gradient(140deg, var(--color-primary), var(--color-cyan))",
          color: "#05060a",
        };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-[56px] w-full items-center justify-center rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:opacity-70"
      style={style}
    >
      {children}
    </button>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-[16px] border px-4 text-center text-sm font-semibold text-[var(--color-text-secondary)]"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <motion.span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--color-cyan)" }}
        animate={{ opacity: [1, 0.25, 1], scale: [1, 0.8, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {children}
    </div>
  );
}

function Side({
  p,
  you,
  lead,
  right = false,
}: {
  p: SeriesPlayer | null;
  you: boolean;
  lead: boolean;
  right?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${right ? "items-end text-right" : "items-start"}`}>
      {p ? (
        <>
          <div className="relative">
            <Avatar id={p.did} name={p.name} avatarUrl={p.avatar_url} size={44} />
            {lead && (
              <span
                className="absolute -right-1 -top-1 h-3 w-3 rounded-full ring-2"
                style={{ background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
              />
            )}
          </div>
          <div className="mt-2 w-full truncate text-sm font-semibold">
            {you ? "You" : p.name}
          </div>
        </>
      ) : (
        <>
          <div
            className="grid h-11 w-11 place-items-center rounded-full border border-dashed text-[var(--color-text-secondary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            ?
          </div>
          <div className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">
            Open seat
          </div>
        </>
      )}
    </div>
  );
}

/** One game of the lineup, with its result once it has one. */
function GameRow({
  index,
  name,
  result,
  current,
  you,
  p1,
  p2,
  hostDid,
}: {
  index: number;
  name: string;
  result: { game_type: string; winner_did: string | null; room_id: string } | null;
  current: boolean;
  you: "player1" | "player2" | null;
  p1: SeriesPlayer | null;
  p2: SeriesPlayer | null;
  hostDid: string | null;
}) {
  const myDid = you === "player1" ? p1?.did : you === "player2" ? p2?.did : null;
  const decided = !!result;
  const draw = decided && !result!.winner_did;
  const youWon = decided && !!myDid && result!.winner_did === myDid;
  const winnerName =
    decided && result!.winner_did
      ? result!.winner_did === p1?.did
        ? p1?.name
        : p2?.name
      : null;

  // Who opens the room for this leg (hosting alternates each game). Only worth
  // saying for legs still to play; a finished leg's host no longer matters.
  const hostName =
    hostDid === p1?.did ? p1?.name : hostDid === p2?.did ? p2?.name : null;
  const hostLabel = hostDid
    ? myDid && hostDid === myDid
      ? "you host"
      : hostName
        ? `${hostName} hosts`
        : ""
    : "";

  const tone = decided
    ? draw
      ? "var(--color-text-secondary)"
      : youWon || (!you && result!.winner_did === p1?.did)
        ? "var(--color-success)"
        : "var(--color-warm)"
    : current
      ? "var(--color-cyan)"
      : "var(--color-border)";

  let label: string;
  if (decided) {
    if (draw) label = "drawn · no win";
    else if (you) label = youWon ? "you won" : "you lost";
    else label = `${winnerName} won`;
  } else if (current) {
    label = hostLabel ? `up next · ${hostLabel}` : "up next";
  } else {
    label = hostLabel || "not played yet";
  }

  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${tone} ${decided || current ? "60%" : "100%"}, transparent)`,
        background: current
          ? "color-mix(in srgb, var(--color-cyan) 8%, var(--color-surface))"
          : "var(--color-surface)",
        opacity: !decided && !current ? 0.62 : 1,
      }}
    >
      <span className="font-[var(--font-mono)] text-[11px] text-[var(--color-text-secondary)]">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div
          className="truncate font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em]"
          style={{ color: decided && !draw ? tone : "var(--color-text-secondary)" }}
        >
          {label}
        </div>
      </div>
      {current && (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--color-cyan)", boxShadow: "0 0 8px var(--color-cyan)" }} />
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-lg px-5 pb-16 pt-8">
      <div className="mb-6">
        <BackButton href="/" label="hub" />
      </div>
      {children}
    </main>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-[var(--color-text-secondary)]">{children}</p>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h1 className="font-[var(--font-display)] text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-[var(--color-text-secondary)]">{body}</p>
    </div>
  );
}
