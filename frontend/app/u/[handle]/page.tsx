"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
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

  return (
    <Shell>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Avatar id={p.handle} name={p.display_name ?? p.handle} avatarUrl={p.avatar_url} size={72} />
          <div className="min-w-0">
            <h1 className="truncate font-[var(--font-display)] text-2xl font-bold sm:text-3xl">{p.display_name ?? p.handle}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm" style={{ color: MUTED }}>
              <a href={`https://bsky.app/profile/${p.handle}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">@{p.handle}</a>
              <span>member since {joinedLabel(p.joined)}</span>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-[14px] border p-3 text-center sm:p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
              <div className="font-[var(--font-display)] text-2xl font-bold sm:text-3xl">{s.value}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: MUTED }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* 1v1 / solo breakdown — spells out what the tiles summarize */}
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

        {/* Badges */}
        {p.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {p.badges.map((b) => (
              <span key={b.key} title={b.detail} className="rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: "var(--color-primary)", color: "var(--color-text-primary)", background: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}>
                {b.label}
              </span>
            ))}
          </div>
        )}

        <button onClick={share} className="mt-5 h-11 w-full rounded-[12px] text-sm font-semibold" style={{ background: "var(--color-primary)", color: "#05060a" }}>
          {isMe ? "Share my profile" : "Share profile"}
        </button>

        {/* Records */}
        {p.bests.length > 0 && (
          <Section title="Personal bests">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {p.bests.map((b) => (
                <div key={b.game_type} className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
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
                <div key={r.handle} className="flex items-center justify-between rounded-[10px] border px-4 py-2.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                  <Link href={`/u/${r.handle}`} className="truncate text-sm underline-offset-2 hover:underline">@{r.handle}</Link>
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
                  <div key={i} className="flex items-center gap-3 rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
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
