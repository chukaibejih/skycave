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

async function adminSend<T = void>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new AdminAuthError("Session expired");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const setFeedbackResolved = (id: number, resolved: boolean) =>
  adminSend(`/admin/feedback/${id}`, "PATCH", { resolved });

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
  created_at: string | null;
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
  resolved: boolean;
}

export interface DayBucket {
  date: string;
  versus: number;
  solo: number;
  users: number;
  feedback: number;
}
export interface Timeseries {
  days: number;
  buckets: DayBucket[];
}

export interface Insights {
  plays: { guest: number; bluesky: number };
  funnel: { filled: number; expired: number };
  feedback_by_page: { label: string; count: number }[];
  feedback_by_device: { mobile: number; desktop: number; unknown: number };
  active: { dau: number; wau: number; mau: number };
  retention: { new: number; returning: number };
  top_players: {
    handle: string;
    games: number;
    versus_games: number;
    solo: number;
    wins: number;
    win_rate: number;
  }[];
  game_balance: {
    game_type: string;
    games: number;
    versus: number;
    solo: number;
    decisive: number;
    first_player_win_rate: number;
    draw_rate: number;
    avg_score: number;
  }[];
}
export const getInsights = () => adminGet<Insights>("/admin/insights");

export const getOverview = () => adminGet<Overview>("/admin/overview");
export const getTimeseries = (days = 30) =>
  adminGet<Timeseries>(`/admin/timeseries?days=${days}`);
export type UserSort = "created" | "played" | "won" | "win_rate" | "score";
export const getUsers = (
  limit = 25,
  offset = 0,
  opts: { q?: string; sort?: UserSort; order?: "asc" | "desc" } = {},
) => {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts.q) p.set("q", opts.q);
  if (opts.sort) p.set("sort", opts.sort);
  if (opts.order) p.set("order", opts.order);
  return adminGet<{ total: number; users: UserRow[] }>(`/admin/users?${p}`);
};
export const getGames = (
  limit = 25,
  offset = 0,
  opts: { game_type?: string; mode?: string; q?: string } = {},
) => {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts.game_type) p.set("game_type", opts.game_type);
  if (opts.mode) p.set("mode", opts.mode);
  if (opts.q) p.set("q", opts.q);
  return adminGet<{ total: number; games: GameRow[] }>(`/admin/games?${p}`);
};
export const getFeedback = (limit = 15, offset = 0, resolved?: boolean) => {
  const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (resolved !== undefined) p.set("resolved", String(resolved));
  return adminGet<{ total: number; feedback: FeedbackRow[] }>(`/admin/feedback?${p}`);
};

// ── Session management ──
export const recomputeUser = (did: string) =>
  adminSend<{ did: string; games_played: number; games_won: number; total_score: number }>(
    `/admin/users/${encodeURIComponent(did)}/recompute`,
    "POST",
  );
export const deleteGame = (id: number) => adminSend(`/admin/games/${id}`, "DELETE");

export interface TournamentAdminRow {
  id: string;
  name: string;
  status: string;
  entrants: number;
  max_players: number;
  rounds: number;
  champion: string | null;
  created_at: string;
  registration_closes_at: string;
  matches_done: number;
  matches_total: number;
}
export interface TournamentsAdmin {
  summary: {
    total: number;
    registering: number;
    live: number;
    finished: number;
    unique_entrants: number;
    series_played: number;
  };
  tournaments: TournamentAdminRow[];
}
export const getTournamentsAdmin = () =>
  adminGet<TournamentsAdmin>("/admin/tournaments");
