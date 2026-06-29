// Bundles game assets at build time so nothing depends on an external API at
// runtime: flag SVGs (lipis/flag-icons) + a globe texture (three-globe).
//
// Usage:  node scripts/fetch-assets.mjs
//
// The flag set is driven by lib/data/flags.json (generated separately). Re-run
// after changing that list.
import { mkdir, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const flags = require("../lib/data/flags.json");

const FLAG_BASE =
  "https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.3/flags/4x3";
const OUTLINE_BASE = "https://cdn.jsdelivr.net/gh/djaiss/mapsicon@master/all";
// Curated recognizable outlines — keep in sync with backend outline_quiz.CURATED.
const OUTLINE_CODES = (
  "fr it es pt de gb ie nl be ch at pl cz se no fi dk gr tr ua is ro " +
  "us ca mx br ar cl pe co ve bo ec " +
  "cn jp kr in id th vn ph my pk sa ae ir iq il af np lk bd mm kz " +
  "eg za ng ke et ma dz ly sd gh tz ao mz na ml so td au nz"
).split(" ");
// Bright day texture — legible for guessing (the night map is too dim).
const TEXTURE =
  "https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-blue-marble.jpg";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function main() {
  await mkdir("public/flags", { recursive: true });
  await mkdir("public/textures", { recursive: true });

  let ok = 0;
  const misses = [];
  for (const { code } of flags) {
    const dest = `public/flags/${code}.svg`;
    if (await exists(dest)) {
      ok++;
      continue;
    }
    try {
      await download(`${FLAG_BASE}/${code}.svg`, dest);
      ok++;
    } catch (e) {
      misses.push(code);
    }
  }
  console.log(`flags: ${ok}/${flags.length}`, misses.length ? `missing: ${misses}` : "");

  // Country outlines (Outline Quiz)
  await mkdir("public/outlines", { recursive: true });
  let oOk = 0;
  const oMiss = [];
  for (const code of OUTLINE_CODES) {
    const dest = `public/outlines/${code}.svg`;
    if (await exists(dest)) {
      oOk++;
      continue;
    }
    try {
      await download(`${OUTLINE_BASE}/${code}/vector.svg`, dest);
      oOk++;
    } catch {
      oMiss.push(code);
    }
  }
  console.log(`outlines: ${oOk}/${OUTLINE_CODES.length}`, oMiss.length ? `missing: ${oMiss}` : "");

  if (!(await exists("public/textures/earth-blue-marble.jpg"))) {
    await download(TEXTURE, "public/textures/earth-blue-marble.jpg");
    console.log("globe texture: downloaded");
  } else {
    console.log("globe texture: present");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
