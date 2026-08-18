"use client";

import { useEffect, useRef } from "react";

/*
 * The Open Gaming Graph — Skycave's public vision / experimental protocol page.
 *
 * Ported verbatim from the design artifact. The markup is injected as a static
 * HTML string and every style is scoped under `.ogg`, so nothing here touches
 * the rest of the app (FeedbackButton, ChampionInit, other routes). Tokens map
 * onto Skycave's real CSS variables (--font-mono, --font-body, --color-*), so
 * the page renders in the app's actual fonts, not a lookalike stack.
 */

const CSS = `
.ogg {
  --base: var(--color-base, #05060a);
  --surface: var(--color-surface, #10131c);
  --elevated: #161b28;
  --line: rgba(255, 255, 255, 0.09);
  --line-strong: rgba(255, 255, 255, 0.16);
  --purple: var(--color-primary, #8b7cff);
  --cyan: var(--color-cyan, #67e8f9);
  --gold: var(--color-gold, #ffd166);
  --success: var(--color-success, #56f0aa);
  --warm: var(--color-warm, #ff725e);
  --ink: var(--color-text-primary, #f5f7ff);
  --ink-2: var(--color-text-secondary, #9aa3ba);
  --ink-3: #6b7488;
  --mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
  --sans: var(--font-body, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --wrap: 1120px;
  --measure: 66ch;

  background: var(--base);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  overflow-x: hidden;
}
.ogg * { box-sizing: border-box; }
.ogg a { color: inherit; }
.ogg ::selection { background: rgba(139, 124, 255, 0.32); }
.ogg :focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; border-radius: 4px; }

.ogg .wrap { width: 100%; max-width: var(--wrap); margin: 0 auto; padding: 0 24px; }

/* mono utilities */
.ogg .mono { font-family: var(--mono); }
.ogg .eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--ink-3); display: inline-flex; align-items: center; gap: 10px;
}
.ogg .eyebrow::before { content: ""; width: 22px; height: 1px; background: currentColor; opacity: 0.6; }
.ogg .tag {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--ink-2); white-space: nowrap;
}

/* top bar */
.ogg header.bar {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px); background: color-mix(in srgb, var(--base) 78%, transparent);
  border-bottom: 1px solid var(--line);
}
.ogg .bar-inner { height: 60px; display: flex; align-items: center; gap: 22px; }
.ogg .brand {
  font-family: var(--mono); font-weight: 700; letter-spacing: 0.04em; text-decoration: none;
  display: flex; align-items: center; gap: 9px; font-size: 15px; color: var(--ink);
}
.ogg .brand .dot {
  width: 12px; height: 12px; border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, #b9acff, var(--purple) 62%, #5b4fd6);
  box-shadow: 0 0 14px rgba(139, 124, 255, 0.7);
}
.ogg .brand .sub { color: var(--ink-3); font-weight: 400; }
.ogg .bar nav { margin-left: auto; display: flex; align-items: center; gap: 22px; }
.ogg .bar nav a {
  font-family: var(--mono); font-size: 12.5px; letter-spacing: 0.08em; text-transform: uppercase;
  text-decoration: none; color: var(--ink-2); transition: color 0.18s;
}
.ogg .bar nav a:hover { color: var(--ink); }
.ogg .bar .badge {
  font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--gold); border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
  padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--gold) 9%, transparent);
}
@media (max-width: 860px) { .ogg .bar nav .navlink { display: none; } }

/* hero */
.ogg .hero { position: relative; overflow: hidden; border-bottom: 1px solid var(--line); }
.ogg #graph { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ogg .hero-veil {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60% 55% at 78% 18%, rgba(103, 232, 249, 0.10), transparent 70%),
    radial-gradient(70% 60% at 12% 30%, rgba(139, 124, 255, 0.12), transparent 72%),
    linear-gradient(180deg, transparent 45%, var(--base) 100%);
}
.ogg .hero-inner { position: relative; z-index: 2; padding: 92px 0 84px; }
.ogg .hero h1 {
  font-family: var(--mono); font-weight: 700; letter-spacing: 0.02em; line-height: 1.02;
  margin: 22px 0 0; font-size: clamp(2.5rem, 7vw, 5.1rem); text-wrap: balance; text-transform: uppercase;
}
.ogg .hero h1 .of { display: block; color: var(--ink-2); font-weight: 400; font-size: 0.42em; letter-spacing: 0.18em; margin-top: 14px; }
.ogg .hero h1 .grad {
  background: linear-gradient(96deg, var(--purple), var(--cyan) 62%, var(--success));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.ogg .hero-lede { margin: 26px 0 0; max-width: 60ch; color: var(--ink-2); font-size: clamp(1.02rem, 2.3vw, 1.22rem); }
.ogg .hero-lede b { color: var(--ink); font-weight: 600; }
.ogg .hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 34px; }
.ogg .btn {
  font-family: var(--mono); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase;
  text-decoration: none; padding: 13px 22px; border-radius: 12px; display: inline-flex; gap: 9px; align-items: center;
  transition: transform 0.16s, filter 0.16s, background 0.16s;
}
.ogg .btn.primary { background: var(--purple); color: #05060a; font-weight: 700; }
.ogg .btn.primary:hover { transform: translateY(-1px); filter: brightness(1.06); }
.ogg .btn.ghost { border: 1px solid var(--line-strong); color: var(--ink); }
.ogg .btn.ghost:hover { background: rgba(255,255,255,0.05); }

.ogg .factrow { display: flex; flex-wrap: wrap; gap: 34px 48px; margin-top: 52px; }
.ogg .fact .n { font-family: var(--mono); font-size: clamp(1.5rem, 4vw, 2.1rem); font-weight: 700; letter-spacing: -0.01em; }
.ogg .fact .l { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); margin-top: 4px; }
.ogg .fact .n.c-p { color: var(--purple); } .ogg .fact .n.c-c { color: var(--cyan); } .ogg .fact .n.c-g { color: var(--gold); } .ogg .fact .n.c-s { color: var(--success); }

/* honesty frame */
.ogg .honesty {
  margin-top: 46px; border: 1px solid color-mix(in srgb, var(--gold) 34%, transparent);
  background: color-mix(in srgb, var(--gold) 7%, transparent);
  border-radius: 16px; padding: 18px 22px; display: flex; gap: 16px; align-items: flex-start;
}
.ogg .honesty .ico { color: var(--gold); font-family: var(--mono); font-weight: 700; font-size: 15px; border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent); border-radius: 8px; padding: 3px 9px; flex: none; }
.ogg .honesty p { margin: 0; font-size: 15px; color: var(--ink-2); }
.ogg .honesty b { color: var(--ink); }

/* section scaffold */
.ogg section { padding: 88px 0; border-bottom: 1px solid var(--line); }
.ogg .section-head { max-width: var(--measure); }
.ogg h2 {
  font-family: var(--mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em;
  font-size: clamp(1.7rem, 4vw, 2.5rem); line-height: 1.08; margin: 16px 0 0; text-wrap: balance;
}
.ogg .section-head p { color: var(--ink-2); max-width: var(--measure); margin: 18px 0 0; }
.ogg h3 { font-family: var(--sans); font-weight: 700; font-size: 1.16rem; margin: 0 0 6px; letter-spacing: -0.01em; }
.ogg p { max-width: var(--measure); }
.ogg .lead-quote {
  font-family: var(--mono); font-size: clamp(1.05rem, 2.6vw, 1.5rem); line-height: 1.45;
  border-left: 2px solid var(--purple); padding-left: 22px; margin: 30px 0 0; color: var(--ink); max-width: 40ch;
}

/* the principle: boundary columns */
.ogg .cols3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 40px; }
@media (max-width: 820px) { .ogg .cols3 { grid-template-columns: 1fr; } }
.ogg .bcard { border: 1px solid var(--line); border-radius: 16px; padding: 22px; background: var(--surface); }
.ogg .bcard .cap { font-family: var(--mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.ogg .bcard .cap .sw { width: 9px; height: 9px; border-radius: 3px; }
.ogg .bcard.pub .cap { color: var(--success); } .ogg .bcard.pub { border-color: color-mix(in srgb, var(--success) 26%, var(--line)); }
.ogg .bcard.priv .cap { color: var(--gold); } .ogg .bcard.rt .cap { color: var(--cyan); } .ogg .bcard.rt { border-color: color-mix(in srgb, var(--cyan) 24%, var(--line)); }
.ogg .bcard ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.ogg .bcard li { font-family: var(--mono); font-size: 13.5px; color: var(--ink-2); padding-left: 16px; position: relative; }
.ogg .bcard li::before { content: "·"; position: absolute; left: 2px; color: var(--ink-3); }
.ogg .rt-note { margin-top: 26px; font-family: var(--mono); font-size: 13px; color: var(--ink-3); }

/* figure / diagram */
.ogg figure { margin: 40px 0 0; }
.ogg .figbox { border: 1px solid var(--line); border-radius: 18px; background: linear-gradient(180deg, var(--surface), #0c0f17); padding: 26px 22px 12px; overflow-x: auto; }
.ogg figure svg { display: block; width: 100%; height: auto; max-width: 100%; color: var(--ink); }
.ogg figcaption { font-family: var(--mono); font-size: 12.5px; color: var(--ink-3); margin-top: 14px; letter-spacing: 0.02em; }
.ogg .di-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.04em; fill: var(--ink); }
.ogg .di-sub { font-family: var(--mono); font-size: 10.5px; fill: var(--ink-3); letter-spacing: 0.02em; }
.ogg .di-edge { font-family: var(--mono); font-size: 10px; fill: var(--ink-2); letter-spacing: 0.03em; }

/* code block */
.ogg .code { border: 1px solid var(--line); border-radius: 16px; background: #0b0e15; overflow: hidden; margin: 26px 0 0; }
.ogg .code .top { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.ogg .code .top .d { width: 10px; height: 10px; border-radius: 50%; background: #2a3140; }
.ogg .code .top .name { margin-left: 10px; font-family: var(--mono); font-size: 12px; color: var(--ink-3); letter-spacing: 0.06em; }
.ogg .code pre { margin: 0; padding: 18px 20px; overflow-x: auto; font-family: var(--mono); font-size: 13.5px; line-height: 1.75; color: var(--ink-2); }
.ogg .code pre .k { color: var(--cyan); }
.ogg .code pre .s { color: var(--gold); }
.ogg .code pre .c { color: var(--ink-3); font-style: italic; }
.ogg .code pre .p { color: var(--purple); }
.ogg .code pre .g { color: var(--success); }

/* building block cards */
.ogg .grid-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; }
@media (max-width: 900px) { .ogg .grid-cards { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .ogg .grid-cards { grid-template-columns: 1fr; } }
.ogg .cc { border: 1px solid var(--line); border-radius: 16px; padding: 22px; background: var(--surface); transition: border-color 0.2s, transform 0.2s; }
.ogg .cc:hover { border-color: var(--line-strong); transform: translateY(-2px); }
.ogg .cc .ico { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; margin-bottom: 14px; border: 1px solid var(--line-strong); font-size: 18px; }
.ogg .cc h3 { font-size: 1.04rem; }
.ogg .cc p { font-size: 14.5px; color: var(--ink-2); margin: 0; max-width: none; }
.ogg .cc .lx { font-family: var(--mono); font-size: 11.5px; color: var(--cyan); margin-top: 12px; letter-spacing: 0.02em; word-break: break-all; }

/* roadmap */
.ogg .rail { margin-top: 44px; position: relative; padding-left: 30px; }
.ogg .rail::before { content: ""; position: absolute; left: 7px; top: 6px; bottom: 6px; width: 2px; background: linear-gradient(180deg, var(--purple), var(--cyan) 55%, var(--gold)); opacity: 0.6; }
.ogg .phase { position: relative; padding: 0 0 30px; }
.ogg .phase:last-child { padding-bottom: 0; }
.ogg .phase .node { position: absolute; left: -30px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--base); border: 2px solid var(--purple); }
.ogg .phase .no { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
.ogg .phase h3 { margin: 3px 0 5px; font-size: 1.06rem; }
.ogg .phase p { margin: 0; font-size: 14.5px; color: var(--ink-2); max-width: 62ch; }
.ogg .phase .exit { font-family: var(--mono); font-size: 12.5px; color: var(--success); margin-top: 8px; display: block; }
.ogg .phase .exit b { color: var(--ink-2); font-weight: 400; }

/* proofs */
.ogg .proofs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 38px; }
@media (max-width: 900px) { .ogg .proofs { grid-template-columns: 1fr; } }
.ogg .proof { border: 1px solid var(--line); border-radius: 14px; padding: 18px; background: var(--surface); }
.ogg .proof .n { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--cyan); }
.ogg .proof p { font-size: 14px; margin: 8px 0 0; color: var(--ink); max-width: none; }
.ogg .proof .gate { font-family: var(--mono); font-size: 11.5px; color: var(--warm); margin-top: 10px; display: block; }

/* governance / two-col */
.ogg .two { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 40px; align-items: start; }
@media (max-width: 820px) { .ogg .two { grid-template-columns: 1fr; } }
.ogg .qlist { display: flex; flex-direction: column; gap: 4px; }
.ogg .q { border-bottom: 1px solid var(--line); padding: 15px 0; }
.ogg .q:first-child { padding-top: 0; }
.ogg .q .qq { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--warm); }
.ogg .q p { margin: 6px 0 0; font-size: 14.5px; color: var(--ink-2); max-width: none; }
.ogg .ladder { display: flex; flex-direction: column; gap: 8px; }
.ogg .rung { display: flex; align-items: center; gap: 14px; border: 1px solid var(--line); border-radius: 12px; padding: 13px 16px; background: var(--surface); }
.ogg .rung .lvl { font-family: var(--mono); font-size: 11px; width: 20px; text-align: center; color: var(--ink-3); }
.ogg .rung .who { font-family: var(--mono); font-size: 13.5px; }
.ogg .rung .bar { margin-left: auto; height: 6px; border-radius: 3px; }
.ogg .rung.r1 .bar { width: 22px; background: var(--warm); } .ogg .rung.r1 .who { color: var(--ink-2); }
.ogg .rung.r2 .bar { width: 44px; background: #e8b04e; }
.ogg .rung.r3 .bar { width: 70px; background: var(--gold); }
.ogg .rung.r4 .bar { width: 100px; background: var(--success); } .ogg .rung.r4 { border-color: color-mix(in srgb, var(--success) 34%, var(--line)); }
.ogg .ladder-note { font-family: var(--mono); font-size: 12.5px; color: var(--ink-3); margin-top: 14px; }

/* non-goals */
.ogg .nogoals { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 34px; }
.ogg .ng { font-family: var(--mono); font-size: 13px; color: var(--ink-2); border: 1px solid var(--line); border-radius: 10px; padding: 9px 14px; display: inline-flex; gap: 9px; align-items: center; }
.ogg .ng::before { content: "✕"; color: var(--warm); font-size: 12px; }
.ogg .prog { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; }
@media (max-width: 820px) { .ogg .prog { grid-template-columns: 1fr; } }
.ogg .step { border: 1px solid var(--line); border-radius: 16px; padding: 22px; background: var(--surface); position: relative; }
.ogg .step .when { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
.ogg .step .say { font-size: 1.12rem; font-weight: 600; margin: 12px 0 0; line-height: 1.4; }
.ogg .step:nth-child(3) .say { color: var(--purple); }

/* closing */
.ogg .close { padding: 100px 0; border-bottom: none; text-align: center; position: relative; overflow: hidden; }
.ogg .close::before { content: ""; position: absolute; inset: 0; background: radial-gradient(50% 70% at 50% 0%, rgba(139,124,255,0.14), transparent 70%); pointer-events: none; }
.ogg .close .pieces { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin: 0 auto 40px; max-width: 760px; }
.ogg .piece { font-family: var(--mono); font-size: 12.5px; letter-spacing: 0.04em; color: var(--ink-2); border: 1px solid var(--line-strong); border-radius: 999px; padding: 8px 15px; }
.ogg .piece b { color: var(--cyan); }
.ogg .principle {
  font-family: var(--mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.01em;
  font-size: clamp(1.5rem, 4.5vw, 2.7rem); line-height: 1.2; max-width: 20ch; margin: 0 auto; text-wrap: balance; position: relative;
}
.ogg .principle .a { color: var(--warm); } .ogg .principle .b { color: var(--success); }
.ogg .close .foot-line { font-family: var(--sans); color: var(--ink-2); margin: 30px auto 0; max-width: 52ch; }

/* footer */
.ogg footer { padding: 54px 0 70px; }
.ogg .foot-grid { display: flex; flex-wrap: wrap; gap: 30px 60px; justify-content: space-between; }
.ogg .foot-grid h4 { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 14px; }
.ogg .foot-links { display: flex; flex-direction: column; gap: 9px; }
.ogg .foot-links a { font-size: 14px; color: var(--ink-2); text-decoration: none; }
.ogg .foot-links a:hover { color: var(--ink); }
.ogg .foot-meta { margin-top: 40px; padding-top: 22px; border-top: 1px solid var(--line); font-family: var(--mono); font-size: 12px; color: var(--ink-3); display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; }

/* reveal */
.ogg .reveal { opacity: 0; transform: translateY(18px); transition: opacity 0.7s ease, transform 0.7s ease; }
.ogg .reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { .ogg .reveal { opacity: 1; transform: none; transition: none; } }
`;

