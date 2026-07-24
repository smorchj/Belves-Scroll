// Measure Havnstad's layout against the real heightmap, with no GPU and no GLBs.
//
// The Settlement module keeps every placement decision in planHavnstad(), which
// touches nothing but terrain.height/slope/isWater and a seeded RNG. This script
// imports that same function and drives it with a headless Terrain that reads
// public/assets/terrain/heroy.r16 and reproduces Terrain.js's bilinear height()
// and slope() exactly — so the numbers below are the numbers the runtime will
// place buildings on, not an approximation of them.
//
// Run: node tools/survey/verify-settlement.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planHavnstad } from '../../src/world/Settlement.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TERRAIN = path.join(ROOT, 'public/assets/terrain');

const meta = JSON.parse(fs.readFileSync(path.join(TERRAIN, 'heroy.json'), 'utf8'));
const raw = fs.readFileSync(path.join(TERRAIN, 'heroy.r16'));
const data = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);

/** Byte-for-byte the sampling in src/world/Terrain.js. */
class HeadlessTerrain {
  constructor() {
    this.size = meta.sizeMetres;
    this.samples = meta.samples;
    this.minY = meta.minElevation;
    this.scale = meta.scale;
    this.half = this.size / 2;
    this.step = this.size / (this.samples - 1);
    this.seaLevel = 0;
  }

  height(x, z) {
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    const n = this.samples;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= n - 1 || z0 >= n - 1) {
      const cx = Math.min(n - 1, Math.max(0, x0));
      const cz = Math.min(n - 1, Math.max(0, z0));
      return data[cz * n + cx] * this.scale + this.minY;
    }
    const tx = fx - x0, tz = fz - z0, i = z0 * n + x0;
    const a = data[i] + (data[i + 1] - data[i]) * tx;
    const b = data[i + n] + (data[i + n + 1] - data[i + n]) * tx;
    return (a + (b - a) * tz) * this.scale + this.minY;
  }

  slope(x, z) {
    const e = this.step;
    const nx = this.height(x - e, z) - this.height(x + e, z);
    const nz = this.height(x, z - e) - this.height(x, z + e);
    const ny = 2 * e;
    return 1 - ny / Math.hypot(nx, ny, nz);
  }

  isWater(x, z) { return this.height(x, z) <= this.seaLevel + 0.15; }
}

// ------------------------------------------------------------------ helpers

const q = (sorted, p) => {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); return ok; };

// --------------------------------------------------------------------- run

const terrain = new HeadlessTerrain();
const plan = planHavnstad(terrain);
const B = plan.buildings;

console.log('HAVNSTAD — measured against public/assets/terrain/heroy.r16\n');
console.log(`site      anchor (${plan.site.anchorX}, ${plan.site.anchorZ})  bearing ${plan.site.bearingDeg}deg  length ${plan.site.lengthM}m`);
console.log(`buildings ${B.length}   piers ${plan.piers.length}   dressing ${plan.dressing.length}\n`);

// --- 1. every building is on land, above the tide, on gentle ground

let minH = Infinity, maxH = -Infinity, maxS = 0;
for (const b of B) {
  const h = terrain.height(b.x, b.z);
  const s = terrain.slope(b.x, b.z);
  minH = Math.min(minH, h); maxH = Math.max(maxH, h); maxS = Math.max(maxS, s);
  check(!terrain.isWater(b.x, b.z), `IN WATER: ${b.model} @ ${b.x.toFixed(0)},${b.z.toFixed(0)}`);
  check(h >= 1.5, `BELOW 1.5m: ${b.model} @ ${b.x.toFixed(0)},${b.z.toFixed(0)} = ${h.toFixed(2)}m`);
  check(s <= 0.2, `TOO STEEP: ${b.model} @ ${b.x.toFixed(0)},${b.z.toFixed(0)} slope ${s.toFixed(3)}`);
  check(Math.abs(b.x) < 2008 && Math.abs(b.z) < 2008, `NEAR TILE EDGE: ${b.model}`);
}
console.log('GROUND');
console.log(`  elevation  min ${minH.toFixed(2)}m  max ${maxH.toFixed(2)}m   (floor 1.5m)`);
console.log(`  slope      max ${maxS.toFixed(3)}                (limit 0.200)`);
console.log(`  in water   ${B.filter((b) => terrain.isWater(b.x, b.z)).length} of ${B.length}\n`);

// --- 2. nearest-neighbour spacing against the measured grammar
//        (1142 real Herøy footprints: p10 10.8m, median 19.6m, p90 43.8m)

const nn = [];
for (let i = 0; i < B.length; i++) {
  let best = Infinity;
  for (let j = 0; j < B.length; j++) {
    if (i === j) continue;
    best = Math.min(best, Math.hypot(B[i].x - B[j].x, B[i].z - B[j].z));
  }
  nn.push(best);
}
nn.sort((a, b) => a - b);

