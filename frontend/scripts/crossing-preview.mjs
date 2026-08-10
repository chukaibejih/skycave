import sharp from "sharp";
const boards = JSON.parse(process.argv[3] ? (await import("node:fs")).readFileSync(process.argv[3],"utf8") : "[]");
const A="#2563eb", B="#f97316", EDGE="#334155", ES="#94a3b8";
const show = [0,4]; // Lattice + Wide
const PW=560, PH=460, GAP=40, PAD=54;
const W = show.length*PW + (show.length+1)*GAP, H = PH + 2*GAP + 40;
function card(bd, ox, oy){
  const nodes=bd.nodes, edges=bd.edges, a=bd.Aset, b=bd.Bset;
  const xs=Object.values(nodes).map(p=>p[0]), ys=Object.values(nodes).map(p=>p[1]);
  const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const iw=PW-2*PAD, ih=PH-2*PAD-30;
  const px=n=>ox+PAD+((nodes[n][0]-minx)/(maxx-minx))*iw;
  const py=n=>oy+PAD+30+((nodes[n][1]-miny)/(maxy-miny))*ih;
  let s=`<rect x="${ox}" y="${oy}" width="${PW}" height="${PH}" rx="26" fill="#ffffff"/>`;
  s+=`<text x="${ox+30}" y="${oy+40}" font-family="Arial" font-size="24" font-weight="700" fill="#0f172a">${bd.name.replace(/^\d+ · /,"")}</text>`;
  // target rings
  for(const n of a) s+=`<circle cx="${px(n)}" cy="${py(n)}" r="26" fill="none" stroke="${A}" stroke-opacity="0.28" stroke-width="2.5" stroke-dasharray="6 6"/>`;
  for(const n of b) s+=`<circle cx="${px(n)}" cy="${py(n)}" r="26" fill="none" stroke="${B}" stroke-opacity="0.28" stroke-width="2.5" stroke-dasharray="6 6"/>`;
  for(const [u,v] of edges) s+=`<line x1="${px(u)}" y1="${py(u)}" x2="${px(v)}" y2="${py(v)}" stroke="${EDGE}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>`;
  for(const id of Object.keys(nodes)){
    const n=Number(id);
    if(a.includes(n)) s+=`<circle cx="${px(n)}" cy="${py(n)}" r="19" fill="${A}" stroke="#fff" stroke-width="4"/>`;
    else if(b.includes(n)) s+=`<circle cx="${px(n)}" cy="${py(n)}" r="19" fill="${B}" stroke="#fff" stroke-width="4"/>`;
    else s+=`<circle cx="${px(n)}" cy="${py(n)}" r="12" fill="#fff" stroke="${ES}" stroke-width="3.5"/>`;
  }
  return s;
}
let body=""; show.forEach((bi,i)=>{ body+=card(boards[bi], GAP+i*(PW+GAP), GAP+40); });
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0b1220"/>
<text x="${GAP}" y="${GAP+8}" font-family="Arial" font-size="26" font-weight="700" fill="#e2e8f0">Crossing · white board on the dark app · blue vs orange · dashed rings = each side's goal</text>${body}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(process.argv[2]);
console.log("wrote", process.argv[2]);
