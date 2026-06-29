// Deterministic guest avatar: initials + a color derived from the identity id.
const PALETTE = [
  "#6C63FF",
  "#FF6B6B",
  "#4FFFB0",
  "#FFB04F",
  "#4FB0FF",
  "#B96CFF",
  "#FF6CC4",
  "#5CD6C0",
];

export function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().replace(/^@/, "").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
