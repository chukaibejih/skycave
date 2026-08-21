import type { Metadata } from "next";

// The room page is a client component, so its per-invite title/description live
// here (a server layout). Pairs with opengraph-image.tsx: the card shows the
// game visually, this is the text beneath it. Both read the public GET /rooms/{id}.
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  let gameName = "a game";
  let host = "";
  try {
    const r = await fetch(`${API}/rooms/${id}`, { cache: "no-store" });
    if (r.ok) {
      const room = (await r.json()) as { game_name?: string; host_handle?: string };
      gameName = room.game_name || gameName;
      host = (room.host_handle || "").replace(/^@+/, "");
      if (host.toLowerCase() === "guest") host = ""; // guest hosts have no real handle
    }
  } catch {
    // Fall through to a generic invite title.
  }

  const title = host ? `@${host} invited you to ${gameName}` : `A ${gameName} invite on Skycave`;
  const description = "Tap in and play, right in your browser.";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
