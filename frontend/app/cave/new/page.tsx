"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CaveShell, Hint } from "@/components/cave/CaveShell";
import { shareToBluesky } from "@/lib/bluesky";
import { useAuth } from "@/lib/store";
import {
  addEvidence,
  createCase,
  CaveError,
  deleteEvidence,
  getCaseEdit,
  publishCase,
  updateCase,
  updateEvidence,
  type Assignment,
  type CaseFull,
  type Difficulty,
  type Evidence,
} from "@/lib/cave";

const INK = "var(--color-text-primary)";
const MUTED = "#8888AA";
const SITE = "skycave.space";

export default function BuildPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { identity, loaded, hydrate } = useAuth();
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [data, setData] = useState<CaseFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const pending = useRef<{ fields: Partial<CaseFull>; ev: Record<string, Partial<Evidence>> }>({ fields: {}, ev: {} });
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load an existing draft, or create one and pin its id to the URL.
  useEffect(() => {
    if (!loaded || !identity || identity.is_guest) return;
    let active = true;
    (async () => {
      try {
        const id = params.get("id");
        if (id) {
          const c = await getCaseEdit(id);
          if (active) setData(c);
        } else {
          const draft = await createCase();
          const c = await getCaseEdit(draft.id);
          if (active) {
            setData(c);
            router.replace(`/cave/new?id=${draft.id}`);
          }
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not open the builder");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, identity]);

  // Autosave: accumulate pending case-field and evidence patches, then flush them
  // together on a debounce. Accumulating is essential; otherwise fast successive
  // edits to different fields overwrite each other's pending save.
  const flush = async (id: string) => {
    const p = pending.current;
    pending.current = { fields: {}, ev: {} };
    setSaving(true);
    try {
      if (Object.keys(p.fields).length) {
        const fresh = await updateCase(id, p.fields);
        setData((d) => (d ? { ...d, checklist_errors: fresh.checklist_errors } : d));
      }
      for (const [eid, patch] of Object.entries(p.ev)) {
        await updateEvidence(id, eid, patch).catch(() => {});
      }
    } catch {
      /* transient; the next edit retries */
    } finally {
      setSaving(false);
    }
  };
  const schedule = (id: string) => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => flush(id), 600);
  };

  const setField = <K extends keyof CaseFull>(key: K, value: CaseFull[K]) => {
    setData((d) => (d ? { ...d, [key]: value } : d));
    if (data) {
      pending.current.fields = { ...pending.current.fields, [key]: value };
      schedule(data.id);
    }
  };

  // ── Evidence ops ──
  const addCard = async () => {
    if (!data) return;
    const order = data.evidence.length + 1;
    const res = await addEvidence(data.id, { type: "text", content: "", assignment: "both", order });
    setData((d) =>
      d
        ? { ...d, evidence: [...d.evidence, { id: res.id, type: "text", content: "", assignment: "both", is_red_herring: false, order }] }
        : d
    );
  };
  const patchCard = (eid: string, patch: Partial<Evidence>) => {
    setData((d) => (d ? { ...d, evidence: d.evidence.map((e) => (e.id === eid ? { ...e, ...patch } : e)) } : d));
    if (data) {
      pending.current.ev[eid] = { ...pending.current.ev[eid], ...patch };
      schedule(data.id);
    }
  };
  const removeCard = async (eid: string) => {
    if (!data) return;
    setData((d) => (d ? { ...d, evidence: d.evidence.filter((e) => e.id !== eid) } : d));
    await deleteEvidence(data.id, eid).catch(() => {});
  };

  // ── Suspicion options ──
  const addOption = () => {
    if (!data) return;
    const key = `opt_${Date.now().toString(36)}`;
    const next = [...data.suspicion_options, { key, label: "" }];
    setField("suspicion_options", next);
  };
  const patchOption = (key: string, label: string) => {
    if (!data) return;
    setField("suspicion_options", data.suspicion_options.map((o) => (o.key === key ? { ...o, label } : o)));
  };
  const removeOption = (key: string) => {
    if (!data) return;
    setField("suspicion_options", data.suspicion_options.filter((o) => o.key !== key));
  };

  const doPublish = async () => {
    if (!data) return;
    setError(null);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    await flush(data.id); // ensure every edit is saved before the checklist runs
    try {
      await publishCase(data.id);
      setPublished(data.id);
    } catch (e) {
      if (e instanceof CaveError && (e.detail as { errors?: string[] })?.errors) {
        setError((e.detail as { errors: string[] }).errors.join(" · "));
      } else {
        setError(e instanceof Error ? e.message : "Could not publish");
      }
    }
  };

  // ── Auth gate ──
  if (loaded && (!identity || identity.is_guest)) {
    return (
      <CaveShell back="/">
        <h1 className="font-[var(--font-display)] text-3xl font-bold" style={{ color: INK }}>
          The Cave
        </h1>
        <p className="mt-3 max-w-md text-sm" style={{ color: MUTED }}>
          The Cave requires a Bluesky account. Connect yours to build a case.
        </p>
      </CaveShell>
    );
  }
  if (!data) {
    return (
      <CaveShell back="/cave">
        <p className="py-20 text-center text-sm" style={{ color: MUTED }}>
          {error ?? "opening the builder..."}
        </p>
      </CaveShell>
    );
  }

  if (published) {
    const url = `${SITE}/cave/${published}`;
    const post = `just built a case in The Cave. two people need to crack it together.\n\nanyone brave enough?\n\n${url}`;
    return (
      <CaveShell back="/cave">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-[var(--font-display)] text-3xl font-bold" style={{ color: INK }}>
            Your case is live.
          </h1>
          <p className="mt-3 text-sm" style={{ color: MUTED }}>
            Post it on Bluesky. Two people claim the link and crack it together.
          </p>
          <div className="mt-6 rounded-[14px] border p-4 text-left" style={{ borderColor: "var(--color-border)", background: "#171410" }}>
            <p className="whitespace-pre-wrap text-sm" style={{ color: INK }}>{post}</p>
          </div>
          <button
            onClick={() => shareToBluesky(post)}
            className="mt-5 h-12 w-full rounded-[12px] text-sm font-semibold"
            style={{ background: "var(--color-primary)", color: "#05060a" }}
          >
            Post to Bluesky
          </button>
          <button onClick={() => router.push("/cave/mine")} className="mt-3 text-sm" style={{ color: MUTED }}>
            go to my cases
          </button>
        </div>
      </CaveShell>
    );
  }

  const ev = data.evidence;
  const aCards = ev.filter((e) => e.assignment === "A" || e.assignment === "both");
  const bCards = ev.filter((e) => e.assignment === "B" || e.assignment === "both");
  const h = caseHealth(data);
  const blk = blockers(data);

  return (
    <CaveShell back="/cave">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl font-bold sm:text-3xl" style={{ color: INK }}>
          Build a case
        </h1>
        <span className="text-xs" style={{ color: MUTED }}>{saving ? "saving..." : "saved"}</span>
      </div>

      {/* Case setup */}
      <Section title="The case">
        <input
          value={data.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="Give your case a name. Make it feel like something worth solving."
          maxLength={200}
          className="w-full rounded-[10px] border px-3 py-3 text-lg outline-none"
          style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
        />
        <textarea
          value={data.premise}
          onChange={(e) => setField("premise", e.target.value)}
          placeholder="Set the scene. What happened? Keep it under 150 words. Mystery lives in what you leave out."
          rows={4}
          className="mt-3 w-full resize-none rounded-[10px] border px-3 py-3 text-sm leading-6 outline-none"
          style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <Pill key={d} on={data.difficulty === d} onClick={() => setField("difficulty", d)}>
              {d}
            </Pill>
          ))}
          <span className="ml-auto text-xs" style={{ color: MUTED }}>Mystery · more types coming soon</span>
        </div>
        <Hint>Difficulty only tells solvers what to expect. It does not limit what you build.</Hint>
      </Section>

      {/* Evidence */}
      <Section title={`Evidence (${ev.length})`}>
        <Hint>If only one solver sees a card, make sure it only makes sense paired with something their partner holds.</Hint>
        <div className="mt-3 space-y-3">
          {ev.map((card) => (
            <EvidenceCardRow key={card.id} card={card} onChange={(p) => patchCard(card.id, p)} onDelete={() => removeCard(card.id)} />
          ))}
        </div>
        <button
          onClick={addCard}
          className="mt-3 h-11 w-full rounded-[10px] border border-dashed text-sm font-medium"
          style={{ borderColor: "var(--color-border)", color: INK }}
        >
          + Add evidence card
        </button>

        {/* Live asymmetry preview */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <AsymCol role="A" cards={aCards} />
          <AsymCol role="B" cards={bCards} />
        </div>
      </Section>

      {/* Suspicion board options */}
      <Section title="Suspicion board">
        <Hint>These are the leads solvers can pin or rule out together. Suspects, locations, or theories.</Hint>
        <div className="mt-3 space-y-2">
          {data.suspicion_options.map((o) => (
            <div key={o.key} className="flex items-center gap-2">
              <input
                value={o.label}
                onChange={(e) => patchOption(o.key, e.target.value)}
                placeholder="A suspect or a lead"
                className="flex-1 rounded-[10px] border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
              />
              <button onClick={() => removeOption(o.key)} aria-label="remove" className="grid h-9 w-9 place-items-center rounded-full" style={{ color: MUTED }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
        <button onClick={addOption} className="mt-2 text-sm font-medium" style={{ color: "var(--color-primary)" }}>+ add a lead</button>
      </Section>

      {/* Answer + reveal */}
      <Section title="Answer and reveal">
        <label className="text-xs uppercase tracking-wide" style={{ color: MUTED }}>The answer</label>
        <input
          value={data.answer}
          onChange={(e) => setField("answer", e.target.value)}
          placeholder="Who or what did it? Solvers must match this."
          className="mt-1 w-full rounded-[10px] border px-3 py-3 text-sm outline-none"
          style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
        />
        <Hint>Matched loosely: casing and extra spaces do not matter.</Hint>
        <textarea
          value={data.correct_text}
          onChange={(e) => setField("correct_text", e.target.value)}
          placeholder="What do they find out? Make the reveal feel earned."
          rows={3}
          className="mt-4 w-full resize-none rounded-[10px] border px-3 py-3 text-sm leading-6 outline-none"
          style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
        />
        <textarea
          value={data.wrong_text}
          onChange={(e) => setField("wrong_text", e.target.value)}
          placeholder="What did they miss? Give them something to think about."
          rows={3}
          className="mt-3 w-full resize-none rounded-[10px] border px-3 py-3 text-sm leading-6 outline-none"
          style={{ borderColor: "var(--color-border)", background: "#13100c", color: INK }}
        />
      </Section>

      {/* Case health */}
      <div className="mt-6 rounded-[14px] border p-4" style={{ borderColor: h.color, background: "#141210" }}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>{h.title}</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-5" style={{ color: MUTED }}>{h.msg}</p>
      </div>

      {/* Publish */}
      {error && <p className="mt-4 text-sm" style={{ color: "var(--color-warm)" }}>{error}</p>}
      <button
        onClick={doPublish}
        className="mt-4 h-[52px] w-full rounded-[12px] text-[15px] font-semibold"
        style={{ background: "var(--color-primary)", color: "#05060a" }}
      >
        Publish case
      </button>
      {blk.length > 0 && (
        <ul className="mt-3 space-y-1">
          {blk.map((e, i) => (
            <li key={i} className="text-[13px]" style={{ color: MUTED }}>· {e}</li>
          ))}
        </ul>
      )}
    </CaveShell>
  );
}

// ── small pieces ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-[16px] border p-4 sm:p-5" style={{ borderColor: "var(--color-border)", background: "#12100d" }}>
      <h2 className="font-[var(--font-display)] text-lg font-semibold" style={{ color: INK }}>{title}</h2>
      {children}
    </section>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3.5 py-1.5 text-sm capitalize"
      style={{
        borderColor: on ? "var(--color-primary)" : "var(--color-border)",
        background: on ? "color-mix(in srgb, var(--color-primary) 16%, transparent)" : "transparent",
        color: on ? INK : MUTED,
      }}
    >
      {children}
    </button>
  );
}

function EvidenceCardRow({ card, onChange, onDelete }: { card: Evidence; onChange: (p: Partial<Evidence>) => void; onDelete: () => void }) {
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-border)", background: "#1a1a14" }}>
      <textarea
        value={card.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="The clue. A note, a statement, a detail."
        rows={2}
        className="w-full resize-none bg-transparent text-sm leading-6 outline-none"
        style={{ color: INK }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(["A", "both", "B"] as Assignment[]).map((a) => (
          <button
            key={a}
            onClick={() => onChange({ assignment: a })}
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              borderColor: card.assignment === a ? "var(--color-primary)" : "var(--color-border)",
              background: card.assignment === a ? "color-mix(in srgb, var(--color-primary) 18%, transparent)" : "transparent",
              color: card.assignment === a ? INK : MUTED,
            }}
          >
            {a === "both" ? "Both" : `Solver ${a}`}
          </button>
        ))}
        <button
          onClick={() => onChange({ is_red_herring: !card.is_red_herring })}
          className="rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: card.is_red_herring ? "var(--color-warm)" : "var(--color-border)",
            color: card.is_red_herring ? "var(--color-warm)" : MUTED,
          }}
        >
          red herring
        </button>
        <button onClick={onDelete} aria-label="delete" className="ml-auto grid h-8 w-8 place-items-center rounded-full" style={{ color: MUTED }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

function AsymCol({ role, cards }: { role: "A" | "B"; cards: Evidence[] }) {
  return (
    <div className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-border)", background: "#100e0b" }}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
        Solver {role} sees {cards.length}
      </div>
      <div className="space-y-1">
        {cards.length === 0 ? (
          <span className="text-xs" style={{ color: MUTED }}>nothing yet</span>
        ) : (
          cards.map((c) => (
            <div key={c.id} className="truncate text-xs" style={{ color: INK }}>
              · {c.content.slice(0, 34) || "(empty card)"}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Live publish blockers, mirrored from the backend checklist so the list is
// always current (the server errors only surface on a failed publish attempt).
function blockers(c: CaseFull): string[] {
  const ev = c.evidence;
  const aOnly = ev.filter((e) => e.assignment === "A").length;
  const bOnly = ev.filter((e) => e.assignment === "B").length;
  const out: string[] = [];
  if (!c.title.trim()) out.push("Add a case title.");
  if (!c.premise.trim()) out.push("Write the case premise.");
  if (ev.length < 4) out.push(`Add at least 4 evidence cards (you have ${ev.length}).`);
  if (aOnly < 1) out.push("Assign at least one card to Solver A only.");
  if (bOnly < 1) out.push("Assign at least one card to Solver B only.");
  if (!c.answer.trim()) out.push("Set the answer.");
  if (!c.correct_text.trim()) out.push("Write the correct verdict text.");
  if (!c.wrong_text.trim()) out.push("Write the wrong verdict text.");
  return out;
}

function caseHealth(c: CaseFull): { color: string; title: string; msg: string } {
  const ev = c.evidence;
  const aOnly = ev.filter((e) => e.assignment === "A").length;
  const bOnly = ev.filter((e) => e.assignment === "B").length;
  const shared = ev.filter((e) => e.assignment === "both").length;
  const herrings = ev.filter((e) => e.is_red_herring).length;
  if (ev.length < 4 || !c.answer.trim()) {
    return {
      color: "#ff725e",
      title: "Hard to solve",
      msg: "Very few clues, or no answer set. Solvers may get stuck with no way forward.",
    };
  }
  if (aOnly === 0 || bOnly === 0) {
    return {
      color: "#ffd166",
      title: "Check your balance",
      msg: `${aOnly === 0 ? "Solver A" : "Solver B"} has no private card. The asymmetry that makes this fun is missing.`,
    };
  }
  if (shared > aOnly + bOnly) {
    return {
      color: "#ffd166",
      title: "Check your balance",
      msg: "More shared cards than private ones. Give each solver more that only they can see.",
    };
  }
  return {
    color: "#56f0aa",
    title: "Balanced",
    msg: herrings > 0 ? "Good asymmetry and a red herring or two. This will play well." : "Good asymmetry. A red herring or two would add tension.",
  };
}
