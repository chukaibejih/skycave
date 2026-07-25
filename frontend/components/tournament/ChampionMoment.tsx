"use client";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Avatar } from "@/components/ui/Avatar";
import { ShareButton } from "@/components/lobby/ShareButton";
import type { MyMatch } from "@/lib/api";

/**
 * Winning a weekend tournament is the biggest thing that happens on Skycave,
 * and for a while it was a grey box that said "you won". This is the moment.
 *
 * Three things carry it: gold that nothing else in the product uses, the whole
 * climb written out (a champion beat real named people to get here, and seeing
 * the list is what makes it feel earned rather than announced), and a share
 * that is already written. The share matters most: a champion post tags the
 * people they beat, which is the only way anyone outside the field hears that
 * the tournament happened at all.
 */
const GOLD = "var(--color-gold)";

export function ChampionMoment({ m }: { m: MyMatch }) {
  const you = m.you;
  const beaten = m.run.filter((r) => r.won && !r.bye && r.opponent);

  const shareText = useMemo(() => {
    const lines = [`I won the ${m.tournament_name}. 👑`];
    if (beaten.length) {
      const names = beaten.map((r) => `@${r.opponent!.handle}`);
      lines.push(
        `Beat ${names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names.at(-1) : names[0]} on the way.`
      );
    }
    lines.push(`skycave.space/tournament/${m.tournament_id}`);
    return lines.join("\n\n");
  }, [m.tournament_name, m.tournament_id, beaten]);

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 20 }}
        className="relative overflow-hidden rounded-[22px] border p-6 text-center"
        style={{
          borderColor: `color-mix(in srgb, ${GOLD} 55%, transparent)`,
          background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, ${GOLD} 16%, transparent), transparent 65%), var(--color-surface)`,
        }}
      >
        <div className="relative">
          <Rays />
          <motion.div
            // A slow rise and settle, so the crown lands rather than just appearing.
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 14 }}
            className="relative text-4xl"
          >
            👑
          </motion.div>
        </div>

        <div
          className="mt-2 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.28em]"
          style={{ color: GOLD }}
        >
          Champion
        </div>

        <div className="mt-4 flex flex-col items-center">
          <div
            className="rounded-full p-[3px]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, var(--color-warm))` }}
          >
            <Avatar id={you.did} name={you.display_name} avatarUrl={you.avatar_url} size={72} />
          </div>
          <div className="mt-3 font-[var(--font-display)] text-2xl font-bold">
            {you.display_name}
          </div>
          <div className="font-[var(--font-mono)] text-xs text-[var(--color-text-secondary)]">
            @{you.handle}
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-[19rem] text-sm leading-relaxed text-[var(--color-text-secondary)]">
          You won the {m.tournament_name}. Nobody else got through.
        </p>

        {/* The climb. Byes are shown greyed rather than hidden: a champion who
            got one should see it, and a champion who did not should get the
            credit for having played every round. */}
        {m.run.length > 0 && (
          <div className="mt-5 space-y-1.5 text-left">
            {m.run.map((r) => (
              <div
                key={r.round}
                className="flex items-center gap-3 rounded-[12px] border px-3.5 py-2.5"
                style={{
                  borderColor: r.bye
                    ? "var(--color-border)"
                    : `color-mix(in srgb, ${GOLD} 40%, transparent)`,
                  background: "var(--color-base)",
                  opacity: r.bye ? 0.6 : 1,
                }}
              >
                <span className="w-[86px] shrink-0 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                  {r.round_name}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.bye ? (
                    <span className="text-[var(--color-text-secondary)]">Bye</span>
                  ) : (
                    <>
                      beat <span className="font-semibold">{r.opponent?.display_name}</span>
                    </>
                  )}
                </span>
                {!r.bye && (
                  <span className="shrink-0 font-[var(--font-display)] text-sm font-bold tabular-nums">
                    {r.your_wins}-{r.their_wins}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-6">
          <ShareButton text={shareText} label="Post it to Bluesky" full />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Light behind the crown. Cheap, no canvas and no dependency: blurred wedges
 * breathing outward, which reads as a glow rather than as an animation anyone
 * has to sit through. Sits inside the card, because the card paints its own
 * background and anything behind it is simply not visible.
 */
function Rays() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-64 -translate-x-1/2 -translate-y-1/2">
      {[-38, -13, 13, 38].map((deg, i) => (
        <motion.div
          key={deg}
          className="absolute left-1/2 top-0 h-32 w-10 blur-xl"
          style={{
            background: `linear-gradient(to bottom, color-mix(in srgb, ${GOLD} 60%, transparent), transparent 75%)`,
            transformOrigin: "top center",
            transform: `translateX(-50%) rotate(${deg}deg)`,
          }}
          animate={{ opacity: [0.3, 0.75, 0.3] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
        />
      ))}
    </div>
  );
}
