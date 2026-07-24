// Assert that every object the landmark pass places is on real, dry, walkable
// ground at the elevation it claims.
//
// This imports the *same* planning functions the runtime uses and feeds them a
// terrain sampler read straight from public/assets/terrain/heroy.r16, using the
// identical bilinear filter and slope stencil as src/world/Terrain.js. So the
// numbers printed here are the numbers the game will read — not a re-derivation
// that can drift away from it.
//
//   node tools/survey/verify-landmarks.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { planLandmarks, Landmarks, SITES } from '../../src/world/Landmarks.js';
import { PROPS } from '../../src/data/catalog.js';

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
const SEA = 0;

// ---------------------------------------------------------------- sampling

const terrain = {
  size: SIZE,
  height(x, z) {
    const fx = (x + HALF) / STEP, fz = (z + HALF) / STEP;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= N - 1 || z0 >= N - 1) {
      const cx = Math.min(N - 1, Math.max(0, x0));
      const cz = Math.min(N - 1, Math.max(0, z0));
      return data[cz * N + cx] * SCALE + MIN_Y;
    }
    const tx = fx - x0, tz = fz - z0, i = z0 * N + x0;
    const a = data[i] + (data[i + 1] - data[i]) * tx;
    const b = data[i + N] + (data[i + N + 1] - data[i + N]) * tx;
    return (a + (b - a) * tz) * SCALE + MIN_Y;
  },
  slope(x, z) {
    const e = STEP;
    const nx = this.height(x - e, z) - this.height(x + e, z);
    const nz = this.height(x, z - e) - this.height(x, z + e);
    const ny = 2 * e;
    return 1 - ny / Math.hypot(nx, ny, nz);
  },
  isWater(x, z) { return this.height(x, z) <= SEA + 0.15; },
};

// height() clamps outside the tile, so anything within a sample or two of the
// edge reads back as impossibly flat. Nothing may be placed there.
const EDGE = 40;
const inBounds = (x, z) => Math.abs(x) < HALF - EDGE && Math.abs(z) < HALF - EDGE;

// ----------------------------------------------------------------- checking

// Summit and climb work is allowed to be steeper; nothing else is.
const SLOPE_LIMIT = { gravfeltet: 0.30, vardefjell: 0.45, 'vardefjell-route': 0.45, seterdalen: 0.30 };
const MIN_ELEVATION = 1.4;              // above the tide, per the design doc

const failures = [];
const rows = [];

function check(kind, id, poi, x, z, claimedY, claimedSlope, extra = {}) {
  const y = terrain.height(x, z);
  const s = terrain.slope(x, z);
  const limit = SLOPE_LIMIT[poi] ?? 0.30;
  const fail = [];

  if (!inBounds(x, z)) fail.push('outside the safe tile margin (clamped height)');
  if (terrain.isWater(x, z)) fail.push(`in water (y=${y.toFixed(2)})`);
  if (y < MIN_ELEVATION) fail.push(`below the tide floor (y=${y.toFixed(2)} < ${MIN_ELEVATION})`);
  if (s > limit) fail.push(`slope ${s.toFixed(3)} > ${limit}`);
  // The plan records what it measured; if that disagrees with a fresh read of
  // the heightmap then the planning pass and the runtime are sampling different
  // ground, which is the failure mode worth catching most.
  if (Math.abs(y - claimedY) > 1e-6) fail.push(`claimed y=${claimedY.toFixed(4)} but terrain reads ${y.toFixed(4)}`);
  if (Math.abs(s - claimedSlope) > 1e-6) fail.push(`claimed slope=${claimedSlope.toFixed(4)} but terrain reads ${s.toFixed(4)}`);

  const row = { kind, id, poi, x, z, y, slope: s, ...extra, ok: fail.length === 0 };
  rows.push(row);
  if (fail.length) failures.push({ id, why: fail.join('; ') });
  return row;
}

