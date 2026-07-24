import { terrain, plan, q, mean, f, nearestNeighbour } from './audit-town.mjs';

const B = plan.buildings;
const R = plan.ribbon;
const P = plan.terraces;

console.log('\n\n=== DEEPER PROBE ===');

console.log('\n-- terrace offsets along the ribbon (every 50m) --');
console.log('   t   quay   upper   quay-main gap   upperH   quayH');
for (let t = 0; t <= R.length; t += 50) {
  const quay = P.at(t, 'quay');
  const upper = P.at(t, 'upper');
  const pu = R.at(t, -upper);
  const pq = R.at(t, quay);
  console.log(`${String(t).padStart(4)}  ${f(quay).padStart(6)} ${f(-upper).padStart(7)}  ${f(quay).padStart(12)}   ${f(terrain.height(pu.x, pu.z), 1).padStart(6)}  ${f(terrain.height(pq.x, pq.z), 1).padStart(6)}`);
}

// how often does the upper terrace hit its 120m cap (i.e. never found 18m)?
let capped = 0, n = 0;
for (const s of P.stations) { n++; if (s.upper >= 119) capped++; }
console.log(`\nupper terrace stations at/over the 120m cap: ${capped}/${n}`);

// elevation band conformance vs doc: quay 0-3, main 4-12, upper 18-35
console.log('\n-- road elevation vs the doc bands --');
for (const [name, r, lo, hi] of [
  ['quay', plan.roads.quay, 0, 3],
  ['main', plan.roads.main, 4, 12],
  ['upper', plan.roads.upper, 18, 35],
]) {
  const hs = r.pts.map((p) => terrain.height(p.x, p.z));
  const inBand = hs.filter((h) => h >= lo && h <= hi).length;
  console.log(`${name}: spec ${lo}-${hi}m | actual p10 ${f(q(hs, 0.1), 1)} p50 ${f(q(hs, 0.5), 1)} p90 ${f(q(hs, 0.9), 1)} | in band ${inBand}/${hs.length}`);
}

// the void: buildings in the band between the quay road and main street
console.log('\n-- the gap between quay and main street --');
const quayGaps = [];
for (let t = 0; t <= R.length; t += 10) quayGaps.push(P.at(t, 'quay'));
console.log(`quay offset: min ${f(Math.min(...quayGaps))} median ${f(q(quayGaps, 0.5))} max ${f(Math.max(...quayGaps))}`);
const inVoid = B.filter((b) => b.off > 12 && b.off < P.at(Math.max(0, Math.min(R.length, b.t)), 'quay') - 20);
console.log(`buildings sitting in the open band seaward of the street: ${B.filter((b) => b.off > 12).length} total seaward, ${inVoid.length} of them >20m short of the quay`);

// per-role variation for the repeated meshes
console.log('\n-- variation within the repeated meshes --');
for (const model of ['farmstead', 'ruins-timber']) {
  const g = B.filter((b) => b.model === model);
  const sc = g.map((b) => b.scaleMul);
  const fa = g.map((b) => (b.facing * 180) / Math.PI);
  const tn = {};
  for (const b of g) tn[b.tint ? b.tint.name : 'none'] = (tn[b.tint ? b.tint.name : 'none'] || 0) + 1;
  const fm = mean(fa);
  console.log(`${model} x${g.length}: scale ${f(Math.min(...sc), 2)}-${f(Math.max(...sc), 2)}, facing sd ${f(Math.sqrt(mean(fa.map((v) => (v - fm) ** 2))), 1)} deg, tints ${JSON.stringify(tn)}`);
}

// spacing by role
console.log('\n-- nearest-neighbour by role --');
for (const role of ['dwelling', 'farm', 'boathouse']) {
  const g = B.filter((b) => b.role === role);
  if (g.length < 2) continue;
  // nn within the whole town, but reported for members of this role
  const nn = [];
  for (const b of g) {
    let best = Infinity;
    for (const o of B) {
      if (o === b) continue;
      const d = Math.hypot(b.x - o.x, b.z - o.z);
      if (d < best) best = d;
    }
    nn.push(best);
  }
  console.log(`${role} x${g.length}: nn p10 ${f(q(nn, 0.1))} p50 ${f(q(nn, 0.5))} p90 ${f(q(nn, 0.9))} max ${f(Math.max(...nn))}`);
}
// farm-to-farm only (doc says 40-80m)
const farms = B.filter((b) => b.role === 'farm');
const ff = [];
for (const b of farms) {
  let best = Infinity;
  for (const o of farms) { if (o === b) continue; const d = Math.hypot(b.x - o.x, b.z - o.z); if (d < best) best = d; }
  ff.push(best);
}
console.log(`farm-to-farm nn: p10 ${f(q(ff, 0.1))} p50 ${f(q(ff, 0.5))} p90 ${f(q(ff, 0.9))}   (doc says 40-80m)`);

// clustering: is there real cluster structure or an even comb?
console.log('\n-- along-ribbon structure (are there gaps in the ribbon?) --');
const ts = B.map((b) => b.t).sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
console.log(`t-gaps: p50 ${f(q(gaps, 0.5))} p90 ${f(q(gaps, 0.9))} max ${f(Math.max(...gaps))}`);
// histogram of t in 50m bins
const bins = new Array(Math.ceil(R.length / 50) + 1).fill(0);
for (const b of B) bins[Math.max(0, Math.floor(b.t / 50))]++;
console.log('buildings per 50m of ribbon:', bins.join(' '));

// Clark-Evans nearest-neighbour index: <1 clustered, 1 random, >1 regular
const nnAll = nearestNeighbour(B);
const area = 564.1 * 221.5; // full span bbox from pass 1
const density = B.length / area;
const expected = 0.5 / Math.sqrt(density);
console.log(`\nClark-Evans index: ${f(mean(nnAll) / expected, 3)}  (<1 clustered, 1 random, >1 regular/comb-like)`);