const MARKUP = `
<header class="bar">
  <div class="wrap bar-inner">
    <a class="brand" href="/"><span class="dot"></span>skycave<span class="sub">/ protocol</span></a>
    <nav>
      <a class="navlink" href="#shift">Shift</a>
      <a class="navlink" href="#principle">Principle</a>
      <a class="navlink" href="#blocks">Blocks</a>
      <a class="navlink" href="#architecture">Architecture</a>
      <a class="navlink" href="#roadmap">Roadmap</a>
      <span class="badge">Vision</span>
    </nav>
  </div>
</header>

<a id="top"></a>
<section class="hero">
  <canvas id="graph" aria-hidden="true"></canvas>
  <div class="hero-veil"></div>
  <div class="wrap hero-inner">
    <span class="eyebrow">Skycave · Vision &amp; Experimental Direction</span>
    <h1>The Open Gaming Graph<span class="of">of the <span class="grad">Atmosphere</span></span></h1>
    <p class="hero-lede">
      Skycave should not merely <b>integrate</b> with AT Protocol. It has a credible shot at
      defining what gaming looks like as a native application category on the open social web —
      the layer where players, games, matches, rivalries, tournaments, and achievements connect.
    </p>
    <div class="hero-cta">
      <a class="btn primary" href="#shift">Read the thesis →</a>
      <a class="btn ghost" href="#roadmap">The roadmap</a>
    </div>

    <div class="factrow">
      <div class="fact"><div class="n c-p mono">4</div><div class="l">boring lexicons to start</div></div>
      <div class="fact"><div class="n c-c mono">1</div><div class="l">record publisher</div></div>
      <div class="fact"><div class="n c-g mono">1</div><div class="l">external game</div></div>
      <div class="fact"><div class="n c-s mono">∞</div><div class="l">views over shared facts</div></div>
    </div>

    <div class="honesty">
      <span class="ico">i</span>
      <p><b>None of this is built yet.</b> This is a direction, not a promise — a public vision and an
      experimental protocol path. The live Skycave product stays fast, opinionated, and centralized
      where centralization makes a better game. This page describes what could grow <i>around</i> it.</p>
    </div>
  </div>
</section>

<section id="shift">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Shift</span>
      <h2>From a game platform to a gaming graph</h2>
      <p>The unambitious framing is “a website where Bluesky users play browser games.” Even “the
      AT Protocol gaming platform” undersells it. The useful framing: Skycave becomes the layer that
      gives <em>any</em> game an identity, a record, a reputation, and a social context — without
      needing to run every game itself.</p>
    </div>

    <figure class="reveal">
      <div class="figbox">
        <svg viewBox="0 0 900 360" role="img" aria-label="Skycave sits between three pillars — identity, competition, discovery — feeding an open game layer of Skycave, indie, and community games.">
          <g text-anchor="middle">
            <rect x="70" y="34" width="200" height="58" rx="12" fill="#10131c" stroke="#8b7cff" stroke-opacity="0.5"/>
            <text class="di-label" x="170" y="60" fill="#8b7cff">IDENTITY</text>
            <text class="di-sub" x="170" y="78">profiles · history · achievements</text>
            <rect x="350" y="34" width="200" height="58" rx="12" fill="#10131c" stroke="#67e8f9" stroke-opacity="0.5"/>
            <text class="di-label" x="450" y="60" fill="#67e8f9">COMPETITION</text>
            <text class="di-sub" x="450" y="78">matches · ratings · tournaments</text>
            <rect x="630" y="34" width="200" height="58" rx="12" fill="#10131c" stroke="#ffd166" stroke-opacity="0.5"/>
            <text class="di-label" x="730" y="60" fill="#ffd166">DISCOVERY</text>
            <text class="di-sub" x="730" y="78">feeds · challenges · social graph</text>
          </g>
          <rect x="330" y="150" width="240" height="60" rx="14" fill="#8b7cff" fill-opacity="0.08" stroke="#f5f7ff" stroke-opacity="0.28"/>
          <text class="di-label" x="450" y="180" text-anchor="middle" fill="#f5f7ff" style="letter-spacing:0.14em">SKYCAVE NETWORK</text>
          <text class="di-sub" x="450" y="197" text-anchor="middle">the shared gaming layer</text>
          <g stroke="currentColor" stroke-opacity="0.35" fill="none">
            <path d="M170 92 L170 130 L400 130 L400 150" marker-end="url(#ar)"/>
            <path d="M450 92 L450 150" marker-end="url(#ar)"/>
            <path d="M730 92 L730 130 L500 130 L500 150" marker-end="url(#ar)"/>
          </g>
          <text class="di-sub" x="450" y="248" text-anchor="middle" style="letter-spacing:0.16em">OPEN GAME LAYER</text>
          <g stroke="currentColor" stroke-opacity="0.35" fill="none">
            <path d="M400 210 L210 258 L210 288" marker-end="url(#ar)"/>
            <path d="M450 210 L450 288" marker-end="url(#ar)"/>
            <path d="M500 210 L690 258 L690 288" marker-end="url(#ar)"/>
          </g>
          <g text-anchor="middle">
            <rect x="120" y="290" width="180" height="46" rx="11" fill="#10131c" stroke="#ffffff" stroke-opacity="0.14"/>
            <text class="di-label" x="210" y="318">Skycave game</text>
            <rect x="360" y="290" width="180" height="46" rx="11" fill="#10131c" stroke="#ffffff" stroke-opacity="0.14"/>
            <text class="di-label" x="450" y="318">Indie game</text>
            <rect x="600" y="290" width="180" height="46" rx="11" fill="#10131c" stroke="#ffffff" stroke-opacity="0.14"/>
            <text class="di-label" x="690" y="318">Community game</text>
          </g>
          <defs>
            <marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
              <polygon points="0,0 8,4.5 0,9" fill="currentColor" fill-opacity="0.55"/>
            </marker>
          </defs>
        </svg>
      </div>
      <figcaption>The bet: three durable pillars feed one shared layer, and the games hang off it — Skycave-built or not.</figcaption>
    </figure>

    <p class="lead-quote reveal">AT Protocol never defines “game,” “match,” “achievement,” or “tournament.” That gap is the opportunity — Skycave already lives all of them.</p>
  </div>
</section>

<section id="principle">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Principle</span>
      <h2>Centralize execution. Decentralize the rest.</h2>
      <p>The mistake would be decentralizing 300&nbsp;ms game moves out of ideology. Live engines,
      timers, anti-cheat, and WebSocket state stay on purpose-built Skycave infrastructure. The
      protocol carries the <em>durable, interoperable facts</em> — and only those.</p>
    </div>

    <div class="cols3">
      <div class="bcard pub reveal">
        <div class="cap"><span class="sw" style="background:#56f0aa"></span>Public AT data</div>
        <ul>
          <li>completed results</li><li>achievements</li><li>public challenges</li>
          <li>tournaments</li><li>game definitions</li><li>records &amp; player stats</li><li>matchmaking requests</li>
        </ul>
      </div>
      <div class="bcard priv reveal">
        <div class="cap"><span class="sw" style="background:#ffd166"></span>Private / permissioned</div>
        <ul>
          <li>hidden card hands</li><li>private invitations</li><li>unrevealed choices</li>
          <li>private leagues</li><li>moderation state</li><li>admin state</li>
        </ul>
      </div>
      <div class="bcard rt reveal">
        <div class="cap"><span class="sw" style="background:#67e8f9"></span>Real-time Skycave</div>
        <ul>
          <li>WebSocket gameplay</li><li>timers</li><li>anti-cheat</li>
          <li>authoritative engines</li><li>transient room state</li><li>short-lived actions</li>
        </ul>
      </div>
    </div>
    <p class="rt-note reveal">// This boundary is what keeps the architecture from becoming decentralization theatre.</p>
  </div>
</section>

<section id="integrity">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Ownership vs Authority</span>
      <h2>The player owns the history; the referee certifies it</h2>
      <p>Durable gaming history should belong to the player’s AT identity — but a user must not be able
      to publish “I scored 999999” and have it count. The fix is to split <b>ownership</b> from
      <b>authority</b>: a trusted referee service publishes the canonical result; the player’s
      repository holds a signed <em>receipt</em> that points at it.</p>
    </div>

    <figure class="reveal">
      <div class="figbox">
        <svg viewBox="0 0 900 250" role="img" aria-label="A referee service writes the canonical match result; the player's repository holds a receipt that strong-references that result.">
          <rect x="60" y="90" width="220" height="70" rx="14" fill="#10131c" stroke="#56f0aa" stroke-opacity="0.6"/>
          <text class="di-label" x="170" y="118" text-anchor="middle" fill="#56f0aa">REFEREE SERVICE</text>
          <text class="di-sub" x="170" y="138" text-anchor="middle">did:plc:skycave</text>
          <rect x="360" y="42" width="230" height="76" rx="14" fill="#0b0e15" stroke="#ffffff" stroke-opacity="0.18"/>
          <text class="di-sub" x="375" y="66" text-anchor="start" fill="#67e8f9">space.skycave.match.result</text>
          <text class="di-sub" x="375" y="86" text-anchor="start">winner · game · score</text>
          <text class="di-sub" x="375" y="104" text-anchor="start">engineVersion · completedAt</text>
          <rect x="360" y="150" width="230" height="60" rx="14" fill="#0b0e15" stroke="#ffffff" stroke-opacity="0.18"/>
          <text class="di-sub" x="375" y="174" text-anchor="start" fill="#8b7cff">space.skycave.playReceipt</text>
          <text class="di-sub" x="375" y="193" text-anchor="start">result: strong-ref →</text>
          <rect x="670" y="150" width="170" height="60" rx="14" fill="#10131c" stroke="#8b7cff" stroke-opacity="0.5"/>
          <text class="di-label" x="755" y="178" text-anchor="middle" fill="#8b7cff">PLAYER REPO</text>
          <text class="di-sub" x="755" y="197" text-anchor="middle">did:plc:alice</text>
          <g stroke="currentColor" fill="none" stroke-opacity="0.5">
            <path d="M280 118 L360 90" marker-end="url(#ar2)"/>
            <path d="M755 150 L590 180" marker-end="url(#ar2)"/>
          </g>
          <path d="M475 150 L475 118" stroke="#ffd166" stroke-dasharray="4 4" fill="none" marker-end="url(#ar3)"/>
          <text class="di-edge" x="345" y="88" text-anchor="middle" transform="rotate(-19 345 88)">publishes</text>
          <text class="di-edge" x="672" y="160" text-anchor="middle" transform="rotate(11 672 160)">writes</text>
          <text class="di-edge" x="492" y="136" fill="#ffd166" text-anchor="start">references</text>
          <defs>
            <marker id="ar2" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><polygon points="0,0 8,4.5 0,9" fill="currentColor" fill-opacity="0.6"/></marker>
            <marker id="ar3" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><polygon points="0,0 8,4.5 0,9" fill="#ffd166"/></marker>
          </defs>
        </svg>
      </div>
      <figcaption>A signature proves “this DID published this record” — never “this result actually happened.” Competitive facts come from the referee, not the winner.</figcaption>
    </figure>
  </div>
</section>

<section id="blocks">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Building Blocks</span>
      <h2>What becomes portable</h2>
      <p>Once results are durable facts, the pieces Skycave already has stop being account-page
      features and start being objects other applications can read, index, and act on.</p>
    </div>

    <div class="grid-cards">
      <div class="cc reveal"><div class="ico" style="color:#8b7cff">◈</div><h3>Portable gaming profile</h3><p>Not “who are you inside Skycave” but “who are you as a player across the Atmosphere” — history, titles, achievements, and bests, reconstructable from records another app can display.</p></div>
      <div class="cc reveal"><div class="ico" style="color:#67e8f9">⟨⟩</div><h3>Skycave as an API for games</h3><p>A developer shouldn’t rebuild identity, leaderboards, tournaments, and challenges. An SDK could hand them all of it — an open equivalent of Game Center, built on portable AT identities.</p><div class="lx">skycave.createMatch(...) → completeMatch(...)</div></div>
      <div class="cc reveal"><div class="ico" style="color:#56f0aa">⊞</div><h3>Games published by anyone</h3><p>A game definition points at its developer’s DID and its own launch URL. Skycave discovers, reviews, and lists it — without engineering every game itself.</p><div class="lx">space.skycave.game.definition</div></div>
      <div class="cc reveal"><div class="ico" style="color:#ff725e">⚔</div><h3>Challenges as objects</h3><p>A challenge stops being a link and gains a lifecycle: created → accepted → match → result — discoverable across surfaces, resolvable into the same match.</p><div class="lx">space.skycave.challenge</div></div>
      <div class="cc reveal"><div class="ico" style="color:#ffd166">♚</div><h3>Portable tournaments</h3><p>The Weekend Tournament becomes one consumer of a shared format. A Blacksky Summer Cup or a University Mancala Night can run on the same competition infrastructure and belong to its community.</p><div class="lx">space.skycave.tournament.*</div></div>
      <div class="cc reveal"><div class="ico" style="color:#ffd166">✦</div><h3>Open trophies</h3><p>Achievements carry an issuer. Skycave today; a community or an external developer tomorrow. The profile becomes an open trophy cabinet with verifiable provenance.</p><div class="lx">space.skycave.achievementAward</div></div>
      <div class="cc reveal"><div class="ico" style="color:#67e8f9">≣</div><h3>Alternative leaderboards</h3><p>Skycave publishes reliable facts; anyone can interpret them — total wins, Elo, Blacksky-only, Nigerian players, August season, mutuals only. No single true ranking.</p></div>
      <div class="cc reveal"><div class="ico" style="color:#8b7cff">◎</div><h3>Social-graph matchmaking</h3><p>Not “who’s online” but “3 mutuals play Mancala,” “your rival is online,” “someone you follow wants a Connect&nbsp;4 opponent.” A gaming lens over a graph that already exists.</p><div class="lx">space.skycave.matchmaking.request</div></div>
      <div class="cc reveal"><div class="ico" style="color:#56f0aa">►</div><h3>Feeds as arcade lobbies</h3><p>A custom feed turns a social post into a playable object: <em>Ray scored 31 on Flag Rush</em> → tap → you’re playing Flag Rush. The feed becomes part of the lobby.</p></div>
    </div>
  </div>
</section>

<section id="lexicons">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Lexicons</span>
      <h2>A small, experimental schema family</h2>
      <p>Not all at once. The first objective is to discover which concepts actually deserve durable,
      protocol-level representation — starting with four boring ones and letting the rest earn their place.</p>
    </div>

    <div class="two" style="align-items:stretch">
      <div class="code reveal">
        <div class="top"><span class="d"></span><span class="d"></span><span class="d"></span><span class="name">space.skycave.* — proposed family</span></div>
<pre><span class="c"># start here — the four that carry the thesis</span>
<span class="g">space.skycave.game.definition</span>
<span class="g">space.skycave.match.result</span>
<span class="g">space.skycave.achievementAward</span>
<span class="g">space.skycave.challenge</span>

<span class="c"># candidates that must earn durability</span>
<span class="k">space.skycave.match</span>
<span class="k">space.skycave.playReceipt</span>
<span class="k">space.skycave.tournament</span>
<span class="k">space.skycave.tournament.entry</span>
<span class="k">space.skycave.tournament.result</span>
<span class="k">space.skycave.season</span>
<span class="k">space.skycave.rating</span>
<span class="k">space.skycave.rivalry</span>
<span class="k">space.skycave.matchmaking.request</span></pre>
      </div>
      <div class="code reveal">
        <div class="top"><span class="d"></span><span class="d"></span><span class="d"></span><span class="name">a conceivable Skycave Game SDK</span></div>
<pre><span class="k">const</span> match = <span class="k">await</span> skycave.<span class="p">createMatch</span>({
  game: <span class="s">"com.someone.hex"</span>,
  players: [alice, bob]
})

<span class="k">await</span> skycave.<span class="p">completeMatch</span>({
  match,
  winner: alice,
  result: { ... }
})

<span class="c">// the referee certifies. the players own
// the receipt. another app can read both.</span></pre>
      </div>
    </div>
  </div>
</section>

<section id="architecture">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Architecture</span>
      <h2>A safe migration path, not a rewrite</h2>
      <p>The production database stays authoritative through the whole experiment. An event outbox
      mirrors <em>selected</em> completed events onto the protocol — so independent views can be built
      without betting the live platform on an unproven design.</p>
    </div>

    <figure class="reveal">
      <div class="figbox">
        <svg viewBox="0 0 940 400" role="img" aria-label="The game engine writes to the authoritative database and an event outbox. The outbox feeds both the existing Skycave API and an AT record publisher, which writes to AT Protocol, is indexed, and read by Skycave UI, Caveview, and third parties.">
          <defs>
            <marker id="af" markerWidth="10" markerHeight="10" refX="7.5" refY="5" orient="auto"><polygon points="0,0 9,5 0,10" fill="currentColor" fill-opacity="0.55"/></marker>
          </defs>
          <g text-anchor="middle" fill="none">
            <rect x="60" y="30" width="200" height="50" rx="12" fill="#10131c" stroke="#67e8f9" stroke-opacity="0.5"/>
            <text class="di-label" x="160" y="60" fill="#67e8f9">GAME ENGINE</text>
            <rect x="60" y="120" width="200" height="50" rx="12" fill="#10131c" stroke="#ffffff" stroke-opacity="0.18"/>
            <text class="di-label" x="160" y="150">AUTHORITATIVE DB</text>
            <rect x="60" y="210" width="200" height="50" rx="12" fill="#8b7cff" fill-opacity="0.09" stroke="#8b7cff" stroke-opacity="0.55"/>
            <text class="di-label" x="160" y="240" fill="#8b7cff">EVENT OUTBOX</text>
            <line x1="160" y1="80" x2="160" y2="120" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <line x1="160" y1="170" x2="160" y2="210" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <rect x="330" y="150" width="180" height="46" rx="11" fill="#10131c" stroke="#ffffff" stroke-opacity="0.16"/>
            <text class="di-label" x="420" y="177">SKYCAVE API</text>
            <rect x="330" y="250" width="180" height="46" rx="11" fill="#10131c" stroke="#56f0aa" stroke-opacity="0.5"/>
            <text class="di-label" x="420" y="277" fill="#56f0aa">AT PUBLISHER</text>
            <path d="M260 230 L300 173 L330 173" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <path d="M260 240 L300 273 L330 273" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <text class="di-edge" x="292" y="205" fill="#6b7488" text-anchor="middle">mirror selected</text>
            <rect x="560" y="250" width="150" height="46" rx="11" fill="#0b0e15" stroke="#ffffff" stroke-opacity="0.16"/>
            <text class="di-label" x="635" y="277">AT PROTOCOL</text>
            <rect x="560" y="320" width="150" height="46" rx="11" fill="#0b0e15" stroke="#ffffff" stroke-opacity="0.16"/>
            <text class="di-label" x="635" y="347">AT INDEX</text>
            <line x1="510" y1="273" x2="560" y2="273" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <line x1="635" y1="296" x2="635" y2="320" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <rect x="770" y="150" width="150" height="46" rx="11" fill="#10131c" stroke="#8b7cff" stroke-opacity="0.5"/>
            <text class="di-label" x="845" y="177" fill="#8b7cff">SKYCAVE UI</text>
            <rect x="770" y="250" width="150" height="46" rx="11" fill="#10131c" stroke="#67e8f9" stroke-opacity="0.5"/>
            <text class="di-label" x="845" y="277" fill="#67e8f9">CAVEVIEW</text>
            <rect x="770" y="320" width="150" height="46" rx="11" fill="#10131c" stroke="#ffd166" stroke-opacity="0.5"/>
            <text class="di-label" x="845" y="347" fill="#ffd166">THIRD PARTY</text>
            <path d="M710 340 L740 273 L770 273" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <path d="M710 343 L770 343" stroke="currentColor" stroke-opacity="0.4" marker-end="url(#af)"/>
            <path d="M508 173 C660 173 700 173 770 173" stroke="currentColor" stroke-opacity="0.4" fill="none" marker-end="url(#af)"/>
          </g>
        </svg>
      </div>
      <figcaption>The DB stays the source of truth; AT records mirror durable events. Two independent frontends can read the same verified history — one privileged, one not.</figcaption>
    </figure>
  </div>
</section>

<section id="roadmap">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">The Roadmap</span>
      <h2>Ordered around proofs, not features</h2>
      <p>Each phase exists to answer one question. If a phase’s proof fails, the thesis is revisited
      before anything expands. The sequence is the point.</p>
    </div>

    <div class="rail reveal">
      <div class="phase"><span class="node"></span><div class="no">Phase 0 · Boundary</div><h3>Design the protocol boundary</h3><p>Decide what becomes AT data. Define the referee/issuer trust model, namespace conventions, versioning, and correction semantics. Threat-model forged results. Ship nothing yet.</p><span class="exit">exit → <b>who may publish a Skycave record, who may trust it, and how is it corrected?</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 1 · Four Lexicons</div><h3>Mirror completed events</h3><p>Definitions, validation, a feature-flagged record publisher, outbox integration. Mirror selected completed events only. Don’t touch production reads.</p><span class="exit">exit → <b>a real match produces a valid, independently retrievable AT record.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 2 · Independent Index</div><h3>Index without DB access</h3><p>A small app-specific index over the Skycave lexicons — built deliberately without access to production game tables.</p><span class="exit">exit → <b>the index reconstructs a useful slice of a player’s history from records alone.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 3 · Caveview</div><h3>A second, ugly frontend</h3><p>No production DB, no privileged APIs — reads only the independent index. Not meant to be beautiful. It’s an interoperability proof.</p><span class="exit">exit → <b>two independent apps show the same verified history.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 4 · Native Challenge</div><h3>The first interactive object</h3><p>created → accepted → expired → completed, linked to canonical matches.</p><span class="exit">exit → <b>a challenge made on one surface resolves on another.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 5 · Open Trophies</div><h3>Issuer-signed achievements</h3><p>Achievement + award records with issuer, subject, and evidence. A trophy cabinet sourced from indexed records.</p><span class="exit">exit → <b>Skycave shows an award from a trusted non-core issuer.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 6 · External Game</div><h3>The most important test</h3><p>Invite one outside developer to build a tiny game hosted outside Skycave, with a minimal SDK. The point is integration, not game quality.</p><span class="exit">exit → <b>an external game produces trusted results in Skycave profiles. If it fails badly, revisit the thesis.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 7 · Open Game Dock</div><h3>Approved external games in discovery</h3><p>Developer verification, trust levels, moderation, health checks, launch-URL and de-listing policy.</p><span class="exit">exit → <b>several independent games participate without materially raising operational risk.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 8 · Protocol Matchmaking</div><h3>Discovery, not execution</h3><p>Expiring LFG records + views (people you follow, community LFG, rival available). Rooms still run centrally.</p><span class="exit">exit → <b>protocol discovery yields real completed matches without unacceptable spam.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 9 · Portable Tournaments</div><h3>Community-run competition</h3><p>Tournament lexicons; selected communities host their own events on Skycave infrastructure.</p><span class="exit">exit → <b>a third-party community runs a full tournament; players keep portable results.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 10 · Seasons &amp; AppViews</div><h3>Many views, one fact set</h3><p>Season records + enough reliable data that alternative ranking services can emerge.</p><span class="exit">exit → <b>Skycave is no longer the only software that can produce useful views over its records.</b></span></div>
      <div class="phase"><span class="node"></span><div class="no">Phase 11 · Agents</div><h3>Only after the ecosystem is healthy</h3><p>Caver as an AT identity; agent-capable game declarations; humans vs the Atmosphere. Not a distraction from the core network.</p></div>
    </div>

    <div style="margin-top:64px" class="reveal">
      <span class="eyebrow">The Proofs</span>
      <h2 style="font-size:clamp(1.4rem,3.2vw,1.9rem)">Five gates, in order</h2>
    </div>
    <div class="proofs">
      <div class="proof reveal"><div class="n">Proof 1</div><p>Can a completed game become a trustworthy AT record?</p><span class="gate">if no → stop</span></div>
      <div class="proof reveal"><div class="n">Proof 2</div><p>Can an independent index reconstruct useful history?</p><span class="gate">if no → weak story</span></div>
      <div class="proof reveal"><div class="n">Proof 3</div><p>Can a second frontend show it without privileged access?</p><span class="gate">if no → still closed</span></div>
      <div class="proof reveal"><div class="n">Proof 4</div><p>Can an external developer integrate a game?</p><span class="gate">if no → still a catalogue</span></div>
      <div class="proof reveal"><div class="n">Proof 5</div><p>Can a community run competition on top of it?</p><span class="gate">if yes → it’s infrastructure</span></div>
    </div>
  </div>
</section>

<section id="trust">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">Governance &amp; Trust</span>
      <h2>An open graph creates problems a game site can postpone</h2>
      <p>These are product-architecture questions, not merely protocol ones — and they need answers
      before the graph opens, not after.</p>
    </div>

    <div class="two">
      <div class="qlist reveal">
        <div class="q"><div class="qq">Result authority</div><p>Who may issue canonical results?</p></div>
        <div class="q"><div class="qq">Developer trust</div><p>How does Skycave decide which third-party games are trustworthy?</p></div>
        <div class="q"><div class="qq">Cheating</div><p>How are suspicious results marked, invalidated, or superseded?</p></div>
        <div class="q"><div class="qq">Corrections</div><p>What happens when an authoritative result was wrong?</p></div>
        <div class="q"><div class="qq">Removed games</div><p>Can old results stay valid after a game is de-listed?</p></div>
        <div class="q"><div class="qq">Achievement issuers</div><p>Can anyone create achievements? Can Skycave distinguish verified awards?</p></div>
        <div class="q"><div class="qq">Namespace evolution</div><p>How are lexicons versioned without breaking compatibility?</p></div>
      </div>
      <div class="reveal">
        <p style="color:#9aa3ba; margin-top:0">A signature only proves <em>this DID published this record</em> — never that the result
        happened. Trust must be explicit, and it has levels. Competitive facts should come from an
        authorized referee, not the winning player.</p>
        <div class="ladder" style="margin-top:22px">
          <div class="rung r1"><span class="lvl">01</span><span class="who">player assertion</span><span class="bar"></span></div>
          <div class="rung r2"><span class="lvl">02</span><span class="who">game-developer assertion</span><span class="bar"></span></div>
          <div class="rung r3"><span class="lvl">03</span><span class="who">community-issued assertion</span><span class="bar"></span></div>
          <div class="rung r4"><span class="lvl">04</span><span class="who">trusted referee · Skycave-verified</span><span class="bar"></span></div>
        </div>
        <p class="ladder-note">// weakest → strongest. consumers choose the floor they’ll accept.</p>
      </div>
    </div>
  </div>
</section>

<section id="not">
  <div class="wrap">
    <div class="section-head reveal">
      <span class="eyebrow">What This Is Not</span>
      <h2>Earn the architecture; don’t announce it</h2>
      <p>Until the proofs succeed, the project stays deliberately experimental — and it is never marketed
      as something it isn’t.</p>
    </div>

    <div class="nogoals reveal">
      <span class="ng">live match state on AT Protocol</span>
      <span class="ng">replacing the primary database</span>
      <span class="ng">migrating profiles fully onto AT data</span>
      <span class="ng">accepting untrusted external results</span>
      <span class="ng">an unrestricted game marketplace</span>
      <span class="ng">promising protocol stability</span>
      <span class="ng">a universal “gaming standard” claim</span>
      <span class="ng">tokenization / digital-ownership narratives</span>
      <span class="ng">a blockchain-style economy</span>
    </div>

    <div class="prog">
      <div class="step reveal"><div class="when">Current product</div><p class="say">Games for Bluesky, Blacksky, and beyond.</p></div>
      <div class="step reveal"><div class="when">Emerging developer story</div><p class="say">Build games for the social web without rebuilding identity, competition, and community.</p></div>
      <div class="step reveal"><div class="when">Long-term protocol story</div><p class="say">The open gaming graph of the Atmosphere.</p></div>
    </div>
  </div>
</section>

<section class="close">
  <div class="wrap">
    <span class="eyebrow" style="justify-content:center; color:#6b7488">The Bet</span>
    <div class="pieces" style="margin-top:26px">
      <span class="piece"><b>4</b> boring lexicons</span>
      <span class="piece"><b>1</b> record publisher</span>
      <span class="piece"><b>1</b> independent index</span>
      <span class="piece"><b>1</b> ugly second frontend</span>
      <span class="piece"><b>1</b> external game</span>
    </div>
    <p class="principle"><span class="a">Centralize execution.</span><br/><span class="b">Decentralize</span> identity, durable history, interoperability, and discovery.</p>
    <p class="foot-line">If those five pieces work, Skycave has demonstrated something much larger than AT login —
    an interoperable gaming network. The mindset stays honest: don’t announce that Skycave invented
    decentralized gaming. Prove another developer can participate first.</p>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="brand" href="/" style="font-size:16px"><span class="dot"></span>skycave<span class="sub">/ protocol</span></a>
        <p style="color:#6b7488; font-size:13.5px; max-width:34ch; margin-top:14px">The open gaming graph of the Atmosphere. A vision, not a shipped product.</p>
      </div>
      <div>
        <h4>On this page</h4>
        <div class="foot-links">
          <a href="#shift">The shift</a>
          <a href="#principle">The principle</a>
          <a href="#blocks">Building blocks</a>
          <a href="#architecture">Architecture</a>
          <a href="#roadmap">Roadmap &amp; proofs</a>
        </div>
      </div>
      <div>
        <h4>Further reading</h4>
        <div class="foot-links">
          <a href="https://atproto.com/specs/atp" target="_blank" rel="noopener">AT Protocol specs ↗</a>
          <a href="https://atproto.com/articles/atproto-ethos" target="_blank" rel="noopener">The AT Protocol ethos ↗</a>
          <a href="https://atproto.com/guides/custom-feed-tutorial" target="_blank" rel="noopener">Custom feeds ↗</a>
          <a href="/" rel="noopener">Back to Skycave ↗</a>
        </div>
      </div>
    </div>
    <div class="foot-meta">
      <span>Status · Vision / Experimental</span>
      <span>Not yet implemented</span>
      <span>Last updated · 2026-08-18</span>
    </div>
  </div>
</footer>
`;

