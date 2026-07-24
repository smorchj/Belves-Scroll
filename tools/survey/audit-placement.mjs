/**
 * Adversarial placement audit.
 *
 * Imports the real planning functions from Settlement.js, Landmarks.js and
 * Vegetation.js and runs them against the real Kartverket heightmap, then
 * re-derives every placed object's final world transform the same way the
 * runtime does — including the GLB bounding box, which is what actually decides
 * whether a prop floats or sinks.
 *
 * node tools/survey/audit-placement.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { loadHeightField } from './audit-heightfield.mjs';
import { loadGLTF, boundsOf } from './audit-glb-bounds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROPDIR = path.join(ROOT, 'public', 'assets', 'props');

const { planHavnstad } = await import(pathToFileURL(path.join(ROOT, 'src/world/Settlement.js')).href);
const { planLandmarks } = await import(pathToFileURL(path.join(ROOT, 'src/world/Landmarks.js')).href);
const { planVegetation } = await import(pathToFileURL(path.join(ROOT, 'src/world/Vegetation.js')).href);
const { PROPS } = await import(pathToFileURL(path.join(ROOT, 'src/data/catalog.js')).href);

const T = await loadHeightField(ROOT);

// ------------------------------------------------------------------ helpers

const cache = new Map();
async function gltfFor(model) {
  if (cache.has(model)) return cache.get(model);
  const f = path.join(PROPDIR, `${model}.glb`);
  const g = existsSync(f) ? await loadGLTF(f) : null;
  cache.set(model, g);
  return g;
}

const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : 'n/a');
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

function quantiles(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return { min: s[0], p10: q(0.1), median: q(0.5), p90: q(0.9), max: s[s.length - 1] };
}

/**
 * Terrain relief under an axis-aligned footprint: how far the ground rises above
 * and falls below the object's base plane. A positive `gap` is daylight under a
 * corner; a positive `bury` is wall swallowed by the hillside.
 */
function reliefUnder(x, z, hx, hz, baseY) {
  let lo = Infinity, hi = -Infinity, loAt = null, hiAt = null;
  const N = 5;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const px = x + (i / (N - 1) * 2 - 1) * hx;
      const pz = z + (j / (N - 1) * 2 - 1) * hz;
      const h = T.height(px, pz);
      if (h < lo) { lo = h; loAt = [px, pz]; }
      if (h > hi) { hi = h; hiAt = [px, pz]; }
    }
  }
  return { gap: baseY - lo, bury: hi - baseY, lo, hi, loAt, hiAt };
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((x - a.x) * dx + (z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < best) best = d;
  }
  return best;
}

const fail = [];
function record(group, id, test, detail) { fail.push({ group, id, test, detail }); }

// ================================================================ SETTLEMENT

console.log('='.repeat(78));
console.log('SETTLEMENT — Havnstad');
console.log('='.repeat(78));

const S = planHavnstad(T);
console.log(`buildings ${S.buildings.length}   piers ${S.piers.length}   dressing ${S.dressing.length}`);

const built = [];
for (const b of S.buildings) {
  const g = await gltfFor(b.model);
  if (!g) { record('settlement', b.model, 'asset-missing', `${b.model}.glb not on disk`); continue; }
  const cat = PROPS[b.model];

  // measuredScale: catalog metres / unrotated model height.
  const flat = boundsOf(g, {});
  const modelH = flat.max[1] - flat.min[1];
  const scale = (cat?.metres ? cat.metres / modelH : cat?.scale ?? 1) * b.scaleMul;

  // Ridge axis is measured, exactly as _placeBuilding does.
  const spanX = flat.max[0] - flat.min[0], spanZ = flat.max[2] - flat.min[2];
  const rotY = b.facing - (spanX > spanZ ? Math.PI / 2 : 0);

  const box = boundsOf(g, { rotY, scale });
  const hx = (box.max[0] - box.min[0]) / 2;
  const hz = (box.max[2] - box.min[2]) / 2;
  const height = box.max[1] - box.min[1];

  // Runtime: position.y = rec.y - localMinY - sink, so base world y = rec.y - sink.
  const baseY = b.y - b.sink;
  built.push({ ...b, hx, hz, height, baseY, scale });
}

