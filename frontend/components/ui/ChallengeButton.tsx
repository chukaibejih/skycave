"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ChallengeTray } from "@/components/hub/ChallengeTray";
import { useAuth } from "@/lib/store";

const HIDDEN_ON = ["/admin", "/room", "/play"];

export function ChallengeButton() {
  const pathname = usePathname();
  const [trayOpen, setTrayOpen] = useState(false);
  const hydrate = useAuth((st) => st.hydrate);

  // The button is global (rendered in the layout), but many pages never hydrate
  // auth, so hydrate here too or the tray would prompt sign-in for someone who
  // is already signed in.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return null;

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setTrayOpen(true)}
        aria-label="Open Challenge Tray"
        className="fixed bottom-[max(env(safe-area-inset-bottom),16px)] right-4 z-40 grid h-13 w-13 place-items-center rounded-full border-2 border-white/95 bg-[var(--color-primary)] text-white shadow-[0_6px_28px_rgba(139,124,255,0.65)] backdrop-blur-md transition-all hover:bg-[#7b6bf5] active:scale-95"
        title="Challenge"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-xs"
        >
          {/* Crossed Swords vector icon */}
          <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
          <path d="M13 19l6-6" />
          <path d="M16 16l4 4" />
          <path d="M19 21l2-2" />
          <path d="M9.5 17.5L21 6V3h-3L6.5 14.5" />
          <path d="M11 19l-6-6" />
          <path d="M8 16l-4 4" />
          <path d="M5 21l-2-2" />
        </svg>
      </motion.button>

      <ChallengeTray open={trayOpen} onClose={() => setTrayOpen(false)} />
    </>
  );
}
