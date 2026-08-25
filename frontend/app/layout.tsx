import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import { ChallengeButton } from "@/components/ui/ChallengeButton";
import { ChampionInit } from "@/components/ChampionInit";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Skycave: games for Bluesky, Blacksky, and beyond",
  description:
    "Fast, casual multiplayer games for Bluesky, Blacksky, and beyond. Post a link, your opponent taps in.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://skycave.space"
  ),
  openGraph: {
    title: "Skycave",
    description: "Play with anyone on Bluesky, Blacksky, and beyond.",
    siteName: "Skycave",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skycave",
    description: "Play with anyone on Bluesky, Blacksky, and beyond.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  // Allow landscape + the globe to use real estate; don't lock zoom away from
  // users who need it, but discourage accidental pinch during fast tapping.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body>
        {children}
        <ChampionInit />
        <ChallengeButton />
      </body>
    </html>
  );
}
