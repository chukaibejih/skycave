"use client";
import { TournamentBanner } from "@/components/tournament/TournamentBanner";
import { TournamentHero } from "@/components/tournament/TournamentHero";
import type { Tournament, TournamentMatch, TournamentPlayer } from "@/lib/api";

/**
 * The weekly theme harness: renders the hub card and the "This weekend" hero in
 * every state with mock data, so each week's new palette (see
 * tournament-themes.md) can be checked without a live tournament. Not linked
 * from anywhere - visit /tournament/preview directly when reskinning.
 */

const H = 3600e3;

function mock(over: Partial<Tournament>): Tournament {
  const now = Date.now();
  return {
    id: "preview",
    name: "Skycave Weekend Tournament",
    status: "registering",
    max_players: 64,
    entrants: 41,
    spots_left: 23,
    registration_closes_at: new Date(now + 30 * H).toISOString(),
    countdown_from: new Date(now - H).toISOString(), // in the past, so the clock ticks
    play_opens_at: new Date(now + 40 * H).toISOString(),
    play_closes_at: new Date(now + 100 * H).toISOString(),
    bracket_size: 64,
    rounds: 6,
    round_deadlines: [],
    champion: null,
    game_pool: [],
    game_pool_names: [],
    you: null,
    you_registered: false,
    players: [],
    matches: [],
    ...over,
  };
}

const champ: TournamentPlayer = {
  did: "did:plc:x",
  handle: "westcoastbaddie.blacksky.app",
  display_name: "west coast baddie ✨",
  avatar_url: null,
};

const liveMatch: TournamentMatch = {
  round: 1,
  slot: 0,
  status: "live",
  player1: null,
  player2: null,
  games: [],
  game_names: [],
  results: [],
  winner_did: null,
  deadline: null,
  checked_in: [],
  in_play: true,
};

const STATES: { label: string; t: Tournament }[] = [
  { label: "Registration open", t: mock({}) },
  { label: "Last call (under 12h)", t: mock({ registration_closes_at: new Date(Date.now() + 5 * H).toISOString(), spots_left: 4 }) },
  { label: "The final is on", t: mock({ status: "in_progress", rounds: 1, matches: [liveMatch] }) },
  { label: "Champion crowned", t: mock({ status: "finished", champion: champ }) },
];

export default function TournamentThemePreview() {
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-16 pt-6">
      <h1 className="font-[var(--font-display)] text-xl font-bold text-[var(--color-text-primary)]">
        Tournament card · ocean / beach
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Preview only. The card as it reads on the hub, in each state.
      </p>
      <div className="mt-6 space-y-8">
        {STATES.map((s) => (
          <div key={s.label}>
            <div className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {s.label}
            </div>
            <TournamentBanner preview={s.t} />
          </div>
        ))}
      </div>

      <h1 className="mt-14 font-[var(--font-display)] text-xl font-bold text-[var(--color-text-primary)]">
        &ldquo;This weekend&rdquo; hero · ocean / beach
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        The centrepiece of the tournament page, in each state.
      </p>
      <div className="mt-6 space-y-8">
        {STATES.map((s) => (
          <div key={`hero-${s.label}`}>
            <div className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
              {s.label}
            </div>
            <TournamentHero t={s.t} />
          </div>
        ))}
      </div>
    </main>
  );
}
