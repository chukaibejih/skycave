import type { Config } from "tailwindcss";

// Tailwind v4 is CSS-first: the design tokens live in app/globals.css under
// the @theme block. This file only declares content sources so the JIT engine
// scans the right files.
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
} satisfies Config;
