"use client";
import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: Variant;
  full?: boolean;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(135deg,var(--color-primary),var(--color-cyan))] text-[#05060a] shadow-[0_0_28px_var(--color-primary-glow)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--color-elevated)]/85 text-[var(--color-text-primary)] border border-[var(--color-border)] active:bg-[var(--color-surface)]",
  ghost:
    "bg-transparent text-[var(--color-text-secondary)] active:text-[var(--color-text-primary)]",
  danger: "bg-[var(--color-warm)] text-white active:brightness-95",
};

// 48px min height (touch target), 24px radius, no hover-only state — every
// style has an active: equivalent so touch users get feedback.
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", full, className = "", children, ...props },
  ref
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)]",
        "px-6 py-3 text-base font-semibold font-[var(--font-body)]",
        "transition-[filter,background-color] duration-200 disabled:opacity-40 disabled:pointer-events-none",
        full ? "w-full" : "",
        styles[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </motion.button>
  );
});
