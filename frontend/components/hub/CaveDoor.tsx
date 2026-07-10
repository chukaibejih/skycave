"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { CAVE_LAUNCH_LABEL, CAVE_PREVIEW, CountdownRow, useCountdown } from "@/components/cave/launch";

/**
 * The entry to The Cave from the home hub. Deliberately off-palette: the warm
 * amber/sepia glow (matching CaveShell) sets it apart from the teal/violet of the
 * fast games, so it reads as a door into a different room, not another game tile.
 *
 * Before launch (August 1) the door is locked and shows a live countdown; the
 * team keeps a small preview link via CAVE_PREVIEW. After launch it links to
 * /cave, which sends a signed-in Bluesky player straight in and nudges guests.
 */
export function CaveDoor() {
  const c = useCountdown();
  const locked = !c.done;

  const shell = (
    <div
      className="group relative block overflow-hidden rounded-[22px] border p-6 sm:p-8"
      style={{
        borderColor: "rgba(201,162,75,0.35)",
        background:
          "radial-gradient(900px 300px at 12% -40%, rgba(255,150,60,0.14), transparent 60%)," +
          "radial-gradient(700px 280px at 100% 140%, rgba(150,90,50,0.12), transparent 55%)," +
          "#0f0d0a",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(circle, rgba(255,170,80,0.22), transparent 70%)" }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.18em]" style={{ borderColor: "rgba(201,162,75,0.4)", color: "#e8c98a" }}>
            {locked ? (
              <>
                <LockIcon />
                opens {CAVE_LAUNCH_LABEL}
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#ffb050", boxShadow: "0 0 10px #ffb050" }} />
                new · co-op mystery
              </>
            )}
          </div>
          <h2 className="font-[var(--font-display)] text-3xl font-bold sm:text-4xl" style={{ color: "#f5efe2" }}>
            The Cave
          </h2>
          <p className="mt-2 font-[var(--font-display)] text-[15px] font-semibold sm:text-base" style={{ color: "#e8dcc0" }}>
            You know who did it. They don&apos;t.
          </p>
          <p className="mt-2 text-sm leading-6" style={{ color: "#b7ad97" }}>
            Build a mystery, split the clues between two strangers, and watch them try to piece it together. Or claim a
            case and solve one with a partner. Half the clues each. Only yours to see.
          </p>
          <p className="mt-2 text-sm font-medium" style={{ color: "#e8c98a" }}>
            Crack it together. Or not at all.
          </p>
          <div className="mt-3 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em]" style={{ color: "#8a8069" }}>
            2 solvers · take your time · bluesky
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          {locked ? (
            <>
              <CountdownRow c={c} />
              {CAVE_PREVIEW && (
                <Link href="/cave" className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.14em] underline underline-offset-4" style={{ color: "#8a8069" }}>
                  team preview &rarr;
                </Link>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Keyhole />
              <span
                className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform group-active:scale-95"
                style={{ background: "#e8c98a", color: "#241a0c" }}
              >
                Enter the Cave
                <span aria-hidden>&rarr;</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6 }}
    >
      {locked ? shell : <Link href="/cave">{shell}</Link>}
    </motion.div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8c98a" strokeWidth="2.4" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function Keyhole() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden className="hidden sm:block">
      <circle cx="12" cy="9.5" r="7.5" stroke="rgba(201,162,75,0.5)" strokeWidth="1.4" />
      <circle cx="12" cy="8.5" r="2.4" fill="#e8c98a" />
      <path d="M11 10.4 L10 15 h4 l-1 -4.6" fill="#e8c98a" />
    </svg>
  );
}
