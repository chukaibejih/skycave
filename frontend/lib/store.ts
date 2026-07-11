// Global state: auth identity + live room/game state driven by the socket.
import { create } from "zustand";
import { fetchMe, getToken, logout as apiLogout } from "./api";
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
  justJoined: boolean; // pulse the portal -> GO transition in the lobby
  roomExpired: boolean; // waiting room auto-closed (no opponent joined)
  series: Record<string, number>; // wins per player id across rematches in this room
  rematchRequestedBy: string[]; // player ids who tapped rematch on the finished screen

  connect: (roomId: string) => void;
  disconnect: () => void;
  sendReady: () => void;
  sendAction: (data: Record<string, unknown>) => void;
  sendRematch: () => void;
  clearFeedback: () => void;
  resetTransient: () => void;
}

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
  justJoined: false,
  roomExpired: false,
  series: {},
  rematchRequestedBy: [],

  connect: (roomId) => {
    // Tear down any prior socket (e.g. navigating between rooms).
    get().socket?.close();
    const token = getToken();
    if (!token) return;

    const socket = new SkycaveSocket(roomId, token);
    set({ socket, room: null, game: null, gameEnd: null, soloWords: [], boardState: null, roomExpired: false, series: {}, rematchRequestedBy: [] });

    socket.onStatus((status) => set({ status }));

    // Turn-based board update (Tile Takeover). Also flips the game to active on
    // first arrival, since turn-based games have no ROUND_START.
    socket.on(WS.GAME_STATE, (board: import("./types").BoardState) => {
      set((s) => ({
        boardState: board,
        game: s.game ? { ...s.game, phase: "active" } : s.game,
      }));
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
                winner_id: null,
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

    socket.connect();
  },

  disconnect: () => {
    get().socket?.close();
    set({ socket: null, status: "closed" });
  },

  sendReady: () => get().socket?.ready(),
  sendAction: (data) => get().socket?.action(data),
  sendRematch: () => get().socket?.rematch(),
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
