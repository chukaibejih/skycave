"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { Countdown } from "@/components/tournament/Countdown";
import { ChampionMoment } from "@/components/tournament/ChampionMoment";
import { BackButton } from "@/components/nav/BackButton";
import { composeIntentUrl } from "@/lib/bluesky";
import { TOURNEY } from "@/lib/tournamentStatus";
import {
  ApiError,
  checkInToMatch,
  getMyMatch,
  startMatchGame,
  type MatchLeg,
  type MyMatch,
} from "@/lib/api";
import { useAuth } from "@/lib/store";

/**
 * Your fixture, for the whole weekend.
 *
 * This is the one page a player in the tournament needs open. Everything that
 * would otherwise send them back to the hub happens here: checking in, the room
 * opening, the score across the series, and starting the next game.
 *
 * It polls fast, because half of what it shows is about someone else: whether
 * the opponent has checked in, and whether they have opened the room. A player
 * staring at "waiting for your opponent" should see it change without touching
 * anything.
 */
const POLL_MS = 5_000;

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { identity, loaded, hydrate } = useAuth();
  const [m, setM] = useState<MyMatch | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    try {
      const next = await getMyMatch(id);
      setM(next);
      setState(next ? "ready" : "none");
    } catch {
      setState((s) => (s === "loading" ? "none" : s));
    }
  }, [id]);

  useEffect(() => {
    if (!loaded) return;
    if (!identity || identity.is_guest) {
      setState("none");
      return;
    }
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, loaded, identity]);

  const act = async (fn: () => Promise<MyMatch>) => {
    setBusy(true);
    setError(null);
    try {
      setM(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not go through. Try again.");
      void load();
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await startMatchGame(id);
      setM(next);
      if (next.room_id) router.push(`/room/${next.room_id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the room. Try again.");
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading" || !loaded) {
    return <Shell id={id}><Muted>Finding your fixture...</Muted></Shell>;
  }

  if (!identity || identity.is_guest) {
    return (
      <Shell id={id}>
        <Empty
          title="Sign in to see your fixture."
          body="The tournament runs on Bluesky accounts, so we know which fixture is yours."
        />
      </Shell>
    );
  }

  if (state === "none" || !m) {
    return (
      <Shell id={id}>
        <Empty
          title="You are not in this one."
          body="You can still follow every result on the bracket."
        />
      </Shell>
    );
  }

  // Winning the whole thing takes the page over. Everything else here is about
  // what to do next, and for a champion there is nothing next.
  if (m.is_champion) {
    return (
      <Shell id={id}>
        <ChampionMoment m={m} />
        <div className="mt-8 text-center">
          <Link
            href={`/tournament/${id}`}
            className="inline-flex h-11 items-center rounded-[14px] border px-5 text-sm font-semibold"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
          >
            See the full bracket
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell id={id}>
      {/* ── Which fixture this is ──────────────────────────────────────── */}
      <div className="text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-warm) 50%, transparent)",
            color: "var(--color-warm)",
          }}
        >
          {m.round_name}
        </span>
        <h1 className="mt-3 font-[var(--font-display)] text-2xl font-bold sm:text-3xl">
          {m.is_bye
            ? "You are straight through."
            : m.opponent
              ? `You vs ${m.opponent.display_name}`
              : "Your next opponent is being decided"}
        </h1>
      </div>

      {/* ── The face-off ───────────────────────────────────────────────── */}
      <section className="mt-7">
        <div
          className="rounded-[20px] border p-5"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <Side p={m.you} label="You" checkedIn={m.you_checked_in} />
            <div className="shrink-0 text-center">
              <div className="font-[var(--font-display)] text-3xl font-bold tabular-nums">
                {m.your_wins} <span className="text-[var(--color-text-secondary)]">-</span>{" "}
                {m.their_wins}
              </div>
              <div className="mt-0.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                best of 3
              </div>
            </div>
            <Side
              p={m.opponent}
              label={m.is_bye ? "Bye" : "Them"}
              checkedIn={m.opponent_checked_in}
              right
            />
          </div>

          {/* First to two takes it, so say how close that is. */}
          {!m.is_bye && m.opponent && !m.won_match && !m.eliminated && (
            <p className="mt-4 border-t pt-3.5 text-center text-sm text-[var(--color-text-secondary)]"
               style={{ borderColor: "var(--color-border)" }}>
              {m.your_wins === 1 && m.their_wins === 1
                ? "One game each. The next one takes it."
                : m.your_wins === 1
                  ? "One more win and you are through."
                  : m.their_wins === 1
                    ? "They need one more. You need both."
                    : "First to two wins goes through."}
            </p>
          )}
        </div>
      </section>

      {/* ── What to do next ────────────────────────────────────────────── */}
      <section className="mt-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${m.status}-${m.you_checked_in}-${m.opponent_checked_in}-${m.room_id ?? ""}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Action m={m} busy={busy} onCheckIn={() => act(() => checkInToMatch(id))} onStart={start} />
          </motion.div>
        </AnimatePresence>

        <p className="mt-2.5 text-center text-xs text-[var(--color-text-secondary)]">{m.prompt}</p>
        {error && (
          <p className="mt-2 text-center text-sm" style={{ color: "var(--color-warm)" }}>
            {error}
          </p>
        )}

        {m.deadline && !m.won_match && !m.eliminated && !m.is_bye && (
          <p className="mt-4 text-center text-xs text-[var(--color-text-secondary)]">
            This round closes in <Countdown to={m.deadline} compact />. Miss it and the fixture
            goes to whoever showed up.
          </p>
        )}
      </section>

      {/* ── The three games ────────────────────────────────────────────── */}
      {!m.is_bye && (
        <section className="mt-9">
          <h2 className="font-[var(--font-display)] text-lg font-bold">Your series</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Three games, drawn when the bracket went up. Same three for both of you.
          </p>
          <div className="mt-4 space-y-2.5">
            {m.games.map((slug, i) => (
              <GameRow
                key={`${slug}-${i}`}
                name={m.game_names[i] ?? slug}
                index={i}
                legs={m.legs.filter((lg) => lg.game_type === slug)}
                current={!m.won_match && !m.eliminated && m.current_game === slug}
                hostSwap={m.you_host}
              />
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link
          href={`/tournament/${id}`}
          className="inline-flex h-11 items-center rounded-[14px] border px-5 text-sm font-semibold"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          See the full bracket
        </Link>
      </div>
    </Shell>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

/**
 * The single most important thing on the page: one button that is always the
 * right next move. Which one it is comes off the server state, never off a
 * local guess, so both players cannot end up looking at contradictory buttons.
 */
function Action({
  m,
  busy,
  onCheckIn,
  onStart,
}: {
  m: MyMatch;
  busy: boolean;
  onCheckIn: () => void;
  onStart: () => void;
}) {
  if (m.is_champion) {
    return <Done tone="gold">You won the whole thing.</Done>;
  }
  if (m.is_bye) {
    return <Done tone="cyan">Nothing to play. You are in the next round.</Done>;
  }
  if (m.won_match) {
    return <Done tone="cyan">You are through. Next opponent still to be decided.</Done>;
  }
  if (m.eliminated) {
    return <Done tone="muted">You are out. Good run.</Done>;
  }
  if (!m.opponent) {
    return <Waiting>Waiting on the match that feeds yours</Waiting>;
  }
  // The bracket is drawn, but this fixture cannot be played until its own round
  // window opens - not merely when the event does. A round that finished early
  // waits here for the next window rather than going live in the small hours.
  const opensAt = m.opens_at ?? m.play_opens_at;
  if (Date.now() < new Date(opensAt).getTime()) {
    return <PlayOpensSoon iso={opensAt} />;
  }
  if (!m.you_checked_in) {
    return (
      <Big onClick={onCheckIn} disabled={busy} tone="primary">
        {busy ? "Checking you in..." : "Check in, I am ready"}
      </Big>
    );
  }
  if (!m.opponent_checked_in) {
    return (
      <div className="space-y-3">
        <Waiting>Waiting for {m.opponent.display_name} to check in</Waiting>
        <NudgeOpponent m={m} />
      </div>
    );
  }
  if (m.room_id) {
    return (
      <Link href={`/room/${m.room_id}`} className="block">
        <Big tone="cyan">Go to your room</Big>
      </Link>
    );
  }
  return (
    <Big onClick={onStart} disabled={busy} tone="primary">
      {busy
        ? "Opening the room..."
        : `Start game ${m.game_number}: ${m.current_game_name ?? ""}`}
    </Big>
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
  // Primary actions wear the tournament world's warm gradient; "go to your room"
  // keeps cyan, the colour the neon thread uses for a live edge of the bracket.
  const style =
    tone === "cyan"
      ? { background: "var(--color-cyan)", color: "#05060a" }
      : { background: TOURNEY.gradient, color: TOURNEY.ink, boxShadow: "0 10px 30px rgba(255,110,60,0.28)" };
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

/**
 * When you are checked in and they are not, the one channel that can reach
 * someone who has left the app is Bluesky. This opens their own composer
 * prefilled with a friendly @mention, which lands as a real notification for the
 * opponent. The player sends it from their own account, in their own words, so
 * nothing is ever posted on their behalf. A soft per-fixture cooldown keeps a
 * nudge from becoming a pile-on.
 */
function NudgeOpponent({ m }: { m: MyMatch }) {
  const opp = m.opponent;
  const key = opp ? `nudge:${m.tournament_id}:${m.round}:${m.slot}` : "";
  const COOLDOWN_MS = 60 * 60_000; // one nudge an hour per fixture
  const [sentAt, setSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (!key) return;
    const v = window.localStorage.getItem(key);
    setSentAt(v ? Number(v) : null);
  }, [key]);

  if (!opp) return null;
  const onCooldown = sentAt !== null && Date.now() - sentAt < COOLDOWN_MS;

  // The @mention becomes a real notification once posted; the link auto-links.
  // composeIntentUrl appends Skycave's default hashtags, same as every other post.
  const text = `@${opp.handle} I'm checked in for our ${m.tournament_name} match. Come settle it 👀 skycave.space/tournament`;
  const href = composeIntentUrl(text);

  const send = () => {
    if (key) window.localStorage.setItem(key, String(Date.now()));
    setSentAt(Date.now());
    window.open(href, "_blank", "noopener,noreferrer");
  };

  if (onCooldown) {
    return (
      <p className="text-center text-xs text-[var(--color-text-secondary)]">
        Nudge sent on Bluesky. Give them a moment to see it.
      </p>
    );
  }

  return (
    <button
      onClick={send}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border text-sm font-semibold transition-[filter] active:brightness-95"
      style={{
        borderColor: "color-mix(in srgb, var(--color-warm) 55%, transparent)",
        background: "color-mix(in srgb, var(--color-warm) 10%, var(--color-surface))",
        color: "var(--color-warm)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      Nudge {opp.display_name} on Bluesky
    </button>
  );
}

/**
 * The fixture is drawn but its round window has not opened. A deactivated play
 * button with a live countdown to the opening, so a player knows they are in and
 * exactly when to come back, rather than a check-in button that would only be
 * refused. Covers both the first round (the event opening) and a later round
 * that opens on its own day.
 */
function PlayOpensSoon({ iso }: { iso: string }) {
  return (
    <div
      className="flex h-[56px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-[16px] text-base font-bold"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        color: "var(--color-text-secondary)",
      }}
    >
      Round opens in
      <span className="tabular-nums text-[var(--color-text-primary)]">
        <Countdown to={iso} compact />
      </span>
    </div>
  );
}

/** A wait is not a dead end: the pulse says the page is still watching for them. */
function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-[56px] w-full items-center justify-center gap-2.5 rounded-[16px] border text-sm font-semibold text-[var(--color-text-secondary)]"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <motion.span
        className="h-2 w-2 rounded-full"
        style={{ background: "var(--color-warm)" }}
        animate={{ opacity: [1, 0.25, 1], scale: [1, 0.8, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      {children}
    </div>
  );
}

function Done({ children, tone }: { children: React.ReactNode; tone: "gold" | "cyan" | "muted" }) {
  const color =
    tone === "gold" ? "var(--color-gold)" : tone === "cyan" ? "var(--color-cyan)" : "var(--color-border)";
  return (
    <div
      className="flex min-h-[56px] w-full items-center justify-center rounded-[16px] border px-4 text-center text-sm font-semibold"
      style={{
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, var(--color-surface))`,
      }}
    >
      {children}
    </div>
  );
}

function Side({
  p,
  label,
  checkedIn,
  right = false,
}: {
  p: { did: string; display_name: string; handle: string; avatar_url: string | null } | null;
  label: string;
  checkedIn: boolean;
  right?: boolean;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col ${right ? "items-end text-right" : "items-start"}`}>
      {p ? (
        <>
          <Avatar id={p.did} name={p.display_name} avatarUrl={p.avatar_url} size={44} />
          <div className="mt-2 w-full truncate text-sm font-semibold">{p.display_name}</div>
          <div className="w-full truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            @{p.handle}
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
          <div className="mt-2 text-sm font-semibold text-[var(--color-text-secondary)]">{label}</div>
        </>
      )}
      {p && (
        <div
          className="mt-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em]"
          style={{ color: checkedIn ? "var(--color-success)" : "var(--color-text-secondary)" }}
        >
          {checkedIn ? "checked in" : "not in yet"}
        </div>
      )}
    </div>
  );
}

/**
 * One game of the series. A drawn game is replayed, so a game can hold more
 * than one result; showing them all is what makes a replay legible instead of
 * looking like the score changed by itself.
 */
function GameRow({
  name,
  index,
  legs,
  current,
  hostSwap,
}: {
  name: string;
  index: number;
  legs: MatchLeg[];
  current: boolean;
  hostSwap: boolean;
}) {
  const decided = legs.find((lg) => !lg.replay && lg.winner_did);
  const played = decided ?? legs[legs.length - 1];
  const tone = decided
    ? decided.you_won
      ? "var(--color-success)"
      : "var(--color-warm)"
    : current
      ? "var(--color-cyan)"
      : "var(--color-border)";

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
        <div className="truncate font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
          {decided
            ? decided.you_won
              ? "you won"
              : "they won"
            : current
              ? `up next · ${hostSwap ? "you host" : "they host"}`
              : "not played yet"}
          {legs.some((lg) => lg.replay) && " · replayed after a draw"}
        </div>
      </div>
      {played && (played.your_score || played.their_score) ? (
        <span className="shrink-0 font-[var(--font-display)] text-sm font-bold tabular-nums">
          {played.your_score} - {played.their_score}
        </span>
      ) : null}
    </div>
  );
}

function Shell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-lg px-5 pb-16 pt-8">
      <div className="mb-6">
        <BackButton href={`/tournament/${id}`} label="Bracket" />
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
