// Pull the real Herøy landform from Kartverket into a runtime heightmap.
//
// Source: Nasjonal høydemodell, digital terrain model, EPSG:25833 (UTM33N).
// This is the actual Helgeland coast — the strait, the massif, the skerries —
// not noise shaped to look like it.
//
//   node tools/fetch-terrain.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GeoTIFF from 'geotiff';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'assets', 'terrain');
const CACHE = path.join(root, 'assets-src', 'terrain');

const WCS = 'https://wcs.geonorge.no/skwms1/wcs.hoyde-dtm-nhm-25833';

// The island cluster SE of Herøyholmen, picked by tools/scout-islands.mjs:
// one 134ha main island with an 18ha and a 3ha neighbour close by, low rolling
// hills (max 56m), 25% land. Smaller and denser than the old Silvalen tile —
// the playable islands sit together and the rest is skerries and open sea.
// e shifted 400m west of the scouted centre so the temple island clears the
// tile margin instead of clipping through the west edge.
const CENTRE = { e: 381800, n: 7323500 };
const SIZE = 2816;      // metres
const SAMPLES = 704;    // 4m per sample

const half = SIZE / 2;
const bbox = [CENTRE.e - half, CENTRE.n - half, CENTRE.e + half, CENTRE.n + half];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const tifPath = path.join(CACHE, `heroy_${CENTRE.e}_${CENTRE.n}_${SIZE}_${SAMPLES}.tif`);
if (!fs.existsSync(tifPath)) {
  const url = `${WCS}?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage`
    + `&COVERAGE=nhm_dtm_topo_25833&CRS=EPSG:25833&BBOX=${bbox.join(',')}`
    + `&WIDTH=${SAMPLES}&HEIGHT=${SAMPLES}&FORMAT=GeoTIFF`;
  console.log(`fetching ${SIZE}m @ ${SAMPLES}px from Kartverket…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`WCS HTTP ${res.status}`);
  fs.writeFileSync(tifPath, Buffer.from(await res.arrayBuffer()));
}

const buf = fs.readFileSync(tifPath);
const tif = await GeoTIFF.fromArrayBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const img = await tif.getImage();
const [raster] = await img.readRasters();
const w = img.getWidth(), h = img.getHeight();

// The DTM uses a large negative for no-data; sea is a true 0.
const field = new Float32Array(w * h);
for (let i = 0; i < raster.length; i++) {
  const v = raster[i];
  field[i] = (!Number.isFinite(v) || v < -1000) ? 0 : v;
}

// The national model is a 10m grid, and this tile was requested at 4m, so the
// service interpolated — leaving stair-step plateaus with an ~8m period.
// Vertex normals amplify those into a regular quilt across every hillside.
// A light separable Gaussian (sigma ~1.3 samples) removes the resampling
// period while leaving the real landform, which varies over tens of metres.
function blur(src, width, height, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const k = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(k); sum += k;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        acc += src[y * width + clamp(x + i, 0, width - 1)] * kernel[i + radius];
      }
      tmp[y * width + x] = acc;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -radius; i <= radius; i++) {
        acc += tmp[clamp(y + i, 0, height - 1) * width + x] * kernel[i + radius];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

const smoothed = blur(field, w, h, 1.3);
for (let i = 0; i < smoothed.length; i++) {
  if (field[i] <= 0.05) smoothed[i] = 0;
  else smoothed[i] = Math.max(0.02, smoothed[i]);
}

// The DTM stops at the waterline: everything wet is recorded as a flat 0. With
// the water plane also at 0 that left 45% of the map coplanar with it, which is
// exactly the z-fighting — two surfaces at the same depth, neither winning.
//
// So carve a sea floor. Depth grows with distance from the nearest land, via a
// cheap chamfer distance transform (two sweeps, forward and backward). This
// also gives the water shader a real depth field to shade with, which is what
// makes the shallows read as shallow instead of as a flat sheet.
{
  const INF = 1e9;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = smoothed[i] > 0.05 ? 0 : INF;

  const at = (x, y) => dist[y * w + x];
  const relax = (x, y, v) => { const i = y * w + x; if (v < dist[i]) dist[i] = v; };
  const D1 = 1, D2 = Math.SQRT2;   // chamfer weights, in samples

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x > 0) relax(x, y, at(x - 1, y) + D1);
      if (y > 0) relax(x, y, at(x, y - 1) + D1);
      if (x > 0 && y > 0) relax(x, y, at(x - 1, y - 1) + D2);
      if (x < w - 1 && y > 0) relax(x, y, at(x + 1, y - 1) + D2);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      if (x < w - 1) relax(x, y, at(x + 1, y) + D1);
      if (y < h - 1) relax(x, y, at(x, y + 1) + D1);
      if (x < w - 1 && y < h - 1) relax(x, y, at(x + 1, y + 1) + D2);
      if (x > 0 && y < h - 1) relax(x, y, at(x - 1, y + 1) + D2);
    }
  }

  const mps = SIZE / w;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] > 0.05) continue;
    const metres = dist[i] * mps;
    // Steep near the beach, levelling off into the strait. sqrt gives a natural
    // profile without a visible break of slope.
    smoothed[i] = -Math.min(42, 2.2 * Math.sqrt(metres));
  }
}

let min = Infinity, max = -Infinity;
for (const v of smoothed) {
  if (v < min) min = v;
  if (v > max) max = v;
}
min = Math.min(min, 0);

// Uint16 keeps this to 2MB with 0.5cm precision over a 300m range — far finer
// than the 4m horizontal sampling, so nothing is lost.
const scale = (max - min) / 65535;
const out = new Uint16Array(w * h);
let sea = 0;
for (let i = 0; i < smoothed.length; i++) {
  const v = smoothed[i];
  if (v <= 0.3) sea++;
  out[i] = Math.round((v - min) / scale);
}

// glTF/DTM rows run north-to-south; the game's +Z runs south-to-north. Flip now
// so the runtime can index straight in without thinking about it.
const flipped = new Uint16Array(w * h);
for (let y = 0; y < h; y++) {
  flipped.set(out.subarray(y * w, (y + 1) * w), (h - 1 - y) * w);
}

fs.writeFileSync(path.join(OUT, 'heroy.r16'), Buffer.from(flipped.buffer));
fs.writeFileSync(path.join(OUT, 'heroy.json'), JSON.stringify({
  source: 'Kartverket NHM DTM, EPSG:25833',
  centre: CENTRE, bbox, sizeMetres: SIZE, samples: w,
  minElevation: min, maxElevation: max, scale,
  metresPerSample: SIZE / w,
  seaLevel: 0,
}, null, 2));

console.log(`  ${w}x${h} @ ${(SIZE / w).toFixed(1)}m/sample`);
console.log(`  elevation ${min.toFixed(1)}m .. ${max.toFixed(1)}m`);
console.log(`  sea ${(sea / raster.length * 100).toFixed(0)}%`);
console.log(`  heroy.r16 ${(flipped.byteLength / 1048576).toFixed(2)}MB`);
