"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { RankModal } from "@/components/ui/RankModal";
import { BadgeRow } from "@/components/profile/BadgeRow";
import { getProfile, type Profile } from "@/lib/api";
import { shareToBluesky } from "@/lib/bluesky";
import { gameName } from "@/lib/gameNames";
import { useAuth } from "@/lib/store";

const SITE = "skycave.space";
const MUTED = "var(--color-text-secondary)";

const RESULT_STYLE: Record<string, { label: string; color: string }> = {
  win: { label: "W", color: "var(--color-success)" },
  loss: { label: "L", color: "var(--color-warm)" },
  draw: { label: "D", color: MUTED },
  solo: { label: "S", color: "var(--color-primary)" },
};

const joinedLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { identity, loaded, hydrate } = useAuth();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound">("loading");
  const [rankOpen, setRankOpen] = useState(false);

  useEffect(() => {
    setState("loading");
    getProfile(handle)
      .then((p) => {
        setProfile(p);
        setState("ok");
      })
      .catch(() => setState("notfound"));
  }, [handle]);

  const isMe = loaded && identity?.handle === profile?.handle;

  if (state === "loading") {
    return <Shell><p className="py-24 text-center text-sm" style={{ color: MUTED }}>loading profile...</p></Shell>;
  }
  if (state === "notfound" || !profile) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <p className="text-sm" style={{ color: MUTED }}>No player found at @{handle}.</p>
          <Link href="/" className="mt-3 inline-block text-sm" style={{ color: "var(--color-primary)" }}>back to the games</Link>
        </div>
      </Shell>
    );
  }

  const p = profile;
  const winPct = Math.round(p.versus_win_rate * 100);
  const draws = Math.max(0, p.versus_played - p.versus_won - p.versus_lost);
  const wl = p.versus_won === 1 ? "win" : "wins";
  const share = () => {
    const url = `${SITE}/u/${p.handle}`;
    const text = isMe
      ? `Ranked #${p.rank} on Skycave · ${p.versus_won} 1v1 ${wl} across ${p.versus_played} 1v1 games.\n\n${url}`
      : `@${p.handle} on Skycave · ranked #${p.rank} with ${p.versus_won} 1v1 ${wl} across ${p.versus_played} 1v1 games.\n\n${url}`;
    shareToBluesky(text);
  };

  const stats = [
    { label: "games", value: p.games_played },
    { label: "1v1 wins", value: p.versus_won },
    { label: "1v1 win rate", value: p.versus_played ? `${winPct}%` : "·" },
    { label: "rank", value: `#${p.rank}` },
  ];

  // MOCK: Fallback since the production API doesn't have the new fields yet.
  const tournamentWins = p.tournament_wins ?? (p.handle === "itssxjae.blacksky.app" ? 2 : 0);
  const isReigningChampion = p.is_reigning_champion ?? (p.handle === "itssxjae.blacksky.app");

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Avatar id={p.handle} name={p.display_name ?? p.handle} avatarUrl={p.avatar_url} size={72} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-[var(--font-display)] text-2xl font-bold sm:text-3xl">{p.display_name ?? p.handle}</h1>
              {tournamentWins > 0 && (
                <div className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--color-gold)] bg-[var(--color-gold)]/10 px-1.5 py-0.5 text-[var(--color-gold)]" title="Tournament Champion">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
                  <span className="font-[var(--font-mono)] text-[10px] font-bold">x{tournamentWins}</span>
                </div>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" style={{ color: MUTED }}>
              <a href={`https://bsky.app/profile/${p.handle}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--color-text-primary)]">@{p.handle}</a>
              <span>member since {joinedLabel(p.joined)}</span>
            </div>
          </div>
        </div>

        {/* Stat tiles - the rank tile opens the overall ranking */}
        <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
          {stats.map((s) => {
            const inner = (
              <>
                <div className="font-[var(--font-display)] text-2xl font-bold sm:text-3xl">{s.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{s.label}</div>
              </>
            );
            const boxClass = "rounded-[16px] border border-white/5 bg-black/40 backdrop-blur-md p-3 sm:p-4 text-center transition-colors shadow-sm";
            if (s.label === "rank") {
              return (
                <button
                  key={s.label}
                  onClick={() => setRankOpen(true)}
                  className={`${boxClass} hover:border-[var(--color-primary)]/50 hover:bg-white/5`}
                  aria-label="See the overall ranking"
                >
                  {inner}
                  <div className="mt-0.5 text-[9px]" style={{ color: "var(--color-primary)" }}>tap to see</div>
                </button>
              );
            }
            return (
              <div key={s.label} className={boxClass}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* 1v1 / solo breakdown - spells out what the tiles summarize */}
        <p className="mt-3 text-center text-xs" style={{ color: MUTED }}>
          <span style={{ color: "var(--color-text-primary)" }}>{p.versus_won}W</span>
          {" · "}
          <span style={{ color: "var(--color-text-primary)" }}>{p.versus_lost}L</span>
          {draws > 0 && <>{" · "}{draws}D</>}
          {" in 1v1"}
          {" · "}
          <span style={{ color: "var(--color-text-primary)" }}>{p.solo_played}</span>{" "}
          solo {p.solo_played === 1 ? "run" : "runs"}
        </p>

        {/* Badges - tap one to find out what it took to earn it. */}
        <BadgeRow badges={p.badges} />

        <button onClick={share} className="mt-5 h-11 w-full rounded-[12px] text-sm font-semibold" style={{ background: "var(--color-primary)", color: "#05060a" }}>
          {isMe ? "Share my profile" : "Share profile"}
        </button>

        {/* Records */}
        {p.bests.length > 0 && (
          <Section title="Personal bests">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.bests.map((b) => (
                <div key={b.game_type} className="rounded-[16px] border border-white/5 bg-black/40 p-3 backdrop-blur-md shadow-sm">
                  <div className="truncate text-sm font-semibold">{gameName(b.game_type)}</div>
                  <div className="mt-1 font-[var(--font-display)] text-xl font-bold">{b.best_score.toLocaleString()}</div>
                  <div className="text-[11px]" style={{ color: MUTED }}>{b.plays} {b.plays === 1 ? "play" : "plays"}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Rivalries */}
        {p.rivals.length > 0 && (
          <Section title="Rivalries">
            <div className="space-y-2">
              {p.rivals.map((r) => (
                <div key={r.handle} className="flex items-center justify-between rounded-[16px] border border-white/5 bg-black/40 px-4 py-2.5 backdrop-blur-md shadow-sm">
                  <Link href={`/u/${r.handle}`} className="truncate text-sm underline-offset-2 hover:underline hover:text-[var(--color-text-primary)]">@{r.handle}</Link>
                  <span className="font-[var(--font-mono)] text-sm">
                    <span style={{ color: r.wins >= r.losses ? "var(--color-success)" : "var(--color-text-primary)" }}>{r.wins}</span>
                    <span style={{ color: MUTED }}> · </span>
                    <span style={{ color: r.losses > r.wins ? "var(--color-warm)" : "var(--color-text-primary)" }}>{r.losses}</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Recent */}
        {p.recent.length > 0 && (
          <Section title="Recent games">
            <div className="space-y-1.5">
              {p.recent.map((g, i) => {
                const rs = RESULT_STYLE[g.result] ?? RESULT_STYLE.solo;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-[16px] border border-white/5 bg-black/40 px-3 py-2 text-sm backdrop-blur-md shadow-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-[var(--font-mono)] text-[11px] font-bold" style={{ background: "color-mix(in srgb, " + rs.color + " 18%, transparent)", color: rs.color }}>{rs.label}</span>
                    <span className="flex-1 truncate">{gameName(g.game_type)}</span>
                    {g.opponent && <span className="truncate text-xs" style={{ color: MUTED }}>vs {g.opponent === "Caver" ? "Caver" : "@" + g.opponent}</span>}
                    <span className="shrink-0 font-[var(--font-mono)] text-xs" style={{ color: MUTED }}>{ago(g.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </motion.div>
      <RankModal open={rankOpen} onClose={() => setRankOpen(false)} meHandle={p.handle} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-2xl px-4 py-6 pb-24 sm:px-6">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
        Skycave
      </Link>
      {children}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-[var(--font-display)] text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
