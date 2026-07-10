"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CaveShell, Hint } from "@/components/cave/CaveShell";
import { getToken } from "@/lib/api";
import { shareToBluesky } from "@/lib/bluesky";
import { useAuth } from "@/lib/store";
import {
  addNote,
  CaveError,
  confirmVerdict,
  getReveal,
  getRoom,
  setSuspicion,
  type NoteEntry,
  type Reveal,
  type RoomState,
} from "@/lib/cave";

const INK = "var(--color-text-primary)";
const MUTED = "#8888AA";
const PAPER = "#1a1a14"; // aged paper for evidence
const SITE = "skycave.space";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
const POLL_MS = 30000; // fallback only; the WebSocket carries real-time updates

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function CaseRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { identity, loaded, hydrate } = useAuth();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [presence, setPresence] = useState<string[]>([]); // solver roles currently connected via WS
  const [wsUp, setWsUp] = useState(false);
  const cursor = useRef(0);
  const gotReveal = useRef(false);
  const resolvedRef = useRef(false);

  const loadReveal = useCallback(() => {
    if (gotReveal.current) return;
    gotReveal.current = true;
    getReveal(roomId)
      .then(setReveal)
      .catch(() => {
        gotReveal.current = false; // let a later sync retry if it wasn't ready yet
      });
  }, [roomId]);

  // One delta pull: merge new notepad entries by cursor, refresh room state, and
  // load the reveal once resolved. Called by both the WS poke and the fallback poll.
  const syncNow = useCallback(async () => {
    const r = await getRoom(roomId, cursor.current);
    setRoom(r);
    if (r.notepad.length) {
      setNotes((prev) => [...prev, ...r.notepad]);
      cursor.current = r.cursor;
    }
    if (r.status === "solved" || r.status === "failed") {
      resolvedRef.current = true;
      loadReveal();
    }
    return r;
  }, [roomId, loadReveal]);
  const refreshNow = syncNow;

  // Fallback poll: a safety net under the WebSocket. Slow (30s) because the socket
  // carries real-time updates; this only covers a dropped poke or a dead socket.
  // Pauses when the tab is hidden and stops once the case resolves.
  useEffect(() => {
    if (!loaded || !identity) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (document.hidden || resolvedRef.current) return;
      syncNow().catch((e) => setErr(e instanceof Error ? e.message : "Could not load the room"));
    };
    tick();
    id = setInterval(tick, POLL_MS);
    const onVis = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loaded, identity, syncNow]);

  // Live socket: instant notepad/suspicion/verdict sync + partner presence.
  // Reconnects with a fixed backoff; stops once the case resolves.
  useEffect(() => {
    if (!loaded || !identity) return;
    const token = getToken();
    if (!token) return;
    let ws: WebSocket | null = null;
    let stop = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (stop) return;
      ws = new WebSocket(`${WS_BASE}/cave/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => setWsUp(true);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "poke") syncNow().catch(() => {});
          else if (msg.type === "presence") setPresence(Array.isArray(msg.roles) ? msg.roles : []);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        setWsUp(false);
        if (!stop && !resolvedRef.current) retry = setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      stop = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [loaded, identity, roomId, syncNow]);

  if (loaded && (!identity || identity.is_guest)) {
    return (
      <CaveShell back="/cave">
        <p className="py-20 text-center text-sm" style={{ color: MUTED }}>
          The Cave requires a Bluesky account.
        </p>
      </CaveShell>
    );
  }
  if (!room) {
    return (
      <CaveShell back="/cave">
        <p className="py-20 text-center text-sm" style={{ color: MUTED }}>
          {err ?? "opening the case room..."}
        </p>
      </CaveShell>
    );
  }

  const bothWrote =
    notes.some((n) => n.role === "A") && notes.some((n) => n.role === "B");
  const resolved = room.status === "solved" || room.status === "failed";
  // Live presence when the socket is up (partner's role in the connected set),
  // otherwise fall back to the claim-based flag from room state.
  const partnerRole = room.your_role === "A" ? "B" : "A";
  const partnerOnline = wsUp ? presence.includes(partnerRole) : room.partner.present;

  return (
    <CaveShell back="/cave">
      {/* Top bar */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold leading-tight sm:text-3xl" style={{ color: INK }}>
            {room.case.title}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: MUTED }}>
            <span className="rounded-full border px-2 py-0.5 capitalize" style={{ borderColor: "var(--color-border)" }}>
              {room.case.difficulty}
            </span>
            <a href={`https://bsky.app/profile/${room.case.architect_handle}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              by @{room.case.architect_handle}
            </a>
          </div>
        </div>
        <span className="shrink-0 rounded-full border px-3 py-1 font-[var(--font-mono)] text-xs" style={{ borderColor: "var(--color-primary)", color: INK }}>
          You are Solver {room.your_role}
        </span>
      </div>

      {/* Case file */}
      <section className="rounded-[16px] border p-5" style={{ borderColor: "var(--color-border)", background: "#12100d" }}>
        <div className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]" style={{ color: MUTED }}>
          case file
        </div>
        <p className="font-[var(--font-display)] text-[17px] leading-8" style={{ color: INK }}>
          {room.case.premise}
        </p>
        <Hint>Read this carefully. Your clues are below. Your partner has different ones.</Hint>
      </section>

      {/* Evidence board */}
      <section className="mt-5">
        <h2 className="font-[var(--font-display)] text-lg font-semibold" style={{ color: INK }}>Your evidence</h2>
        <Hint>These are your clues. Describe them to your partner in the notepad. Do not just paste them, talk through what they mean.</Hint>
        <div className="mt-3 space-y-3">
          {room.your_evidence.map((e) => (
            <EvidenceCard key={e.id} content={e.content} shared={e.shared} />
          ))}
        </div>
      </section>

      {/* Partner status */}
      <section className="mt-5 flex items-center gap-3 rounded-[12px] border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "#100e0b" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: partnerOnline ? "var(--color-success)" : MUTED }} />
        <div className="text-sm" style={{ color: INK }}>
          {room.partner.handle ? (
            <>
              Partner <span style={{ color: MUTED }}>@{room.partner.handle}</span>{" "}
              <span style={{ color: partnerOnline ? "var(--color-success)" : MUTED }}>{partnerOnline ? "is here" : "is away"}</span>
              {" · "}holds <span style={{ color: INK }}>{room.partner.private_count}</span> private{" "}
              {room.partner.private_count === 1 ? "card" : "cards"} you cannot see.
            </>
          ) : (
            <span style={{ color: MUTED }}>Waiting for a second solver to claim this case.</span>
          )}
        </div>
      </section>

      {/* Notepad */}
      <Notepad
        notes={notes}
        role={room.your_role}
        onSend={async (text) => {
          await addNote(roomId, text);
          await refreshNow();
        }}
        disabled={resolved}
      />

      {/* Suspicion board */}
      {room.suspicion_options.length > 0 && (
        <SuspicionBoard
          options={room.suspicion_options}
          statuses={room.suspicion}
          disabled={resolved}
          onSet={async (key, status) => {
            setRoom((r) => (r ? { ...r, suspicion: { ...r.suspicion, [key]: status } } : r));
            await setSuspicion(roomId, key, status).catch(() => {});
          }}
        />
      )}

      {/* Verdict / reveal */}
      {resolved && reveal ? (
        <RevealPanel reveal={reveal} caseId={room.case.id} title={room.case.title} architect={room.case.architect_handle} />
      ) : (
        <VerdictPanel
          room={room}
          bothWrote={bothWrote}
          onConfirm={async (answer) => {
            try {
              const res = await confirmVerdict(roomId, answer);
              await refreshNow();
              if (res.resolved) loadReveal();
            } catch (e) {
              // 409 = the case already resolved (partner sealed it, or a double
              // tap). Not an error to the player: just sync to the outcome.
              if (e instanceof CaveError && e.status === 409) {
                await refreshNow();
                loadReveal();
              } else {
                throw e;
              }
            }
          }}
        />
      )}
    </CaveShell>
  );
}