const plan = planLandmarks(terrain);

for (const m of plan.mounds) {
  check('mound', m.id, m.poi, m.x, m.z, m.y, m.slope, { radius: m.radius, height: m.height, open: m.mouthDeg !== null });
  // A mound skirt must also stand on dry land all the way round, or half a
  // barrow hangs over the water.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rx = m.x + Math.sin(a) * m.radius, rz = m.z + Math.cos(a) * m.radius;
    if (terrain.isWater(rx, rz)) {
      failures.push({ id: `${m.id} rim`, why: `rim at bearing ${(a * 180 / Math.PI).toFixed(0)} is in water` });
    }
  }
}

for (const c of plan.cairns) {
  check('cairn', c.id, c.poi, c.x, c.z, c.y, c.slope, { height: c.height });
}

for (const p of plan.props) {
  check('prop', p.id, p.poi, p.x, p.z, p.y, p.slope, { model: p.model, moved: p.moved, sink: p.sink ?? 0 });
}

// ------------------------------------------- procedural geometry, really built
//
// The placement table above only proves the *centres* are on good ground. The
// mounds and cairns are generated meshes, so the only way to know no vertex
// floats or sinks is to build them and read the vertices back. Landmarks does
// this without touching a GLB, so it runs headlessly.

const geomNotes = [];
{
  const lm = new Landmarks(terrain);
  lm._buildMounds(plan.mounds);
  lm._buildCairns(plan.cairns);

  const barrows = lm.group.getObjectByName('barrows');
  if (!barrows) {
    failures.push({ id: 'barrows', why: 'mound mesh was not built' });
  } else {
    const pos = barrows.geometry.attributes.position;
    let below = 0, worstBelow = 0, worstAbove = 0;
    const tallest = Math.max(...plan.mounds.map((m) => m.height));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const dy = y - terrain.height(x, z);
      if (dy < 0) { below++; worstBelow = Math.min(worstBelow, dy); }
      worstAbove = Math.max(worstAbove, dy);
    }
    // The skirt is deliberately buried 0.35m so it is never coplanar with the
    // terrain; anything deeper than that is a mound sunk into a slope.
    if (worstBelow < -0.45) failures.push({ id: 'barrows', why: `a vertex sits ${(-worstBelow).toFixed(2)}m under the terrain (skirt allowance is 0.35m)` });
    if (worstAbove > tallest + 0.05) failures.push({ id: 'barrows', why: `a vertex stands ${worstAbove.toFixed(2)}m proud, above the tallest mound (${tallest.toFixed(2)}m)` });
    geomNotes.push(`barrows: ${pos.count} vertices, ${below} buried in the skirt, deepest ${worstBelow.toFixed(2)}m, crest ${worstAbove.toFixed(2)}m above ground (tallest mound ${tallest.toFixed(2)}m)`);

    // Every mound has to actually read as a mound: a crest of at least 0.8m.
    for (const m of plan.mounds) {
      let peak = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        if (Math.hypot(x - m.x, z - m.z) > m.radius * 0.3) continue;
        peak = Math.max(peak, pos.getY(i) - terrain.height(x, z));
      }
      if (peak < 0.8) failures.push({ id: m.id, why: `crest only ${peak.toFixed(2)}m above ground` });
    }
  }

  const cairns = lm.group.getObjectByName('cairns');
  if (!cairns) {
    failures.push({ id: 'cairns', why: 'cairn mesh was not built' });
  } else {
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let worstFloat = 0, worstSink = 0;
    for (let i = 0; i < cairns.count; i++) {
      cairns.getMatrixAt(i, m4);
      m4.decompose(p, q, s);
      const ground = terrain.height(p.x, p.z);
      const nearest = plan.cairns.reduce((a, b) =>
        Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a);
      const rise = p.y - ground;
      // A stone may sit up to its own radius below the surface it beds into, and
      // no higher than the cairn it belongs to.
      if (rise < -s.y) worstSink = Math.min(worstSink, rise);
      if (rise > nearest.height + 0.3) worstFloat = Math.max(worstFloat, rise - nearest.height);
    }
    if (worstSink < 0) failures.push({ id: 'cairns', why: `a stone is ${(-worstSink).toFixed(2)}m below the ground it stands on` });
    if (worstFloat > 0) failures.push({ id: 'cairns', why: `a stone floats ${worstFloat.toFixed(2)}m above its cairn` });
    geomNotes.push(`cairns: ${cairns.count} stones across ${plan.cairns.length} piles, none sunk, none floating`);
  }
}

