// Thin REST client for the Skycave backend.
import type { GameInfo, Identity, Room } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "skycave_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ──
export async function guestLogin(displayName: string) {
  const data = await request<{ token: string; identity: Identity }>(
    "/auth/guest",
    { method: "POST", body: JSON.stringify({ display_name: displayName }) }
  );
  setToken(data.token);
  return data.identity;
}

/**
 * Finish Bluesky login: trade the sidecar's httpOnly session cookie for a
 * Skycave token. `credentials: "include"` sends the cookie (same-site). Returns
 * null if there's no valid session (e.g. user landed here without logging in).
 */
export async function completeBluesky(): Promise<Identity | null> {
  const res = await fetch(`${API}/auth/bluesky/complete`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { token: string; identity: Identity };
  setToken(data.token);
  return data.identity;
}

/**
 * LOCAL DEV ONLY. Mint a real (non-guest) identity from a Bluesky handle without
 * the OAuth dance, so the Cave can be exercised before the sidecar is deployed.
 * Backend returns 404 unless env == development; the UI only surfaces this when
 * NEXT_PUBLIC_DEV_LOGIN === "true".
 */
export async function devLogin(handle: string): Promise<Identity> {
  const data = await request<{ token: string; identity: Identity }>(
    "/auth/dev/login",
    { method: "POST", body: JSON.stringify({ handle }) }
  );
  setToken(data.token);
  return data.identity;
}

export async function fetchMe(): Promise<Identity | null> {
  try {
    return await request<Identity>("/auth/me");
  } catch {
    return null;
  }
}

/**
 * Log out. Clears the local Skycave token (works for guests too). For Bluesky
 * users it also asks the OAuth sidecar to revoke the AT Protocol session and
 * clear the httpOnly session cookie. Best-effort: the local clear always runs.
 */
export async function logout(isGuest: boolean): Promise<void> {
  if (!isGuest) {
    try {
      await fetch(`${API}/oauth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* best-effort; the local token clear below is what logs the app out */
    }
  }
  clearToken();
}

// ── Games ──
export const listGames = () => request<GameInfo[]>("/games");

// ── Player profile ──
export interface ProfileGame {
  game_type: string;
  best_score: number;
  plays: number;
}
export interface ProfileRecent {
  game_type: string;
  mode: string;
  result: "win" | "loss" | "draw" | "solo";
  opponent: string | null;
  your_score: number;
  created_at: string;
}
export interface ProfileRival {
  handle: string;
  wins: number;
  losses: number;
  games: number;
}
export interface ProfileBadge {
  key: string;
  label: string;
  detail: string;
}
export interface Profile {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  joined: string;
  games_played: number;
  games_won: number;
  win_rate: number;
  versus_played: number;
  versus_won: number;
  versus_lost: number;
  versus_win_rate: number;
  solo_played: number;
  total_score: number;
  rank: number;
  bests: ProfileGame[];
  recent: ProfileRecent[];
  rivals: ProfileRival[];
  badges: ProfileBadge[];
}
export const getProfile = (handle: string) =>
  request<Profile>(`/users/handle/${encodeURIComponent(handle)}/profile`);

export interface RankingEntry {
  rank: number;
  did: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  games_won: number;
  total_score: number;
}
export const getRanking = () =>
  request<{ entries: RankingEntry[] }>("/users/ranking");

// ── Rooms ──
export const createRoom = (
  gameType: string,
  mode: "versus" | "solo" | "daily" = "versus"
) =>
  request<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({ game_type: gameType, mode }),
  });

export const getRoom = (roomId: string) => request<Room>(`/rooms/${roomId}`);

export const joinRoom = (roomId: string) =>
  request<{ room: Room; you: import("./types").PlayerSlot }>(
    `/rooms/${roomId}/join`,
    { method: "POST" }
  );

// ── Sharing ──
export const getInvite = (roomId: string) =>
  request<{ text: string; intent_url: string }>(`/share/invite/${roomId}`);

// ── Leaderboard ──
export interface LeaderboardEntry {
  rank: number;
  did: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
}
export type LeaderboardPeriod = "all" | "week";
// "total" = cumulative points across every mode (used by Clay).
export type LeaderboardMode = "versus" | "solo" | "total";
export const getLeaderboard = (opts: {
  game: string;
  mode: LeaderboardMode;
  period?: LeaderboardPeriod;
  limit?: number;
}) =>
  request<{ entries: LeaderboardEntry[] }>(
    `/leaderboard?game=${opts.game}&mode=${opts.mode}` +
      `&period=${opts.period ?? "all"}&limit=${opts.limit ?? 25}`
  );

// ── Feedback ──
export const submitFeedback = (message: string, page?: string) =>
  request<{ ok: boolean }>("/feedback", {
    method: "POST",
    body: JSON.stringify({ message, page }),
  });

export const getScorecard = (roomId: string) =>
  request<{ text: string; intent_url: string; image_url: string | null }>(
    "/share/scorecard",
    { method: "POST", body: JSON.stringify({ room_id: roomId }) }
  );

export { API };

// ── Weekend tournament ──
export interface TournamentPlayer {
  did: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export interface TournamentMatch {
  round: number;
  slot: number;
  status: string;
  player1: TournamentPlayer | null;
  player2: TournamentPlayer | null;
  games: string[];
  game_names: string[];
  results: Record<string, unknown>[];
  winner_did: string | null;
  deadline: string | null;
  checked_in: string[];
}

export interface Tournament {
  id: string;
  name: string;
  status: string; // registering | locked | in_progress | finished
  max_players: number;
  entrants: number;
  spots_left: number;
  registration_closes_at: string;
  play_opens_at: string;
  play_closes_at: string;
  bracket_size: number;
  rounds: number;
  round_deadlines: { round: number; deadline: string }[];
  champion: TournamentPlayer | null;
  game_pool: string[];
  game_pool_names: string[];
  you: TournamentPlayer | null;
  you_registered: boolean;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
}

/** The live event, or null when none is running. Public: no auth needed. */
export const getCurrentTournament = () =>
  request<Tournament | null>("/tournaments/current");

export const getTournament = (id: string) =>
  request<Tournament>(`/tournaments/${id}`);

/** Take a seat. Needs a Bluesky identity; the server refuses guests. */
export const enterTournament = (id: string) =>
  request<Tournament>(`/tournaments/${id}/register`, { method: "POST" });

/** One game already played in a series, told from the viewer's side. */
export interface MatchLeg {
  game_type: string;
  game_name: string;
  winner_did: string | null;
  you_won: boolean;
  drawn: boolean;
  replay: boolean;
  your_score: number;
  their_score: number;
  room_id: string | null;
}

/** One fixture the viewer has already settled, for showing their climb. */
export interface RunStep {
  round: number;
  round_name: string;
  opponent: TournamentPlayer | null;
  your_wins: number;
  their_wins: number;
  bye: boolean;
  won: boolean;
}

export interface MyMatch {
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  round: number;
  slot: number;
  round_name: string;
  status: string; // pending | ready | live | done | bye
  you: TournamentPlayer;
  opponent: TournamentPlayer | null;
  games: string[];
  game_names: string[];
  current_game: string | null;
  current_game_name: string | null;
  game_number: number;
  legs: MatchLeg[];
  your_wins: number;
  their_wins: number;
  you_checked_in: boolean;
  opponent_checked_in: boolean;
  you_host: boolean;
  room_id: string | null;
  is_bye: boolean;
  eliminated: boolean;
  won_match: boolean;
  is_champion: boolean;
  deadline: string | null;
  run: RunStep[];
  prompt: string;
}

/** The viewer's own fixture. Null when they are not in this tournament. */
export const getMyMatch = (id: string) =>
  request<MyMatch | null>(`/tournaments/${id}/my-match`);

/** Say you are here. The room opens by itself once both of you have. */
export const checkInToMatch = (id: string) =>
  request<MyMatch>(`/tournaments/${id}/check-in`, { method: "POST" });

/**
 * Open the room for the game in play, or hand back the one already open.
 * The same call for game one and the decider, and safe to press twice.
 */
export const startMatchGame = (id: string) =>
  request<MyMatch>(`/tournaments/${id}/start`, { method: "POST" });
