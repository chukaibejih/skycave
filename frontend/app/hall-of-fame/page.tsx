"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { BackButton } from "@/components/nav/BackButton";
import { gameName } from "@/lib/gameNames";
import {
  getHallOfFame,
  type HallOfFame,
  type HofPerson,
  type HofChampion,
} from "@/lib/api";

const GOLD = "var(--color-gold)";

export default function HallOfFamePage() {
  const [hof, setHof] = useState<HallOfFame | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getHallOfFame().then(setHof).catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <Shell>
        <p className="text-center text-[var(--color-text-secondary)]">
          The Hall is closed for a moment. Try again shortly.
        </p>
      </Shell>
    );
  }
  if (!hof) {
    return (
      <Shell>
        <p className="text-center text-[var(--color-text-secondary)]">Opening the Hall...</p>
      </Shell>
    );
  }

  const ladder = [
    hof.longest_streak && { label: "Longest win streak", ...hof.longest_streak },
    hof.most_wins && { label: "Most 1v1 wins", ...hof.most_wins },
    hof.most_played && { label: "Most games played", ...hof.most_played },
  ].filter(Boolean) as { label: string; player: HofPerson; value: number }[];

  return (
    <Shell>
      <Header />

      {/* The wall: champions. */}
      <Section title="Champions" accent>
        {hof.champions.length === 0 ? (
          <Empty>
            No champion crowned yet. The first Weekend Cup winner takes this throne.
          </Empty>
        ) : (
          <div className="space-y-3">
            <ChampionHero champ={hof.champions[0]} titles={hof.most_titles} />
            {hof.champions.slice(1).map((c) => (
              <ChampionRow key={c.tournament_id} champ={c} />
            ))}
          </div>
        )}
      </Section>

      {/* All-time ladder. */}
      {(ladder.length > 0 || hof.best_win_rate) && (
        <Section title="All-time ladder">
          <div className="grid grid-cols-2 gap-3">
            {ladder.map((s) => (
              <StatCard key={s.label} label={s.label} player={s.player} value={s.value.toLocaleString()} />
            ))}
            {hof.best_win_rate && (
              <StatCard
                label="Best win rate"
                player={hof.best_win_rate.player}
                value={`${Math.round(hof.best_win_rate.win_rate * 100)}%`}
                sub={`${hof.best_win_rate.games_won}/${hof.best_win_rate.games_played}`}
              />
            )}
          </div>
        </Section>
      )}

      {/* Highlights + firsts. */}
      {(hof.biggest_1v1 || hof.first_game || (hof.first_champion && hof.champions.length > 1)) && (
        <Section title="For the books">
          <div className="space-y-3">
            {hof.biggest_1v1 && (
              <HighlightCard
                kicker="Biggest 1v1 score"
                person={hof.biggest_1v1.player}
                line={`${hof.biggest_1v1.score.toLocaleString()} in a game of ${gameName(hof.biggest_1v1.game_type)}`}
              />
            )}
            {hof.first_game && (
              <HighlightCard
                kicker="The very first game"
                person={hof.first_game.player}
                line={
                  `${gameName(hof.first_game.game_type)}` +
                  (hof.first_game.opponent ? ` vs ${personName(hof.first_game.opponent)}` : "") +
                  ` · ${fmtDate(hof.first_game.date)}`
                }
              />
            )}
            {hof.first_champion && hof.champions.length > 1 && (
              <HighlightCard
                kicker="The first champion"
                person={hof.first_champion.player}
                line={`${hof.first_champion.tournament_name}${hof.first_champion.date ? ` · ${fmtDate(hof.first_champion.date)}` : ""}`}
              />
            )}
          </div>
        </Section>
      )}

      <p className="mt-10 text-center text-xs text-[var(--color-text-secondary)]">
        Records update through the day. Win to take your place here.
      </p>
    </Shell>
  );
}

/* ---- pieces ---- */

function Header() {
  return (
    <div className="text-center">
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]"
        style={{ borderColor: "color-mix(in srgb, var(--color-gold) 45%, transparent)", color: GOLD }}
      >
        <TrophyIcon size={11} /> Skycave
      </span>
      <h1 className="mt-3 font-[var(--font-display)] text-4xl font-bold leading-tight">Hall of Fame</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--color-text-secondary)]">
        The permanent record. Champions, all-time bests, and every game's standing high score.
      </p>
    </div>
  );
}