// ------------------------------------------------- props, measured off the GLB
//
// The runtime grounds a prop by measuring its assembled Box3 and lifting until
// box.min.y sits on the terrain, then settling it by `sink`. That is float-proof
// by construction, so what is left to check is the opposite failure: a sink deep
// enough to bury the prop. Bounds are read from the GLB the same way
// survey-assets.mjs reads them, with the plan's scale and tilt applied.

const propNotes = [];
{
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });

  const cache = new Map();
  async function localBounds(model) {
    if (cache.has(model)) return cache.get(model);
    const file = path.join(ROOT, 'public/assets/props', `${model}.glb`);
    if (!fs.existsSync(file)) { cache.set(model, null); return null; }
    const doc = await io.read(file);

    // World matrix per node, then every vertex through it — exact, rather than
    // transforming the accessor's corners, because a tilt turns a corner box
    // into an overestimate.
    const mats = new Map();
    const walk = (node, parent) => {
      const l = node.getMatrix?.();
      const local = (l && l.length === 16) ? l : null;
      const w = local ? mul(parent, local) : mul(parent, trs(node));
      mats.set(node, w);
      for (const c of node.listChildren()) walk(c, w);
    };
    const ID = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    for (const scene of doc.getRoot().listScenes()) for (const n of scene.listChildren()) walk(n, ID);

    const pts = [];
    for (const [node, m] of mats) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      for (const prim of mesh.listPrimitives()) {
        const acc = prim.getAttribute('POSITION');
        if (!acc) continue;
        const el = [];
        for (let i = 0; i < acc.getCount(); i++) {
          acc.getElement(i, el);
          pts.push([
            m[0] * el[0] + m[4] * el[1] + m[8] * el[2] + m[12],
            m[1] * el[0] + m[5] * el[1] + m[9] * el[2] + m[13],
            m[2] * el[0] + m[6] * el[1] + m[10] * el[2] + m[14],
          ]);
        }
      }
    }
    cache.set(model, pts);
    return pts;
  }

  function mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function trs(node) {
    const [x, y, z, w] = node.getRotation();
    const t = node.getTranslation(), s = node.getScale();
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ];
  }

  const v = new THREE.Vector3();
  const e = new THREE.Euler();
  for (const p of plan.props) {
    const pts = await localBounds(p.model);
    if (!pts) { failures.push({ id: p.id, why: `no GLB for ${p.model}` }); continue; }

    const scale = (PROPS[p.model]?.scale ?? 1) * (p.scaleMul ?? 1);
    e.set(p.tiltX ?? 0, (p.rotDeg ?? 0) * Math.PI / 180, p.tiltZ ?? 0);
    const m4 = new THREE.Matrix4().makeRotationFromEuler(e).scale(new THREE.Vector3(scale, scale, scale));

    let lo = Infinity, hi = -Infinity;
    for (const q of pts) {
      v.set(q[0], q[1], q[2]).applyMatrix4(m4);
      if (v.y < lo) lo = v.y;
      if (v.y > hi) hi = v.y;
    }
    const height = hi - lo;
    const sink = p.sink ?? 0.05;
    const showing = height - sink;
    if (showing < height * 0.5) {
      failures.push({ id: p.id, why: `sink ${sink.toFixed(2)}m buries more than half of a ${height.toFixed(2)}m prop` });
    }
    propNotes.push({ id: p.id, poi: p.poi, model: p.model, height, sink, showing });
  }
}

