"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { GameGlyph } from "@/components/games/gameVisual";
import { ChallengeTray } from "@/components/hub/ChallengeTray";
import { AuthModal } from "@/components/ui/AuthModal";
import { composeIntentUrl } from "@/lib/bluesky";
import { seriesUrl } from "@/lib/site";
import { downloadSeriesCard, type SeriesLeg } from "@/lib/scorecard-image";
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
 * A head-to-head series (Gemini's visual design, wired to the real backend).
 * Every state is derived from GET /series/{id}; the page polls while the series
 * is unsettled so the creator sees an opponent arrive and the score climb.
 */
const POLL_MS = 3_000;

interface PageProps {
  params: Promise<{ id: string }>;
}

function initials(name: string | undefined): string {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || n.slice(0, 2).toUpperCase();
}

export default function SeriesPage({ params }: PageProps) {
  const { id } = use(params);
  const { identity, loaded, hydrate } = useAuth();

  const [s, setS] = useState<Series | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const load = useCallback(async () => {
    try {
      setS(await getSeries(id));
      setPhase("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setPhase("missing");
      else setPhase((p) => (p === "loading" ? "missing" : p));
    }
  }, [id]);

  useEffect(() => {
    if (loaded) load();
  }, [loaded, load]);

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
      window.location.href = `/room/${room_id}`;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the game. Try again.");
      setBusy(false);
      void load();
    }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(seriesUrl(id)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  // ── Loading / not found ────────────────────────────────────────────────
  if (!loaded || phase === "loading") {
    return <Center>Loading the series…</Center>;
  }
  if (phase === "missing" || !s) {
    return (
      <Center>
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-2xl font-bold">This series is gone.</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            The link may be wrong, or it was never created.
          </p>
          <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-semibold">
            Back to the hub
          </Link>
        </div>
      </Center>
    );
  }

  // ── Derived, real data ─────────────────────────────────────────────────
  const best = s.wins_needed * 2 - 1;
  const p1 = s.player1;
  const p2 = s.player2;
  const p1Wins = p1?.wins ?? 0;
  const p2Wins = p2?.wins ?? 0;
  const iAmPlayer = s.you !== null;
  const state: "waiting" | "invited" | "live" | "finished" =
    s.status === "finished"
      ? "finished"
      : s.status === "live"
        ? "live"
        : s.you === "player1"
          ? "waiting"
          : "invited";

  const hostName = (i: number): string => {
    const did = s.hosts?.[i];
    if (did && did === p1?.did) return p1?.name ?? "Player 1";
    if (did && did === p2?.did) return p2?.name ?? "Player 2";
    return "TBD";
  };
  const lineup = s.games.map((g, i) => ({
    type: g,
    name: s.game_names[i] ?? g,
    host: hostName(i),
    result: s.results[i] ?? null,
  }));

  const winnerName =
    s.winner_did === p1?.did ? p1?.name : s.winner_did === p2?.did ? p2?.name : null;

  const shareUrl = seriesUrl(id);
  const inviteText = `I've started a best-of-${best} series on Skycave. First to ${s.wins_needed} across games. Come settle it 👉 ${shareUrl}`;

  return (
    <main className="min-h-screen bg-[#05060a] text-white flex flex-col items-center justify-between p-4 sm:p-8">
      {/* Top Navbar */}
      <header className="w-full max-w-2xl flex items-center justify-between py-4 border-b border-[var(--color-border)]/40">
        <Link
          href="/"
          className="flex items-center gap-2 font-[var(--font-display)] text-xl font-bold tracking-tight text-white hover:opacity-90 transition-opacity"
        >
          <span className="text-[var(--color-primary)]">sky</span>cave
          <span className="rounded-full bg-[var(--color-gold)]/20 border border-[var(--color-gold)]/40 px-2 py-0.5 font-[var(--font-mono)] text-[10px] uppercase text-[var(--color-gold)]">
            Series
          </span>
        </Link>
        <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          Best of {best}
        </span>
      </header>

      <div className="w-full max-w-2xl flex-1 flex flex-col justify-center py-8 space-y-8">
        {/* ── WAITING (creator) ─────────────────────────────────────────── */}
        {state === "waiting" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center space-y-6">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 text-[var(--color-gold)] shadow-[0_0_25px_rgba(255,228,92,0.25)]">
              <TrophySvg size={28} />
            </div>
            <div>
              <span className="font-[var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                Series Challenge Created
              </span>
              <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold text-white">
                Best of {best} Series
              </h1>
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-300">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400"></span>
              </span>
              Waiting for your opponent to join…
            </div>
            <LineupPreview lineup={lineup} accent="var(--color-cyan)" label="Series Lineup (Alternating Hosts)" />
            <div className="w-full max-w-md space-y-3">
              <a
                href={composeIntentUrl(inviteText)}
                target="_blank"
                rel="noreferrer"
                className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#0085ff] font-[var(--font-display)] text-base font-bold text-white shadow-[0_4px_20px_rgba(0,133,255,0.4)] transition-all hover:bg-[#0076e0] active:scale-98"
              >
                <BskySvg /> <span>Invite on Bluesky</span>
              </a>
              <button
                onClick={copyLink}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] font-[var(--font-display)] text-sm font-semibold text-white transition-colors hover:border-white"
              >
                <CopySvg /> <span>{copied ? "Link Copied!" : "Copy Series Link"}</span>
              </button>
            </div>
          </motion.div>
        )}

        {/* ── INVITED (visitor) ─────────────────────────────────────────── */}
        {state === "invited" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center space-y-6">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-[0_0_25px_var(--color-primary-glow)]">
              <SwordsSvg size={28} />
            </div>
            <div>
              <span className="font-[var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                {p1?.name ? `You were challenged by ${p1.name}` : "You've been challenged"}
              </span>
              <h1 className="mt-1 font-[var(--font-display)] text-3xl font-extrabold text-white">
                Best of {best} Series Duel
              </h1>
            </div>
            <LineupPreview lineup={lineup} accent="var(--color-gold)" label="Game Lineup" legPrefix="Leg" />
            <button
              onClick={join}
              disabled={busy}
              className="flex h-13 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] font-[var(--font-display)] text-base font-bold text-white shadow-[0_4px_20px_var(--color-primary-glow)] transition-all hover:bg-[#7b6bf5] active:scale-98 disabled:opacity-60"
            >
              <span>{busy ? "Joining…" : "Accept the Challenge"}</span>
            </button>
            <p className="text-xs text-[var(--color-text-secondary)]">Guests welcome</p>
          </motion.div>
        )}

        {/* ── LIVE ──────────────────────────────────────────────────────── */}
        {state === "live" && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-2xl">
              <div className="absolute top-0 inset-x-0 h-1 bg-[linear-gradient(90deg,var(--color-primary),var(--color-gold))] opacity-80" />
              <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
                Series in Progress · Best of {best}
              </span>
              <div className="mt-4 flex items-center justify-around">
                <PlayerBadge p={p1} you={s.you === "player1"} accent="var(--color-primary)" lead={p1Wins > p2Wins} />
                <div className="flex flex-col items-center">
                  <div className="font-[var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--color-gold)]">
                    {p1Wins} - {p2Wins}
                  </div>
                  <span className="mt-1 font-[var(--font-mono)] text-[10px] uppercase tracking-wider text-[var(--color-success)] font-bold">
                    Leg {s.current_leg + 1} Up Next
                  </span>
                </div>
                <PlayerBadge p={p2} you={s.you === "player2"} accent="#ff6b6b" lead={p2Wins > p1Wins} />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 space-y-3">
              <h3 className="font-[var(--font-mono)] text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                Series Schedule & Host Alternation
              </h3>
              <div className="space-y-2">
                {lineup.map((leg, i) => {
                  const isCurrent = i === s.current_leg;
                  const isFinished = !!leg.result;
                  const legWinner =
                    leg.result?.winner_did === p1?.did
                      ? p1?.name
                      : leg.result?.winner_did === p2?.did
                        ? p2?.name
                        : null;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-xl border p-3 text-sm transition-all ${
                        isCurrent
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[0_0_15px_var(--color-primary-glow)]"
                          : isFinished
                            ? "border-[var(--color-border)] bg-[var(--color-surface)] opacity-75"
                            : "border-[var(--color-border)]/50 bg-[var(--color-surface)]/30 opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-[var(--font-mono)] text-xs font-bold text-[var(--color-text-secondary)]">L{i + 1}</span>
                        <GameGlyph type={leg.type} color="var(--color-cyan)" />
                        <div className="text-left">
                          <div className="font-bold text-white">{leg.name}</div>
                          <div className="text-[11px] text-[var(--color-text-secondary)]">Host: {leg.host}</div>
                        </div>
                      </div>
                      <div>
                        {isFinished ? (
                          <span className="font-[var(--font-mono)] text-xs font-bold text-[var(--color-success)]">
                            {legWinner ? `${legWinner} won` : "drawn"}
                          </span>
                        ) : isCurrent ? (
                          <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-1 font-[var(--font-mono)] text-[10px] font-bold uppercase text-white">
                            Up Next
                          </span>
                        ) : (
                          <span className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">Upcoming</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {iAmPlayer ? (
              <button
                onClick={enterLeg}
                disabled={busy}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] font-[var(--font-display)] text-base font-bold text-white shadow-[0_4px_20px_var(--color-primary-glow)] transition-all hover:bg-[#7b6bf5] active:scale-98 disabled:opacity-60"
              >
                <span>
                  {busy
                    ? "Opening…"
                    : s.current_room_id
                      ? "Go to your game"
                      : `Play game ${s.current_leg + 1}: ${s.current_game_name ?? ""}`}
                </span>
              </button>
            ) : (
              <div className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-secondary)]">
                Spectating · {p1?.name} vs {p2?.name}
              </div>
            )}
            {error && <p className="text-center text-sm text-[var(--color-warm)]">{error}</p>}
          </motion.div>
        )}

        {/* ── FINISHED ──────────────────────────────────────────────────── */}
        {state === "finished" && (
          <FinishedView
            s={s}
            best={best}
            p1={p1}
            p2={p2}
            p1Wins={p1Wins}
            p2Wins={p2Wins}
            winnerName={winnerName ?? null}
            viewerDid={identity?.id ?? null}
            lineup={lineup}
            onAnother={() => setTrayOpen(true)}
          />
        )}
      </div>

      <ChallengeTray open={trayOpen} onClose={() => setTrayOpen(false)} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        title="Join this series"
        invite={{ hostHandle: p1?.name, gameName: `best of ${best}` }}
        onAuthed={() => {
          setAuthOpen(false);
          void join();
        }}
      />
    </main>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */

function FinishedView({
  s,
  best,
  p1,
  p2,
  p1Wins,
  p2Wins,
  winnerName,
  viewerDid,
  lineup,
  onAnother,
}: {
  s: Series;
  best: number;
  p1: SeriesPlayer | null;
  p2: SeriesPlayer | null;
  p1Wins: number;
  p2Wins: number;
  winnerName: string | null;
  viewerDid: string | null;
  lineup: { type: string; name: string; host: string; result: Series["results"][number] | null }[];
  onAnother: () => void;
}) {
  const level = !s.winner_did;
  const mineFirst = viewerDid === p1?.did;
  const myW = mineFirst ? p1Wins : p2Wins;
  const theirW = mineFirst ? p2Wins : p1Wins;
  const iWon = !level && s.winner_did === viewerDid;
  const spectator = viewerDid !== p1?.did && viewerDid !== p2?.did;
  const hi = Math.max(p1Wins, p2Wins);
  const lo = Math.min(p1Wins, p2Wins);
  const oppName = mineFirst ? p2?.name : p1?.name;

  const shareUrl = seriesUrl(s.id);
  const shareText = level
    ? `Our best-of-${best} series ended level on Skycave. ${shareUrl}`
    : spectator
      ? `${winnerName} took the best-of-${best} series ${hi}-${lo} on Skycave. ${shareUrl}`
      : iWon
        ? `Won my best-of-${best} series ${myW}-${theirW} on Skycave 🏆 ${shareUrl}`
        : `Lost a close one, ${oppName} took the best-of-${best} ${theirW}-${myW}. Run it back? ${shareUrl}`;

  const legs: SeriesLeg[] = (s.results || []).map((r, i) => ({
    name: lineup[i]?.name ?? r.game_type,
    winner: r.winner_did === p1?.did ? "p1" : r.winner_did === p2?.did ? "p2" : "draw",
  }));
  const download = () =>
    downloadSeriesCard({
      p1Name: p1?.name ?? "Player 1",
      p2Name: p2?.name ?? "Player 2",
      p1Wins,
      p2Wins,
      winnerName: level ? null : winnerName,
      best,
      legs,
    });

  const headline = level ? "Series drawn" : `${winnerName} wins!`;

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center space-y-6">
      <div className="grid h-20 w-20 place-items-center rounded-3xl border-2 border-[var(--color-gold)] bg-[var(--color-gold)]/20 text-[var(--color-gold)] shadow-[0_0_30px_rgba(255,228,92,0.4)]">
        <TrophySvg size={36} />
      </div>
      <div>
        <span className="font-[var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--color-gold)] font-bold">
          {level ? "Series Complete" : "Series Champion"}
        </span>
        <h1 className="mt-1 font-[var(--font-display)] text-4xl font-extrabold text-white">{headline}</h1>
        <p className="mt-1 font-[var(--font-mono)] text-sm text-[var(--color-text-secondary)]">
          Final Series Score: {p1Wins} - {p2Wins} (Best of {best})
        </p>
      </div>
      <div className="w-full max-w-md space-y-3">
        <a
          href={composeIntentUrl(shareText)}
          target="_blank"
          rel="noreferrer"
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#0085ff] font-[var(--font-display)] text-base font-bold text-white shadow-[0_4px_20px_rgba(0,133,255,0.4)] transition-all hover:bg-[#0076e0] active:scale-98"
        >
          <BskySvg /> <span>Post Result to Bluesky</span>
        </a>
        <button
          onClick={download}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] font-[var(--font-display)] text-sm font-semibold text-white transition-colors hover:border-white"
        >
          <DownloadSvg /> <span>Download Result Card</span>
        </button>
        <button
          onClick={onAnother}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 font-[var(--font-display)] text-sm font-bold text-[var(--color-gold)] transition-colors hover:bg-[var(--color-gold)]/20"
        >
          <SwordsSvg size={16} /> <span>Start Another Series</span>
        </button>
      </div>
    </motion.div>
  );
}

