// Independent adversarial audit. Reimplements terrain sampling from the raw
// .r16 rather than importing Terrain.js, so a bug in the sampler cannot hide
// behind itself, then measures the real planHavnstad/planVegetation output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/terrain/heroy.json'), 'utf8'));
const buf = fs.readFileSync(path.join(ROOT, 'public/assets/terrain/heroy.r16'));
const data = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);

class RawTerrain {
  constructor() {
    this.meta = manifest;
    this.size = manifest.sizeMetres;
    this.samples = manifest.samples;
    this.minY = manifest.minElevation;
    this.scale = manifest.scale;
    this.data = data;
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
      return this.data[cz * n + cx] * this.scale + this.minY;
    }
    const tx = fx - x0, tz = fz - z0;
    const d = this.data, i = z0 * n + x0;
    const h00 = d[i], h10 = d[i + 1], h01 = d[i + n], h11 = d[i + n + 1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return (a + (b - a) * tz) * this.scale + this.minY;
  }
  normalY(x, z) {
    const e = this.step;
    const l = this.height(x - e, z), r = this.height(x + e, z);
    const d = this.height(x, z - e), u = this.height(x, z + e);
    const nx = l - r, ny = 2 * e, nz = d - u;
    return ny / Math.hypot(nx, ny, nz);
  }
  slope(x, z) { return 1 - this.normalY(x, z); }
  isWater(x, z) { return this.height(x, z) <= this.seaLevel + 0.15; }
}

const terrain = new RawTerrain();

// ---- stats helpers
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

// ---- principal axes of the building cloud
function principalAxes(pts) {
  const cx = mean(pts.map((p) => p.x));
  const cz = mean(pts.map((p) => p.z));
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) {
    const dx = p.x - cx, dz = p.z - cz;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  const n = pts.length;
  sxx /= n; szz /= n; sxz /= n;
  const tr = sxx + szz, det = sxx * szz - sxz * sxz;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  // extent along each principal axis (full span, not sd)
  const ax = { x: Math.cos(ang), z: Math.sin(ang) };
  const ay = { x: -Math.sin(ang), z: Math.cos(ang) };
  const proj = (a) => pts.map((p) => (p.x - cx) * a.x + (p.z - cz) * a.z);
  const p1 = proj(ax), p2 = proj(ay);
  const span = (v) => Math.max(...v) - Math.min(...v);
  return {
    cx, cz,
    sdRatio: Math.sqrt(l1 / Math.max(1e-9, l2)),
    spanMajor: span(p1), spanMinor: span(p2),
    spanRatio: span(p1) / Math.max(1e-9, span(p2)),
    // robust span: 5-95 percentile, immune to one stray building
    robMajor: q(p1, 0.95) - q(p1, 0.05),
    robMinor: q(p2, 0.95) - q(p2, 0.05),
    angleDeg: (ang * 180) / Math.PI,
  };
}

function nearestNeighbour(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d < best) best = d;
    }
    out.push(best);
  }
  return out;
}

// ---- run the real planner
const { planHavnstad } = await import('../../src/world/Settlement.js');
const plan = planHavnstad(terrain);
const B = plan.buildings;

console.log('=== SETTLEMENT ===');
console.log(`buildings: ${B.length}`);
const byRole = {};
const byModel = {};
for (const b of B) {
  byRole[b.role] = (byRole[b.role] || 0) + 1;
  byModel[b.model] = (byModel[b.model] || 0) + 1;
}
console.log('by role :', JSON.stringify(byRole));
console.log('by model:', JSON.stringify(byModel));

const pa = principalAxes(B);
console.log('\n-- shape --');
console.log(`centroid          : ${f(pa.cx)}, ${f(pa.cz)}`);
console.log(`principal axis    : ${f(pa.angleDeg)} deg (ribbon bearing 118)`);
console.log(`full span         : ${f(pa.spanMajor)}m x ${f(pa.spanMinor)}m  ratio ${f(pa.spanRatio, 2)}`);
console.log(`robust span 5-95  : ${f(pa.robMajor)}m x ${f(pa.robMinor)}m  ratio ${f(pa.robMajor / pa.robMinor, 2)}`);
console.log(`sd ratio (sqrt l1/l2): ${f(pa.sdRatio, 2)}`);

// depth: distance from the main-street centreline (off coordinate)
const offs = B.map((b) => b.off);
console.log('\n-- one road deep? (off = metres seaward of centreline) --');
console.log(`off p05 ${f(q(offs, 0.05))}  p50 ${f(q(offs, 0.5))}  p95 ${f(q(offs, 0.95))}  min ${f(Math.min(...offs))} max ${f(Math.max(...offs))}`);

// distance to the nearest of the three roads
function distToRoads(b) {
  let best = Infinity;
  for (const r of [plan.roads.quay, plan.roads.main, plan.roads.upper]) {
    for (const p of r.pts) {
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (d < best) best = d;
    }
  }
  return best;
}
const roadD = B.map(distToRoads);
console.log(`dist to nearest road: p50 ${f(q(roadD, 0.5))}  p90 ${f(q(roadD, 0.9))}  max ${f(Math.max(...roadD))}   (real: median 41, p90 104)`);