// --- 1. on land
let notLand = 0, belowMargin = 0;
for (const b of built) {
  const h = T.height(b.x, b.z);
  if (h <= 1.2) { notLand++; record('settlement', `${b.role}/${b.model}`, 'not-on-land', `y=${fmt(h)} at ${fmt(b.x, 0)},${fmt(b.z, 0)}`); }
  if (h < 2.1) belowMargin++;
}

// --- 2. base on the terrain, measured across the real footprint
const gaps = [], buries = [];
for (const b of built) {
  const r = reliefUnder(b.x, b.z, b.hx, b.hz, b.baseY);
  b.relief = r;
  gaps.push(r.gap); buries.push(r.bury);
  if (r.gap > 0.5) {
    record('settlement', `${b.role}/${b.model}`, 'floating-corner',
      `${fmt(r.gap)}m of daylight under the footprint at ${fmt(b.x, 0)},${fmt(b.z, 0)} (base ${fmt(b.baseY)}, ground low ${fmt(r.lo)})`);
  }
  if (r.bury > 1.5) {
    record('settlement', `${b.role}/${b.model}`, 'buried-corner',
      `ground rises ${fmt(r.bury)}m above the base at ${fmt(b.x, 0)},${fmt(b.z, 0)} (${pct(r.bury, b.height)} of a ${fmt(b.height, 1)}m building)`);
  }
  // The centre-point contract: base must be within a few cm of the terrain.
  const centreErr = Math.abs(T.height(b.x, b.z) - b.baseY);
  if (centreErr > 0.10) {
    record('settlement', `${b.role}/${b.model}`, 'centre-off-ground', `${fmt(centreErr * 100, 1)}cm`);
  }
}

// --- 3. slope
let slopeOver = 0;
for (const b of built) {
  const s = T.slope(b.x, b.z);
  b.slopeAt = s;
  if (s > 0.165) { slopeOver++; record('settlement', `${b.role}/${b.model}`, 'slope-over-tolerance', `${fmt(s, 3)} > 0.165 at ${fmt(b.x, 0)},${fmt(b.z, 0)}`); }
}

// --- 4. footprint overlap (AABB of the rotated bbox — conservative)
let overlaps = 0;
for (let i = 0; i < built.length; i++) {
  for (let j = i + 1; j < built.length; j++) {
    const a = built[i], c = built[j];
    const ox = (a.hx + c.hx) - Math.abs(a.x - c.x);
    const oz = (a.hz + c.hz) - Math.abs(a.z - c.z);
    if (ox > 0 && oz > 0) {
      overlaps++;
      record('settlement', `${a.role}/${a.model} × ${c.role}/${c.model}`, 'footprint-overlap',
        `${fmt(Math.min(ox, oz))}m interpenetration at ${fmt(a.x, 0)},${fmt(a.z, 0)} / ${fmt(c.x, 0)},${fmt(c.z, 0)}`);
    }
  }
}

// --- 5. road distance and spacing
const roads = [S.roads.quay.pts, S.roads.main.pts, S.roads.upper.pts];
const roadD = built.map((b) => Math.min(...roads.map((p) => distToPolyline(b.x, b.z, p))));
let farFromRoad = 0;
roadD.forEach((d, i) => {
  built[i].roadD = d;
  if (d > 40) { farFromRoad++; record('settlement', `${built[i].role}/${built[i].model}`, 'far-from-road', `${fmt(d, 1)}m > 40m`); }
});

const nn = built.map((b, i) => Math.min(...built.filter((_, j) => j !== i).map((c) => Math.hypot(b.x - c.x, b.z - c.z))));
const nnQ = quantiles(nn);
const tooClose = nn.filter((d) => d < 11).length;
nn.forEach((d, i) => {
  if (d < 11) record('settlement', `${built[i].role}/${built[i].model}`, 'spacing-under-11m', `${fmt(d, 1)}m`);
});

