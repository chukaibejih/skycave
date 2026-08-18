import type { Metadata } from "next";
import ProtocolClient from "./ProtocolClient";

export const metadata: Metadata = {
  title: "Open Gaming Graph",
  description:
    "Skycave's vision for evolving from an AT Protocol game platform into the open gaming graph of the Atmosphere. A direction and an experimental protocol path, not a shipped product.",
  openGraph: {
    title: "Open Gaming Graph · Skycave",
    description:
      "The open gaming graph of the Atmosphere. Skycave's experimental protocol vision: portable gaming history, open trophies, and games any developer can publish.",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Open Gaming Graph · Skycave",
    description: "The open gaming graph of the Atmosphere. Skycave's experimental protocol vision.",
  },
};

export default function ProtocolPage() {
  return <ProtocolClient />;
}
