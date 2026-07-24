import { terrain, q, mean, f } from './audit-town.mjs';
import { planVegetation, shelterAt } from '../../src/world/Vegetation.js';

console.log('\n\n=== VEGETATION ===');
const t0 = Date.now();
const V = planVegetation(terrain, []);
console.log(`planned in ${Date.now() - t0}ms`);
console.log(`stands ${V.stands.length}  trees ${V.trees.length}  scrub ${V.scrub.length}  rocks ${V.rocks.length}`);

// --- treeline
const th = V.trees.map((t) => t.y);
console.log('\n-- treeline (hard limit 70m, fade from 48m) --');
console.log(`tree elevation: min ${f(Math.min(...th))} p50 ${f(q(th, 0.5))} p90 ${f(q(th, 0.9))} max ${f(Math.max(...th))}`);
console.log(`above 70m: ${th.filter((h) => h > 70).length}   above 48m: ${th.filter((h) => h > 48).length} (${f(100 * th.filter((h) => h > 48).length / th.length)}%)`);
console.log(`below 2.5m: ${th.filter((h) => h < 2.5).length}`);
let inWater = 0, tooSteep = 0;
for (const t of V.trees) {
  if (terrain.isWater(t.x, t.z)) inWater++;
  if (terrain.slope(t.x, t.z) > 0.35) tooSteep++;
}
console.log(`trees in water: ${inWater}   trees on slope > 0.35: ${tooSteep}`);

// --- shelter rule: compare tree shelter against shelter of random land
console.log('\n-- shelter rule (is this an even carpet or genuinely sheltered ground?) --');
const treeShelter = V.trees.map((t) => t.shelter);
const treeWeather = V.trees.map((t) => t.weather);
console.log(`tree shelter : p10 ${f(q(treeShelter, 0.1), 3)} p50 ${f(q(treeShelter, 0.5), 3)} p90 ${f(q(treeShelter, 0.9), 3)}`);
console.log(`tree weather : p10 ${f(q(treeWeather, 0.1), 3)} p50 ${f(q(treeWeather, 0.5), 3)} p90 ${f(q(treeWeather, 0.9), 3)}`);

// baseline: shelter over eligible land generally
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const base = [];
const limit = terrain.size / 2 - 224;
while (base.length < 3000) {
  const x = (rnd() * 2 - 1) * limit, z = (rnd() * 2 - 1) * limit;
  const h = terrain.height(x, z);
  if (h < 2.5 || h > 70) continue;
  if (terrain.isWater(x, z)) continue;
  if (terrain.slope(x, z) > 0.35) continue;
  base.push(shelterAt(terrain, x, z, h).shelter);
}
console.log(`ELIGIBLE LAND baseline shelter: p10 ${f(q(base, 0.1), 3)} p50 ${f(q(base, 0.5), 3)} p90 ${f(q(base, 0.9), 3)}`);
const above = base.filter((b) => b >= q(treeShelter, 0.5)).length / base.length;
console.log(`fraction of eligible land at or above the MEDIAN tree's shelter: ${f(100 * above, 1)}%`);
console.log('  -> if this were an even carpet it would be ~50%; a real shelter rule makes it small');

// --- clustering: are trees in copses or spread?
console.log('\n-- copse structure --');
for (const s of V.stands) {
  const n = V.trees.filter((t) => t.stand === V.stands.indexOf(s)).length;
  console.log(`  stand @ ${f(s.x, 0)},${f(s.z, 0)} h${f(s.y, 0)} shelter ${f(s.shelter, 3)} q${f(s.quality, 2)} r${f(s.radius, 0)} target ${s.target} -> ${n} trees`);
}
const standCounts = V.stands.map((s, i) => V.trees.filter((t) => t.stand === i).length);
console.log(`trees per stand: min ${Math.min(...standCounts)} max ${Math.max(...standCounts)} mean ${f(mean(standCounts))}`);

