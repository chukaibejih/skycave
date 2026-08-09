// Generates the GeoGuess "Map" style texture: public/textures/earth-map.jpg
//
// A label-free political/physical world map for the equirectangular globe
// (GlobePicker) and its 2D fallback (FlatPicker). Equirectangular is a linear
// lng/lat -> x/y mapping, so the data is drawn straight to pixels with no
// projection library and no tile provider.
//
// Source data: Natural Earth 1:50m vectors, which are PUBLIC DOMAIN (no
// attribution required). https://www.naturalearthdata.com/about/terms-of-use/
// Fetched from the community mirror github.com/nvkelso/natural-earth-vector.
//
// NO labels are ever drawn (no country/city names, roads, or POIs), so the
// texture is safe to show while the player is guessing.
//
// Run: npm run gen:map   (requires network; `sharp` is already a dependency)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "textures", "earth-map.jpg");
const BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const W = 4096;
const H = 2048;

// A clean, readable light map palette (blue water, light land, dark borders).
const OCEAN = "#a8d3e0";
const LAND = "#eaeddf";
const BORDER = "#6b7078";
const RIVER = "#96c3d6";

const px = (lng, lat) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];

const ring = (coords) => {
  let d = "";
  for (let i = 0; i < coords.length; i++) {
    const [x, y] = px(coords[i][0], coords[i][1]);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
};
const polyPath = (geom) => {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly.map(ring).join("")).join("");
};
const linePath = (geom) => {
  const lines = geom.type === "LineString" ? [geom.coordinates] : geom.coordinates;
  return lines
    .map((line) =>
      line
        .map(([lng, lat], i) => {
          const [x, y] = px(lng, lat);
          return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        })
        .join("")
    )
    .join("");
};

const fetchGeo = async (name) => {
  const res = await fetch(`${BASE}/${name}.geojson`);
  if (!res.ok) throw new Error(`fetch ${name}: HTTP ${res.status}`);
  return res.json();
};

const paths = (fc, toPath) =>
  fc.features
    .filter((f) => f.geometry)
    .map((f) => `<path d="${toPath(f.geometry)}"/>`)
    .join("");

const [countries, lakes, rivers] = await Promise.all([
  fetchGeo("ne_50m_admin_0_countries"),
  fetchGeo("ne_50m_lakes"),
  fetchGeo("ne_50m_rivers_lake_centerlines"),
]);

// Land + political borders + coastlines in one pass: filling each country and
// stroking its boundary yields borders (shared edges) and coastlines (ocean
// edges). Then rivers, then lakes punched back to water colour.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="geometricPrecision">
<rect width="${W}" height="${H}" fill="${OCEAN}"/>
<g fill="${LAND}" stroke="${BORDER}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${paths(countries, polyPath)}</g>
<g fill="none" stroke="${RIVER}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${paths(rivers, linePath)}</g>
<g fill="${OCEAN}" stroke="${RIVER}" stroke-width="1">${paths(lakes, polyPath)}</g>
</svg>`;

await sharp(Buffer.from(svg), { density: 96 })
  .resize(W, H)
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(OUT);

console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1024) | 0} KB, ${W}x${H})`);
