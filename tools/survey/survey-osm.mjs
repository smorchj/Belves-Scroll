// Extract the real settlement geometry of Herøy so the game town can follow the
// same rules instead of scattering props at random.
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync(process.env.OSM_FILE, 'utf8'));
const els = d.elements || [];

// Local metric projection (metres) around the village.
const LAT0 = 66.0, LON0 = 12.30;
const MPD_LAT = 111132, MPD_LON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const proj = (lat, lon) => [(lon - LON0) * MPD_LON, (lat - LAT0) * MPD_LAT];

const centre = (e) => {
  const lat = e.center?.lat ?? e.lat, lon = e.center?.lon ?? e.lon;
  return (lat != null && lon != null) ? proj(lat, lon) : null;
};

const buildings = els.filter((e) => e.tags?.building).map(centre).filter(Boolean);
const roads = els.filter((e) => e.tags?.highway).map((e) => ({ p: centre(e), t: e.tags.highway })).filter((r) => r.p);
const piers = els.filter((e) => e.tags?.man_made === 'pier').map(centre).filter(Boolean);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// --- clustering: single-link at 60m, which is what reads as "one settlement" ---
const LINK = 60;
const seen = new Array(buildings.length).fill(false);
const clusters = [];
for (let i = 0; i < buildings.length; i++) {
  if (seen[i]) continue;
  const stack = [i], group = [];
  seen[i] = true;
  while (stack.length) {
    const k = stack.pop();
    group.push(buildings[k]);
    for (let j = 0; j < buildings.length; j++) {
      if (!seen[j] && dist(buildings[k], buildings[j]) < LINK) { seen[j] = true; stack.push(j); }
    }
  }
  clusters.push(group);
}
clusters.sort((a, b) => b.length - a.length);

// --- nearest-neighbour spacing within settlements ---
const nn = [];
for (let i = 0; i < buildings.length; i++) {
  let best = Infinity;
  for (let j = 0; j < buildings.length; j++) {
    if (i === j) continue;
    const dd = dist(buildings[i], buildings[j]);
    if (dd < best) best = dd;
  }
  if (best < 500) nn.push(best);
}
nn.sort((a, b) => a - b);
const pct = (arr, p) => arr[Math.floor(arr.length * p)];

// --- how close buildings sit to a road ---
const toRoad = buildings.map((b) => {
  let best = Infinity;
  for (const r of roads) { const dd = dist(b, r.p); if (dd < best) best = dd; }
  return best;
}).filter((v) => v < 2000).sort((a, b) => a - b);

// --- and to the nearest pier (proxy for the waterline) ---
const toPier = buildings.map((b) => {
  let best = Infinity;
  for (const p of piers) { const dd = dist(b, p); if (dd < best) best = dd; }
  return best;
}).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);

console.log(`buildings ${buildings.length} | roads ${roads.length} | piers ${piers.length}\n`);

console.log('SETTLEMENT CLUSTERS (single-link, 60m)');
console.log(`  total clusters: ${clusters.length}`);
const sizes = clusters.map((c) => c.length);
console.log(`  largest: ${sizes.slice(0, 8).join(', ')}`);
console.log(`  singletons (isolated farms): ${sizes.filter((s) => s === 1).length}`);
console.log(`  2-5 buildings (farmsteads):  ${sizes.filter((s) => s >= 2 && s <= 5).length}`);
console.log(`  6-20 (hamlets):              ${sizes.filter((s) => s >= 6 && s <= 20).length}`);
console.log(`  21+ (village cores):         ${sizes.filter((s) => s > 20).length}`);

// Footprint of the biggest cluster — how big is a real village core?
for (const c of clusters.slice(0, 3)) {
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  console.log(`  core of ${c.length}: ${w.toFixed(0)}m x ${h.toFixed(0)}m`);
}

console.log('\nBUILDING SPACING (nearest neighbour)');
console.log(`  p10 ${pct(nn, 0.1).toFixed(1)}m | median ${pct(nn, 0.5).toFixed(1)}m | p90 ${pct(nn, 0.9).toFixed(1)}m`);

console.log('\nDISTANCE TO NEAREST ROAD');
console.log(`  median ${pct(toRoad, 0.5).toFixed(0)}m | p90 ${pct(toRoad, 0.9).toFixed(0)}m`);

console.log('\nDISTANCE TO NEAREST PIER (waterline proxy)');
console.log(`  p10 ${pct(toPier, 0.1).toFixed(0)}m | median ${pct(toPier, 0.5).toFixed(0)}m | p90 ${pct(toPier, 0.9).toFixed(0)}m`);

// --- road network extent by class ---
console.log('\nROAD CLASSES');
const byClass = {};
for (const r of roads) byClass[r.t] = (byClass[r.t] || 0) + 1;
Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)} ${k}`));
