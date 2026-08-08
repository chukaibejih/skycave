// Global state: auth identity + live room/game state driven by the socket.
import { create } from "zustand";
import { fetchMe, getReigningChampion, getToken, logout as apiLogout } from "./api";
import { SkycaveSocket, type ConnectionStatus } from "./websocket";
import { WS, type Identity, type Room, type GameState } from "./types";

// ── Auth ──
interface AuthState {
  identity: Identity | null;
  loaded: boolean;
  setIdentity: (i: Identity | null) => void;
  hydrate: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  identity: null,
  loaded: false,
  setIdentity: (identity) => set({ identity }),
  hydrate: async () => {
    if (!getToken()) {
      set({ loaded: true });
      return;
    }
    const identity = await fetchMe();
    set({ identity, loaded: true });
  },
  // Clear local state (guest + Bluesky) and revoke the Bluesky session server-side.
  logout: async () => {
    const isGuest = get().identity?.is_guest ?? true;
    await apiLogout(isGuest);
    set({ identity: null });
  },
}));

// ── Reigning champion (the crown the Avatar draws, keyed by did or handle) ──
interface ChampionState {
  did: string | null;
  handle: string | null;
  hydrate: () => Promise<void>;
}

let championStarted = false;
export const useChampion = create<ChampionState>((set) => ({
  did: null,
  handle: null,
  // Fetched once per session; the reigning champion changes at most once a week.
  hydrate: async () => {
    if (championStarted) return;
    championStarted = true;
    try {
      const c = await getReigningChampion();
      if (c) set({ did: c.player.did, handle: c.player.handle });
    } catch {
      championStarted = false; // transient failure: let a later mount retry
    }
  },
}));

// ── Round result + game-end payloads (transient UI) ──
export interface RoundResult {
  round: number;
  round_points: Record<string, number>;
  scores: Record<string, number>;
  answer: Record<string, unknown>;
  winner_id: string | null;
  timed_out: boolean;
}

export interface GameEnd {
  scores: Record<string, number>;
  winner_id: string | null;
  history: { round: number; points: Record<string, number> }[];
  players: Room["players"];
  series?: Record<string, number>; // wins per player id across rematches in this room
}

export type Feedback = "correct" | "wrong" | null;

// An emoji a watcher floated. `id` is a client-unique key for the animation.
export interface Reaction {
  id: number;
  emoji: string;
  from: string | null;
}

interface RoomState {
  socket: SkycaveSocket | null;
  status: ConnectionStatus;
  room: Room | null;
  game: GameState | null;
  roundData: Record<string, unknown> | null;
  roundResult: RoundResult | null;
  gameEnd: GameEnd | null;
  feedback: Feedback;
  locked: boolean; // this player is locked out of the current race round
  submitted: boolean;
  roundEndsAt: number | null;
  opponentSubmitted: boolean;
  soloWords: string[]; // accepted words this solo Word Duel session
  boardState: import("./types").BoardState | null; // turn-based board (Tile Takeover)
  privateBoard: import("./types").UnoHand | null; // your own hidden slice (Uno hand)
  justJoined: boolean; // pulse the portal -> GO transition in the lobby
  roomExpired: boolean; // waiting room auto-closed (no opponent joined)
  series: Record<string, number>; // wins per player id across rematches in this room
  rematchRequestedBy: string[]; // player ids who tapped rematch on the finished screen
  spectatorCount: number; // how many are watching this room (eye icon)
  reactions: Reaction[]; // recent floated emoji reactions (ephemeral, capped)
  isSpectator: boolean; // this connection is watch-only

  connect: (roomId: string) => void;
  spectate: (roomId: string) => void;
  disconnect: () => void;
  sendReady: () => void;
  sendAction: (data: Record<string, unknown>) => void;
  sendRematch: () => void;
  sendReaction: (emoji: string) => void;
  clearFeedback: () => void;
  resetTransient: () => void;
  // Internal: attach all room event handlers to a socket (connect + spectate).
  _wire: (socket: SkycaveSocket) => void;
}

// Client-unique key for each floated reaction, so React can animate them.
let reactionSeq = 0;

