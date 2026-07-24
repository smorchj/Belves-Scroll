/**
 * What Terrain.slope() actually measures, and what the placement gates therefore
 * really admit.
 *
 * slope() = 1 - normal.y = 1 - cos(theta). That is 0 at flat and 1 at vertical
 * as the docstring says, but it is quadratic near flat, so the small-looking
 * thresholds everything is gated on correspond to very steep ground.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHeightField } from './audit-heightfield.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { planHavnstad } = await import(pathToFileURL(path.join(ROOT, 'src/world/Settlement.js')).href);
const { planLandmarks } = await import(pathToFileURL(path.join(ROOT, 'src/world/Landmarks.js')).href);
const { planVegetation } = await import(pathToFileURL(path.join(ROOT, 'src/world/Vegetation.js')).href);
const T = await loadHeightField(ROOT);

const deg = (r) => (r * 180 / Math.PI);
const toGrade = (s) => Math.tan(Math.acos(1 - s));

console.log('grade -> what slope() reports');
for (const g of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.66, 1.0]) {
  const th = Math.atan(g);
  console.log(`  ${g.toFixed(2).padStart(5)}  ${deg(th).toFixed(1).padStart(5)}deg  ->  slope() ${(1 - Math.cos(th)).toFixed(3)}`);
}

console.log('');
console.log('the gates in the code, converted back to real ground grade');
const gates = [
  ['Terrain.findFlat maxSlope', 0.16], ['Settlement SITE_SLOPE', 0.165],
  ['Settlement MAX_SLOPE', 0.2], ['footprintClear MAX+0.06', 0.26],
  ['Landmarks default maxSlope', 0.3], ['Landmarks keep/tower', 0.4],
  ['Vegetation TREE_MAX_SLOPE', 0.35], ['Vegetation SCRUB_MAX_SLOPE', 0.42],
  ['Vegetation rock cutoff', 0.55],
];
for (const [n, v] of gates) {
  const th = Math.acos(1 - v);
  console.log(`  ${n.padEnd(28)} ${v.toFixed(2)}  ->  ${deg(th).toFixed(1).padStart(5)}deg  grade ${Math.tan(th).toFixed(2)}  (1:${(1 / Math.tan(th)).toFixed(1)})`);
}

const q = (a, p) => [...a].sort((x, y) => x - y)[Math.round(p * (a.length - 1))];
const report = (label, pts) => {
  const g = pts.map((p) => toGrade(T.slope(p.x, p.z)));
  console.log(`  ${label.padEnd(24)} n=${String(pts.length).padEnd(5)}`
    + ` grade med ${q(g, 0.5).toFixed(2)}  p90 ${q(g, 0.9).toFixed(2)}  max ${q(g, 1).toFixed(2)}`
    + `  | >1:5 ${g.filter((v) => v > 0.2).length}  >1:4 ${g.filter((v) => v > 0.25).length}  >1:3 ${g.filter((v) => v > 0.33).length}`);
};

console.log('');
console.log('real ground grade at every placed anchor');
const S = planHavnstad(T);
const L = planLandmarks(T);
const V = planVegetation(T, L.zones);
report('settlement buildings', S.buildings);
report('settlement dressing', S.dressing);
report('landmark props', L.props);
report('trees', V.trees);
report('scrub', V.scrub);
report('rocks', V.rocks);