// coverage: what fraction of the island's eligible land is within 60m of a tree?
let near = 0, tot = 0;
for (let x = -1800; x <= 1800; x += 40) {
  for (let z = -1800; z <= 1800; z += 40) {
    const h = terrain.height(x, z);
    if (h < 2.5 || h > 70 || terrain.isWater(x, z)) continue;
    tot++;
    if (V.trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 3600)) near++;
  }
}
console.log(`eligible land within 60m of a tree: ${near}/${tot} = ${f(100 * near / tot, 1)}%   (scarcity is the goal)`);

// --- species mix
console.log('\n-- species mix --');
const sp = {};
for (const t of V.trees) sp[t.model] = (sp[t.model] || 0) + 1;
for (const [k, v] of Object.entries(sp).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v} (${f(100 * v / V.trees.length)}%)`);
}

// --- scale variation
const sc = V.trees.map((t) => t.scale);
console.log(`\ntree scale: min ${f(Math.min(...sc), 2)} p50 ${f(q(sc, 0.5), 2)} max ${f(Math.max(...sc), 2)}`);
// per model, so a single metres value isn't masking uniformity
for (const m of Object.keys(sp)) {
  const g = V.trees.filter((t) => t.model === m).map((t) => t.scale);
  console.log(`  ${m}: ${f(Math.min(...g), 2)} - ${f(Math.max(...g), 2)} (sd ${f(Math.sqrt(mean(g.map((v) => (v - mean(g)) ** 2))), 3)})`);
}

// --- scrub / rocks distribution
console.log('\n-- scrub & rocks --');
const scr = {};
for (const s of V.scrub) scr[s.model] = (scr[s.model] || 0) + 1;
console.log('scrub:', JSON.stringify(scr), ' (requested: succulent 2200, stump 320/260, logs 120)');
const rh = V.rocks.map((r) => r.y);
console.log(`rocks ${V.rocks.length} (requested 5200): elev p10 ${f(q(rh, 0.1))} p50 ${f(q(rh, 0.5))} p90 ${f(q(rh, 0.9))}`);
const rs = V.rocks.map((r) => r.scale);
console.log(`rock scale: p50 ${f(q(rs, 0.5), 2)} p99 ${f(q(rs, 0.99), 2)} max ${f(Math.max(...rs), 2)}`);

// do rocks respect the thin-soil bias, or are they uniform?
const rockSlopes = V.rocks.map((r) => terrain.slope(r.x, r.z));
const baseSlopes = [];
while (baseSlopes.length < 3000) {
  const x = (rnd() * 2 - 1) * limit, z = (rnd() * 2 - 1) * limit;
  const h = terrain.height(x, z);
  if (h < 0.8 || terrain.isWater(x, z)) continue;
  const s = terrain.slope(x, z);
  if (s > 0.55) continue;
  baseSlopes.push(s);
}
console.log(`rock slope p50 ${f(q(rockSlopes, 0.5), 3)} vs eligible-land slope p50 ${f(q(baseSlopes, 0.5), 3)}`);

// scrub in water / above 180
console.log(`scrub in water: ${V.scrub.filter((s) => terrain.isWater(s.x, s.z)).length}, above 180m: ${V.scrub.filter((s) => s.y > 180).length}`);
console.log(`rocks in water: ${V.rocks.filter((r) => terrain.isWater(r.x, r.z)).length}`);

// --- exclusion zones actually honoured?
console.log('\n-- exclusion --');
const V2 = planVegetation(terrain, [{ x: 992, z: 1537, r: 300 }]);
const inside = [...V2.trees, ...V2.scrub, ...V2.rocks].filter((p) => Math.hypot(p.x - 992, p.z - 1537) < 300).length;
console.log(`with a 300m exclusion at the town centroid: ${inside} placements inside it (should be 0)`);
console.log(`trees ${V.trees.length} -> ${V2.trees.length}`);