export default function ProtocolClient() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];

    // Ambient node-graph behind the hero — the subject is a graph, so the hero shows one.
    const canvas = root.querySelector<HTMLCanvasElement>("#graph");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const COLORS = ["139,124,255", "103,232,249", "86,240,170"];
      let W = 0,
        H = 0,
        dpr = 1;
      let nodes: Array<{ x: number; y: number; vx: number; vy: number; r: number; c: string }> = [];
      let raf = 0;
      let resizeTimer: ReturnType<typeof setTimeout> | undefined;

      const size = () => {
        if (!ctx) return;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const parent = canvas.parentElement;
        const r = parent ? parent.getBoundingClientRect() : { width: 0, height: 0 };
        W = r.width;
        H = r.height;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      const seed = () => {
        const count = Math.max(26, Math.min(52, Math.round(W / 26)));
        nodes = [];
        for (let i = 0; i < count; i++) {
          nodes.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.22,
            vy: (Math.random() - 0.5) * 0.22,
            r: 1 + Math.random() * 1.8,
            c: COLORS[(Math.random() * COLORS.length) | 0],
          });
        }
      };
      const frame = () => {
        if (!ctx) return;
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (!reduce) {
            a.x += a.vx;
            a.y += a.vy;
          }
          if (a.x < 0 || a.x > W) a.vx *= -1;
          if (a.y < 0 || a.y > H) a.vy *= -1;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x,
              dy = a.y - b.y,
              d = Math.hypot(dx, dy);
            if (d < 128) {
              ctx.strokeStyle = "rgba(139,124,255," + (0.1 * (1 - d / 128)).toFixed(3) + ")";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
        for (let k = 0; k < nodes.length; k++) {
          const n = nodes[k];
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, 6.2832);
          ctx.fillStyle = "rgba(" + n.c + ",0.7)";
          ctx.fill();
        }
        if (!reduce) raf = requestAnimationFrame(frame);
      };
      const boot = () => {
        size();
        seed();
        cancelAnimationFrame(raf);
        frame();
      };
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(boot, 180);
      };
      window.addEventListener("resize", onResize);
      boot();
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        clearTimeout(resizeTimer);
        window.removeEventListener("resize", onResize);
      });
    }

    // Scroll reveals.
    const els = root.querySelectorAll<HTMLElement>(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      els.forEach((e) => io.observe(e));
      cleanups.push(() => io.disconnect());
    } else {
      els.forEach((e) => e.classList.add("in"));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ogg" ref={rootRef} dangerouslySetInnerHTML={{ __html: MARKUP }} />
    </>
  );
}