// ------------------------------------------------------------------ report

const args = process.argv.slice(2);
if (args.includes('--json')) {
  console.log(JSON.stringify({ rows, failures, rejected: plan.rejected, anchors: plan.anchors, zones: plan.zones }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

const f2 = (v) => (v === undefined || v === null ? '' : Number(v).toFixed(2));

function summarise(poi, label) {
  const mine = rows.filter((r) => r.poi === poi);
  if (!mine.length) return;
  const ys = mine.map((r) => r.y), ss = mine.map((r) => r.slope);
  const moved = mine.map((r) => r.moved ?? 0);
  console.log(`\n=== ${label}  (${mine.length} objects)`);
  console.log(`    elevation  ${f2(Math.min(...ys))} .. ${f2(Math.max(...ys))} m   mean ${f2(ys.reduce((a, b) => a + b, 0) / ys.length)}`);
  console.log(`    slope      ${f2(Math.min(...ss))} .. ${f2(Math.max(...ss))}     mean ${f2(ss.reduce((a, b) => a + b, 0) / ss.length)}`);
  console.log(`    nudged     max ${f2(Math.max(...moved))} m off the designed spot`);
  console.log(`    in water   ${mine.filter((r) => terrain.isWater(r.x, r.z)).length}`);
  for (const r of mine) {
    console.log(`      ${r.ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(28)} ${String(Math.round(r.x)).padStart(5)},${String(Math.round(r.z)).padStart(5)}  y=${f2(r.y).padStart(7)}  slope=${f2(r.slope)}  ${r.model ?? r.kind}`);
  }
}

console.log('LANDMARK VERIFICATION — src/world/Landmarks.js against heroy.r16');
console.log(`tile ${SIZE}m / ${N} samples / ${meta.metresPerSample}m per sample`);

summarise('gravfeltet', `GRAVFELTET  anchor ${SITES.gravfeltet.anchor} axis ${SITES.gravfeltet.axisDeg}deg`);
summarise('vardefjell', `VARDEFJELL  summit ${SITES.vardefjell.summit}`);
summarise('vardefjell-route', 'VARDEFJELL — route cairns from town');
summarise('seterdalen', `SETERDALEN  centre ${SITES.seterdalen.centre}`);

console.log('\n--- procedural geometry, built and read back');
for (const n of geomNotes) console.log(`    ${n}`);

console.log('\n--- prop immersion (measured off the GLB, with the plan\'s scale and tilt)');
for (const n of propNotes.filter((p) => p.sink > 0.2).sort((a, b) => b.sink / b.height - a.sink / a.height)) {
  console.log(`    ${n.id.padEnd(28)} ${n.model.padEnd(16)} ${f2(n.height).padStart(6)}m tall, sunk ${f2(n.sink)}m, ${Math.round(100 * n.showing / n.height)}% showing`);
}

console.log('\n--- anchors');
for (const [name, p] of plan.anchors) {
  console.log(`    ${name.padEnd(28)} ${Math.round(p.x)},${Math.round(p.z)}  y=${f2(p.y)}`);
}

console.log('\n--- vegetation exclusion zones');
for (const z of plan.zones) console.log(`    ${z.id.padEnd(28)} ${Math.round(z.x)},${Math.round(z.z)}  r=${z.r}m`);

if (plan.rejected.length) {
  console.log('\n--- rejected by the planner (never reach the scene)');
  for (const r of plan.rejected) console.log(`    ${r.id}: ${r.why}`);
}

console.log(`\n${failures.length ? 'FAILURES' : 'PASS'} — ${rows.length} objects checked, ${failures.length} failed`);
for (const f of failures) console.log(`    ${f.id}: ${f.why}`);
process.exit(failures.length ? 1 : 0);
