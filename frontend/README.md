# Skycave frontend

Next.js 15 (App Router) · Tailwind CSS v4 · Framer Motion · globe.gl · Zustand.

## Run

```bash
cp .env.local.example .env.local     # points at the backend on :8000
npm install
npm run fetch:assets                 # bundle flag SVGs + globe texture (one-time)
npm run dev                          # http://localhost:3000
```

## Layout

```
app/
  layout.tsx              fonts (Space Grotesk / Inter / JetBrains Mono), metadata
  globals.css             design tokens (@theme) — spec §7 palette/typography/radii
  page.tsx                Home / Hub
  room/[id]/page.tsx      Lobby (Room Portal) + in-game shell
  results/[id]/page.tsx   Results + score card + share/download
  oauth/page.tsx          Bluesky OAuth callback completion
components/
  ui/        Button, Avatar, GameCard, AuthModal, ConnectionBadge, ScoreCard
  lobby/     RoomPortal (signature animation), PlayerCard, ShareButton
  games/     GameShell, ScoreHeader, Feedback, ColorClash, FlagRush, GeoGuess, GlobePicker
lib/
  types.ts            shared types + WS event names (mirror backend)
  api.ts              REST client + token storage
  websocket.ts        reconnecting socket (backoff + online/visibility resume)
  store.ts            Zustand: auth + live room/game state wired to the socket
  bluesky.ts          compose-intent share + atproto OAuth (lazy-loaded)
  avatar.ts           guest avatar (initials + deterministic color)
  scorecard-image.ts  client-side score card → PNG download
  data/flags.json     country names (used by tooling; flags served from /public)
public/
  flags/              194 bundled flag SVGs
  textures/           globe earth texture
```

## Design system

All tokens from spec §7 live in `app/globals.css` under Tailwind v4's `@theme`
block (palette, fonts, radii, motion). The aesthetic is "midnight arcade":
near-black `#0A0A0F` base, electric violet `#6C63FF`, coral `#FF6B6B`, mint
`#4FFFB0`, with an ambient violet glow behind the page.

## Mobile-first rules enforced

- Designed at 390px; layouts use `max-w-*` and scale up.
- Touch targets ≥ 48px (enforced on `button`/`[role=button]` in `globals.css`).
- No hover-only states — every interactive element has an `active:`/tap response.
- Landscape supported for GeoGuess (the globe takes `landscape:min-h-[60vh]`).
- `prefers-reduced-motion` collapses the portal/spring animations.

## The Room Portal

`components/lobby/RoomPortal.tsx` — a violet ring pulses while waiting; when the
opponent joins (`filled` flips true) the ring sweeps full and "GO" punches out,
then fires `onGo`. This is the one moment of visual drama; everything else stays
quiet.

> **Note:** A `next build` fetches Google Fonts at build time, so it needs
> network access. Components are typed against React 19 / Next 15.
