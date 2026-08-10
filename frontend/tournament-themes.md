# Skycave Tournament — Weekly Theme Roadmap

The tournament world reskins every weekend so the hub feels like a new place each
time. This file is the plan, so no one has to invent a palette on a Monday.

## How a swap works
- **One source of truth:** `lib/tournamentStatus.ts` → the `TOURNEY` object. Its
  colours flow through the hub card (`TournamentBanner`), the "This weekend" hero
  (`TournamentHero`), and all the tournament chrome (tabs, buttons, rules page).
- **Minimum swap (10 min):** replace `TOURNEY` with the week's palette below.
- **Full overhaul (the good version):** also redraw the *scene* in
  `TournamentBanner` + `TournamentHero` to the week's concept (beach = sky/sun/
  sea/sand; a jungle or a galaxy wants its own shapes). The scene is what makes it
  feel like a total change rather than a recolour.
- **Preview before shipping:** open `/tournament/preview` — it renders the card
  and the hero in every state (registration, last call, final, champion) with
  mock data, so you can eyeball the new palette without a live event.
- Keep past palettes in git history, not in `TOURNEY`.

Text-contrast rule of thumb: on a **bright** scene use the dark `ink`; on a
**dark** scene make `ink` near-white and keep the countdown numerals light.

---

## The calendar (weekends are Thu–Sun, Pacific)

| # | Weekend | Theme | One-line vibe |
|---|---------|-------|----------------|
| — | Aug 13–16 | **Ocean / Beach** (LIVE) | turquoise water, warm sand, a low sun |
| 1 | Aug 20–23 | **Neon Arcade** | synthwave night, magenta + cyan grid |
| 2 | Aug 27–30 | **Tropical Jungle** | emerald canopy, gold light shafts |
| 3 | Sep 3–6 | **Cosmic Galaxy** | deep space, nebula, a field of stars |
| 4 | Sep 10–13 | **Blossom Garden** | blush pink, sage, soft and bright |
| 5 | Sep 17–20 | **Desert Dusk** | terracotta dunes, dusty-rose sky |
| 6 | Sep 24–27 | **Deep Sea** | dark water, bioluminescent glow |
| 7 | Oct 1–4 | **Autumn Woods** | amber, rust, gold, falling leaves |
| 8 | Oct 8–11 | **Vineyard** | deep plum and wine, harvest gold |
| 9 | Oct 15–18 | **Misty Pines** | slate-green fog, an ember of warmth |
| 10 | Oct 22–25 | **Spooky Season** | haunted purple, toxic green, pumpkin |
| ★ | Oct 29–Nov 1 | **Halloween Night** | the big one: full moon, ghost-green, pumpkin |

---

## Palettes

Each block gives the signature colours; map them onto `TOURNEY` and the scene.

### Ocean / Beach — LIVE
`accent #0fb5c9 · soft #5fe6da · ink #053244` · sky `#8ad9ee→#cdeef0` · sea `#4bd0cb→#12a0bd` · sand `#ffe7ba→#f2d18c` · sun `#ffce6a` · pop `#e5533d`
Scene: bright sky, low bobbing sun, sea with drifting foam, a shore of sand.

### 1 · Neon Arcade  (dark scene, light ink)
`accent #ff2fb9 · soft #45e0ff · ink #f4f0ff` · bg `#17032e→#3a0a5c` · grid `#ff4fd8` / `#39d0ff` · sun `#ff9a3c→#ff2f87` · pop `#ffe14d`
Scene: a vaporwave grid receding to a horizon, a banded retro sun, star specks.

### 2 · Tropical Jungle  (dark scene, light ink)
`accent #1fbf7a · soft #7ff0b0 · ink #eafff4` · bg `#06331f→#0f5a34` · shaft `#ffe9a3` · pop `#ffd15e`
Scene: layered leaf silhouettes, diagonal light shafts, low mist at the foot.

### 3 · Cosmic Galaxy  (dark scene, light ink)
`accent #a76bff · soft #6be0ff · ink #f2eeff` · bg `#0a0620→#241056` · nebula `#ff5fa2` / `#5fd0ff` · star `#ffffff` · pop `#ffd36b`
Scene: a starfield, a soft nebula swirl, maybe a ringed planet low-right.

### 4 · Blossom Garden  (bright scene, dark ink)
`accent #f2749b · soft #ffc0d4 · ink #3a1230` · sky `#ffe9f1→#f6f0ff` · leaf `#8fbf88` · pop `#ffcf5e`
Scene: pale sky, drifting petals, a bough of blossom, soft sage ground.

### 5 · Desert Dusk  (warm scene, dark ink)
`accent #d97b4a · soft #f0b07a · ink `#37170c` · sky `#f6c9a6→#c98db0` · dune `#e8b477→#b9743e` · sun `#ffb15e` · pop `#8a4f7d`
Scene: rolling dunes, a big low sun, a dusty-rose to peach sky, a lone cactus.

### 6 · Deep Sea  (dark scene, light ink)
`accent #17c3c0 · soft #6ff0e8 · ink #eafcff` · bg `#021a2b→#053a4f` · glow `#38e6c9` / `#7a6bff` · pop `#ffd36b`
Scene: dark water, drifting bioluminescent motes, a soft glow rising from below.

### 7 · Autumn Woods  (warm scene, dark ink)
`accent #c85a2b · soft #e89b57 · ink #2c1608` · sky `#f7e2bd→#e9b877` · gold `#f0b64a` · rust `#9c3d1f` · pop `#7a2e2e`
Scene: autumn trees, falling leaves, a warm low sun, a russet ground.

### 8 · Vineyard  (rich scene, light ink)
`accent #b5477a · soft #e08fb5 · ink #f6ecf1` · bg `#2a0a2e→#4a1230` · vine `#6b8e3a` · gold `#e8b64a` · pop `#ffd36b`
Scene: rows of vines to a horizon, deep plum dusk sky, hanging grapes.

### 9 · Misty Pines  (moody scene, light ink)
`accent #5fbf9a · soft #a7e6cf · ink #eef4f2` · bg `#0e2422→#274a44` · fog `#cfe0da` · ember `#ff8a4c` · pop `#ffb15e`
Scene: pine silhouettes fading into fog, a single warm ember of light.

### 10 · Spooky Season  (dark scene, light ink)
`accent #8a3ff0 · soft #b98cff · ink #f3ecff` · bg `#160726→#2e0d3f` · toxic `#8bff5e` · pumpkin `#ff7a1a` · pop `#ff7a1a`
Scene: bare crooked branches, a purple sky, a toxic-green glow, a pumpkin.

### ★ Halloween Night  (Oct 29–Nov 1, the special)
`accent #ff7a1a · soft #ffb15e · ink #f3ecff` · bg `#0a0612→#241033` · moon `#f6f0d8` · ghost `#8bff9e` · pop `#8a3ff0`
Scene: a full moon over a hill, bats, a jack-o'-lantern grin, ghost-green fog.

---

## Notes
- Seasonal on purpose: Aug is still summer (beach, neon, jungle), September
  cools (garden, desert, deep sea), October turns (autumn, vineyard, mist) and
  ends on Halloween. Feel free to reorder within a month.
- Keep the **red/coral urgency pulse** on every theme — it is a state signal, not
  part of the palette, so "last call" always reads the same.
- If a week is busy, the minimum swap (palette only, beach scene recoloured) still
  looks intentional; the scene redraw is the upgrade when there is time.
