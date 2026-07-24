// Measure the vegetation plan against the real Herøy DTM.
//
// This does not re-implement the placement rules — it imports
// src/world/Vegetation.js and runs the same planVegetation() the runtime calls,
// against a terrain stub that reproduces Terrain.js's height/slope/isWater
// exactly. So every number printed here is a number the game will use.
//
// Usage: node tools/survey/survey-vegetation.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planVegetation, shelterAt } from '../../src/world/Vegetation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TERRAIN = path.join(ROOT, 'public/assets/terrain');

const meta = JSON.parse(fs.readFileSync(path.join(TERRAIN, 'heroy.json'), 'utf8'));
const raw = fs.readFileSync(path.join(TERRAIN, 'heroy.r16'));
const data = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);

const N = meta.samples;
const SIZE = meta.sizeMetres;
const HALF = SIZE / 2;
const STEP = SIZE / (N - 1);
const SCALE = meta.scale;
const MIN_Y = meta.minElevation;

const terrain = {
  size: SIZE,
  samples: N,
  seaLevel: 0,

  height(x, z) {
    const fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= N - 1 || z0 >= N - 1) {
      const cx = Math.min(N - 1, Math.max(0, x0));
      const cz = Math.min(N - 1, Math.max(0, z0));
      return data[cz * N + cx] * SCALE + MIN_Y;
    }
    const tx = fx - x0, tz = fz - z0;
    const i = z0 * N + x0;
    const a = data[i] + (data[i + 1] - data[i]) * tx;
    const b = data[i + N] + (data[i + N + 1] - data[i + N]) * tx;
    return (a + (b - a) * tz) * SCALE + MIN_Y;
  },

  slope(x, z) {
    const e = STEP;
    const l = this.height(x - e, z), r = this.height(x + e, z);
    const d = this.height(x, z - e), u = this.height(x, z + e);
    const nx = l - r, ny = 2 * e, nz = d - u;
    return 1 - ny / Math.hypot(nx, ny, nz);
  },

  isWater(x, z) { return this.height(x, z) <= 0.15; },
};

// The town ribbon and the three POIs, from the site survey. Vegetation is kept
// clear of them so the settlement grammar is not buried under scrub.
const EXCLUSIONS = [
  { x: 731, z: 1652, r: 120 },     // Havnstad, west end
  { x: 1004, z: 1506, r: 140 },    // Havnstad, midpoint
  { x: 1278, z: 1361, r: 120 },    // Havnstad, east end
  { x: 585, z: 1930, r: 110 },     // Gravfeltet
  { x: 1856, z: 1183, r: 90 },     // Vardefjell summit
  { x: 1247, z: 246, r: 130 },     // Seterdalen (reserved assets only)
];

// ------------------------------------------------------------------ helpers

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

function dist(label, arr, d = 2) {
  console.log(
    `  ${label.padEnd(12)} n=${String(arr.length).padStart(5)}  ` +
    `min ${f(Math.min(...arr), d).padStart(7)}  p10 ${f(pct(arr, 10), d).padStart(7)}  ` +
    `median ${f(pct(arr, 50), d).padStart(7)}  p90 ${f(pct(arr, 90), d).padStart(7)}  ` +
    `max ${f(Math.max(...arr), d).padStart(7)}  mean ${f(mean(arr), d).padStart(7)}`);
}

function histogram(label, values, edges) {
  const bins = new Array(edges.length).fill(0);
  for (const v of values) {
    let i = edges.findIndex((e) => v < e);
    if (i < 0) i = edges.length - 1;
    bins[i]++;
  }
  console.log(`  ${label}`);
  edges.forEach((e, i) => {
    const lo = i === 0 ? '-inf' : String(edges[i - 1]);
    const bar = '#'.repeat(Math.round(bins[i] / Math.max(1, Math.max(...bins)) * 46));
    console.log(`    ${(lo + '..' + e).padStart(14)}  ${String(bins[i]).padStart(5)}  ${bar}`);
  });
}

// -------------------------------------------------------------------- run

const t0 = Date.now();
const plan = planVegetation(terrain, EXCLUSIONS);
const elapsed = Date.now() - t0;

const { stands, trees, scrub, rocks } = plan;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    stands: stands.length, trees: trees.length, scrub: scrub.length, rocks: rocks.length,
  }, null, 2));
  process.exit(0);
}

console.log(`\nVEGETATION SURVEY — Herøy DTM, ${SIZE}m tile, planned in ${elapsed}ms\n`);

