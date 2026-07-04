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

export async function fetchMe(): Promise<Identity | null> {
  try {
    return await request<Identity>("/auth/me");
  } catch {
    return null;
  }
}

// ── Games ──
export const listGames = () => request<GameInfo[]>("/games");

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
export const getLeaderboard = (period: LeaderboardPeriod = "all", limit = 25) =>
  request<{ entries: LeaderboardEntry[] }>(
    `/leaderboard?period=${period}&limit=${limit}`
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