// nearest neighbour
const nn = nearestNeighbour(B);
console.log('\n-- nearest-neighbour spacing --');
console.log(`p10 ${f(q(nn, 0.1))}  p50 ${f(q(nn, 0.5))}  p90 ${f(q(nn, 0.9))}  min ${f(Math.min(...nn))}  max ${f(Math.max(...nn))}`);
console.log('real                : p10 10.8  p50 19.6  p90 43.8');

// facing coherence
const yaws = B.map((b) => b.facing);
const dwellYaws = B.filter((b) => b.role === 'dwelling').map((b) => b.facing);
function circStats(a) {
  const s = mean(a.map(Math.sin)), c = mean(a.map(Math.cos));
  const R = Math.hypot(s, c);
  return { meanDeg: (Math.atan2(s, c) * 180) / Math.PI, R, sdDeg: (Math.sqrt(-2 * Math.log(Math.max(1e-9, R))) * 180) / Math.PI };
}
const cs = circStats(yaws), csd = circStats(dwellYaws);
console.log('\n-- facing --');
console.log(`all       : mean ${f(cs.meanDeg)} deg, R ${f(cs.R, 3)}, circular sd ${f(cs.sdDeg)} deg`);
console.log(`dwellings : mean ${f(csd.meanDeg)} deg, R ${f(csd.R, 3)}, circular sd ${f(csd.sdDeg)} deg`);

// same mesh adjacent to itself
console.log('\n-- adjacency (is a mesh ever next to a copy of itself?) --');
let adjSame = 0, adjTot = 0;
const nnPairs = [];
for (let i = 0; i < B.length; i++) {
  let best = Infinity, bj = -1;
  for (let j = 0; j < B.length; j++) {
    if (i === j) continue;
    const d = Math.hypot(B[i].x - B[j].x, B[i].z - B[j].z);
    if (d < best) { best = d; bj = j; }
  }
  adjTot++;
  if (B[i].model === B[bj].model) {
    adjSame++;
    nnPairs.push(`${B[i].model} @ ${f(best)}m (${B[i].role}/${B[bj].role})`);
  }
}
console.log(`nearest neighbour shares the same model: ${adjSame}/${adjTot}`);
for (const p of nnPairs) console.log('   ', p);

// variation
console.log('\n-- variation --');
const sm = B.map((b) => b.scaleMul);
console.log(`scaleMul: min ${f(Math.min(...sm), 3)} max ${f(Math.max(...sm), 3)} sd ${f(Math.sqrt(mean(sm.map((v) => (v - mean(sm)) ** 2))), 3)}`);
const tintNames = {};
for (const b of B) {
  const k = b.tint ? b.tint.name : 'none';
  tintNames[k] = (tintNames[k] || 0) + 1;
}
console.log('tints:', JSON.stringify(tintNames));
const strengths = B.filter((b) => b.tint).map((b) => b.tint.strength);
console.log(`tint strength: min ${f(Math.min(...strengths), 3)} max ${f(Math.max(...strengths), 3)}`);

// hard placement checks
console.log('\n-- placement sanity (re-measured against raw heightmap) --');
let inSea = 0, lowGround = 0, steep = 0;
for (const b of B) {
  const h = terrain.height(b.x, b.z);
  if (terrain.isWater(b.x, b.z)) inSea++;
  if (h < 1.5) lowGround++;
  if (terrain.slope(b.x, b.z) > 0.2) steep++;
  if (Math.abs(h - b.y) > 0.01) console.log(`  MISMATCH y at ${b.model}: plan ${f(b.y, 2)} raw ${f(h, 2)}`);
}
console.log(`in water: ${inSea}   below 1.5m: ${lowGround}   slope > 0.2: ${steep}`);

// piers
console.log('\n-- piers --');
console.log(`count ${plan.piers.length} (real area has 44 across the whole map)`);
for (const p of plan.piers) {
  const hx = p.x + Math.sin(p.yaw) * p.length;
  const hz = p.z + Math.cos(p.yaw) * p.length;
  console.log(`  t=${f(p.t)} len ${f(p.length)} deckY ${f(p.deckY, 2)} rootH ${f(terrain.height(p.x, p.z), 2)} headH ${f(terrain.height(hx, hz), 2)} headWater=${terrain.isWater(hx, hz)}`);
}

// roads: is the quay ever in the sea?
console.log('\n-- roads --');
for (const [name, r] of Object.entries(plan.roads)) {
  const hs = r.pts.map((p) => terrain.height(p.x, p.z));
  const wet = r.pts.filter((p) => terrain.height(p.x, p.z) < 0.15).length;
  console.log(`${name}: ${r.pts.length} pts, width ${r.width}, h min ${f(Math.min(...hs), 2)} max ${f(Math.max(...hs), 1)}, wet pts ${wet}`);
}
// spacing between the three terraces at midpoint
const midT = plan.ribbon.length / 2;
console.log(`terrace offsets at t=${midT}: quay ${f(plan.terraces.at(midT, 'quay'))}  main 0  upper ${f(-plan.terraces.at(midT, 'upper'))}`);

console.log('\n-- dressing --');
console.log(`count ${plan.dressing.length}`);
const dm = {};
for (const d of plan.dressing) dm[d.model] = (dm[d.model] || 0) + 1;
console.log(JSON.stringify(dm));

export { terrain, plan, q, mean, f, principalAxes, nearestNeighbour };
