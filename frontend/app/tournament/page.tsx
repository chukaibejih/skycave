"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BlueskyLogo } from "@/components/ui/BlueskyLogo";
import { Countdown, LocalTime } from "@/components/tournament/Countdown";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { ApiError, enterTournament, getCurrentTournament, type Tournament } from "@/lib/api";
import { startBlueskyLogin } from "@/lib/bluesky";
import { gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";

// Live numbers (spots left, status) refresh on a timer so the page never needs
// a manual reload. 30s is the agreed default.
const POLL_MS = 30_000;

export default function TournamentPage() {
  const { identity, loaded, hydrate } = useAuth();
  const [t, setT] = useState<Tournament | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    try {
      const next = await getCurrentTournament();
      setT(next);
      setState(next ? "ready" : "none");
    } catch {
      setState((s) => (s === "loading" ? "none" : s));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Someone who logged in from this page lands back here; take their seat as
  // soon as we know who they are, so the OAuth round trip is not a dead end.
  useEffect(() => {
    if (!t || !identity || identity.is_guest) return;
    if (t.you_registered) return;
    if (sessionStorage.getItem("sc-tourney-intent") !== t.id) return;
    sessionStorage.removeItem("sc-tourney-intent");
    void enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id, identity?.id]);

  const enter = async () => {
    if (!t) return;
    setEntering(true);
    setError(null);
    try {
      setT(await enterTournament(t.id));
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "That did not go through. Try once more."
      );
      void load();
    } finally {
      setEntering(false);
    }
  };

  const onEnter = () => {
    if (!t) return;
    // No account yet: remember the intent, then hand off to Bluesky and pick
    // the seat up on the way back.
    if (!identity || identity.is_guest) {
      sessionStorage.setItem("sc-tourney-intent", t.id);
      startBlueskyLogin();
      return;
    }
    void enter();
  };

  if (state === "loading") {
    return (
      <TournamentShell active="now">
        <p className="text-center text-[var(--color-text-secondary)]">Loading the event...</p>
      </TournamentShell>
    );
  }

  if (state === "none" || !t) {
    return (
      <TournamentShell active="now">
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-3xl font-bold">No tournament right now.</h1>
          <p className="mt-3 text-[var(--color-text-secondary)]">
            The next weekend event will show up here. Go play something in the meantime.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] px-6 font-semibold"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            Back to the games
          </Link>
        </div>
      </TournamentShell>
    );
  }

  const open = t.status === "registering" && t.spots_left > 0;
  const taken = t.max_players - t.spots_left;

  return (
    <TournamentShell active="now">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div className="text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "color-mix(in srgb, var(--color-primary) 45%, transparent)",
            color: "var(--color-primary)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
          Weekend event
        </span>

        <h1 className="mt-4 font-[var(--font-display)] text-4xl font-bold leading-[1.05] sm:text-5xl">
          {t.name}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
          One weekend. Straight knockout. Best of three games a round, drawn from{" "}
          {t.game_pool_names.length} of your favourites.
        </p>
      </div>

      {/* ── The clock ──────────────────────────────────────────────────── */}
      <section className="mt-9">
        <p className="mb-3 text-center font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
          {t.status === "registering" ? "Entries close in" : "Entries are closed"}
        </p>
        {t.status === "registering" ? (
          <>
            <Countdown to={t.registration_closes_at} onElapsed={load} />
            <p className="mt-3 text-center text-xs text-[var(--color-text-secondary)]">
              Closes <LocalTime iso={t.registration_closes_at} />, and that is the moment
              the bracket goes up.
            </p>
          </>
        ) : (
          <p className="text-center text-lg font-semibold">The bracket is live.</p>
        )}
      </section>

      {/* ── Spots ──────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-[var(--font-display)] text-lg font-bold">
            {t.spots_left > 0 ? `${t.spots_left} of ${t.max_players} spots left` : "Field is full"}
          </span>
          <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            {taken} in
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-cyan))" }}
            initial={false}
            animate={{ width: `${Math.round((taken / Math.max(1, t.max_players)) * 100)}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </section>

      {/* ── You, or the way in ─────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {t.you_registered && t.you ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <YouAreIn t={t} />
          </motion.div>
        ) : (
          <motion.div key="enter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
            <button
              onClick={onEnter}
              disabled={!open || entering || !loaded}
              className="flex h-[56px] w-full items-center justify-center gap-2.5 rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:cursor-not-allowed"
              style={{
                background: open ? "var(--color-primary)" : "var(--color-surface)",
                color: open ? "#05060a" : "var(--color-text-secondary)",
                border: open ? "none" : "1px solid var(--color-border)",
              }}
            >
              {!open ? (
                "Registration closed"
              ) : entering ? (
                "Taking your seat..."
              ) : (
                <>
                  <BlueskyLogo className="h-5 w-5" />
                  Enter the tournament
                </>
              )}
            </button>
            <p className="mt-2.5 text-center text-xs text-[var(--color-text-secondary)]">
              {open
                ? "Bluesky account needed, so you can be tagged in your fixture."
                : "Follow the bracket below to see how it plays out."}
            </p>
            {error && (
              <p className="mt-2 text-center text-sm" style={{ color: "var(--color-warm)" }}>
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── The games ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-[var(--font-display)] text-xl font-bold">
          {t.you_registered ? "Your games this weekend" : "The games in the pot"}
        </h2>
        <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
          {t.you_registered
            ? "Three of these get drawn for each round. Warm up on any of them."
            : "Every fixture draws three of these, and you see them before you play."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {t.game_pool.map((slug, i) => (
            <Link
              key={slug}
              href={`/play/${gameSlug(slug)}`}
              className="flex min-h-[64px] items-center justify-between gap-2 rounded-[14px] border px-4 py-3 transition-[filter] active:brightness-110"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface)",
              }}
            >
              <span className="text-sm font-semibold leading-tight">
                {t.game_pool_names[i] ?? slug}
              </span>
              <span
                className="shrink-0 font-[var(--font-mono)] text-[10px] uppercase tracking-wide"
                style={{ color: "var(--color-primary)" }}
              >
                Practice
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Who is in ──────────────────────────────────────────────────── */}
      {t.players.length > 0 && (
        <section className="mt-10">
          <h2 className="font-[var(--font-display)] text-xl font-bold">
            In so far ({t.players.length})
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {t.players.map((p) => (
              <div
                key={p.did}
                className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <Avatar id={p.did} name={p.display_name} avatarUrl={p.avatar_url} size={26} />
                <span className="max-w-[130px] truncate text-xs">{p.display_name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-12 text-center text-xs text-[var(--color-text-secondary)]">
        Play runs Friday to Sunday. Miss your round and it goes to your opponent.
      </p>
    </TournamentShell>
  );
}

/** The signed-up player's own panel: the whole point of the page after entry. */
function YouAreIn({ t }: { t: Tournament }) {
  const you = t.you!;
  return (
    <div
      className="rounded-[20px] border p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--color-success) 40%, transparent)",
        background:
          "linear-gradient(160deg, color-mix(in srgb, var(--color-success) 10%, transparent), transparent 60%), var(--color-surface)",
      }}
    >
      <h2 className="font-[var(--font-display)] text-2xl font-bold">You are in. Good luck.</h2>

      <div className="mt-4 flex items-center gap-3">
        <Avatar id={you.did} name={you.display_name} avatarUrl={you.avatar_url} size={48} />
        <div className="min-w-0">
          <div className="truncate font-[var(--font-display)] text-lg font-bold">
            {you.display_name}
          </div>
          <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            @{you.handle}
          </div>
        </div>
      </div>

      {t.status === "registering" ? (
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Your bracket and your opponent go up when entries close. Until then, go warm up in the{" "}
          <Link href="/" className="font-semibold underline underline-offset-2" style={{ color: "var(--color-primary)" }}>
            game hub
          </Link>
          .
        </p>
      ) : (
        // Once the draw has happened this panel has exactly one job: get them to
        // their fixture. Everything they need to play is on that page.
        <Link href={`/tournament/${t.id}/match`} className="mt-4 block">
          <span
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] text-base font-bold"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            Go to your fixture
          </span>
        </Link>
      )}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Row label="Bracket goes up in">
          {t.status === "registering" ? (
            <Countdown to={t.registration_closes_at} compact />
          ) : (
            "Now, it is live"
          )}
        </Row>
        <Row label="Check-in opens">
          <LocalTime iso={t.play_opens_at} />
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] border px-3.5 py-2.5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-base)" }}
    >
      <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
    </div>
  );
}
