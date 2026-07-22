"use client";
import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef, type CSSProperties } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  full?: boolean;
}

/**
 * Variant colours live in inline styles, not utility classes.
 *
 * Arbitrary colour utilities were silently producing no CSS for this component,
 * so `secondary` fell through to the browser's default button colour and
 * rendered near-black text on a dark surface - readable as a shape, not as a
 * label. That bit twice ("Back to hub", then "Play as guest"), which is enough
 * to stop relying on them here. Inline styles always emit and always win.
 *
 * The palette is written out rather than referenced through var() for the same
 * reason: one less layer that can resolve to nothing.
 */
const INK = "#f5f7ff";
const MUTED = "#9aa3ba";

const variantStyle: Record<Variant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, var(--color-primary), var(--color-cyan))",
    color: "#05060a",
    boxShadow: "0 0 28px var(--color-primary-glow)",
  },
  // Tinted from white so it is always a step lighter than whatever it sits on.
  // Filling with --color-elevated made it invisible inside a modal, which is
  // itself --color-elevated.
  secondary: {
    backgroundColor: "rgba(255,255,255,0.07)",
    color: INK,
    border: "1px solid rgba(255,255,255,0.18)",
  },
  ghost: { backgroundColor: "transparent", color: MUTED },
  danger: { backgroundColor: "var(--color-warm)", color: "#ffffff" },
};

// 48px min height (touch target), 24px radius, no hover-only state - every
// style has an active: equivalent so touch users get feedback.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", full, className = "", children, style, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      // A caller's own style wins, so the Bluesky button keeps its blue.
      style={{ ...variantStyle[variant], ...(style as CSSProperties) }}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)]",
        "px-6 py-3 text-base font-semibold font-[var(--font-body)]",
        // 40% left disabled labels unreadable on a dark surface; 60% still
        // reads as clearly unavailable but can be read.
        "transition-[filter,background-color] duration-200 disabled:opacity-60 disabled:pointer-events-none",
        "active:brightness-110",
        full ? "w-full" : "",
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </motion.button>
  );
});
