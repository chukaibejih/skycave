import type { Metadata } from "next";
import { BracketView } from "@/components/tournament/BracketView";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The bracket URL is the shareable one, so the card it produces on Bluesky has
 * to say something real: who is playing, how far along it is, who is left.
 *
 * This is a server component purely so the crawler gets that in the HTML; the
 * live bracket underneath is a client component that polls.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    // No-store: a cached card would show a stale scoreline after a result.
    const res = await fetch(`${API}/tournaments/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    const t = await res.json();

    const title = t.champion
      ? `${t.champion.display_name} wins the ${t.name}`
      : t.name;

    const left = (t.matches ?? []).filter(
      (m: { status: string }) => m.status !== "done" && m.status !== "bye"
    ).length;

    const description =
      t.status === "registering"
        ? `${t.spots_left} of ${t.max_players} spots left. Enter before the draw.`
        : t.status === "finished"
          ? `${t.entrants} played, one came out on top. See how it went.`
          : `${t.entrants} in the draw. ${left} ${left === 1 ? "match" : "matches"} still to play.`;

    return {
      title,
      description,
      openGraph: { title, description, siteName: "Skycave", type: "website" },
      twitter: { card: "summary_large_image", title, description },
    };
  } catch {
    return {
      title: "Skycave Weekend Tournament",
      description: "One weekend, straight knockout, best of three a round.",
    };
  }
}

export default async function TournamentBracketPage({ params }: Props) {
  const { id } = await params;
  return <BracketView id={id} />;
}
