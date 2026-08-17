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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
};

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
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
            <TrophyIcon size={20} />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Opening the Hall...
          </p>
        </div>
      </Shell>
    );
  }

  const ladder = [
    hof.longest_streak && {
      type: "streak",
      label: "Longest win streak",
      ...hof.longest_streak,
    },
    hof.most_wins && {
      type: "wins",
      label: "Most 1v1 wins",
      ...hof.most_wins,
    },
    hof.most_played && {
      type: "played",
      label: "Most games played",
      ...hof.most_played,
    },
  ].filter(Boolean) as {
    type: "streak" | "wins" | "played";
    label: string;
    player: HofPerson;
    value: number;
  }[];

  return (
    <Shell>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        <motion.div variants={itemVariants}>
          <Header />
        </motion.div>

        {/* Champions Section */}
        <motion.div variants={itemVariants}>
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
        </motion.div>

        {/* All-time Ladder Section */}
        {(ladder.length > 0 || hof.best_win_rate) && (
          <motion.div variants={itemVariants}>
            <Section title="All-time ladder">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ladder.map((s) => (
                  <StatCard
                    key={s.label}
                    type={s.type}
                    label={s.label}
                    player={s.player}
                    value={s.value.toLocaleString()}
                  />
                ))}
                {hof.best_win_rate && (
                  <StatCard
                    type="winrate"
                    label="Best win rate"
                    player={hof.best_win_rate.player}
                    value={`${Math.round(hof.best_win_rate.win_rate * 100)}%`}
                    sub={`${hof.best_win_rate.games_won}/${hof.best_win_rate.games_played}`}
                  />
                )}
              </div>
            </Section>
          </motion.div>
        )}

        {/* Highlights Section */}
        {(hof.longest_reign ||
          hof.biggest_1v1 ||
          hof.first_game ||
          (hof.first_champion && hof.champions.length > 1)) && (
          <motion.div variants={itemVariants}>
            <Section title="For the books">
              <div className="space-y-3">
                {hof.longest_reign && (
                  <HighlightCard
                    kicker="Longest reign at #1"
                    person={hof.longest_reign.player}
                    line={
                      `${hof.longest_reign.days} ${
                        hof.longest_reign.days === 1 ? "day" : "days"
                      } atop ${gameName(hof.longest_reign.game_type)} solo` +
                      ` · ${hof.longest_reign.best_score.toLocaleString()} best` +
                      (hof.longest_reign.current ? " · still reigning" : "")
                    }
                  />
                )}
                {hof.biggest_1v1 && (
                  <HighlightCard
                    kicker="Biggest 1v1 score"
                    person={hof.biggest_1v1.player}
                    line={`${hof.biggest_1v1.score.toLocaleString()} in a game of ${gameName(
                      hof.biggest_1v1.game_type
                    )}`}
                  />
                )}
                {hof.first_game && (
                  <HighlightCard
                    kicker="The very first game"
                    person={hof.first_game.player}
                    line={
                      `${gameName(hof.first_game.game_type)}` +
                      (hof.first_game.opponent
                        ? ` vs ${personName(hof.first_game.opponent)}`
                        : "") +
                      ` · ${fmtDate(hof.first_game.date)}`
                    }
                  />
                )}
                {hof.first_champion && hof.champions.length > 1 && (
                  <HighlightCard
                    kicker="The first champion"
                    person={hof.first_champion.player}
                    line={`${hof.first_champion.tournament_name}${
                      hof.first_champion.date
                        ? ` · ${fmtDate(hof.first_champion.date)}`
                        : ""
                    }`}
                  />
                )}
              </div>
            </Section>
          </motion.div>
        )}

        <motion.p
          variants={itemVariants}
          className="pt-4 text-center text-xs text-[var(--color-text-secondary)]"
        >
          Records update through the day. Win to take your place here.
        </motion.p>
      </motion.div>
    </Shell>
  );
}

/* ---- Component Pieces ---- */

