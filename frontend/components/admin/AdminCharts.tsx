"use client";
import { useState } from "react";

// Palette (dark surface). Marks carry identity; text always uses ink tokens.
const INK_MUTED = "#9aa3ba";
const GRID = "#283044";
const SURFACE = "#10131c";

const VBW = 720;
const VBH = 240;
const PAD = { l: 34, r: 12, t: 14, b: 24 };
const PLOT_W = VBW - PAD.l - PAD.r;
const PLOT_H = VBH - PAD.t - PAD.b;

export interface Series {
  name: string;
  color: string;
  values: number[];
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m]} ${+d}`;
};

/**
 * Stacked-area time chart (one or more series) with a hover crosshair + tooltip.
 * A single series renders as a filled line. Legend is always shown for >= 2.
 */
export function TimeChart({
  labels,
  series,
  unit = "",
}: {
  labels: string[];
  series: Series[];
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] || 0), 0));
  const maxY = niceCeil(Math.max(1, ...totals));

  const xAt = (i: number) => PAD.l + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yAt = (v: number) => PAD.t + PLOT_H - (v / maxY) * PLOT_H;

  // Build stacked bands bottom-up.
  let cum = labels.map(() => 0);
  const bands = series.map((ser) => {
    const lower = [...cum];
    const upper = labels.map((_, i) => cum[i] + (ser.values[i] || 0));
    cum = upper;
    const top = labels.map((_, i) => `${xAt(i)},${yAt(upper[i])}`);
    const bottom = [...labels].map((_, i) => `${xAt(i)},${yAt(lower[i])}`).reverse();
    return {
      color: ser.color,
      fill: `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`,
      line: `M ${top.join(" L ")}`,
      upper,
    };
  });

  const gridVals = [0, maxY / 2, maxY];
  const xTicks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  const hi = hover;
  const tooltipLeft = hi !== null ? (xAt(hi) / VBW) * 100 : 0;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full" style={{ height: "auto" }}>
        {/* recessive gridlines + y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={VBW - PAD.r} y1={yAt(v)} y2={yAt(v)} stroke={GRID} strokeWidth={1} strokeOpacity={0.5} />
            <text x={PAD.l - 6} y={yAt(v) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* stacked bands: solid fill + 2px surface gap between segments + series top line */}
        {bands.map((b, i) => (
          <path key={`f${i}`} d={b.fill} fill={b.color} fillOpacity={0.9} />
        ))}
        {bands.map((b, i) => (
          <path
            key={`l${i}`}
            d={b.line}
            fill="none"
            stroke={i < bands.length - 1 ? SURFACE : b.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* x date ticks */}
        {xTicks.map((i) => (
          <text key={i} x={xAt(i)} y={VBH - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={10} fill={INK_MUTED}>
            {fmtDay(labels[i])}
          </text>
        ))}

        {/* hover crosshair + markers */}
        {hi !== null && (
          <g>
            <line x1={xAt(hi)} x2={xAt(hi)} y1={PAD.t} y2={PAD.t + PLOT_H} stroke={INK_MUTED} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} />
            {bands.map((b, i) => (
              <circle key={i} cx={xAt(hi)} cy={yAt(b.upper[hi])} r={3.5} fill={series[i].color} stroke={SURFACE} strokeWidth={1.5} />
            ))}
          </g>
        )}

        {/* invisible per-day hit targets */}
        {labels.map((_, i) => (
          <rect
            key={i}
            x={PAD.l + (n <= 1 ? 0 : (i - 0.5) / (n - 1) * PLOT_W)}
            y={PAD.t}
            width={n <= 1 ? PLOT_W : PLOT_W / (n - 1)}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {/* tooltip */}
      {hi !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2 text-xs shadow-xl"
          style={{ left: `${Math.min(88, Math.max(12, tooltipLeft))}%` }}
        >
          <div className="mb-1 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
            {fmtDay(labels[hi])}
          </div>
          {series.map((ser) => (
            <div key={ser.name} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: ser.color }} />
              <span className="text-[var(--color-text-secondary)]">{ser.name}</span>
              <span className="ml-auto font-[var(--font-mono)] font-semibold">{ser.values[hi] || 0}</span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="mt-1 flex items-center gap-2 border-t border-[var(--color-border)] pt-1">
              <span className="text-[var(--color-text-secondary)]">total</span>
              <span className="ml-auto font-[var(--font-mono)] font-semibold">{totals[hi]}</span>
            </div>
          )}
          {unit && <span className="sr-only">{unit}</span>}
        </div>
      )}
    </div>
  );
}

/** Legend row for a set of series. */
export function Legend({ series }: { series: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars for categorical magnitude, with per-bar hover + direct labels. */
export function BarList({
  items,
  color = "#8b7cff",
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const [hover, setHover] = useState<number | null>(null);
  if (items.length === 0) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No games yet.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div
          key={it.label}
          className="flex items-center gap-3"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="w-28 shrink-0 truncate text-sm">{it.label}</div>
          <div className="h-6 flex-1 overflow-hidden rounded-full" style={{ background: SURFACE }}>
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${(it.value / max) * 100}%`,
                background: color,
                opacity: hover === null || hover === i ? 1 : 0.55,
              }}
            />
          </div>
          <div className="w-9 text-right font-[var(--font-mono)] text-sm">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

// A 100%-stacked horizontal bar with a labeled legend below (share of a whole).
export function SplitBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div>
      <div className="flex h-7 w-full overflow-hidden rounded-full" style={{ background: SURFACE }}>
        {segments.map((s) =>
          s.value > 0 ? (
            <div key={s.label} title={`${s.label}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ) : null
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-[var(--color-text-secondary)]">{s.label}</span>
            <span className="font-[var(--font-mono)]">{s.value.toLocaleString()}</span>
            <span className="text-[var(--color-text-secondary)]">· {pct(s.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