console.log(`  on land (>1.2m)          ${built.length - notLand}/${built.length} pass   (${belowMargin} under the module's own 2.1m siting margin)`);
console.log(`  base at centre           worst error ${fmt(Math.max(...built.map((b) => Math.abs(T.height(b.x, b.z) - b.baseY))) * 100, 1)}cm`);
console.log(`  footprint relief         gap  min/med/max ${fmt(quantiles(gaps).min)} / ${fmt(quantiles(gaps).median)} / ${fmt(quantiles(gaps).max)} m`);
console.log(`                           bury min/med/max ${fmt(quantiles(buries).min)} / ${fmt(quantiles(buries).median)} / ${fmt(quantiles(buries).max)} m`);
console.log(`  slope <= 0.165           ${built.length - slopeOver}/${built.length} pass   (max ${fmt(Math.max(...built.map((b) => b.slopeAt)), 3)})`);
console.log(`  footprint overlaps       ${overlaps} pairs`);
console.log(`  road <= 40m              ${built.length - farFromRoad}/${built.length} pass   (median ${fmt(quantiles(roadD).median, 1)}m, max ${fmt(quantiles(roadD).max, 1)}m)`);
console.log(`  nearest neighbour        min ${fmt(nnQ.min, 1)}  p10 ${fmt(nnQ.p10, 1)}  median ${fmt(nnQ.median, 1)}  p90 ${fmt(nnQ.p90, 1)}  (${tooClose} under 11m)`);

// --- dressing and piers
let dressWet = 0;
for (const d of S.dressing) {
  const h = T.height(d.x, d.z);
  if (h <= 1.2) { dressWet++; record('settlement', d.model, 'dressing-not-on-land', `y=${fmt(h)}`); }
  if (Math.abs(h - d.y) > 0.05) record('settlement', d.model, 'dressing-stale-y', `plan y=${fmt(d.y)} vs terrain ${fmt(h)}`);
}
console.log(`  dressing on land         ${S.dressing.length - dressWet}/${S.dressing.length} pass`);

for (const p of S.piers) {
  const rootH = T.height(p.x, p.z);
  if (rootH < 1.2) record('settlement', 'pier', 'pier-root-in-tide', `root ground ${fmt(rootH)}m at ${fmt(p.x, 0)},${fmt(p.z, 0)}`);
  const headX = p.x + Math.sin(p.yaw) * p.length;
  const headZ = p.z + Math.cos(p.yaw) * p.length;
  const headH = T.height(headX, headZ);
  if (headH > 0.15) record('settlement', 'pier', 'pier-head-on-land', `head ground ${fmt(headH)}m — pier ends on dry land`);
  if (p.deckY - rootH > 3.0) record('settlement', 'pier', 'pier-deck-high', `deck ${fmt(p.deckY)} over ${fmt(rootH)}m ground`);
}
console.log(`  piers                    ${S.piers.length} planned, root/head checks in the failure list`);

// ================================================================= LANDMARKS

console.log('');
console.log('='.repeat(78));
console.log('LANDMARKS');
console.log('='.repeat(78));

const L = planLandmarks(T);
console.log(`props ${L.props.length}   mounds ${L.mounds.length}   cairns ${L.cairns.length}   rejected ${L.rejected.length}`);
for (const r of L.rejected) record('landmarks', r.id, 'rejected-at-plan-time', `${r.why} at ${fmt(r.x, 0)},${fmt(r.z, 0)}`);

