"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BlueskyLogo } from "@/components/ui/BlueskyLogo";
import { LocalTime } from "@/components/tournament/Countdown";
import { TournamentShell } from "@/components/tournament/TournamentShell";
import { TournamentHero } from "@/components/tournament/TournamentHero";
import { RulesNotice } from "@/components/tournament/RulesNotice";
import { AuthModal } from "@/components/ui/AuthModal";
import { GameGlyph, GAME_ACCENT } from "@/components/games/gameVisual";
import { statusMeta, TOURNEY } from "@/lib/tournamentStatus";
import {
  ApiError,
  enterTournament,
  getCurrentTournament,
  type Tournament,
  type TournamentPlayer,
} from "@/lib/api";
import { gameSlug } from "@/lib/solo";
import { useAuth } from "@/lib/store";

const POLL_MS = 30_000;

export default function TournamentPage() {
  const { identity, loaded, hydrate } = useAuth();
  const [t, setT] = useState<Tournament | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

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
      setError(e instanceof ApiError ? e.message : "That did not go through. Try once more.");
      void load();
    } finally {
      setEntering(false);
    }
  };

  const onEnter = () => {
    if (!t) return;
    if (!identity || identity.is_guest) {
      // A guest needs a real account to enter. Show the login (Bluesky only,
      // since a guest session cannot be tagged in a fixture) rather than firing
      // OAuth with no handle, which the sidecar cannot resolve and which bounced
      // the page straight back to the hub. Stash where to resume so the OAuth
      // round trip lands back here and the effect below takes their seat.
      sessionStorage.setItem("sc-tourney-intent", t.id);
      sessionStorage.setItem("cave_return", "/tournament");
      setAuthOpen(true);
      return;
    }
    void enter();
  };

  if (state === "loading") {
    return (
      <TournamentShell active="now">
        <p className="py-16 text-center text-[var(--color-text-secondary)]">Loading the event...</p>
      </TournamentShell>
    );
  }

  if (state === "none" || !t) {
    return (
      <TournamentShell active="now">
        <div className="py-10 text-center">
          <h1 className="font-[var(--font-display)] text-3xl font-bold">No tournament right now.</h1>
          <p className="mx-auto mt-3 max-w-sm text-[var(--color-text-secondary)]">
            The next weekend event will show up here. Go play something in the meantime.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-[14px] px-6 font-semibold"
            style={{ background: TOURNEY.gradient, color: TOURNEY.ink }}
          >
            Back to the games
          </Link>
        </div>
      </TournamentShell>
    );
  }

  const open = t.status === "registering" && t.spots_left > 0;

  return (
    <TournamentShell active="now">
      <TournamentHero t={t} />
      <RulesNotice />

      <AnimatePresence mode="wait">
        {t.you_registered && t.you ? (
          <motion.div key="in" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-7">
            <YouAreIn t={t} />
          </motion.div>
        ) : (
          <motion.div key="out" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-7">
            <Field t={t} />
            <div className="mt-6">
              <button
                onClick={onEnter}
                disabled={!open || entering || !loaded}
                className="flex h-[58px] w-full items-center justify-center gap-2.5 rounded-[16px] text-base font-bold transition-[filter] active:brightness-95 disabled:cursor-not-allowed"
                style={{
                  background: open ? TOURNEY.gradient : "var(--color-surface)",
                  color: open ? TOURNEY.ink : "var(--color-text-secondary)",
                  border: open ? "none" : "1px solid var(--color-border)",
                  boxShadow: open ? "0 10px 30px rgba(15,181,201,0.30)" : "none",
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
                  : "Follow the bracket to see how it plays out."}
              </p>
              {error && (
                <p className="mt-2 text-center text-sm" style={{ color: "var(--color-warm)" }}>
                  {error}
                </p>
              )}
              {!open && (
                <Link href={`/tournament/${t.id}`} className="mt-4 block">
                  <span
                    className="flex h-12 w-full items-center justify-center rounded-[14px] border text-sm font-semibold"
                    style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                  >
                    Open the bracket
                  </span>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <GamePot t={t} />

      <p className="mt-10 text-center text-xs text-[var(--color-text-secondary)]">
        Play runs Friday to Sunday. Miss your round and it goes to your opponent.
      </p>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        blueskyOnly
        title="Log in to enter the Cup"
      />
    </TournamentShell>
  );
}

/* ── The field: who is in, as faces, and how many seats remain ──────────── */

function Field({ t }: { t: Tournament }) {
  const open = t.status === "registering";
  const empty = Math.max(0, t.spots_left);
  const shown = t.players.slice(0, 10);
  const overflow = t.players.length - shown.length;

  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <p className="font-[var(--font-display)] text-base font-bold">
        {t.players.length} {t.players.length === 1 ? "player" : "players"} in
        {open && empty > 0 && (
          <span className="text-[var(--color-text-secondary)]">
            {" "}
            · {empty} {empty === 1 ? "spot" : "spots"} left
          </span>
        )}
        {!open && <span className="text-[var(--color-text-secondary)]"> · field set</span>}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {shown.map((p) => (
          <Avatar key={p.did} id={p.did} name={p.display_name} avatarUrl={p.avatar_url} size={34} />
        ))}
        {overflow > 0 && (
          <div
            className="grid h-[34px] w-[34px] place-items-center rounded-full border font-[var(--font-mono)] text-[11px] font-bold text-[var(--color-text-secondary)]"
            style={{ borderColor: "var(--color-border)", background: "var(--color-base)" }}
          >
            +{overflow}
          </div>
        )}
        {open &&
          Array.from({ length: Math.min(empty, 12) }).map((_, i) => (
            <div
              key={`e-${i}`}
              className="h-[34px] w-[34px] rounded-full border border-dashed"
              style={{ borderColor: "color-mix(in srgb, var(--color-border) 130%, transparent)" }}
            />
          ))}
      </div>
    </div>
  );
}

/* ── Post-registration: the moment, and the momentum ────────────────────── */

function YouAreIn({ t }: { t: Tournament }) {
  const you = t.you!;
  const live = t.status !== "registering";
  const rivals = t.players.filter((p) => p.did !== you.did);

  return (
    <div className="space-y-5">
      {/* The moment, in the warm of the tournament world. */}
      <div
        className="relative overflow-hidden rounded-[22px] border p-6 text-center"
        style={{
          borderColor: `color-mix(in srgb, ${TOURNEY.accent} 45%, transparent)`,
          background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${TOURNEY.accent} 16%, transparent), transparent 62%), var(--color-surface)`,
        }}
      >
        <div className="mx-auto w-max rounded-full p-[3px]" style={{ background: TOURNEY.gradient }}>
          <Avatar id={you.did} name={you.display_name} avatarUrl={you.avatar_url} size={72} />
        </div>
        <h2 className="mt-4 font-[var(--font-display)] text-3xl font-bold">You&apos;re in.</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {live
            ? "The bracket is live. Go and play your fixture."
            : "Your bracket drops when registration closes. Until then, warm up."}
        </p>

        {live && (
          <Link href={`/tournament/${t.id}/match`} className="mt-5 block">
            <span
              className="flex h-[52px] w-full items-center justify-center rounded-[14px] text-base font-bold"
              style={{ background: TOURNEY.gradient, color: TOURNEY.ink, boxShadow: "0 10px 30px rgba(15,181,201,0.30)" }}
            >
              Go to your fixture →
            </span>
          </Link>
        )}
      </div>

      {/* The rivals: real faces, so the field feels like people. */}
      {rivals.length > 0 && (
        <div
          className="rounded-[18px] border p-4"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <p
            className="font-[var(--font-display)] text-base font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {live ? "Who else made it" : "Who you might face"}
            <span style={{ color: "var(--color-text-secondary)" }}> · {rivals.length}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {rivals.slice(0, 14).map((p) => (
              <Rival key={p.did} p={p} />
            ))}
          </div>
        </div>
      )}

      {/* The check-in promise, told as a feature rather than buried in a caption. */}
      {!live && <CheckInBlock openAt={t.play_opens_at} />}
    </div>
  );
}

function Rival({ p }: { p: TournamentPlayer }) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-base)" }}
    >
      <Avatar id={p.did} name={p.display_name} avatarUrl={p.avatar_url} size={26} />
      <span className="max-w-[120px] truncate text-xs">{p.display_name}</span>
    </div>
  );
}

function CheckInBlock({ openAt }: { openAt: string }) {
  return (
    <div
      className="flex gap-3.5 rounded-[18px] border p-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border"
        style={{
          borderColor: "color-mix(in srgb, var(--color-cyan) 40%, transparent)",
          background: "color-mix(in srgb, var(--color-cyan) 10%, transparent)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="font-[var(--font-display)] text-sm font-bold">Check in, and the room opens itself</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          When your round opens you check in right here, and your match room is created automatically once
          your opponent does too. No links to send, no sitting in an empty room. Check-in opens{" "}
          <LocalTime iso={openAt} />.
        </p>
      </div>
    </div>
  );
}

/* ── The pool: proper game cards, the anticipation section ──────────────── */

function GamePot({ t }: { t: Tournament }) {
  return (
    <section className="mt-9">
      <h2 className="font-[var(--font-display)] text-xl font-bold">The games in the pot</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Your fixture will draw 3 of these. You&apos;ll see which ones before you play, so warm up on any.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {t.game_pool.map((slug, i) => (
          <GamePoolCard key={slug} slug={slug} name={t.game_pool_names[i] ?? slug} />
        ))}
      </div>
    </section>
  );
}

function GamePoolCard({ slug, name }: { slug: string; name: string }) {
  const accent = GAME_ACCENT[slug] ?? "var(--color-primary)";
  const tagline = TAGLINES[slug] ?? "";
  return (
    <Link
      href={`/play/${gameSlug(slug)}`}
      className="group relative flex min-h-[120px] flex-col overflow-hidden rounded-[16px] border pl-4 pr-3 py-3 transition-[filter] active:brightness-110"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      {/* the game's own colour down the left edge */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />

      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border"
          style={{ background: `${accent}18`, borderColor: `${accent}4d` }}
        >
          <div className="scale-[0.62]">
            <GameGlyph type={slug} color={accent} />
          </div>
        </div>
        <span className="font-[var(--font-display)] text-sm font-bold leading-tight">{name}</span>
      </div>

      <p className="mt-2 flex-1 text-[11px] leading-snug text-[var(--color-text-secondary)]">{tagline}</p>

      <span
        className="mt-1 inline-flex w-max items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
        style={{ background: `${accent}1f`, color: accent }}
      >
        Practice
        <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

// One-line "what it feels like to play", mirrored from the backend taglines so
// the pot reads with energy instead of a bare list of names.
const TAGLINES: Record<string, string> = {
  tile_takeover: "Flood the board. Claim the most tiles.",
  connect4: "Drop discs. Line up four.",
  word_hunt: "Trace words in the grid. Longest hunt wins.",
  color_clash: "Tap the ink colour, not the word.",
  word_duel: "Same six letters. Longest real word wins.",
  mancala: "Sow the seeds. Bank the most to win.",
  clay: "Shape the pot to match the target.",
  dots_boxes: "Close a box, go again. Most boxes wins.",
  uno: "Match colour or number. Empty your hand.",
};
