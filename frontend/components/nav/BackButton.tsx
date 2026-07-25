"use client";
import Link from "next/link";

/**
 * A back affordance that looks like one: a left chevron leading a label, rather
 * than a bare word in a pill that reads as a tag, not a way out. The href is a
 * fixed parent rather than browser-back, because a bracket link is shared and
 * often opened cold, where history-back would leave the site entirely.
 */
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={`Back to ${label}`}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border pl-2.5 pr-4 text-sm font-medium transition-colors active:border-[var(--color-primary)]"
      style={{
        borderColor: "var(--color-border)",
        background: "color-mix(in srgb, var(--color-surface) 70%, transparent)",
        color: "var(--color-text-secondary)",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}