// ---- stands
console.log(`STANDS: ${stands.length}`);
for (const s of stands) {
  const d = Math.round(Math.hypot(s.x - 1004, s.z - 1506));
  console.log(
    `  (${String(Math.round(s.x)).padStart(6)}, ${String(Math.round(s.z)).padStart(6)})  ` +
    `y=${f(s.y, 1).padStart(6)}m  shelter=${f(s.shelter)}  wsw=${f(s.weather)}  ` +
    `r=${String(Math.round(s.radius)).padStart(3)}m  target=${String(s.target).padStart(2)}  ` +
    `${String(d).padStart(4)}m from town`);
}

// ---- trees
console.log(`\nTREES: ${trees.length} across ${stands.length} stands\n`);
const tElev = trees.map((t) => t.y);
const tSlope = trees.map((t) => t.slope);
const tShel = trees.map((t) => t.shelter);
const tWsw = trees.map((t) => t.weather);
dist('elevation', tElev, 1);
dist('slope', tSlope, 3);
dist('shelter', tShel, 3);
dist('WSW shelter', tWsw, 3);

console.log();
histogram('elevation (m)', tElev, [10, 20, 30, 40, 50, 60, 70, 1e9]);
console.log();
histogram('exposure (1 - shelter)', tShel.map((s) => 1 - s), [0.3, 0.4, 0.5, 0.6, 0.7, 1e9]);