function ChampionHero({ champ, titles }: { champ: HofChampion; titles: HallOfFame["most_titles"] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[20px] border p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--color-gold) 55%, transparent)",
        background:
          "linear-gradient(155deg, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 62%), var(--color-surface)",
      }}
    >
      <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
        Reigning champion
      </div>
      <div className="mt-3 flex items-center gap-3.5">
        <div className="relative">
          <Avatar id={champ.player.did} name={champ.player.display_name ?? champ.player.handle} avatarUrl={champ.player.avatar_url} size={58} />
          <span className="absolute -right-1 -top-1"><TrophyIcon size={20} /></span>
        </div>
        <div className="min-w-0">
          <PersonName person={champ.player} className="font-[var(--font-display)] text-xl font-bold" />
          <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
            {champ.tournament_name}
            {champ.date ? ` · ${fmtDate(champ.date)}` : ""}
          </div>
        </div>
      </div>
      {titles && titles.titles > 1 && (
        <div
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-[var(--font-mono)] text-[11px]"
          style={{ background: "color-mix(in srgb, var(--color-gold) 14%, transparent)", color: GOLD }}
        >
          Most titles · {personName(titles.player)} ({titles.titles})
        </div>
      )}
    </motion.div>
  );
}

function ChampionRow({ champ }: { champ: HofChampion }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <Avatar id={champ.player.did} name={champ.player.display_name ?? champ.player.handle} avatarUrl={champ.player.avatar_url} size={38} />
      <div className="min-w-0 flex-1">
        <PersonName person={champ.player} className="text-sm font-semibold" />
        <div className="text-xs text-[var(--color-text-secondary)]">
          {champ.tournament_name}
          {champ.date ? ` · ${fmtDate(champ.date)}` : ""}
        </div>
      </div>
      <TrophyIcon size={16} muted />
    </div>
  );
}

function StatCard({ label, player, value, sub }: { label: string; player: HofPerson; value: string; sub?: string }) {
  return (
    <div className="rounded-[16px] border p-3.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
        {label}
      </div>
      <div className="mt-2 font-[var(--font-display)] text-2xl font-bold tabular-nums" style={{ color: GOLD }}>
        {value}
        {sub && <span className="ml-1.5 text-xs font-medium text-[var(--color-text-secondary)]">{sub}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Avatar id={player.did} name={player.display_name ?? player.handle} avatarUrl={player.avatar_url} size={22} />
        <PersonName person={player} className="truncate text-xs font-medium" />
      </div>
    </div>
  );
}

function HighlightCard({ kicker, person, line }: { kicker: string; person: HofPerson; line: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <Avatar id={person.did} name={person.display_name ?? person.handle} avatarUrl={person.avatar_url} size={38} />
      <div className="min-w-0 flex-1">
        <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em]" style={{ color: GOLD }}>
          {kicker}
        </div>
        <PersonName person={person} className="text-sm font-semibold" />
        <div className="truncate text-xs text-[var(--color-text-secondary)]">{line}</div>
      </div>
    </div>
  );
}

function personName(p: HofPerson): string {
  return p.display_name || `@${p.handle}`;
}

/** A player's name, linking to their profile unless they are a guest. */
function PersonName({ person, className }: { person: HofPerson; className?: string }) {
  const label = personName(person);
  if (person.is_guest) return <span className={className}>{label}</span>;
  return (
    <Link href={`/u/${person.handle}`} className={`${className ?? ""} transition-opacity hover:opacity-80`} title={`@${person.handle}`}>
      {label}
    </Link>
  );
}

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2
        className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]"
        style={{ color: accent ? GOLD : "var(--color-text-secondary)" }}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[16px] border border-dashed p-5 text-center text-sm text-[var(--color-text-secondary)]"
      style={{ borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

function TrophyIcon({ size = 16, muted }: { size?: number; muted?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={muted ? "var(--color-text-secondary)" : "var(--color-gold)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-xl px-4 pb-16 pt-8">
      <div className="mb-6">
        <BackButton href="/" label="Hub" />
      </div>
      {children}
    </main>
  );
}
