// Resilient WebSocket client for room/game sync.
//
// Mobile clients drop sockets constantly (network switches, backgrounding), so
// this auto-reconnects with exponential backoff + jitter. On every (re)connect
// the server replies with ROOM_STATE, which the store uses to rehydrate - so a
// reconnect transparently resumes an in-progress game. The client also forces a
// reconnect when the tab returns to the foreground or the browser reports back
// online, instead of waiting for the dead socket to time out.

import { WS, type WSMessage } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

// Server close codes that should NOT be retried (see backend handler):
// 4401 unauthorized, 4403 forbidden / room full, 4404 room not found.
const TERMINAL_CLOSE_CODES = new Set([4401, 4403, 4404]);

type Handler = (data: any, type: string) => void;
type StatusHandler = (status: ConnectionStatus) => void;

export type ConnectionStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export class SkycaveSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private anyHandlers = new Set<Handler>();
  private statusHandlers = new Set<StatusHandler>();
  private attempt = 0;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Messages typed before the socket settled. send() used to drop these on the
  // floor: tap Ready a beat too early and the server never heard it, while the
  // button had already flipped to "waiting for opponent..." - so you waited for
  // something that was never coming. The same hole swallowed game moves.
  private pending: string[] = [];

  constructor(
    private roomId: string,
    private token: string
  ) {}

  connect() {
    this.closedByUser = false;
    this.open();
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      document.addEventListener("visibilitychange", this.handleVisible);
    }
  }

  private open() {
    this.clearTimer();
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const url = `${WS_BASE}/ws/${this.roomId}?token=${encodeURIComponent(
      this.token
    )}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus("open");
      // Anything typed while we were down goes out now, in order.
      const queued = this.pending;
      this.pending = [];
      for (const raw of queued) {
        try {
          ws.send(raw);
        } catch {
          /* a send that fails here will be retried by the next reconnect */
        }
      }
    };

    ws.onmessage = (ev) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.dispatch(msg);
    };

    ws.onclose = (ev) => {
      if (this.closedByUser) {
        this.setStatus("closed");
        return;
      }
      // Terminal server rejections (unauthorized / forbidden-or-full / not
      // found) must not be retried - reconnecting would just loop forever.
      if (TERMINAL_CLOSE_CODES.has(ev.code)) {
        this.setStatus("closed");
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnection.
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect() {
    this.setStatus("reconnecting");
    this.attempt += 1;
    // Exponential backoff capped at 8s, with jitter to avoid thundering herd.
    const base = Math.min(8000, 500 * 2 ** (this.attempt - 1));
    const delay = base / 2 + Math.random() * (base / 2);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private handleOnline = () => {
    // Network came back - don't wait for the dead socket's timeout.
    if (!this.closedByUser && this.ws?.readyState !== WebSocket.OPEN) {
      this.attempt = 0;
      this.open();
    }
  };

  private handleVisible = () => {
    if (
      document.visibilityState === "visible" &&
      !this.closedByUser &&
      this.ws?.readyState !== WebSocket.OPEN
    ) {
      this.attempt = 0;
      this.open();
    }
  };

  private dispatch(msg: WSMessage) {
    this.anyHandlers.forEach((h) => h(msg.data, msg.type));
    this.handlers.get(msg.type)?.forEach((h) => h(msg.data, msg.type));
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  onAny(handler: Handler) {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private setStatus(status: ConnectionStatus) {
    this.statusHandlers.forEach((h) => h(status));
  }

  send(type: string, data: Record<string, unknown> = {}) {
    const raw = JSON.stringify({ type, data });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
      return;
    }
    // Hold it until the socket is back rather than losing it silently. Capped
    // so a long outage cannot grow this without bound; the oldest go first,
    // since a stale action is worth less than a recent one.
    if (this.closedByUser) return;
    this.pending.push(raw);
    if (this.pending.length > 12) this.pending.shift();
  }

  ready() {
    this.send(WS.READY);
  }

  action(data: Record<string, unknown>) {
    this.send(WS.ACTION, data);
  }

  rematch() {
    this.send(WS.REMATCH_REQUEST);
  }

  private clearTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  close() {
    this.closedByUser = true;
    this.clearTimer();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      document.removeEventListener("visibilitychange", this.handleVisible);
    }
    this.ws?.close();
    this.ws = null;
  }
}