const p10 = q(nn, 0.10), p50 = q(nn, 0.50), p90 = q(nn, 0.90);
console.log('NEAREST-NEIGHBOUR SPACING            measured Herøy    built');
console.log(`  minimum                              10.8 m (p10)     ${nn[0].toFixed(1)} m`);
console.log(`  p10                                  10.8 m           ${p10.toFixed(1)} m`);
console.log(`  median                               19.6 m           ${p50.toFixed(1)} m`);
console.log(`  p90                                  43.8 m           ${p90.toFixed(1)} m`);
console.log(`  maximum                                 —             ${nn[nn.length - 1].toFixed(1)} m\n`);

check(nn[0] >= 10.8, `TOO TIGHT: closest pair ${nn[0].toFixed(1)}m, floor 10.8m`);
check(p50 >= 14 && p50 <= 27, `MEDIAN SPACING ${p50.toFixed(1)}m outside 14-27m`);
check(p90 <= 52, `p90 SPACING ${p90.toFixed(1)}m above 52m`);

// --- 3. distance to the nearest terrace road (measured median 41m, p90 104m)

const roadPts = [...plan.roads.quay.pts, ...plan.roads.main.pts, ...plan.roads.upper.pts];
const toRoad = B.map((b) => {
  let best = Infinity;
  for (const p of roadPts) best = Math.min(best, Math.hypot(b.x - p.x, b.z - p.z));
  return best;
}).sort((a, b) => a - b);

// the roads themselves have to stay out of the sea, kerb included
console.log('TERRACE ROADS                length   elevation        widest kerb');
for (const [name, road] of Object.entries(plan.roads)) {
  let lo = Infinity, hi = -Infinity, kerbLo = Infinity, run = 0;
  for (let i = 0; i < road.pts.length; i++) {
    const p = road.pts[i];
    lo = Math.min(lo, p.y); hi = Math.max(hi, p.y);
    if (i) run += Math.hypot(p.x - road.pts[i - 1].x, p.z - road.pts[i - 1].z);
    for (const w of [-road.width / 2, road.width / 2]) {
      const x = p.x + plan.ribbon.seaward.x * w, z = p.z + plan.ribbon.seaward.z * w;
      kerbLo = Math.min(kerbLo, terrain.height(x, z));
    }
  }
  console.log(`  ${name.padEnd(26)} ${run.toFixed(0).padStart(4)} m   ${lo.toFixed(1)} - ${hi.toFixed(1)} m     ${kerbLo.toFixed(2)} m`);
  check(kerbLo > 0.15, `${name.toUpperCase()} ROAD IN THE SEA: lowest kerb ${kerbLo.toFixed(2)}m`);
}
console.log();

console.log('DISTANCE TO NEAREST ROAD           measured Herøy    built');
console.log(`  median                               41 m             ${q(toRoad, 0.5).toFixed(1)} m`);
console.log(`  p90                                 104 m             ${q(toRoad, 0.9).toFixed(1)} m`);
console.log(`  maximum                                 —             ${toRoad[toRoad.length - 1].toFixed(1)} m\n`);
check(toRoad[toRoad.length - 1] <= 42, `OFF THE ROAD: farthest building ${toRoad[toRoad.length - 1].toFixed(1)}m, limit 42m`);

// --- 4. the ribbon is a ribbon: elongated along the shore, one road deep

const axis = plan.ribbon.axis, sea = plan.ribbon.seaward;
let tMin = Infinity, tMax = -Infinity, oMin = Infinity, oMax = -Infinity;
for (const b of B) {
  const dx = b.x - plan.site.anchorX, dz = b.z - plan.site.anchorZ;
  const t = dx * axis.x + dz * axis.z;
  const o = dx * sea.x + dz * sea.z;
  tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
  oMin = Math.min(oMin, o); oMax = Math.max(oMax, o);
}
const along = tMax - tMin, deep = oMax - oMin;
console.log('RIBBON SHAPE');
console.log(`  along shore  ${along.toFixed(0)} m`);
console.log(`  depth        ${deep.toFixed(0)} m   (seaward ${oMax.toFixed(0)} .. inland ${oMin.toFixed(0)})`);
console.log(`  aspect       1 : ${(along / deep).toFixed(2)}          (real cores 1 : 2.4-2.5)\n`);
check(along / deep >= 2.2, `NOT A RIBBON: aspect 1:${(along / deep).toFixed(2)}, want at least 1:2.2`);
check(along > 480, `RIBBON TOO SHORT: ${along.toFixed(0)}m`);

// --- 5. terraces: each band sits in its designed elevation range

