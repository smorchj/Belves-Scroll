// Scan candidate map centres around the Herøy archipelago and score each tile
// on "a couple of small islands close together": island count, sizes, spacing.
//   node tools/scout-islands.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GeoTIFF from 'geotiff';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, 'assets-src', 'terrain', 'scout');
fs.mkdirSync(CACHE, { recursive: true });

const WCS = 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833';
const SIZE = 2816;      // candidate map size, metres
const PX = 192;         // scout resolution (~15m/sample) — plenty to see islands

// Grid of candidate centres across the archipelago around the current tile
// (377700, 7325000). Steps of ~1.5km, covering the island belt W/S/E.
const candidates = [];
for (let de = -4500; de <= 4500; de += 1500) {
  for (let dn = -4500; dn <= 3000; dn += 1500) {
    candidates.push({ e: 377700 + de, n: 7325000 + dn });
  }
}

async function fetchTile(c) {
  const f = path.join(CACHE, `s_${c.e}_${c.n}.tif`);
  if (!fs.existsSync(f)) {
    const half = SIZE / 2;
    const bbox = [c.e - half, c.n - half, c.e + half, c.n + half].join(',');
    const url = `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage`
      + `&COVERAGE=nhm_dtm_topo_25833&CRS=EPSG:25833&BBOX=${bbox}`
      + `&WIDTH=${PX}&HEIGHT=${PX}&FORMAT=GeoTIFF`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`WCS ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(f);
  const tif = await GeoTIFF.fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const [raster] = await (await tif.getImage()).readRasters();
  return raster;
}

function analyse(raster) {
  const n = PX;
  const land = new Uint8Array(n * n);
  let landPx = 0, maxH = 0;
  for (let i = 0; i < raster.length; i++) {
    const v = raster[i];
    const h = (!Number.isFinite(v) || v < -1000) ? 0 : v;
    if (h > 0.5) { land[i] = 1; landPx++; if (h > maxH) maxH = h; }
  }
  // Connected components (4-neigh) = islands; ignore specks < 40px (~1 ha).
  const seen = new Uint8Array(n * n);
  const islands = [];
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let size = 0, sx = 0, sy = 0, touchesEdge = false;
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % n, y = (j / n) | 0;
      sx += x; sy += y;
      if (x === 0 || y === 0 || x === n - 1 || y === n - 1) touchesEdge = true;
      for (const k of [j - 1, j + 1, j - n, j + n]) {
        if (k < 0 || k >= land.length) continue;
        if (Math.abs((k % n) - x) > 1) continue;
        if (land[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    if (size >= 40) islands.push({ size, cx: sx / size, cy: sy / size, touchesEdge });
  }
  return { landFrac: landPx / (n * n), islands, maxH };
}

const rows = [];
for (const c of candidates) {
  try {
    const r = analyse(await fetchTile(c));
    const inner = r.islands.filter((i) => !i.touchesEdge);
    // Score: want 2-5 whole islands (not clipped), 15-40% land, decent size mix,
    // and the two biggest close together.
    const big = [...inner].sort((a, b) => b.size - a.size);
    let score = 0;
    if (inner.length >= 2 && inner.length <= 6) score += 3;
    if (r.landFrac > 0.12 && r.landFrac < 0.42) score += 2;
    if (big[0]?.size > 900) score += 2;             // main island big enough for a town (~20+ ha)
    if (big[1]?.size > 350) score += 1;
    if (big[0] && big[1]) {
      const d = Math.hypot(big[0].cx - big[1].cx, big[0].cy - big[1].cy) * (SIZE / PX);
      if (d < 1100) score += 2;                     // close together
    }
    if (r.maxH > 40 && r.maxH < 220) score += 1;    // hills, not a massif wall
    rows.push({ ...c, score, landPct: Math.round(r.landFrac * 100), islands: r.islands.length, whole: inner.length, big: big.slice(0, 3).map((i) => Math.round(i.size * (SIZE / PX) ** 2 / 1e4) + 'ha'), maxH: Math.round(r.maxH) });
    console.log(JSON.stringify(rows[rows.length - 1]));
  } catch (e) { console.log(`${c.e},${c.n} FAILED ${e.message}`); }
}
rows.sort((a, b) => b.score - a.score);
console.log('\nTOP 5:');
for (const r of rows.slice(0, 5)) console.log(JSON.stringify(r));