// ── Evidence card: an aged-paper object, expandable ──
function EvidenceCard({ content, shared }: { content: string; shared: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="block w-full rounded-[10px] border px-4 py-3 text-left"
      style={{ background: PAPER, borderColor: "#3a3524", boxShadow: "0 1px 0 rgba(0,0,0,0.4)" }}
    >
      <div className="mb-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.14em]" style={{ color: shared ? "#8b7cff" : "#c9a24b" }}>
        {shared ? "both of you can see this" : "only you can see this"}
      </div>
      <p className="text-sm leading-6" style={{ color: "#e8e2cf" }}>
        {open ? content || "(empty)" : (content.slice(0, 60) + (content.length > 60 ? "..." : ""))}
      </p>
    </button>
  );
}

// ── Notepad: monospace investigation log, append-only ──
function Notepad({
  notes,
  role,
  onSend,
  disabled,
}: {
  notes: NoteEntry[];
  role: "A" | "B";
  onSend: (text: string) => Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [notes.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 rounded-[16px] border" style={{ borderColor: "var(--color-border)", background: "#0d0c0a" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.18em]" style={{ color: MUTED }}>shared notepad</span>
      </div>
      <div ref={scroller} className="max-h-72 overflow-y-auto px-4 py-3 font-[var(--font-mono)] text-[13px] leading-6">
        {notes.length === 0 ? (
          <p className="italic" style={{ color: MUTED }}>
            Start here. Tell your partner what you are seeing. What stands out in your clues?
          </p>
        ) : (
          notes.map((n, i) => (
            <div key={i} className="mb-2">
              <span style={{ color: n.role === "A" ? "#8b7cff" : "#ffd166" }}>Solver {n.role}</span>
              <span className="ml-2" style={{ color: MUTED }}>{fmtTime(n.created_at)}</span>
              <div style={{ color: "#e8e6df" }}>{n.content}</div>
            </div>
          ))
        )}
      </div>
      {!disabled && (
        <div className="flex items-end gap-2 border-t px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Add to the notepad as Solver ${role}...`}
            rows={2}
            className="flex-1 resize-none bg-transparent font-[var(--font-mono)] text-[13px] leading-6 outline-none"
            style={{ color: INK }}
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="h-9 shrink-0 rounded-[8px] px-4 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            {busy ? "..." : "Send"}
          </button>
        </div>
      )}
    </section>
  );
}

// ── Suspicion board: cycle each lead through states ──
const CYCLE: Record<string, string> = { none: "flagged", flagged: "pinned", pinned: "ruled_out", ruled_out: "none" };
const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  none: { label: "untouched", color: MUTED },
  flagged: { label: "worth a look", color: "#ffd166" },
  pinned: { label: "pinned", color: "#56f0aa" },
  ruled_out: { label: "ruled out", color: "#ff725e" },
};
function SuspicionBoard({
  options,
  statuses,
  onSet,
  disabled,
}: {
  options: { key: string; label: string }[];
  statuses: Record<string, string>;
  onSet: (key: string, status: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="mt-5">
      <h2 className="font-[var(--font-display)] text-lg font-semibold" style={{ color: INK }}>Suspicion board</h2>
      <Hint>Tap a lead to cycle it: worth a look, pinned, ruled out. You both see this.</Hint>
      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const st = statuses[o.key] ?? "none";
          const s = STATUS_STYLE[st] ?? STATUS_STYLE.none;
          return (
            <button
              key={o.key}
              disabled={disabled}
              onClick={() => onSet(o.key, CYCLE[st] ?? "flagged")}
              className="flex w-full items-center justify-between rounded-[10px] border px-4 py-3 text-left"
              style={{ borderColor: st === "none" ? "var(--color-border)" : s.color, background: "#100e0b" }}
            >
              <span className="text-sm" style={{ color: st === "ruled_out" ? MUTED : INK, textDecoration: st === "ruled_out" ? "line-through" : "none" }}>
                {o.label || "(unnamed lead)"}
              </span>
              <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Verdict: dual-confirm, gated on both having written ──
function VerdictPanel({
  room,
  bothWrote,
  onConfirm,
}: {
  room: RoomState;
  bothWrote: boolean;
  onConfirm: (answer: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState(room.verdict.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (room.verdict.answer && room.verdict.answer !== answer) setAnswer(room.verdict.answer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.verdict.answer]);

  // You have already sealed this exact answer; nothing to do until it changes or
  // your partner confirms. Prevents the double-tap that hits a resolved room.
  const alreadySealed =
    room.verdict.your_confirmed && answer.trim() === (room.verdict.answer ?? "").trim();

  const submit = async () => {
    if (!answer.trim() || busy || alreadySealed) return;
    setBusy(true);
    setErr(null);
    try {
      await onConfirm(answer.trim());
    } catch {
      setErr("Could not submit your verdict. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5 rounded-[16px] border p-5" style={{ borderColor: "var(--color-border)", background: "#12100d" }}>
      <h2 className="font-[var(--font-display)] text-lg font-semibold" style={{ color: INK }}>Joint verdict</h2>
      {!bothWrote ? (
        <Hint>Both of you must add at least one note before you can submit a verdict. Collaborate first.</Hint>
      ) : (
        <>
          <Hint>Agree on an answer, then you both confirm. If one of you changes it, both confirm again.</Hint>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer"
            className="mt-3 w-full rounded-[10px] border px-3 py-3 text-sm outline-none"
            style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy || !answer.trim() || alreadySealed}
              className="h-11 flex-1 rounded-[10px] text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--color-primary)", color: "#05060a" }}
            >
              {busy ? "..." : alreadySealed ? "Confirmed" : "Confirm verdict"}
            </button>
          </div>
          {err && <p className="mt-2 text-[13px]" style={{ color: "#ff725e" }}>{err}</p>}
          <div className="mt-3 flex items-center gap-4 text-xs" style={{ color: MUTED }}>
            <span style={{ color: room.verdict.a_confirmed ? "#56f0aa" : MUTED }}>Solver A {room.verdict.a_confirmed ? "confirmed" : "pending"}</span>
            <span style={{ color: room.verdict.b_confirmed ? "#56f0aa" : MUTED }}>Solver B {room.verdict.b_confirmed ? "confirmed" : "pending"}</span>
          </div>
          {room.verdict.your_confirmed && !(room.verdict.a_confirmed && room.verdict.b_confirmed) && (
            <p className="mt-2 text-[13px] italic" style={{ color: MUTED }}>
              Waiting for your partner to confirm. They will see a prompt next time they open the case.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── Reveal ──
function RevealPanel({
  reveal,
  caseId,
  title,
  architect,
}: {
  reveal: Reveal;
  caseId: string;
  title: string;
  architect: string;
}) {
  const url = `${SITE}/cave/${caseId}`;
  const post = reveal.correct
    ? `@${architect} we cracked it.\n\n${title} - ${url}`
    : `@${architect} we got the wrong answer. that case was something else.\n\n${title} - ${url}`;
  return (
    <section className="mt-5 rounded-[16px] border p-5" style={{ borderColor: reveal.correct ? "#56f0aa" : "#ff725e", background: "#12100d" }}>
      <h2 className="font-[var(--font-display)] text-2xl font-bold" style={{ color: INK }}>
        {reveal.correct ? "You cracked it." : "Wrong answer."}
      </h2>
      <p className="mt-2 text-sm leading-6" style={{ color: INK }}>{reveal.verdict_text}</p>
      <div className="mt-4 rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}>
        <span style={{ color: MUTED }}>the answer was </span>
        <span style={{ color: INK }}>{reveal.answer}</span>
      </div>

      <div className="mt-5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>the full case</div>
      <div className="mt-2 space-y-2">
        {reveal.evidence.map((e, i) => (
          <div key={i} className="rounded-[10px] border px-3 py-2 text-sm leading-6" style={{ background: PAPER, borderColor: "#3a3524", color: "#e8e2cf" }}>
            <div className="mb-1 flex items-center gap-2 font-[var(--font-mono)] text-[10px] uppercase tracking-wide">
              <span style={{ color: MUTED }}>{e.assignment === "both" ? "shared" : `solver ${e.assignment}`}</span>
              {e.is_red_herring && <span style={{ color: "#ff725e" }}>red herring</span>}
            </div>
            {e.content}
          </div>
        ))}
      </div>

      <button
        onClick={() => shareToBluesky(post)}
        className="mt-5 h-12 w-full rounded-[12px] text-sm font-semibold"
        style={{ background: "var(--color-primary)", color: "#05060a" }}
      >
        Post the verdict to Bluesky
      </button>
    </section>
  );
}
