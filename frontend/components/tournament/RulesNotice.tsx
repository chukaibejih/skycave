import Link from "next/link";
import { TOURNEY } from "@/lib/tournamentStatus";

const rules = [
  { mark: "2:00", title: "Every move has a clock", body: "Your two minutes begin when it is your turn." },
  { mark: "✓", title: "Show up ready", body: "Check in and play your round before its deadline." },
  { mark: "↔", title: "Check-in order is neutral", body: "It gives neither player hosting or game advantage." },
  { mark: "3", title: "Every fixture is drawn fairly", body: "Best-of-three games come from the tournament pool." },
];

/** A short, in-flow rule reminder. It is deliberately not a modal: people can
 * read it before entering, revisit it from the bracket, and get the move-clock
 * detail again at their fixture without being blocked from the event. */
export function RulesNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="mt-5 flex items-center justify-between gap-3 rounded-[16px] border px-4 py-3"
        style={{ borderColor: `color-mix(in srgb, ${TOURNEY.accent} 38%, var(--color-border))`, background: "var(--color-surface)" }}
      >
        <p className="text-xs leading-snug text-[var(--color-text-secondary)]">
          <span className="font-bold" style={{ color: TOURNEY.accentSoft }}>2:00 per move</span>
          {" · "}check in before your round closes.
        </p>
        <Link href="/tournament/rules" className="shrink-0 text-xs font-bold" style={{ color: TOURNEY.accentSoft }}>
          Rules →
        </Link>
      </div>
    );
  }

  return (
    <section
      className="mt-6 overflow-hidden rounded-[20px] border"
      style={{ borderColor: `color-mix(in srgb, ${TOURNEY.accent} 42%, var(--color-border))`, background: "var(--color-surface)" }}
    >
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--color-border)", background: `linear-gradient(100deg, color-mix(in srgb, ${TOURNEY.accent} 14%, transparent), transparent 66%)` }}>
        <p className="font-[var(--font-display)] text-lg font-bold">Before you play</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Four things to know before you take a seat.
        </p>
      </div>
      <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--color-border)" }}>
        {rules.map((rule) => (
          <div key={rule.title} className="flex gap-3 px-5 py-4">
            <span
              className="grid h-9 min-w-9 place-items-center rounded-[11px] font-[var(--font-mono)] text-xs font-bold"
              style={{ background: `color-mix(in srgb, ${TOURNEY.accent} 16%, transparent)`, color: TOURNEY.accentSoft }}
            >
              {rule.mark}
            </span>
            <div>
              <p className="text-sm font-bold">{rule.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">{rule.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3">
        <Link href="/tournament/rules" className="text-xs font-bold" style={{ color: TOURNEY.accentSoft }}>
          Read all tournament rules →
        </Link>
      </div>
    </section>
  );
}

/** The focused reminder for the fixture page, immediately before check-in and
 * play actions. The actual live clock remains in the game shell. */
export function MoveClockNotice() {
  return (
    <div
      className="mt-5 flex items-center gap-3 rounded-[16px] border p-4"
      style={{ borderColor: `color-mix(in srgb, ${TOURNEY.accent} 44%, var(--color-border))`, background: `color-mix(in srgb, ${TOURNEY.accent} 9%, var(--color-surface))` }}
    >
      <span className="grid h-10 min-w-10 place-items-center rounded-[12px] font-[var(--font-mono)] text-sm font-bold" style={{ background: TOURNEY.accent, color: "#052817" }}>
        2:00
      </span>
      <p className="text-sm leading-snug text-[var(--color-text-secondary)]">
        <span className="font-bold text-[var(--color-text-primary)]">Every move has two minutes.</span>{" "}
        Your clock starts when it is your turn.
      </p>
    </div>
  );
}
