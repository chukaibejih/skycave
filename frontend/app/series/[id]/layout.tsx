import type { Metadata } from "next";

// The series page is a client component, so its per-series title/description
// live here (a server layout). Pairs with opengraph-image.tsx: the card is the
// visual, this is the text beneath it. Both read the public GET /series/{id}.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function realName(n: string | undefined): string {
  const name = (n || "").trim();
  if (!name || ["guest", "player"].includes(name.toLowerCase())) return "";
  return name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let winsNeeded = 2;
  let challenger = "";
  try {
    const r = await fetch(`${API}/series/${id}`, { cache: "no-store" });
    if (r.ok) {
      const s = (await r.json()) as {
        wins_needed?: number;
        player1?: { name?: string };
      };
      winsNeeded = s.wins_needed || 2;
      challenger = realName(s.player1?.name);
    }
  } catch {
    // Fall through to a generic series title.
  }

  const best = winsNeeded * 2 - 1;
  const title = challenger
    ? `${challenger} challenges you to a best-of-${best}`
    : `A head-to-head series on Skycave`;
  const description = `First to ${winsNeeded} wins, across random games. Tap in and play.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function SeriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
