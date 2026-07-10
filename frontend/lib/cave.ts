// API client for The Cave. Uses the player's Bluesky token (no guests). The
// server role-filters every room read; this client just types the calls.
import { getToken } from "./api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class CaveError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
    this.name = "CaveError";
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}/cave${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    const msg = typeof detail === "string" ? detail : (detail as { message?: string })?.message ?? "Request failed";
    throw new CaveError(res.status, msg, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ── Types ──
export type Assignment = "A" | "B" | "both";
export type Difficulty = "easy" | "medium" | "hard";

export interface Evidence {
  id: string;
  type: string;
  content: string;
  assignment: Assignment;
  is_red_herring: boolean;
  order: number;
}
export interface SuspicionOption {
  key: string;
  label: string;
}
export interface CaseFull {
  id: string;
  title: string;
  premise: string;
  difficulty: Difficulty;
  case_type: string;
  answer: string;
  correct_text: string;
  wrong_text: string;
  allow_resubmit: boolean;
  suspicion_options: SuspicionOption[];
  status: "draft" | "published" | "archived";
  attempts: number;
  solves: number;
  fails: number;
  checklist_errors: string[];
  evidence: Evidence[];
}
export interface CaseCard {
  id: string;
  title: string;
  premise: string;
  difficulty: Difficulty;
  architect_handle: string;
  attempts: number;
  solves: number;
  published_at: string | null;
}
export interface RoomEvidence {
  id: string;
  type: string;
  content: string;
  shared: boolean;
}
export interface NoteEntry {
  role: "A" | "B";
  handle: string;
  content: string;
  created_at: string;
}
export interface RoomState {
  room_id: string;
  status: "waiting" | "active" | "solved" | "failed";
  case: { id: string; title: string; premise: string; difficulty: Difficulty; architect_handle: string };
  your_role: "A" | "B";
  your_evidence: RoomEvidence[];
  partner: { handle: string | null; present: boolean; private_count: number };
  notepad: NoteEntry[];
  cursor: number;
  suspicion_options: SuspicionOption[];
  suspicion: Record<string, string>;
  verdict: { answer: string | null; a_confirmed: boolean; b_confirmed: boolean; your_confirmed: boolean; can_submit: boolean };
}
export interface Reveal {
  outcome: "solved" | "failed";
  correct: boolean;
  verdict_text: string;
  answer: string;
  your_answer: string | null;
  allow_resubmit: boolean;
  solvers: { A: string; B: string | null };
  evidence: { type: string; content: string; assignment: Assignment; is_red_herring: boolean }[];
}
export interface ArchitectCase extends CaseCard {
  status: string;
  fails: number;
  in_progress: number;
}
export interface SolverRoom {
  room_id: string;
  case_title: string;
  case_id: string;
  status: string;
  your_role: "A" | "B" | null;
  created_at: string;
}

// ── Builder ──
export const createCase = () => req<{ id: string; status: string }>("/cases", { method: "POST" });
export const getCaseEdit = (id: string) => req<CaseFull>(`/cases/${id}/edit`);
export const updateCase = (id: string, patch: Partial<CaseFull> & { answer?: string }) =>
  req<CaseFull>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const addEvidence = (id: string, ev: Partial<Evidence>) =>
  req<{ id: string }>(`/cases/${id}/evidence`, { method: "POST", body: JSON.stringify(ev) });
export const updateEvidence = (id: string, eid: string, ev: Partial<Evidence>) =>
  req(`/cases/${id}/evidence/${eid}`, { method: "PATCH", body: JSON.stringify(ev) });
export const deleteEvidence = (id: string, eid: string) =>
  req(`/cases/${id}/evidence/${eid}`, { method: "DELETE" });
export const publishCase = (id: string) =>
  req<{ id: string; status: string }>(`/cases/${id}/publish`, { method: "POST" });

// ── Discovery + solve ──
export const browseCases = (opts: { unsolved?: boolean; difficulty?: string; sort?: string } = {}) => {
  const q = new URLSearchParams();
  if (opts.unsolved) q.set("unsolved", "true");
  if (opts.difficulty) q.set("difficulty", opts.difficulty);
  if (opts.sort) q.set("sort", opts.sort);
  return req<{ cases: CaseCard[] }>(`/cases?${q.toString()}`);
};
export const getCasePreview = (id: string) => req<CaseCard>(`/cases/${id}`);
export const claimRoom = (id: string) =>
  req<{ room_id: string; role: "A" | "B"; status: string }>(`/cases/${id}/rooms`, { method: "POST" });
export const getRoom = (roomId: string, since = 0) => req<RoomState>(`/rooms/${roomId}?since=${since}`);
export const addNote = (roomId: string, content: string) =>
  req<{ id: number }>(`/rooms/${roomId}/notepad`, { method: "POST", body: JSON.stringify({ content }) });
export const setSuspicion = (roomId: string, option_key: string, status: string) =>
  req(`/rooms/${roomId}/suspicion`, { method: "PATCH", body: JSON.stringify({ option_key, status }) });
export const confirmVerdict = (roomId: string, answer: string) =>
  req<{ status: string; a_confirmed: boolean; b_confirmed: boolean; resolved: boolean; correct: boolean | null }>(
    `/rooms/${roomId}/confirm`,
    { method: "POST", body: JSON.stringify({ answer }) }
  );
export const getReveal = (roomId: string) => req<Reveal>(`/rooms/${roomId}/reveal`);
export const myCases = () => req<{ cases: ArchitectCase[] }>("/architect/cases");
export const myRooms = () => req<{ rooms: SolverRoom[] }>("/solver/rooms");
