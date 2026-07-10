"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CaveShell, Hint } from "@/components/cave/CaveShell";
import { CaveSignIn } from "@/components/cave/SignIn";
import { useAuth } from "@/lib/store";
import { browseCases, myCases, myRooms, type CaseCard, type ArchitectCase, type SolverRoom } from "@/lib/cave";

const INK = "var(--color-text-primary)";
const MUTED = "#8888AA";

export default function CaveHome() {
  const { identity, loaded, hydrate } = useAuth();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [cases, setCases] = useState<CaseCard[]>([]);
  const [mine, setMine] = useState<ArchitectCase[]>([]);
  const [solving, setSolving] = useState<SolverRoom[]>([]);
  const authed = loaded && identity && !identity.is_guest;

  useEffect(() => {
    if (!authed) return;
    browseCases({ unsolved: true }).then((r) => setCases(r.cases)).catch(() => {});
    myCases().then((r) => setMine(r.cases)).catch(() => {});
    myRooms().then((r) => setSolving(r.rooms)).catch(() => {});
  }, [authed]);

  if (loaded && !authed) {
    return (
      <CaveShell back="/">
        <Intro />
        <div className="mt-8">
          <CaveSignIn returnTo="/cave" />
        </div>
      </CaveShell>
    );
  }

  return (
    <CaveShell back="/">
      <Intro />

      <Link
        href="/cave/new"
        className="mt-6 flex items-center justify-between rounded-[14px] border px-5 py-4"
        style={{ borderColor: "var(--color-primary)", background: "#14110d" }}
      >
        <div>
          <div className="font-[var(--font-display)] text-base font-semibold" style={{ color: INK }}>Build a case</div>
          <div className="text-[13px]" style={{ color: MUTED }}>Design a mystery, split the clues, recruit two solvers.</div>
        </div>
        <span aria-hidden style={{ color: "var(--color-primary)" }}>&rarr;</span>
      </Link>

      {solving.length > 0 && (
        <Section title="Cases you're solving">
          <div className="space-y-2">
            {solving.map((r) => (
              <Link
                key={r.room_id}
                href={`/cave/room/${r.room_id}`}
                className="flex items-center justify-between rounded-[10px] border px-4 py-3"
                style={{ borderColor: "var(--color-border)", background: "#100e0b" }}
              >
                <span className="text-sm" style={{ color: INK }}>{r.case_title}</span>
                <span className="font-[var(--font-mono)] text-[11px] uppercase" style={{ color: statusColor(r.status) }}>{r.status}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Open cases">
        <Hint>Pick a case and claim a solver spot. You will be paired with whoever takes the other seat.</Hint>
        {cases.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: MUTED }}>No open cases yet. Be the first to build one.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cases.map((c) => (
              <CaseTile key={c.id} c={c} />
            ))}
          </div>
        )}
      </Section>

      {mine.length > 0 && (
        <Section title="Cases you built">
          <div className="space-y-2">
            {mine.map((c) => (
              <Link
                key={c.id}
                href={c.status === "draft" ? `/cave/new?id=${c.id}` : `/cave/${c.id}`}
                className="flex items-center justify-between rounded-[10px] border px-4 py-3"
                style={{ borderColor: "var(--color-border)", background: "#100e0b" }}
              >
                <span className="text-sm" style={{ color: INK }}>{c.title || "Untitled case"}</span>
                <span className="font-[var(--font-mono)] text-[11px]" style={{ color: MUTED }}>
                  {c.status === "draft" ? "draft" : `${c.solves}/${c.attempts} solved · ${c.in_progress} live`}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </CaveShell>
  );
}

function Intro() {
  return (
    <div>
      <h1 className="font-[var(--font-display)] text-3xl font-bold" style={{ color: INK }}>The Cave</h1>
      <p className="mt-2 font-[var(--font-display)] text-base font-semibold" style={{ color: "#e8dcc0" }}>
        You know who did it. They don&apos;t.
      </p>
      <p className="mt-2 max-w-xl text-sm leading-6" style={{ color: MUTED }}>
        Build a mystery, split the clues between two strangers, and watch them piece it together. Or claim a case and
        solve one with a partner. Half the clues each. Only yours to see.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-[var(--font-display)] text-lg font-semibold" style={{ color: INK }}>{title}</h2>
      {children}
    </section>
  );
}

function CaseTile({ c }: { c: CaseCard }) {
  return (
    <Link
      href={`/cave/${c.id}`}
      className="block rounded-[12px] border p-4"
      style={{ borderColor: "var(--color-border)", background: "#12100d" }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full border px-2 py-0.5 font-[var(--font-mono)] text-[10px] uppercase" style={{ borderColor: "var(--color-border)", color: MUTED }}>{c.difficulty}</span>
      </div>
      <div className="font-[var(--font-display)] text-base font-semibold leading-snug" style={{ color: INK }}>{c.title}</div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-5" style={{ color: MUTED }}>{c.premise}</p>
      <div className="mt-2 text-[11px]" style={{ color: MUTED }}>by @{c.architect_handle} · {c.attempts} attempts</div>
    </Link>
  );
}

const statusColor = (s: string) =>
  s === "solved" ? "#56f0aa" : s === "failed" ? "#ff725e" : s === "active" ? "#8b7cff" : MUTED;