function Header() {
  return (
    <div className="relative text-center">
      {/* Background Radial Glow */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-48 w-80 -translate-x-1/2 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(234, 179, 8, 0.18) 0%, rgba(234, 179, 8, 0.04) 50%, transparent 80%)",
        }}
      />
      <span
        className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.2em] shadow-sm backdrop-blur-sm transition-transform hover:scale-105"
        style={{
          borderColor: "color-mix(in srgb, var(--color-gold) 50%, transparent)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--color-gold) 15%, transparent), color-mix(in srgb, var(--color-gold) 5%, transparent))",
          color: GOLD,
        }}
      >
        <TrophyIcon size={12} /> Skycave
      </span>
      <h1 className="mt-3 font-[var(--font-display)] text-4xl font-bold tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-300">
        Hall of Fame
      </h1>
      <p className="mx-auto mt-2.5 max-w-sm text-sm text-[var(--color-text-secondary)] leading-relaxed">
        The permanent record. Champions, all-time bests, and standing records.
      </p>
    </div>
  );
}

function ChampionHero({
  champ,
  titles,
}: {
  champ: HofChampion;
  titles: HallOfFame["most_titles"];
}) {
  const isGuest = champ.player.is_guest;
  const content = (
    <div
      className="group relative overflow-hidden rounded-[22px] border p-5.5 backdrop-blur-md transition-all duration-300 hover:scale-[1.01]"
      style={{
        borderColor: "color-mix(in srgb, var(--color-gold) 55%, transparent)",
        background:
          "linear-gradient(145deg, color-mix(in srgb, var(--color-gold) 18%, transparent) 0%, color-mix(in srgb, var(--color-gold) 6%, transparent) 50%, var(--color-surface) 100%)",
        boxShadow:
          "0 8px 32px -8px color-mix(in srgb, var(--color-gold) 20%, transparent), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)",
      }}
    >
      {/* Metallic Shimmer Overlay */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-200/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

      <div
        className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.2em] font-medium"
        style={{ color: GOLD }}
      >
        Reigning champion
      </div>

      <div className="mt-3.5 flex items-center gap-4">
        {/* Avatar with Gold Crown Ring */}
        <div className="relative">
          <div
            className="rounded-full p-1 border shadow-md"
            style={{
              borderColor: "color-mix(in srgb, var(--color-gold) 80%, transparent)",
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-gold) 40%, transparent), transparent)",
            }}
          >
            <Avatar
              id={champ.player.did}
              name={champ.player.display_name ?? champ.player.handle}
              avatarUrl={champ.player.avatar_url}
              size={56}
            />
          </div>
          <span className="absolute -right-1.5 -top-1.5 drop-shadow-md transition-transform group-hover:rotate-12">
            <TrophyIcon size={22} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-[var(--font-display)] text-xl font-bold tracking-tight text-white group-hover:text-[var(--color-gold)] transition-colors">
            {personName(champ.player)}
          </div>
          <div className="mt-1 text-xs text-[var(--color-text-secondary)] font-medium">
            {champ.tournament_name}
            {champ.date ? ` · ${fmtDate(champ.date)}` : ""}
          </div>
        </div>
      </div>

      {titles && titles.titles > 1 && (
        <div
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-[var(--font-mono)] text-[11px] font-medium shadow-sm"
          style={{
            background: "color-mix(in srgb, var(--color-gold) 16%, transparent)",
            borderColor: "color-mix(in srgb, var(--color-gold) 30%, transparent)",
            color: GOLD,
          }}
        >
          Most titles · {personName(titles.player)} ({titles.titles})
        </div>
      )}
    </div>
  );

  if (isGuest) return content;
  return <Link href={`/u/${champ.player.handle}`}>{content}</Link>;
}

function ChampionRow({ champ }: { champ: HofChampion }) {
  const isGuest = champ.player.is_guest;
  const content = (
    <div
      className="group flex items-center gap-3.5 rounded-[16px] border px-4 py-3 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)]/50"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <Avatar
        id={champ.player.did}
        name={champ.player.display_name ?? champ.player.handle}
        avatarUrl={champ.player.avatar_url}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white group-hover:text-[var(--color-gold)] transition-colors">
          {personName(champ.player)}
        </div>
        <div className="text-xs text-[var(--color-text-secondary)]">
          {champ.tournament_name}
          {champ.date ? ` · ${fmtDate(champ.date)}` : ""}
        </div>
      </div>
      <TrophyIcon size={16} muted />
    </div>
  );

  if (isGuest) return content;
  return <Link href={`/u/${champ.player.handle}`}>{content}</Link>;
}

