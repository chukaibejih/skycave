"use client";
import { TOURNEY } from "@/lib/tournamentStatus";
import { FeedbackButton } from "./FeedbackButton";

/**
 * A small warm footer. The rest of the hub is cool violet, so the coffee note
 * borrows the tournament world's amber to feel like a friendly aside rather than
 * a plea. Opens Buy Me a Coffee in a new tab. Includes inline feedback.
 */
export function CoffeeFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--color-border)] pb-8 pt-8 text-center space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Keep the cave caffeinated.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <a
          href="https://buymeacoffee.com/ibejih"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition-[filter] hover:brightness-105 active:brightness-95"
          style={{
            background: TOURNEY.gradient,
            color: TOURNEY.ink,
            boxShadow: "0 8px 26px rgba(255, 110, 60, 0.28)",
          }}
        >
          <span aria-hidden>☕</span> Buy me a coffee
        </a>
        <FeedbackButton />
      </div>
    </footer>
  );
}
