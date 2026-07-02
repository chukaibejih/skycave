"use client";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "./Button";
import { submitFeedback } from "@/lib/api";

// Floating "Feedback" button, available on every page except the back office.
// Writes to the server; admins read it under /admin → Feedback.
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (pathname?.startsWith("/admin")) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setSent(false);
  };

  const submit = async () => {
    const msg = message.trim();
    if (!msg || busy) return;
    setBusy(true);
    try {
      await submitFeedback(msg, pathname ?? undefined);
      setSent(true);
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1400);
    } catch {
      /* leave the modal open so they can retry */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-[max(env(safe-area-inset-bottom),14px)] left-3 z-40 flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 text-sm text-[var(--color-text-secondary)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] backdrop-blur-sm active:text-[var(--color-text-primary)]"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.div
              className="w-full max-w-md rounded-t-[24px] border border-[var(--color-border)] bg-[var(--color-elevated)] p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:rounded-[24px]"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              {sent ? (
                <div className="py-8 text-center">
                  <div className="font-[var(--font-display)] text-2xl font-bold text-[var(--color-success)]">
                    Thanks!
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Your feedback landed.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="mb-1 font-[var(--font-display)] text-xl font-bold">
                    Send feedback
                  </h2>
                  <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                    Bugs, ideas, anything. It goes straight to us.
                  </p>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={2000}
                    rows={5}
                    autoFocus
                    placeholder="What's on your mind?"
                    className="mb-3 w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={close}
                      className="px-2 text-sm text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]"
                    >
                      Cancel
                    </button>
                    <Button onClick={submit} disabled={busy || !message.trim()}>
                      {busy ? "sending…" : "Send"}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