function StatCard({
  type,
  label,
  player,
  value,
  sub,
}: {
  type: "streak" | "wins" | "played" | "winrate";
  label: string;
  player: HofPerson;
  value: string;
  sub?: string;
}) {
  const isGuest = player.is_guest;
  const content = (
    <div
      className="group flex flex-col justify-between rounded-[18px] border p-4 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)] font-medium">
            {label}
          </span>
          <StatIcon type={type} />
        </div>
        <div
          className="mt-2.5 font-[var(--font-display)] text-2xl font-bold tabular-nums tracking-tight"
          style={{ color: GOLD }}
        >
          {value}
          {sub && (
            <span className="ml-1.5 text-xs font-normal text-[var(--color-text-secondary)]">
              {sub}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2 pt-2.5 border-t border-[var(--color-border)]/50">
        <Avatar
          id={player.did}
          name={player.display_name ?? player.handle}
          avatarUrl={player.avatar_url}
          size={24}
        />
        <span className="truncate text-xs font-medium text-slate-200 group-hover:text-[var(--color-gold)] transition-colors">
          {personName(player)}
        </span>
      </div>
    </div>
  );

  if (isGuest) return content;
  return <Link href={`/u/${player.handle}`}>{content}</Link>;
}

function HighlightCard({
  kicker,
  person,
  line,
}: {
  kicker: string;
  person: HofPerson;
  line: string;
}) {
  const isGuest = person.is_guest;
  const content = (
    <div
      className="group flex items-center gap-3.5 rounded-[16px] border px-4 py-3.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)]/50"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <Avatar
        id={person.did}
        name={person.display_name ?? person.handle}
        avatarUrl={person.avatar_url}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <div
          className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] font-medium"
          style={{ color: GOLD }}
        >
          {kicker}
        </div>
        <div className="text-sm font-semibold text-white group-hover:text-[var(--color-gold)] transition-colors">
          {personName(person)}
        </div>
        <div className="truncate text-xs text-[var(--color-text-secondary)]">
          {line}
        </div>
      </div>
    </div>
  );

  if (isGuest) return content;
  return <Link href={`/u/${person.handle}`}>{content}</Link>;
}

function personName(p: HofPerson): string {
  return p.display_name || `@${p.handle}`;
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
    <section className="mt-6">
      <h2
        className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.2em] font-medium"
        style={{ color: accent ? GOLD : "var(--color-text-secondary)" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
          {subtitle}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[20px] border border-dashed p-6 text-center text-sm text-[var(--color-text-secondary)] backdrop-blur-sm"
      style={{ borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

/* ---- Vector SVG Icons (No Emojis) ---- */

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

function StatIcon({ type }: { type: "streak" | "wins" | "played" | "winrate" }) {
  const stroke = "var(--color-gold)";
  if (type === "streak") {
    // Flame SVG
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    );
  }
  if (type === "wins") {
    // Swords SVG
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5" />
        <line x1="13" y1="19" x2="19" y2="13" />
        <line x1="16" y1="16" x2="20" y2="20" />
        <line x1="19" y1="21" x2="21" y2="19" />
        <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5" />
        <line x1="5" y1="14" x2="9" y2="18" />
        <line x1="7" y1="17" x2="4" y2="20" />
        <line x1="3" y1="19" x2="5" y2="21" />
      </svg>
    );
  }
  if (type === "played") {
    // Gamepad SVG
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="6" y1="12" x2="10" y2="12" />
        <line x1="8" y1="10" x2="8" y2="14" />
        <circle cx="15" cy="13" r="1" fill={stroke} />
        <circle cx="18" cy="11" r="1" fill={stroke} />
        <rect x="2" y="6" width="20" height="12" rx="6" />
      </svg>
    );
  }
  // Target / Win Rate SVG
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto min-h-[100dvh] w-full max-w-xl px-4 pb-16 pt-8">
      <div className="mb-6">
        <BackButton href="/" label="Hub" />
      </div>
      {children}
    </main>
  );
}
