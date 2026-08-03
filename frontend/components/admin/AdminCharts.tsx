"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// Palette (dark surface). Marks carry identity; text always uses ink tokens.
const INK_MUTED = "#9aa3ba";
const GRID = "#283044";
const SURFACE = "#10131c";

export interface Series {
  name: string;
  color: string;
  values: number[];
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
  // data format for recharts:
  // [{ date: "2023-01-01", s1: 10, s2: 20 }, ...]
  const data = labels.map((label, i) => {
    const pt: any = { date: label };
    series.forEach((s) => (pt[s.name] = s.values[i] || 0));
    return pt;
  });

  return (
    <div className="h-[260px] w-full" style={{ WebkitTapHighlightColor: "transparent" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.name} id={`color_${s.name.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} opacity={0.5} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDay}
            stroke={INK_MUTED}
            tick={{ fontSize: 10, fill: INK_MUTED }}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis stroke={INK_MUTED} tick={{ fontSize: 10, fill: INK_MUTED }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip unit={unit} />} cursor={{ stroke: INK_MUTED, strokeWidth: 1, strokeDasharray: "3 3" }} />
          {series.map((s) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stackId="1"
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#color_${s.name.replace(/\s+/g, "")})`}
              activeDot={{ r: 5, strokeWidth: 0, fill: s.color }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Custom Tooltip for Recharts
function CustomTooltip({ active, payload, label, unit }: any) {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, p: any) => sum + p.value, 0);
    return (
      <div className="rounded-[12px] border border-white/10 bg-black/50 px-4 py-3 text-sm shadow-xl backdrop-blur-xl">
        <div className="mb-3 font-[var(--font-mono)] text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
          {fmtDay(label)}
        </div>
        <div className="space-y-2">
          {payload.map((p: any) => (
            <div key={p.name} className="flex items-center gap-3 whitespace-nowrap">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 8px ${p.color}80` }} />
              <span className="text-[var(--color-text-secondary)]">{p.name}</span>
              <span className="ml-auto font-[var(--font-mono)] font-bold text-white">{p.value}</span>
            </div>
          ))}
        </div>
        {payload.length > 1 && (
          <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-3">
            <span className="text-[var(--color-text-secondary)]">Total</span>
            <span className="ml-auto font-[var(--font-mono)] font-bold text-[var(--color-gold)]">{total}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

/** Legend row for a set of series. */
export function Legend({ series }: { series: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}60` }} />
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
    return <p className="text-sm text-[var(--color-text-secondary)]">No data yet.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div
          key={it.label}
          className="flex items-center gap-4"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="w-28 shrink-0 truncate text-sm font-medium text-[var(--color-text-primary)]">{it.label}</div>
          <div className="h-6 flex-1 overflow-hidden rounded-full border border-white/5 bg-black/40 shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full transition-opacity"
              style={{
                background: color,
                opacity: hover === null || hover === i ? 1 : 0.6,
                boxShadow: `0 0 10px ${color}40`,
              }}
            />
          </div>
          <div className="w-9 text-right font-[var(--font-mono)] text-sm font-bold">{it.value}</div>
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-full border border-white/5 bg-black/40 p-[2px] shadow-inner">
        {segments.map((s, i) =>
          s.value > 0 ? (
            <motion.div
              key={s.label}
              initial={{ width: 0 }}
              animate={{ width: `${(s.value / total) * 100}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.1 }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="relative cursor-default rounded-full transition-opacity"
              style={{
                background: s.color,
                opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.4,
                boxShadow: hoverIdx === i ? `0 0 12px ${s.color}60` : "none",
                marginLeft: i > 0 ? "2px" : "0",
              }}
            >
              {hoverIdx === i && (
                <div className="absolute inset-0 rounded-full bg-white/10" />
              )}
            </motion.div>
          ) : null
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="flex items-center gap-2 text-sm transition-opacity"
            style={{ opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.5 }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shadow-sm"
              style={{ background: s.color, boxShadow: `0 0 8px ${s.color}60` }}
            />
            <span className="font-medium text-[var(--color-text-secondary)]">{s.label}</span>
            <span className="font-[var(--font-mono)] font-bold">{s.value.toLocaleString()}</span>
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)]">
              {pct(s.value)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
