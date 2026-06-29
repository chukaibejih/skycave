"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { Feedback } from "@/lib/store";

// Full-screen flash: green (correct) / red (wrong). The shake on wrong is
// applied by the game shell to its content via the `shake` helper below.
export function FeedbackFlash({ feedback }: { feedback: Feedback }) {
  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedback}
          className="pointer-events-none fixed inset-0 z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            background:
              feedback === "correct"
                ? "radial-gradient(circle at center, var(--color-success), transparent 70%)"
                : "radial-gradient(circle at center, var(--color-warm), transparent 70%)",
          }}
        />
      )}
    </AnimatePresence>
  );
}

// Shake animation variants for wrong answers (no hover; pure motion).
export const shakeVariants = {
  idle: { x: 0 },
  shake: { x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.4 } },
};