let lmWet = 0, lmSlope = 0, lmFloat = 0, lmSunk = 0;
const lmGaps = [];
for (const p of L.props) {
  const h = T.height(p.x, p.z);
  if (h <= 1.2) { lmWet++; record('landmarks', p.id, 'not-on-land', `y=${fmt(h)} at ${fmt(p.x, 0)},${fmt(p.z, 0)}`); }
  const s = T.slope(p.x, p.z);
  const tol = p.maxSlope ?? 0.3;
  if (s > tol + 1e-6) { lmSlope++; record('landmarks', p.id, 'slope-over-tolerance', `${fmt(s, 3)} > ${tol}`); }
  if (Math.abs(h - p.y) > 0.05) record('landmarks', p.id, 'stale-plan-y', `plan ${fmt(p.y)} vs terrain ${fmt(h)}`);

  const g = await gltfFor(p.model);
  if (!g) { record('landmarks', p.id, 'asset-missing', `${p.model}.glb`); continue; }
  const cat = PROPS[p.model];
  const scale = (cat?.scale ?? 1) * (p.scaleMul ?? 1);
  const box = boundsOf(g, { rotX: p.tiltX ?? 0, rotY: (p.rotDeg ?? 0) * Math.PI / 180, rotZ: p.tiltZ ?? 0, scale });
  const hx = (box.max[0] - box.min[0]) / 2;
  const hz = (box.max[2] - box.min[2]) / 2;
  const height = box.max[1] - box.min[1];
  const baseY = p.y - (p.sink ?? 0.05);
  const topY = baseY + height;

  const r = reliefUnder(p.x, p.z, hx, hz, baseY);
  lmGaps.push(r.gap);
  if (r.gap > 0.6) {
    lmFloat++;
    record('landmarks', p.id, 'floating-corner',
      `${fmt(r.gap)}m of daylight under a ${fmt(hx * 2, 1)}×${fmt(hz * 2, 1)}m footprint at ${fmt(p.x, 0)},${fmt(p.z, 0)}`);
  }
  // Fully swallowed: nothing of the prop left above the highest ground it covers.
  if (topY < r.hi) {
    lmSunk++;
    record('landmarks', p.id, 'entirely-underground', `top ${fmt(topY)} below ground high point ${fmt(r.hi)}`);
  }
  const visible = topY - r.hi;
  if (visible > 0 && visible < 0.35 && height > 1.5) {
    record('landmarks', p.id, 'nearly-buried', `only ${fmt(visible)}m of a ${fmt(height, 1)}m prop clears the ground`);
  }
}

for (const m of [...L.mounds, ...L.cairns]) {
  const h = T.height(m.x, m.z);
  if (h <= 1.2) record('landmarks', m.id, 'not-on-land', `y=${fmt(h)}`);
  if (Math.abs(h - m.y) > 0.05) record('landmarks', m.id, 'stale-plan-y', `plan ${fmt(m.y)} vs terrain ${fmt(h)}`);
  // A mound is written onto the terrain per-vertex, so the only failure mode is
  // its footprint reaching ground the dome cannot cover.
  // No float/sink test applies: appendMound writes every vertex at
  // t.height(wx, wz) + dome, so a mound conforms to the ground exactly.
}

console.log(`  props on land (>1.2m)    ${L.props.length - lmWet}/${L.props.length} pass`);
console.log(`  props within slope tol   ${L.props.length - lmSlope}/${L.props.length} pass`);
console.log(`  props floating (>0.6m)   ${lmFloat}`);
console.log(`  props fully underground  ${lmSunk}`);
console.log(`  footprint gap med/max    ${fmt(quantiles(lmGaps).median)} / ${fmt(quantiles(lmGaps).max)} m`);

// ================================================================ VEGETATION

console.log('');
console.log('='.repeat(78));
console.log('VEGETATION');
console.log('='.repeat(78));

// Reproduces World._exclusionZones(): landmark zones, then a 26m disc per
// building and 20m per pier. The PLACES pois add more, but these are the bulk.
const zones = L.zones.map((z) => ({ x: z.x, z: z.z, r: z.r }));
for (const b of S.buildings) zones.push({ x: b.x, z: b.z, r: 26 });
for (const p of S.piers) zones.push({ x: p.x, z: p.z, r: 20 });
const V = planVegetation(T, zones);
console.log(`stands ${V.stands.length}   trees ${V.trees.length}   scrub ${V.scrub.length}   rocks ${V.rocks.length}`);

