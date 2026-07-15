// Shared types mirroring the backend schemas + WebSocket protocol.

export interface Identity {
  id: string; // DID or guest:<id>
  is_guest: boolean;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PlayerSlot extends Identity {
  connected: boolean;
  ready: boolean;
}

export type RoomStatus = "waiting" | "in_progress" | "finished" | "expired";

export type RoomMode = "versus" | "solo";

export interface SoloSummary {
  player_id: string;
  score: number;
  metric: string; // e.g. "18,420 pts · 5 rounds"
  is_best: boolean | null; // null for guests (decided client-side)
  prev_best: number | null;
}

export interface GameInfo {
  type: string;
  name: string;
  tagline: string;
  total_rounds: number;
  mode: "race" | "simultaneous" | "turn_based";
  min_players: number;
  max_players: number;
}

export interface GameState {
  game_type: string;
  total_rounds: number;
  mode: "race" | "simultaneous" | "turn_based";
  round: number;
  phase: "starting" | "active" | "round_over" | "finished";
  scores: Record<string, number>;
  history: { round: number; points: Record<string, number> }[];
  round_data: Record<string, unknown> | null;
  round_ends_at?: number | null;
  last_result?: Record<string, unknown> | null;
  my_round_state?: { locked?: boolean; submitted?: boolean } | null;
  solo_summary?: SoloSummary | null;
}

export interface Room {
  id: string;
  game_type: string;
  game_name?: string;
  mode?: RoomMode;
  status: RoomStatus;
  host_id: string;
  host_handle: string;
  players: PlayerSlot[];
  game?: GameState | null;
  invite_url?: string;
  expires_at?: number | null; // unix seconds; waiting versus room auto-close time
  series?: Record<string, number>; // wins per player id across rematches in this room
}

// Turn-based board (Tile Takeover). Sent via GAME_STATE / ROOM_STATE.
export interface BoardState {
  cols: number;
  rows: number;
  owner: (string | null)[];
  order: string[];
  turn: string;
  scores: Record<string, number>;
  // Tile Takeover only (present on tile_takeover boards).
  ncolors: number;
  tiles: number[];
  pcolor: Record<string, number>;
  // Connect 4 only (present on connect4 boards).
  winner?: string | null;
  win_cells?: number[];
  // Dots and Boxes only (present on dots_boxes boards).
  num_h?: number;
  h?: (string | null)[];
  v?: (string | null)[];
  boxes?: (string | null)[];
}

// ── WebSocket event names (mirror app/websocket/events.py) ──
export const WS = {
  // server -> client
  PLAYER_JOINED: "PLAYER_JOINED",
  GAME_START: "GAME_START",
  ROUND_START: "ROUND_START",
  PLAYER_ACTION: "PLAYER_ACTION",
  ROUND_RESULT: "ROUND_RESULT",
  GAME_END: "GAME_END",
  PLAYER_DISCONNECTED: "PLAYER_DISCONNECTED",
  ROOM_STATE: "ROOM_STATE",
  GAME_STATE: "GAME_STATE",
  ROOM_EXPIRED: "ROOM_EXPIRED",
  ERROR: "ERROR",
  // client -> server
  READY: "READY",
  ACTION: "ACTION",
  REMATCH_REQUEST: "REMATCH_REQUEST",
} as const;

export type WSEvent = (typeof WS)[keyof typeof WS];

export interface WSMessage<T = Record<string, unknown>> {
  type: WSEvent | string;
  data: T;
}