function PlayerBadge({
  p,
  you,
  accent,
  lead,
}: {
  p: SeriesPlayer | null;
  you: boolean;
  accent: string;
  lead: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl font-[var(--font-display)] text-base font-bold text-white"
        style={{ background: `${accent}22`, border: `1px solid ${accent}`, boxShadow: lead ? `0 0 15px ${accent}66` : undefined }}
      >
        {initials(p?.name)}
      </div>
      <span className="mt-2 font-[var(--font-display)] text-sm font-bold text-white">
        {you ? "You" : p?.name ?? "—"}
      </span>
    </div>
  );
}

function LineupPreview({
  lineup,
  accent,
  label,
  legPrefix = "L",
}: {
  lineup: { type: string; name: string }[];
  accent: string;
  label: string;
  legPrefix?: string;
}) {
  return (
    <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-5 space-y-3">
      <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">
        {label}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {lineup.map((leg, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2 text-xs font-medium">
            <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
              {legPrefix}{legPrefix === "Leg" ? " " : ""}{i + 1}
            </span>
            <GameGlyph type={leg.type} color={accent} />
            <span className="font-bold">{leg.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#05060a] text-white flex items-center justify-center p-6">
      <div className="text-center text-[var(--color-text-secondary)]">{children}</div>
    </main>
  );
}

function BskySvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 568 501" fill="currentColor" aria-hidden>
      <path d="M123.121 33.664C187.902 82.232 257.653 176.713 284 230.173c26.347-53.46 96.098-147.941 160.879-196.509C491.566 1.488 568-23.774 568 62.434c0 17.158-9.845 144.181-15.626 164.819-20.081 71.745-93.208 89.967-158.455 78.891 114.12 19.431 143.167 83.821 80.4 148.212-119.336 122.427-172.932-30.704-187.681-72.91-2.062-5.897-2.638-7.542-2.638-7.542s-.576 1.645-2.638 7.542c-14.749 42.206-68.345 195.337-187.681 72.91-62.767-64.391-33.72-128.781 80.4-148.212-65.247 11.076-138.374-7.146-158.455-78.891C9.845 206.615 0 79.592 0 62.434 0-23.774 76.434 1.488 123.121 33.664z" />
    </svg>
  );
}
function CopySvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function DownloadSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function SwordsSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
      <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" />
      <path d="M11 19l-6-6" />
      <path d="M8 16l-4 4" />
      <path d="M5 21l-2-2" />
    </svg>
  );
}
function TrophySvg({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
      <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
      <path d="M18 4H6v7a6 6 0 0 0 12 0V4z" />
    </svg>
  );
}