function checkScatter(list, label, minH, maxSlope) {
  let wet = 0, low = 0, slope = 0, stale = 0;
  const worst = [];
  for (const p of list) {
    const h = T.height(p.x, p.z);
    if (T.isWater(p.x, p.z)) { wet++; worst.push({ p, h, why: 'in the sea' }); }
    else if (h <= 1.2) { low++; if (worst.length < 400) worst.push({ p, h, why: 'below 1.2m' }); }
    if (T.slope(p.x, p.z) > maxSlope + 1e-6) slope++;
    if (Math.abs(h - p.y) > 0.02) stale++;
  }
  console.log(`  ${label.padEnd(22)} n=${String(list.length).padEnd(5)} in-sea ${wet}   below 1.2m ${low}   over slope ${slope}   base-off-ground ${stale}`);
  if (wet) record('vegetation', label, 'in-the-sea', `${wet} instances`);
  if (low) {
    const w = worst.filter((o) => o.why === 'below 1.2m').sort((a, b) => a.h - b.h).slice(0, 3);
    record('vegetation', label, 'below-1.2m-tideline',
      `${low} of ${list.length} (${pct(low, list.length)}); lowest ${w.map((o) => `${fmt(o.h)}m @ ${fmt(o.p.x, 0)},${fmt(o.p.z, 0)}`).join('; ')}`);
  }
  if (stale) record('vegetation', label, 'base-off-ground', `${stale} instances`);
  return { wet, low, slope, stale };
}

checkScatter(V.trees, 'trees', 2.5, 0.35);
checkScatter(V.scrub, 'scrub', 1.6, 0.42);
checkScatter(V.rocks, 'rocks', 0.8, 0.55);

// Tree footprint float: a tall crown on a steep shoulder still has one root in air.
let treeFloat = 0;
const treeGaps = [];
for (const t of V.trees) {
  const g = await gltfFor(t.model);
  if (!g) continue;
  const flat = boundsOf(g, {});
  const k = t.scale / (flat.max[1] - flat.min[1]);   // Vegetation normalises to unit height * scale
  const hx = (flat.max[0] - flat.min[0]) / 2 * k;
  const hz = (flat.max[2] - flat.min[2]) / 2 * k;
  const r = reliefUnder(t.x, t.z, hx * 0.35, hz * 0.35, t.y);   // trunk footprint, not crown
  treeGaps.push(r.gap);
  if (r.gap > 0.6) treeFloat++;
}
console.log(`  tree trunk float >0.6m   ${treeFloat}/${V.trees.length}   (max ${fmt(quantiles(treeGaps).max)}m)`);
if (treeFloat) record('vegetation', 'trees', 'trunk-floating', `${treeFloat} trees with >0.6m under the trunk footprint`);

// Does vegetation get planted through the settlement?
const townR = 70;
let inTown = 0;
const cx0 = S.buildings.reduce((a, b) => a + b.x, 0) / S.buildings.length;
const cz0 = S.buildings.reduce((a, b) => a + b.z, 0) / S.buildings.length;
for (const p of [...V.trees, ...V.scrub, ...V.rocks]) {
  for (const b of built) {
    if (Math.abs(p.x - b.x) < b.hx && Math.abs(p.z - b.z) < b.hz) { inTown++; break; }
  }
}
console.log(`  scatter inside a building footprint  ${inTown}`);
if (inTown) record('vegetation', 'scatter', 'inside-building-footprint',
  `${inTown} instances land inside a Havnstad building's footprint — planVegetation received no settlement exclusion zone (town centre ${fmt(cx0, 0)},${fmt(cz0, 0)}, r≈${townR})`);

// ==================================================================== REPORT

console.log('');
console.log('='.repeat(78));
console.log(`FAILURES: ${fail.length}`);
console.log('='.repeat(78));
const byTest = new Map();
for (const f of fail) byTest.set(f.test, (byTest.get(f.test) ?? 0) + 1);
for (const [t, n] of [...byTest].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${t}`);
console.log('');
for (const f of fail.slice(0, 200)) console.log(`  [${f.group}] ${f.id} — ${f.test}: ${f.detail}`);
if (fail.length > 200) console.log(`  ... ${fail.length - 200} more`);
