// Survey candidate sites on the Helgeland coast for a game world.
// Fetches real Kartverket DTM and scores each for "town + wild backdrop".
import fs from 'node:fs';
import path from 'node:path';
import * as GeoTIFF from 'geotiff';

const DIR = path.dirname(new URL(import.meta.url).pathname).replace(/^\//, '');
const WCS = 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833';

// UTM33N (EPSG:25833). Helgeland coast, Nordland.
const SITES = [
  { id: 'heroy',        name: 'Herøy / Silvalen',        e: 377700, n: 7325000 },
  { id: 'heroy-s',      name: 'Herøy south + Seløya',    e: 379500, n: 7321000 },
  { id: 'sandnessjoen', name: 'Sandnessjøen',            e: 392700, n: 7326700 },
  { id: 'syv-sostre',   name: 'De syv søstre (Alsten)',  e: 391000, n: 7318500 },
  { id: 'alsten-w',     name: 'Alsten west shore',       e: 387000, n: 7318000 },
  { id: 'tjotta',       name: 'Tjøtta',                  e: 389000, n: 7305000 },
];

const SIZE = 4096;    // metres across
const PX = 512;       // samples per side -> 8m effective

async function fetchTile(site) {
  const file = path.join(DIR, `dtm_${site.id}.tif`);
  if (!fs.existsSync(file)) {
    const half = SIZE / 2;
    const bbox = [site.e - half, site.n - half, site.e + half, site.n + half].join(',');
    const url = `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&COVERAGE=nhm_dtm_topo_25833`
      + `&CRS=EPSG:25833&BBOX=${bbox}&WIDTH=${PX}&HEIGHT=${PX}&FORMAT=GeoTIFF`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${site.id}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const buf = fs.readFileSync(file);
  const tif = await GeoTIFF.fromArrayBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const img = await tif.getImage();
  const [data] = await img.readRasters();
  return { w: img.getWidth(), h: img.getHeight(), data };
}

function score(t) {
  const { w, h, data } = t;
  let min = Infinity, max = -Infinity, sea = 0, valid = 0;
  let buildable = 0;          // land, gentle, above the tideline
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = data[y * w + x];
      if (!Number.isFinite(v) || v < -1000) continue;
      valid++;
      if (v <= 0.3) { sea++; continue; }
      if (v < min) min = v;
      if (v > max) max = v;
      const dx = data[y * w + x + 1] - data[y * w + x - 1];
      const dy = data[(y + 1) * w + x] - data[(y - 1) * w + x];
      const slope = Math.hypot(dx, dy) / (2 * (SIZE / w));
      if (v > 1.5 && v < 60 && slope < 0.18) buildable++;
    }
  }
  return {
    maxElev: max, seaPct: sea / valid * 100,
    buildablePct: buildable / valid * 100,
  };
}

function relief(t, cols = 76, rows = 34) {
  const { w, h, data } = t;
  const ramp = ' .:-=+*#%@';
  let max = 0;
  for (const v of data) if (Number.isFinite(v) && v < 9000 && v > max) max = v;
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const x = Math.floor(c / cols * w), y = Math.floor(r / rows * h);
      const v = data[y * w + x];
      if (!Number.isFinite(v) || v < -1000) { line += ' '; continue; }
      if (v <= 0.3) { line += '~'; continue; }
      line += ramp[Math.min(9, Math.floor(v / max * 9) + 1)];
    }
    out.push(line);
  }
  return out.join('\n');
}

const only = process.argv[2];
for (const site of SITES) {
  if (only && site.id !== only) continue;
  try {
    const t = await fetchTile(site);
    const s = score(t);
    console.log(`\n=== ${site.name}  (${site.e}, ${site.n})`);
    console.log(`    max ${s.maxElev.toFixed(0)}m | sea ${s.seaPct.toFixed(0)}% | buildable ${s.buildablePct.toFixed(1)}%`);
    if (only) console.log(relief(t));
  } catch (e) {
    console.log(`\n=== ${site.name}: ${e.message}`);
  }
}
