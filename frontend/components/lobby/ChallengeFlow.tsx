"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import {
  searchActors,
  resolveActor,
  shareToBluesky,
  type BskyActor,
} from "@/lib/bluesky";

interface Props {
  roomCode: string;
  gameName: string;
  // Optional controlled expansion. When provided, the parent owns the open state
  // (e.g. so a "Reshare" button can reopen this panel) and the built-in trigger
  // is hidden. When omitted, the component self-manages with its own trigger.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Room links always point at the live product, not a dev/tunnel origin, since
// these get posted publicly on Bluesky.
const SITE = "skycave.space";

// Five ways to word the challenge. Index 0 is the pre-selected default so a
// user can just tap send without picking anything.
function buildMessages(handle: string, gameName: string, code: string): string[] {
  const link = `${SITE}/room/${code}`;
  const h = `@${handle}`;
  return [
    `${h}, get in the cave.\n\n${link}`,
    `${h} you're being challenged. don't leave me waiting.\n\n${link}`,
    `Yo ${h}, me vs you. right now.\n\n${link}`,
    `${h} i picked ${gameName}. scared?\n\n${link}`,
    `${h} settle this.\n\n${link}`,
  ];
}

export function ChallengeFlow({ roomCode, gameName, open, onOpenChange }: Props) {
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const expanded = controlled ? open : internalOpen;
  const setExpanded = (v: boolean) =>
    controlled ? onOpenChange?.(v) : setInternalOpen(v);

  // Phase A: pick who.
  const [query, setQuery] = useState("");
  const [actors, setActors] = useState<BskyActor[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase B: pick a message + send.
  const [selected, setSelected] = useState<BskyActor | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messages = useMemo(
    () =>
      selected ? buildMessages(selected.handle, gameName, roomCode) : [],
    [selected, gameName, roomCode]
  );

  // Debounced typeahead. Fires only in phase A, after 2 chars, 300ms after the
  // last keystroke; aborts the in-flight request when the query changes.
  useEffect(() => {
    if (selected) return;
    const q = query.trim().replace(/^@+/, "");
    if (q.length < 2) {
      setActors([]);
      setSearching(false);
      setDropdownOpen(false);
      return;
    }
    setSearching(true);
    setDropdownOpen(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await searchActors(q, ctrl.signal);
      setActors(res);
      setSearching(false);
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, selected]);

  // Close the dropdown when tapping/clicking anywhere outside it (touch + mouse).
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [dropdownOpen]);

  const pickActor = (a: BskyActor) => {
    setSelected(a);
    setMsgIndex(0);
    setDropdownOpen(false);
    setActors([]);
    setError(null);
  };

  // "Challenge" beside the input: resolve the typed handle to a real account.
  const onResolveTyped = async () => {
    if (resolving) return;
    const q = query.trim().replace(/^@+/, "");
    if (!q) return;
    setResolving(true);
    setError(null);
    const a = await resolveActor(q);
    setResolving(false);
    if (!a) {
      setError("couldn't find that handle, check the spelling.");
      return;
    }
    pickActor(a);
  };

  const changeTarget = () => {
    setSelected(null);
    setQuery("");
    setActors([]);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const reset = () => {
    setExpanded(false);
    setSelected(null);
    setQuery("");
    setActors([]);
    setError(null);
    setDropdownOpen(false);
    setResolving(false);
    setMsgIndex(0);
  };

  const send = () => {
    if (!messages[msgIndex]) return;
    shareToBluesky(messages[msgIndex]);
    reset();
  };

  return (
    <div className="space-y-3">
      {!controlled && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)]/70 text-base font-semibold text-[var(--color-text-primary)] transition-[filter] active:brightness-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14.5 3.5 21 10l-9.5 9.5a2.1 2.1 0 0 1-3 0L3 14a2.1 2.1 0 0 1 0-3z" />
            <path d="M7 7h.01" />
          </svg>
          Challenge someone specific
        </button>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                  challenge someone
                </span>
                <button
                  onClick={reset}
                  aria-label="Close"
                  className="grid h-7 w-7 place-items-center rounded-full text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!selected ? (
                // ── Phase A: choose who ──
                <div ref={wrapRef} className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-[var(--font-mono)] text-base text-[var(--color-text-secondary)]">
                        @
                      </span>
                      <input
                        ref={inputRef}
                        type="text"
                        name="bluesky-handle"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setError(null);
                        }}
                        onFocus={() => {
                          if (actors.length || searching) setDropdownOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onResolveTyped();
                          }
                        }}
                        placeholder="you.bsky.social"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        autoComplete="off"
                        inputMode="text"
                        enterKeyHint="go"
                        // Keep password managers from treating a public handle as a credential.
                        data-1p-ignore
                        data-lpignore="true"
                        className="w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-base)] py-3 pl-7 pr-3 font-[var(--font-mono)] text-sm outline-none focus:border-[#1185FE]"
                      />
                    </div>
                    <button
                      onClick={onResolveTyped}
                      disabled={!query.trim() || resolving}
                      className="shrink-0 rounded-[10px] px-4 text-sm font-semibold text-white transition-[filter] active:brightness-95 disabled:opacity-40"
                      style={{ backgroundColor: "#1185FE" }}
                    >
                      {resolving ? "…" : "Challenge"}
                    </button>
                  </div>