export const useRoom = create<RoomState>((set, get) => ({
  socket: null,
  status: "closed",
  room: null,
  game: null,
  roundData: null,
  roundResult: null,
  gameEnd: null,
  feedback: null,
  locked: false,
  submitted: false,
  roundEndsAt: null,
  opponentSubmitted: false,
  soloWords: [],
  boardState: null,
  privateBoard: null,
  justJoined: false,
  roomExpired: false,
  series: {},
  rematchRequestedBy: [],
  spectatorCount: 0,
  reactions: [],
  isSpectator: false,

  connect: (roomId) => {
    // Tear down any prior socket (e.g. navigating between rooms).
    get().socket?.close();
    const token = getToken();
    if (!token) return;

    const socket = new SkycaveSocket(roomId, token);
    // Clear the previous room's round state too, so a new room can never render
    // (or act on) the last game's prompt/deadline before its own ROUND_START.
    set({
      socket, isSpectator: false, room: null, game: null, gameEnd: null, soloWords: [], boardState: null, privateBoard: null,
      roomExpired: false, series: {}, rematchRequestedBy: [], spectatorCount: 0, reactions: [],
      roundData: null, roundResult: null, roundEndsAt: null, locked: false, submitted: false,
    });

    get()._wire(socket);
    socket.connect();
  },

  // Watch-only connection to a live room. Anyone may watch (token optional); the
  // same handlers as connect() populate the store, so the same GameShell renders
  // read-only (a non-player meId disables every control). No joinRoom, so it
  // never counts as a player.
  spectate: (roomId) => {
    get().socket?.close();
    const token = getToken() ?? "";
    const socket = new SkycaveSocket(roomId, token, true);
    set({
      socket, isSpectator: true, room: null, game: null, gameEnd: null, soloWords: [], boardState: null, privateBoard: null,
      roomExpired: false, series: {}, rematchRequestedBy: [], spectatorCount: 0, reactions: [],
      roundData: null, roundResult: null, roundEndsAt: null, locked: false, submitted: false,
    });
    get()._wire(socket);
    socket.connect();
  },

  // Wire every room event handler onto a socket. Players and spectators share
  // these: a spectator's socket receives the same public broadcasts, just never
  // a per-player private slice (enforced server-side), so the same store drives
  // the same GameShell read-only.
  _wire: (socket: SkycaveSocket) => {
    socket.onStatus((status) => set({ status }));

    // Turn-based board update (Tile Takeover). Also flips the game to active on
    // first arrival, since turn-based games have no ROUND_START.
    socket.on(WS.GAME_STATE, (board: import("./types").BoardState) => {
      set((s) => ({
        boardState: board,
        game: s.game ? { ...s.game, phase: "active" } : s.game,
      }));
    });

    // Your own hidden cards. Sent point-to-point rather than broadcast, so an
    // Uno hand never travels to the opponent.
    socket.on(WS.GAME_PRIVATE, (hand: import("./types").UnoHand) => {
      set({ privateBoard: hand });
    });

    // Full snapshot on (re)connect: rehydrate everything for state recovery.
	    socket.on(WS.ROOM_STATE, (room: Room) => {
      const lastResult = room.game?.last_result as RoundResult | null | undefined;
      const myRoundState = room.game?.my_round_state;
	      set({
	        room,
	        game: room.game ?? null,
	        roundData: room.game?.round_data ?? null,
        roundResult: lastResult ?? null,
        locked: !!myRoundState?.locked,
        submitted: !!myRoundState?.submitted,
        roomExpired: room.status === "expired",
        boardState: (room as unknown as { board?: import("./types").BoardState }).board ?? get().boardState,
        privateBoard:
          (room as unknown as { my_board?: import("./types").UnoHand }).my_board ??
          get().privateBoard,
        roundEndsAt: room.game?.round_ends_at ?? null,
        series: room.series ?? get().series,
        // On a finished room, ready flags mean "wants a rematch" (see backend
        // _handle_rematch). Rehydrate that so a reconnect shows the right prompt.
        rematchRequestedBy:
          room.status === "finished"
            ? room.players.filter((p) => p.ready).map((p) => p.id)
            : [],
	        // If we reconnected mid-finished game, surface the end screen.
        gameEnd:
          room.status === "finished" && room.game
            ? {
                scores: room.game.scores,
                winner_id: (room.game as { winner_id?: string | null }).winner_id ?? null,
                history: room.game.history,
                players: room.players,
                series: room.series ?? {},
              }
            : get().gameEnd,
      });
    });

    socket.on(WS.PLAYER_JOINED, (data: { players?: Room["players"] }) => {
      const room = get().room;
      if (room && data.players) {
        const wasWaiting = room.players.length < 2;
        set({
          room: { ...room, players: data.players },
          justJoined: wasWaiting && data.players.length >= 2,
        });
      }
    });

    // Server closed the waiting room (no opponent joined in time). Flip the flag
    // so the host's lobby transitions to the "nobody joined" state immediately,
    // without waiting for the visual countdown to reach zero.
    socket.on(WS.ROOM_EXPIRED, () => {
      const room = get().room;
      set({
        roomExpired: true,
        room: room ? { ...room, status: "expired" } : room,
      });
    });

    socket.on(WS.PLAYER_DISCONNECTED, (data: { player_id: string }) => {
      const room = get().room;
      if (!room) return;
      set({
        room: {
          ...room,
          players: room.players.map((p) =>
            p.id === data.player_id ? { ...p, connected: false } : p
          ),
        },
      });
    });

    // A player opted into a rematch on the finished screen. Ready flags on the
    // broadcast players tell us who; both ready -> the backend restarts the same
    // room and a GAME_START follows.
    socket.on(WS.REMATCH_REQUEST, (data: { player_id: string; players?: Room["players"] }) => {
      set((s) => {
        const players = data.players ?? s.room?.players ?? [];
        return {
          room: s.room && data.players ? { ...s.room, players: data.players } : s.room,
          rematchRequestedBy: players.filter((p) => p.ready).map((p) => p.id),
        };
      });
    });

	    socket.on(WS.GAME_START, (data: any) => {
	      set({
	        gameEnd: null,
	        roundResult: null,
        rematchRequestedBy: [],
        submitted: false,
        roundEndsAt: null,
        privateBoard: null,
	        game: {
          game_type: data.game_type,
          total_rounds: data.total_rounds,
          mode: data.mode,
          round: 0,
          phase: "starting",
          scores: data.scores,
          history: [],
          round_data: null,
        },
        room: get().room
          ? { ...get().room!, status: "in_progress", players: data.players }
          : get().room,
      });
    });

	    socket.on(WS.ROUND_START, (data: any) => {
      // Anchor the deadline to the *client* clock using the round duration, so
      // the countdown is immune to client/server clock skew during normal play.
      const endsAt =
        typeof data.ends_in === "number"
          ? Date.now() / 1000 + data.ends_in
          : data.ends_at ?? null;
	      set((s) => ({
	        roundData: data.round_data,
	        roundResult: null,
	        feedback: null,
	        locked: false,
        submitted: false,
        roundEndsAt: endsAt,
	        opponentSubmitted: false,
	        game: s.game
	          ? {
              ...s.game,
              round: data.round,
              phase: "active",
	              scores: data.scores,
	              round_data: data.round_data,
              round_ends_at: endsAt,
              last_result: null,
              my_round_state: null,
	            }
	          : s.game,
	      }));
    });

	    socket.on(WS.PLAYER_ACTION, (data: any) => {
      const me = useAuth.getState().identity?.id;
      if (data.player_id && data.player_id === me) {
        const patch: Partial<RoomState> = {};
        if (data.correct === false) {
          patch.feedback = "wrong";
          patch.locked = !!data.locked;
        } else if (data.correct === true) {
          patch.feedback = "correct";
          patch.submitted = true;
        }
        // Word Duel solo: running score + accepted words ride PLAYER_ACTION.
        if (typeof data.score === "number") {
          const g = get().game;
          if (g) patch.game = { ...g, scores: { ...g.scores, [me!]: data.score } };
        }
        if (Array.isArray(data.used)) patch.soloWords = data.used as string[];
        set(patch);
      } else if (data.submitted) {
        set({ opponentSubmitted: true });
      }
    });

	    socket.on(WS.ROUND_RESULT, (data: RoundResult) => {
	      set((s) => ({
	        roundResult: data,
	        feedback: null,
        roundEndsAt: null,
	        game: s.game
	          ? {
              ...s.game,
              phase: "round_over",
              scores: data.scores,
              last_result: data as unknown as Record<string, unknown>,
            }
	          : s.game,
	      }));
    });

    socket.on(WS.GAME_END, (data: GameEnd) => {
      set((s) => ({
	        gameEnd: data,
	        game: s.game ? { ...s.game, phase: "finished", scores: data.scores } : s.game,
	        room: s.room ? { ...s.room, status: "finished" } : s.room,
        series: data.series ?? s.series,
        rematchRequestedBy: [], // fresh finished screen; nobody has opted in yet
        roundEndsAt: null,
	      }));
    });

    // Watcher count (eye icon) and floated emoji reactions - seen by players and
    // spectators alike. Reactions are capped so the list can't grow unbounded.
    socket.on(WS.SPECTATOR_COUNT, (d: { count?: number }) =>
      set({ spectatorCount: d.count ?? 0 })
    );
    socket.on(WS.REACTION, (d: { emoji?: string; from?: string | null }) => {
      const emoji = d.emoji;
      if (!emoji) return;
      const from = d.from ?? null;
      set((s) => ({
        reactions: [...s.reactions, { id: ++reactionSeq, emoji, from }].slice(-20),
      }));
    });
  },

  disconnect: () => {
    get().socket?.close();
    set({ socket: null, status: "closed", isSpectator: false, spectatorCount: 0, reactions: [] });
  },

  sendReady: () => get().socket?.ready(),
  sendAction: (data) => get().socket?.action(data),
  sendRematch: () => get().socket?.rematch(),
  sendReaction: (emoji) => get().socket?.react(emoji),
  clearFeedback: () => set({ feedback: null }),
  resetTransient: () =>
    set({
      roundResult: null,
      soloWords: [],
      feedback: null,
	      locked: false,
      submitted: false,
      roundEndsAt: null,
	      opponentSubmitted: false,
      justJoined: false,
    }),
}));
