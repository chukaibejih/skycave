// Global state: auth identity + live room/game state driven by the socket.
import { create } from "zustand";
import { fetchMe, getToken } from "./api";
import { SkycaveSocket, type ConnectionStatus } from "./websocket";
import { WS, type Identity, type Room, type GameState } from "./types";

// ── Auth ──
interface AuthState {
  identity: Identity | null;
  loaded: boolean;
  setIdentity: (i: Identity | null) => void;
  hydrate: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
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
  justJoined: boolean; // pulse the portal -> GO transition in the lobby

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
  justJoined: false,

  connect: (roomId) => {
    // Tear down any prior socket (e.g. navigating between rooms).
    get().socket?.close();
    const token = getToken();
    if (!token) return;

    const socket = new SkycaveSocket(roomId, token);
    set({ socket, room: null, game: null, gameEnd: null });

    socket.onStatus((status) => set({ status }));

    // Full snapshot on (re)connect — rehydrate everything for state recovery.
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
        roundEndsAt: room.game?.round_ends_at ?? null,
	        // If we reconnected mid-finished game, surface the end screen.
        gameEnd:
          room.status === "finished" && room.game
            ? {
                scores: room.game.scores,
                winner_id: null,
                history: room.game.history,
                players: room.players,
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

	    socket.on(WS.GAME_START, (data: any) => {
	      set({
	        gameEnd: null,
	        roundResult: null,
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
        if (data.correct === false) {
          set({ feedback: "wrong", locked: !!data.locked });
	        } else if (data.correct === true) {
	          set({ feedback: "correct", submitted: true });
	        }
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
      feedback: null,
	      locked: false,
      submitted: false,
      roundEndsAt: null,
	      opponentSubmitted: false,
      justJoined: false,
    }),
}));
