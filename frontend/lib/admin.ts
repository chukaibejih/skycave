// Backoffice API client. Uses a separate admin token (not the player token).
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const KEY = "skycave_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}
export function setAdminToken(t: string) {
  window.localStorage.setItem(KEY, t);
}
export function clearAdminToken() {
  window.localStorage.removeItem(KEY);
}

export class AdminAuthError extends Error {}

async function adminGet<T>(path: string): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new AdminAuthError("Session expired");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.json() as Promise<T>;
}

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch(`${API}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).detail ?? "Login failed";
    throw new Error(detail);
  }
  setAdminToken((await res.json()).token);
}

// ── Types ──
export interface Overview {
  users: number;
  games_played: number;
  games_24h: number;
  active_rooms: number;
  rooms_in_progress: number;
  by_game: { game_type: string; count: number }[];
}
export interface UserRow {
  did: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
}
export interface GameRow {
  id: number;
  game_type: string;
  mode: string;
  player1_handle: string;
  player1_score: number;
  player2_handle: string | null;
  player2_score: number;
  winner_id: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: number;
  message: string;
  submitter_handle: string | null;
  is_guest: boolean;
  page: string | null;
  created_at: string;
}

export const getOverview = () => adminGet<Overview>("/admin/overview");
export const getUsers = (limit = 100) =>
  adminGet<{ total: number; users: UserRow[] }>(`/admin/users?limit=${limit}`);
export const getGames = (limit = 100) =>
  adminGet<{ total: number; games: GameRow[] }>(`/admin/games?limit=${limit}`);
export const getFeedback = (limit = 200) =>
  adminGet<{ total: number; feedback: FeedbackRow[] }>(
    `/admin/feedback?limit=${limit}`
  );
