// One-off: render the 5 candidate "Crossing" board topologies as a labeled
// diagram for sign-off. Nodes + coordinates + adjacency only; the game is
// graph-generic so any of these loads at random per game.
//   run:  node scripts/board-diagram.mjs   (from frontend/)
import sharp from "sharp";
import fs from "node:fs";

const A = "#22c55e"; // Player A start (and Player B's target)
const B = "#8b7cff"; // Player B start (and Player A's target)
const OPEN = "#94a3b8"; // open node
const EDGE = "#64748b";
const INK = "#0f172a";
const SUB = "#475569";

// Boards read from JSON (dumped from the Python engine so this is always in
// sync with what actually ships). argv[3] = path to the boards JSON.
const boards = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

const PW = 560, PH = 480, COLS = 3, HEAD = 92, TITLE = 44, PAD = 78, R = 21;
const W = COLS * PW;
const rows = Math.ceil((boards.length + 1) / COLS);
const H = HEAD + rows * PH;

const esc = (s) => s.replace(/&/g, "&amp;");

function panel(board, ox, oy) {
  const x0 = ox + PAD, y0 = oy + TITLE + PAD * 0.7;
  const iw = PW - 2 * PAD, ih = PH - TITLE - PAD * 1.5;
  const px = (n) => x0 + (board.nodes[n][0] / 100) * iw;
  const py = (n) => y0 + (board.nodes[n][1] / 100) * ih;
  let s = "";
  s += `<rect x="${ox + 14}" y="${oy + 14}" width="${PW - 28}" height="${PH - 28}" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>`;
  s += `<text x="${ox + 40}" y="${oy + 52}" font-family="Arial" font-size="30" font-weight="700" fill="${INK}">${esc(board.name)}</text>`;
  s += `<text x="${ox + 40}" y="${oy + PH - 26}" font-family="Arial" font-size="19" fill="${SUB}">${esc(board.note)}</text>`;
  for (const [a, b] of board.edges) s += `<line x1="${px(a)}" y1="${py(a)}" x2="${px(b)}" y2="${py(b)}" stroke="${EDGE}" stroke-width="4"/>`;
  for (const n of Object.keys(board.nodes)) {
    const id = Number(n);
    const fill = board.Aset.includes(id) ? A : board.Bset.includes(id) ? B : OPEN;
    const dark = !board.Aset.includes(id) && !board.Bset.includes(id);
    s += `<circle cx="${px(id)}" cy="${py(id)}" r="${R}" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
    s += `<text x="${px(id)}" y="${py(id) + 6}" font-family="Arial" font-size="18" font-weight="700" fill="${dark ? "#1e293b" : "#ffffff"}" text-anchor="middle">${id}</text>`;
  }
  return s;
}

function legend(ox, oy) {
  let s = `<rect x="${ox + 14}" y="${oy + 14}" width="${PW - 28}" height="${PH - 28}" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>`;
  s += `<text x="${ox + 40}" y="${oy + 52}" font-family="Arial" font-size="30" font-weight="700" fill="${INK}">Legend</text>`;
  const rows2 = [
    [A, "Player A start", "→ must reach the violet nodes"],
    [B, "Player B start", "→ must reach the green nodes"],
    [OPEN, "Open node", "empty, move into it"],
  ];
  rows2.forEach(([c, t, d], i) => {
    const y = oy + 110 + i * 66;
    s += `<circle cx="${ox + 56}" cy="${y}" r="18" fill="${c}" stroke="#fff" stroke-width="3"/>`;
    s += `<text x="${ox + 92}" y="${y - 2}" font-family="Arial" font-size="22" font-weight="700" fill="${INK}">${t}</text>`;
    s += `<text x="${ox + 92}" y="${y + 22}" font-family="Arial" font-size="18" fill="${SUB}">${d}</text>`;
  });
  s += `<text x="${ox + 40}" y="${oy + PH - 92}" font-family="Arial" font-size="18" fill="${SUB}">Move ONE piece per turn along a line into</text>`;
  s += `<text x="${ox + 40}" y="${oy + PH - 66}" font-family="Arial" font-size="18" fill="${SUB}">an adjacent OPEN node. No jumping. First to</text>`;
  s += `<text x="${ox + 40}" y="${oy + PH - 40}" font-family="Arial" font-size="18" fill="${SUB}">fill all 3 of the far side's nodes wins.</text>`;
  return s;
}

let body = "";
boards.forEach((b, i) => {
  const ox = (i % COLS) * PW, oy = HEAD + Math.floor(i / COLS) * PH;
  body += panel(b, ox, oy);
});
const li = boards.length;
body += legend((li % COLS) * PW, HEAD + Math.floor(li / COLS) * PH);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#f1f5f9"/>
<text x="40" y="58" font-family="Arial" font-size="40" font-weight="700" fill="${INK}">Crossing · 5 board topologies</text>
<text x="40" y="84" font-family="Arial" font-size="20" fill="${SUB}">3 pieces each · slide along the lines to the opposite side · one board loads at random per game</text>
${body}
</svg>`;

const OUT = process.argv[2] || "crossing-boards.png";
await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log("wrote", OUT, (fs.statSync(OUT).size / 1024 | 0) + "KB");