const byRole = {};
for (const b of B) (byRole[b.role] ??= []).push(b);
console.log('TERRACES                             count   elevation');
for (const [role, list] of Object.entries(byRole)) {
  const hs = list.map((b) => terrain.height(b.x, b.z)).sort((a, b) => a - b);
  console.log(`  ${role.padEnd(34)} ${String(list.length).padStart(2)}    ${hs[0].toFixed(1)} - ${hs[hs.length - 1].toFixed(1)} m`);
}
console.log();

const dwellings = (byRole.dwelling ?? []).length;
check(dwellings >= 20 && dwellings <= 24, `DWELLING COUNT ${dwellings}, want ~22`);
check((byRole.boathouse ?? []).length >= 5, 'FEWER THAN 5 BOATHOUSES');
check((byRole.hall ?? []).length === 1, 'NO HALL');
check((byRole.church ?? []).length === 1, 'NO CHURCH');
check((byRole.apothecary ?? []).length === 1, 'NO APOTHECARY');
check((byRole.inn ?? []).length === 1, 'NO INN');

// upper terrace should genuinely look down on main street
const upper = [...(byRole.hall ?? []), ...(byRole.church ?? [])];
const street = byRole.dwelling ?? [];
if (upper.length && street.length) {
  const uy = upper.reduce((a, b) => a + terrain.height(b.x, b.z), 0) / upper.length;
  const sy = street.reduce((a, b) => a + terrain.height(b.x, b.z), 0) / street.length;
  console.log(`VERTICAL READ  hall+church mean ${uy.toFixed(1)}m, dwellings mean ${sy.toFixed(1)}m, rise ${(uy - sy).toFixed(1)}m\n`);
  check(uy - sy >= 6, `UPPER TERRACE ONLY ${(uy - sy).toFixed(1)}m ABOVE THE STREET`);
}

// --- 6. anti-repetition: no mesh adjacent to itself along the ribbon

const ordered = [...B].sort((a, b) => a.t - b.t);
let adjacent = 0;
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i].model === ordered[i - 1].model && ordered[i].role === ordered[i - 1].role
      && ordered[i].role === 'dwelling') adjacent++;
}
const meshUse = {};
for (const b of B) meshUse[b.model] = (meshUse[b.model] ?? 0) + 1;
console.log('MESH VARIETY');
for (const [m, n] of Object.entries(meshUse).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(20)} ${n}`);
}
console.log(`  same dwelling mesh adjacent along the ribbon: ${adjacent}\n`);
check(adjacent === 0, `${adjacent} adjacent identical dwelling meshes`);

const tints = {};
for (const b of B) if (b.tint) tints[b.tint.name] = (tints[b.tint.name] ?? 0) + 1;
console.log('WALL TINTS  ' + Object.entries(tints).map(([k, v]) => `${k} ${v}`).join('   ') + '\n');
check(Object.keys(tints).length >= 4, 'FEWER THAN 4 TINTS IN USE');

// --- 7. piers reach real water and stand on ground that can hold them

console.log('PIERS                        root y    tip y    length');
for (const p of plan.piers) {
  const tipX = p.x + Math.sin(p.yaw) * p.length;
  const tipZ = p.z + Math.cos(p.yaw) * p.length;
  const rootY = terrain.height(p.x, p.z);
  const tipY = terrain.height(tipX, tipZ);
  console.log(`  t=${String(Math.round(p.t)).padStart(3)}                    ${rootY.toFixed(2).padStart(6)}   ${tipY.toFixed(2).padStart(6)}   ${p.length.toFixed(1)}m`);
  check(rootY > 0.4, `PIER ROOT IN THE SEA at t=${p.t.toFixed(0)} (${rootY.toFixed(2)}m)`);
  check(tipY < 0, `PIER ENDS ON LAND at t=${p.t.toFixed(0)} (${tipY.toFixed(2)}m)`);
  check(p.deckY > rootY - 0.6, `PIER DECK BELOW ITS OWN LANDING at t=${p.t.toFixed(0)}`);
}
console.log();
check(plan.piers.length >= 6 && plan.piers.length <= 10, `PIER COUNT ${plan.piers.length}, want 6-10`);

// --- 8. dressing stays out of the water

let wetProps = 0;
for (const d of plan.dressing) {
  if (terrain.height(d.x, d.z) < 1.2) wetProps++;
}
console.log(`DRESSING  ${plan.dressing.length} props, ${wetProps} below 1.2m\n`);
check(wetProps === 0, `${wetProps} dressing props in the tide`);

// --------------------------------------------------------------------- out

if (failures.length) {
  console.log(`FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.log('  ' + f);
  process.exit(1);
}
console.log(`PASSED — ${B.length} buildings, ${plan.piers.length} piers, ${plan.dressing.length} props all check out.`);