console.log('\n  species:');
const bySpecies = {};
for (const t of trees) bySpecies[t.model] = (bySpecies[t.model] ?? 0) + 1;
for (const [k, v] of Object.entries(bySpecies).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${k.padEnd(16)} ${String(v).padStart(4)}`);
}

console.log('\n  stand sizes (trees actually planted):');
const perStand = stands.map((_, i) => trees.filter((t) => t.stand === i).length);
console.log(`    ${perStand.join(', ')}`);

// ---- hard constraint audit
console.log('\nCONSTRAINT AUDIT (trees)');
const viol = {
  'above treeline (>70m)': trees.filter((t) => t.y > 70),
  'below 2m elevation': trees.filter((t) => t.y < 2),
  'in water': trees.filter((t) => terrain.isWater(t.x, t.z)),
  'on cliff (slope > 0.35)': trees.filter((t) => terrain.slope(t.x, t.z) > 0.35),
  'in exclusion zone': trees.filter((t) =>
    EXCLUSIONS.some((e) => (t.x - e.x) ** 2 + (t.z - e.z) ** 2 < e.r * e.r)),
  // The widest shelter probe reaches 200m. Any tree closer than that to the
  // edge was scored against height() clamping, i.e. against fictitious ground.
  'scored on clamped edge data': trees.filter((t) =>
    Math.abs(t.x) > HALF - 200 || Math.abs(t.z) > HALF - 200),
  'reserved Seterdalen asset': trees.filter((t) => ['clockwork-grove', 'tree-hollow'].includes(t.model)),
};
let clean = true;
for (const [k, v] of Object.entries(viol)) {
  if (v.length) clean = false;
  console.log(`  ${v.length ? 'FAIL' : 'pass'}  ${k.padEnd(28)} ${v.length}`);
  for (const t of v.slice(0, 3)) console.log(`          (${f(t.x, 0)}, ${f(t.z, 0)}) y=${f(t.y, 1)}`);
}
console.log(`  => ${clean ? 'ALL CLEAR' : 'VIOLATIONS PRESENT'}`);

// ---- exposed west shore check: is there anything on unsheltered ground
// facing the weather? This is the rule that matters most for the look.
const openWest = trees.filter((t) => t.weather < 0.2);
console.log(`\n  trees on ground with WSW shelter < 0.20: ${openWest.length} (must be 0)`);

// ---- what the tile could have supported, for context
let landCells = 0, treeableCells = 0;
for (let x = -HALF + 48; x <= HALF - 48; x += 32) {
  for (let z = -HALF + 48; z <= HALF - 48; z += 32) {
    const h = terrain.height(x, z);
    if (h < 2.5) continue;
    landCells++;
    if (h <= 70 && terrain.slope(x, z) <= 0.35) treeableCells++;
  }
}
const areaKm2 = SIZE * SIZE / 1e6;
console.log(`\nDENSITY: ${trees.length} trees over ${f(areaKm2, 2)} km2 tile ` +
  `= ${f(trees.length / areaKm2, 1)} trees/km2`);
console.log(`  ground passing elevation+slope alone: ${treeableCells} of ${landCells} land cells ` +
  `(${f(treeableCells / landCells * 100, 1)}%) — shelter is what rejects the rest`);

// ---- scrub and rocks
console.log(`\nSCRUB: ${scrub.length}`);
const byScrub = {};
for (const s of scrub) byScrub[s.model] = (byScrub[s.model] ?? 0) + 1;
for (const [k, v] of Object.entries(byScrub)) console.log(`  ${k.padEnd(18)} ${String(v).padStart(5)}`);
dist('elevation', scrub.map((s) => s.y), 1);
dist('slope', scrub.map((s) => terrain.slope(s.x, s.z)), 3);
const scrubWet = scrub.filter((s) => terrain.isWater(s.x, s.z)).length;
console.log(`  in water: ${scrubWet} (must be 0)`);

console.log(`\nROCKS: ${rocks.length} over ${ROCKV()} variants`);
dist('elevation', rocks.map((r) => r.y), 1);
dist('slope', rocks.map((r) => terrain.slope(r.x, r.z)), 3);
dist('size (m)', rocks.map((r) => r.scale), 2);
const rockWet = rocks.filter((r) => terrain.isWater(r.x, r.z)).length;
console.log(`  in water: ${rockWet} (must be 0)`);
console.log(`  erratics over 2m: ${rocks.filter((r) => r.scale > 2).length}`);
function ROCKV() { return new Set(rocks.map((r) => r.variant)).size; }

// ---- draw-call budget
console.log('\nINSTANCE TOTALS');
const totals = { trees: trees.length, scrub: scrub.length, rocks: rocks.length };
totals.all = totals.trees + totals.scrub + totals.rocks;
for (const [k, v] of Object.entries(totals)) console.log(`  ${k.padEnd(8)} ${String(v).padStart(6)}`);
console.log(`  InstancedMesh count is one per source mesh per model + ${ROCKV()} rock variants`);

// ---- spot-check the shelter metric against known ground
console.log('\nSHELTER SPOT CHECKS (sanity: the metric must rank these correctly)');
const spots = [
  ['Havnstad quay (sheltered strait)', 1004, 1506],
  ['Gravfeltet (open seaward heath)', 585, 1930],
  ['Vardefjell summit (fully exposed)', 1856, 1183],
  ['Seterdalen floor (enclosed basin)', 1247, 246],
  ['Farm flat 899,659', 899, 659],
];
for (const [name, x, z] of spots) {
  const h = terrain.height(x, z);
  const s = shelterAt(terrain, x, z, h);
  console.log(`  ${name.padEnd(36)} y=${f(h, 1).padStart(6)}  shelter=${f(s.shelter)}  wsw=${f(s.weather)}`);
}
console.log();

// ---- the specks bug: confirm every vegetation GLB really does carry node
// transforms that must be baked, and that doing so yields a usable root height.
await checkGeometry();

async function checkGeometry() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const draco = await import('draco3dgltf');
  const { PROPS } = await import('../../src/data/catalog.js');

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
  });

  console.log('GEOMETRY CHECK (the "instances shrink to specks" trap)');
  const models = [...new Set([...trees, ...scrub].map((p) => p.model))];

  for (const model of models) {
    const file = path.join(ROOT, 'public/assets/props', `${model}.glb`);
    if (!fs.existsSync(file)) { console.log(`  MISSING  ${model}`); continue; }

    const doc = await io.read(file);
    let prims = 0, transformed = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = worldMatrix(node);
      const ident = isIdentity(m);
      for (const prim of mesh.listPrimitives()) {
        prims++;
        if (!ident) transformed++;
        const pos = prim.getAttribute('POSITION');
        for (let i = 0; i < pos.getCount(); i++) {
          const w = apply(m, pos.getElement(i, [0, 0, 0]));
          for (let a = 0; a < 3; a++) {
            if (w[a] < min[a]) min[a] = w[a];
            if (w[a] > max[a]) max[a] = w[a];
          }
        }
      }
    }

    const h = max[1] - min[1];
    console.log(
      `  ${model.padEnd(16)} prims=${String(prims).padStart(2)}  ` +
      `transformed=${String(transformed).padStart(2)}  rootHeight=${f(h, 3).padStart(7)}  ` +
      `-> instances render at ${f(PROPS[model]?.metres, 2)}m  ${h > 1e-3 ? 'ok' : 'DEGENERATE'}`);
  }
  console.log('  Baking matrixWorld is required wherever transformed > 0. The root\n' +
    '  height is what the instance scale divides out, so any non-zero value\n' +
    '  reproduces the catalog metres exactly — and a multi-prim model must be\n' +
    '  normalised against the ROOT height, not each prim\'s own.\n');
}

function worldMatrix(node) {
  let m = node.getMatrix();
  let p = node.getParentNode?.();
  while (p) { m = mul(p.getMatrix(), m); p = p.getParentNode?.(); }
  return m;
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function apply(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}
function isIdentity(m) {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return m.every((v, i) => Math.abs(v - I[i]) < 1e-6);
}