                  {error && (
                    <p className="mt-2 text-xs text-[var(--color-warm)]">{error}</p>
                  )}

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.14 }}
                        className="mt-2 max-h-[248px] overflow-y-auto overscroll-contain rounded-[12px] border border-[var(--color-border)] bg-[var(--color-elevated)] shadow-xl"
                      >
                        {searching && actors.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                            searching…
                          </p>
                        ) : actors.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                            no one found
                          </p>
                        ) : (
                          actors.map((a) => (
                            <button
                              key={a.did}
                              onClick={() => pickActor(a)}
                              className="flex w-full items-center gap-3 border-t border-[var(--color-border)] px-3 py-2.5 text-left transition-colors first:border-t-0 active:bg-[var(--color-surface)]"
                            >
                              <Avatar
                                id={a.did}
                                name={a.displayName ?? a.handle}
                                avatarUrl={a.avatar}
                                size={36}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold">
                                  {a.displayName ?? a.handle}
                                </div>
                                <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                                  @{a.handle}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                // ── Phase B: confirm target, pick a message, send ──
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2.5">
                    <Avatar
                      id={selected.did}
                      name={selected.displayName ?? selected.handle}
                      avatarUrl={selected.avatar}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {selected.displayName ?? selected.handle}
                      </div>
                      <div className="truncate font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
                        @{selected.handle}
                      </div>
                    </div>
                    <button
                      onClick={changeTarget}
                      className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
                    >
                      change
                    </button>
                  </div>

                  <div>
                    <p className="mb-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                      pick a message
                    </p>
                    <div className="space-y-2">
                      {messages.map((m, i) => (
                        <button
                          key={i}
                          onClick={() => setMsgIndex(i)}
                          aria-pressed={msgIndex === i}
                          className="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-sm transition-colors"
                          style={{
                            borderColor:
                              msgIndex === i
                                ? "var(--color-primary)"
                                : "var(--color-border)",
                            background:
                              msgIndex === i
                                ? "color-mix(in srgb, var(--color-primary) 14%, transparent)"
                                : "transparent",
                          }}
                        >
                          <span
                            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                            style={{
                              borderColor:
                                msgIndex === i
                                  ? "var(--color-primary)"
                                  : "var(--color-border)",
                            }}
                          >
                            {msgIndex === i && (
                              <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {m.split("\n")[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={send}
                    className="flex h-[52px] w-full items-center justify-center rounded-[12px] text-base font-semibold text-white transition-[filter] active:brightness-95"
                    style={{ backgroundColor: "#1185FE" }}
                  >
                    Send challenge on Bluesky
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
