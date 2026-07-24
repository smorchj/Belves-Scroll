/**
 * Follow-ups the first pass could not settle:
 *  - building overlap as oriented rectangles (SAT), not conservative AABBs
 *  - the real footprint half-extent against the radius findSpot/settle tested
 *  - the actual ground under the worst Seterdalen and farmstead sites
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHeightField } from './audit-heightfield.mjs';
import { loadGLTF, boundsOf } from './audit-glb-bounds.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { planHavnstad } = await import(pathToFileURL(path.join(ROOT, 'src/world/Settlement.js')).href);
const { planLandmarks } = await import(pathToFileURL(path.join(ROOT, 'src/world/Landmarks.js')).href);
const { PROPS } = await import(pathToFileURL(path.join(ROOT, 'src/data/catalog.js')).href);
const T = await loadHeightField(ROOT);
const fmt = (n, d = 2) => n.toFixed(d);

const cache = new Map();
async function g(model) {
  if (!cache.has(model)) cache.set(model, await loadGLTF(path.join(ROOT, 'public/assets/props', `${model}.glb`)));
  return cache.get(model);
}

const S = planHavnstad(T);

// ---- oriented rectangles
const rects = [];
for (const b of S.buildings) {
  const gl = await g(b.model);
  const flat = boundsOf(gl, {});
  const cat = PROPS[b.model];
  const scale = (cat.metres / (flat.max[1] - flat.min[1])) * b.scaleMul;
  const spanX = flat.max[0] - flat.min[0], spanZ = flat.max[2] - flat.min[2];
  const rotY = b.facing - (spanX > spanZ ? Math.PI / 2 : 0);
  rects.push({
    b, rotY,
    ex: spanX * scale / 2, ez: spanZ * scale / 2,
    // findSpot / footprintClear only probed this far out.
    checked: b.role === 'hall' ? 8 : b.role === 'church' ? 7
           : b.role === 'farm' ? 7 : ['inn', 'apothecary', 'boathouse'].includes(b.role) ? 6 : 5,
  });
}

function obbOverlap(A, B) {
  const axes = [];
  for (const r of [A, B]) {
    axes.push([Math.cos(r.rotY), -Math.sin(r.rotY)], [Math.sin(r.rotY), Math.cos(r.rotY)]);
  }
  const dx = B.b.x - A.b.x, dz = B.b.z - A.b.z;
  let minPen = Infinity;
  for (const [ax, az] of axes) {
    const proj = (r) => Math.abs(ax * Math.cos(r.rotY) - az * Math.sin(r.rotY)) * r.ex
                      + Math.abs(ax * Math.sin(r.rotY) + az * Math.cos(r.rotY)) * r.ez;
    const pen = proj(A) + proj(B) - Math.abs(dx * ax + dz * az);
    if (pen <= 0) return 0;
    if (pen < minPen) minPen = pen;
  }
  return minPen;
}

console.log('--- building overlap, oriented rectangles (SAT) ---');
let n = 0;
for (let i = 0; i < rects.length; i++) {
  for (let j = i + 1; j < rects.length; j++) {
    const pen = obbOverlap(rects[i], rects[j]);
    if (pen > 0.01) {
      n++;
      console.log(`  ${fmt(pen)}m  ${rects[i].b.role}/${rects[i].b.model} @${fmt(rects[i].b.x, 0)},${fmt(rects[i].b.z, 0)}`
        + `  ×  ${rects[j].b.role}/${rects[j].b.model} @${fmt(rects[j].b.x, 0)},${fmt(rects[j].b.z, 0)}`);
    }
  }
}
console.log(`  ${n} genuinely interpenetrating pairs of ${rects.length} buildings`);

console.log('');
console.log('--- footprint vs the radius the siting test actually probed ---');
const under = rects.filter((r) => Math.max(r.ex, r.ez) > r.checked);
const byRole = new Map();
for (const r of rects) {
  const k = r.b.role;
  if (!byRole.has(k)) byRole.set(k, []);
  byRole.get(k).push(r);
}
for (const [role, list] of byRole) {
  const worst = list.reduce((a, b) => (Math.max(b.ex, b.ez) > Math.max(a.ex, a.ez) ? b : a));
  console.log(`  ${role.padEnd(12)} n=${String(list.length).padEnd(3)} probed r=${list[0].checked}m,`
    + ` real half-extent up to ${fmt(Math.max(worst.ex, worst.ez), 1)}m`
    + ` (${fmt(worst.ex * 2, 1)}×${fmt(worst.ez * 2, 1)}m)`);
}
console.log(`  ${under.length}/${rects.length} buildings are wider than the ground that was tested under them`);

console.log('');
console.log('--- ground actually under the worst offenders ---');
const probe = (label, x, z, r) => {
  const hs = [];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    hs.push(T.height(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  console.log(`  ${label.padEnd(26)} centre ${fmt(T.height(x, z))}m slope ${fmt(T.slope(x, z), 3)}`
    + ` | ring r=${r}m spans ${fmt(Math.min(...hs))}..${fmt(Math.max(...hs))}m`
    + ` (relief ${fmt(Math.max(...hs) - Math.min(...hs))}m, effective slope ${fmt((Math.max(...hs) - Math.min(...hs)) / (2 * r), 3)})`);
};
probe('farmstead @1034,1576', 1034, 1576, 5.6);
probe('farmstead @1271,1463', 1271, 1463, 5.6);
probe('farmstead @946,1632', 946, 1632, 5.6);
probe('guild-hall @1058,1553', 1058, 1553, 7);

const L = planLandmarks(T);
for (const id of ['seterdalen-seter-0', 'seterdalen-seter-1', 'seterdalen-hollow-tree', 'seterdalen-treehouse', 'seterdalen-cabin']) {
  const p = L.props.find((q) => q.id === id);
  if (p) probe(id, p.x, p.z, 5);
}

console.log('');
console.log('--- mounds conform per-vertex, so re-test as written ---');
for (const m of L.mounds) {
  // appendMound writes t.height(wx,wz)+dome, so the only question is whether the
  // dome's own relief survives; nothing can float.
  const rel = [];
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    rel.push(T.height(m.x + Math.cos(a) * m.radius, m.z + Math.sin(a) * m.radius));
  }
  const drop = Math.max(...rel) - Math.min(...rel);
  console.log(`  ${m.id.padEnd(22)} r=${fmt(m.radius, 1)} h=${fmt(m.height, 1)} rim relief ${fmt(drop)}m`
    + (drop > m.height ? '  <- rim relief exceeds mound height: the dome will read as a bulge in a slope' : ''));
}
