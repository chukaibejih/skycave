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
  total_score: number;
  rank: number;
  bests: ProfileGame[];
  recent: ProfileRecent[];
  rivals: ProfileRival[];
  badges: ProfileBadge[];
}
export const getProfile = (handle: string) =>
  request<Profile>(`/users/handle/${encodeURIComponent(handle)}/profile`);

// ── Rooms ──
export const createRoom = (
  gameType: string,
  mode: "versus" | "solo" = "versus"
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
export type LeaderboardMode = "versus" | "solo";
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
