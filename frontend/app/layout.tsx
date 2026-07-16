import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import Script from "next/script";
import { FeedbackButton } from "@/components/ui/FeedbackButton";
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
  title: "Skycave: play with anyone on Bluesky",
  description:
    "Fast, casual multiplayer games. Post a link to Bluesky, your opponent taps in. No account needed.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://skycave.space"
  ),
  openGraph: {
    title: "Skycave",
    description: "Play with anyone on Bluesky. No account needed.",
    siteName: "Skycave",
    type: "website",
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

// Only load analytics for real production traffic: excludes local dev
// (NODE_ENV !== production) and Vercel preview deploys (VERCEL_ENV === preview),
// while still covering Vercel prod and any self-hosted prod build.
const analyticsEnabled =
  process.env.NODE_ENV === "production" &&
  process.env.VERCEL_ENV !== "preview";

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
        <FeedbackButton />
      </body>
      {/* Heetsesh analytics — production only (async, non-blocking, every page). */}
      {analyticsEnabled && (
        <Script
          src="https://cdn.heetsesh.com/heetsesh.js"
          strategy="afterInteractive"
          data-project-key="hk_BCrjdpIjdwIeP9SdvUpXRbReTnjTv0-1"
          data-endpoint="https://ingest.heetsesh.com/ingest"
        />
      )}
    </html>
  );
}
