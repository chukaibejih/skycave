"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { shareToBluesky } from "@/lib/bluesky";

interface Props {
  text: string;
  label?: string;
  full?: boolean;
}

/**
 * Post to Bluesky, plus a Copy option.
 *
 * The composer intent only helps people who use the Bluesky app; anyone on
 * Blacksky, deck.blue, or the web (or who cannot use the Bluesky app at all) had
 * no way through. "Copy post" hands them the exact text that would be posted,
 * to paste wherever they post. No Skycave hashtags are added - the player adds
 * their own tags in the composer.
 */
export function ShareButton({ text, label = "Post to Bluesky", full = true }: Props) {
  const [copied, setCopied] = useState(false);
  // The exact post text; the player adds any tags themselves in the composer.
  const fullText = text;

  const post = () => {
    // Copy as a fallback (the app composer does not always take the deep link),
    // then open it.
    navigator.clipboard?.writeText(fullText).catch(() => {});
    shareToBluesky(text);
  };

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; nothing else to do */
    }
  };

  return (
    <div className={full ? "w-full" : "inline-block"}>
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.12 }}
        onClick={post}
        style={{ backgroundColor: "#6C63FF", color: "#F0F0FF" }}
        className={[
          "flex h-[52px] items-center justify-center rounded-[12px]",
          "font-[var(--font-body)] text-base font-semibold",
          "transition-[filter] duration-200 active:brightness-95",
          full ? "w-full" : "px-6",
        ].join(" ")}
      >
        {label}
      </motion.button>

      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <span>Not on the Bluesky app?</span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 font-semibold transition-colors active:opacity-80"
          style={{ color: copied ? "var(--color-success)" : "var(--color-primary)" }}
        >
          {copied ? (
            "Copied ✓"
          ) : (
            <>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy post
            </>
          )}
        </button>
      </div>
    </div>
  );
}
