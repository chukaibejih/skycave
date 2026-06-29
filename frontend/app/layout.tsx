import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
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
      <body>{children}</body>
    </html>
  );
}
