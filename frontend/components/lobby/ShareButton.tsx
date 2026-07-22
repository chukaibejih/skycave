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
 * "Share to Bluesky" - opens the pre-filled composer. Also copies the text so
 * users on the Bluesky app (where the intent may not deep-link) can paste it.
 *
 * Flat primary fill, no gradient, no emoji - the Bluesky butterfly lives only
 * in the posted share text, not in UI chrome.
 */
export function ShareButton({ text, label = "Share to Bluesky", full = true }: Props) {
  const [copied, setCopied] = useState(false);

  const handle = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be unavailable; sharing still works */
    }
    shareToBluesky(text);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      onClick={handle}
      style={{ backgroundColor: "#6C63FF", color: "#F0F0FF" }}
      className={[
        "flex h-[52px] items-center justify-center rounded-[12px]",
        "font-[var(--font-body)] text-base font-semibold",
        "transition-[filter] duration-200 active:brightness-95",
        full ? "w-full" : "px-6",
      ].join(" ")}
    >
      {copied ? "copied + opening…" : label}
    </motion.button>
  );
}
