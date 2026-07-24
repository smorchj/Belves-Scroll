// Locate Havnstad and the three wilderness POIs on the real Herøy DTM.
//
// Reads public/assets/terrain/heroy.r16 directly and reproduces Terrain.js's
// bilinear height() exactly, so every coordinate printed here is the same
// coordinate the runtime will ground a building on. Nothing is hand-placed:
// each site is the argmax of a scoring function over an exhaustive search of
// the heightmap, and the winning values are re-measured and printed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function height(x, z) {
  const fx = (x + HALF) / STEP;
  const fz = (z + HALF) / STEP;
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
}

/** Matches Terrain.slope(): 1 - normal.y, over a one-sample stencil. */
function slope(x, z) {
  const e = STEP;
  const l = height(x - e, z), r = height(x + e, z);
  const d = height(x, z - e), u = height(x, z + e);
  const nx = l - r, ny = 2 * e, nz = d - u;
  const len = Math.hypot(nx, ny, nz);
  return 1 - ny / len;
}

const isWater = (x, z) => height(x, z) <= SEA + 0.15;

// height() clamps outside the tile, which reads back as a perfectly flat,
// perfectly straight shore — the highest-scoring site in the first run was
// entirely this artefact. Everything a site depends on must be sampled inside.
const EDGE = 40;
const inBounds = (x, z) => Math.abs(x) < HALF - EDGE && Math.abs(z) < HALF - EDGE;

// Grid <-> world. Row index rises with world z, so +z is north and +x is east
// (the manifest stores rows south-to-north). Bearings are compass degrees:
// 0 = +z, 90 = +x.
const wx = (i) => i * STEP - HALF;
const wz = (j) => j * STEP - HALF;
const dirOf = (deg) => {
  const r = deg * Math.PI / 180;
  return [Math.sin(r), Math.cos(r)];
};

// ------------------------------------------------------------- land survey

function landSurvey() {
  let minE = Infinity, maxE = -Infinity;
  let sea = 0, land = 0, buildable = 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < minE) minE = h;
      if (h > maxE) maxE = h;
      if (h <= SEA + 0.15) { sea++; continue; }
      land++;
      const x = wx(i), z = wz(j);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      if (h > 1.5 && h < 60 && slope(x, z) < 0.18) {
        buildable++;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
      }
    }
  }
  return { minE, maxE, sea, land, buildable, bbox: [x0, z0, x1, z1], build: [bx0, bz0, bx1, bz1] };
}

/** ASCII relief, so the search results can be sanity-checked by eye. */
function relief(cols = 100, rows = 46, marks = []) {
  const ramp = ' .:-=+*#%@';
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) / cols * SIZE - HALF;
      const z = HALF - (r + 0.5) / rows * SIZE;   // north at top
      const h = height(x, z);
      line.push(h <= SEA + 0.15 ? '~' : ramp[Math.min(9, Math.floor(h / meta.maxElevation * 9) + 1)]);
    }
    grid.push(line);
  }
  for (const m of marks) {
    const c = Math.round((m.x + HALF) / SIZE * cols - 0.5);
    const r = Math.round((HALF - m.z) / SIZE * rows - 0.5);
    if (c >= 0 && c < cols && r >= 0 && r < rows) grid[r][c] = m.ch;
  }
  return grid.map((l) => l.join('')).join('\n');
}

// ------------------------------------------------------------- visibility

/**
 * How much open water a point can see *seawards*. Only the half-fan facing away
 * from the shore is cast: a full circle counts the rays that run inland as
 * "blocked", which makes every beach look sheltered.
 *
 * A ray stops at the first land it meets. All rays blocked inside 1.5km means a
 * strait or a closed bay — that is the shelter the town wants.
 */
function seawardFan(x, z, sx, sz, range = 1500) {
  const base = Math.atan2(sx, sz) * 180 / Math.PI;
  let total = 0, blocked = 0, n = 0;
  for (let a = -90; a <= 90; a += 10) {
    const [dx, dz] = dirOf(base + a);
    let reach = range;
    for (let d = 20; d <= range; d += 20) {
      if (height(x + dx * d, z + dz * d) > SEA + 0.15) { reach = d; break; }
    }
    total += reach; n++;
    if (reach < range) blocked++;
  }
  return { mean: total / n, blockedFraction: blocked / n };
}

/** Navigable width of the water directly off a point, seawards. */
function channelWidth(x, z, sx, sz, max = 1500) {
  let width = 0;
  for (let d = 0; d <= max; d += 8) {
    if (height(x + sx * d, z + sz * d) > SEA + 0.15) break;
    width = d;
  }
  return width;
}

/** Line of sight between two points over the terrain, with 2m eye height. */
function visible(ax, az, bx, bz, eye = 2, target = 4) {
  const dist = Math.hypot(bx - ax, bz - az);
  const ay = height(ax, az) + eye, by = height(bx, bz) + target;
  const steps = Math.max(8, Math.ceil(dist / 12));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const h = height(ax + (bx - ax) * t, az + (bz - az) * t);
    if (h > ay + (by - ay) * t + 1.0) return false;
  }
  return true;
}

// ------------------------------------------------------------------- town

const RIBBON = 620;          // docs: main street runs 620m
const PROBE = 20;            // sample spacing along the ribbon

/**
 * Distance from a point straight out to the waterline on the given heading,
 * or null if there is none within `max`.
 */
function toWater(x, z, dx, dz, max = 160) {
  for (let d = 0; d <= max; d += 4) {
    if (height(x + dx * d, z + dz * d) <= SEA + 0.15) return d;
  }
  return null;
}

/**
 * Score one candidate ribbon: an anchor, a bearing along the shore, and the
 * seaward side. Returns null the moment a hard requirement fails, so the
 * exhaustive sweep stays cheap.
 */
function scoreRibbon(ax, az, bearing, seaSign) {
  const [dx, dz] = dirOf(bearing);
  const [px, pz] = [dz * seaSign, -dx * seaSign];   // perpendicular, seaward

  const shore = [];        // distance from centreline out to the waterline
  const quay = [];         // elevation on the centreline
  const behind = [];       // elevation 90m inland
  const rise = [];         // elevation 220m inland
  let slopeSum = 0, slopeMax = 0, n = 0;

  for (let d = 0; d <= RIBBON; d += PROBE) {
    const x = ax + dx * d, z = az + dz * d;
    // Everything the site is judged on has to be real data, not edge clamp.
    if (!inBounds(x, z) || !inBounds(x - px * 260, z - pz * 260) || !inBounds(x + px * 200, z + pz * 200)) return null;
    const h = height(x, z);
    if (h < 2 || h > 35) return null;              // main-street band
    const s = slope(x, z);
    if (s > 0.16) return null;
    slopeSum += s; slopeMax = Math.max(slopeMax, s); n++;

    const w = toWater(x, z, px, pz, 140);
    if (w === null) return null;                   // not actually on the shore
    shore.push(w);
    quay.push(h);

    // Land immediately behind must be buildable for the upper terrace.
    const bh = height(x - px * 90, z - pz * 90);
    const bs = slope(x - px * 90, z - pz * 90);
    if (bh < 2 || bh > 60 || bs > 0.30) return null;
    behind.push(bh);
    rise.push(height(x - px * 220, z - pz * 220));
  }

  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };

  // Straightness: a straight shore keeps a constant offset from the centreline.
  const shoreSd = sd(shore);
  if (shoreSd > 34) return null;

  // Quay depth: the sea floor a boat's length off the waterline.
  const mid = RIBBON / 2;
  const mx = ax + dx * mid, mz = az + dz * mid;
  const wOff = toWater(mx, mz, px, pz, 140) ?? 0;
  let depth = 0;
  for (let d = wOff + 20; d <= wOff + 90; d += 10) {
    depth = Math.min(depth, height(mx + px * d, mz + pz * d));
  }
  if (depth > -3) return null;                     // too shallow to moor

  // Anchorage measured from open water off the middle of the quay.
  const ox = mx + px * (wOff + 40), oz = mz + pz * (wOff + 40);
  if (!isWater(ox, oz)) return null;
  const channel = channelWidth(ox, oz, px, pz);
  if (channel < 80) return null;                   // no room to work a boat

  const shelter = seawardFan(ox, oz, px, pz);
  if (shelter.mean < 120) return null;             // a puddle, not an anchorage

  const riseGain = mean(rise) - mean(quay);
  const upperGain = mean(behind) - mean(quay);

  // Weights: shelter and straightness are the two things the previous attempt
  // got wrong, so they dominate. Rising ground is worth real points but must
  // not outvote a sheltered straight shore.
  //
  // Shelter is a band, not a minimum: zero open water is a pond, 1.5km is the
  // open sea. A strait with the far shore 300-900m off is what is wanted.
  const strait = Math.max(0, 1 - Math.abs(shelter.mean - 550) / 950);

  const score =
      shelter.blockedFraction * 110
    + strait * 55
    + (1 - Math.min(1, shoreSd / 34)) * 55
    + Math.min(1, riseGain / 45) * 45
    + Math.min(1, upperGain / 14) * 20
    + (1 - Math.min(1, (slopeSum / n) / 0.16)) * 25
    + Math.min(1, -depth / 12) * 25;

  return {
    x: ax, z: az, bearing, seaSign, score,
    shoreSd, shoreMean: mean(shore),
    quayMean: mean(quay), quayMin: Math.min(...quay), quayMax: Math.max(...quay),
    upperGain, riseGain, riseMean: mean(rise),
    slopeMean: slopeSum / n, slopeMax, depth, channel,
    openWaterMean: shelter.mean, blocked: shelter.blockedFraction,
    midX: mx, midZ: mz,
  };
}

function findTown() {
  const cands = [];
  // 32m anchor grid; 15-degree bearing steps. Anchors must be low shore land.
  for (let j = 4; j < N - 4; j += 8) {
    for (let i = 4; i < N - 4; i += 8) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < 2 || h > 20) continue;
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      for (let b = 0; b < 360; b += 15) {
        for (const s of [1, -1]) {
          const r = scoreRibbon(x, z, b, s);
          if (r) cands.push(r);
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  return cands;
}

/** Re-run the winner on a fine bearing/offset grid. */
function refineTown(best) {
  let top = best;
  for (let db = -12; db <= 12; db += 2) {
    for (let ox = -48; ox <= 48; ox += 8) {
      for (let oz = -48; oz <= 48; oz += 8) {
        const r = scoreRibbon(best.x + ox, best.z + oz, best.bearing + db, best.seaSign);
        if (r && r.score > top.score) top = r;
      }
    }
  }
  return top;
}

// ------------------------------------------------------------------- POIs

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Min-heap keyed on cost, for the track search over a million-cell grid. */
class Heap {
  constructor() { this.n = []; this.c = []; }
  get size() { return this.n.length; }
  push(node, cost) {
    this.n.push(node); this.c.push(cost);
    let i = this.n.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.c[p] <= this.c[i]) break;
      this._swap(p, i); i = p;
    }
  }
  pop() {
    const top = [this.n[0], this.c[0]];
    const ln = this.n.pop(), lc = this.c.pop();
    if (this.n.length) {
      this.n[0] = ln; this.c[0] = lc;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.n.length && this.c[l] < this.c[m]) m = l;
        if (r < this.n.length && this.c[r] < this.c[m]) m = r;
        if (m === i) break;
        this._swap(m, i); i = m;
      }
    }
    return top;
  }
  _swap(a, b) {
    [this.n[a], this.n[b]] = [this.n[b], this.n[a]];
    [this.c[a], this.c[b]] = [this.c[b], this.c[a]];
  }
}

/**
 * The flattest buildable spot near a scored site. A scoring pass finds the
 * right *place*; it does not find the right *stance*, and the winning cell is
 * often a couple of metres off a bench.
 */
function flattestNear(cx, cz, radius = 140, band = 30, accept = null, step = 8) {
  const centre = height(cx, cz);
  let best = null;
  for (let dz = -radius; dz <= radius; dz += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      if (Math.hypot(dx, dz) > radius) continue;
      const x = cx + dx, z = cz + dz;
      const h = height(x, z);
      if (h < 1.5 || Math.abs(h - centre) > band) continue;
      if (accept && !accept(x, z, h)) continue;
      // Only land counts. The carved sea floor drops away steeply just off the
      // shore, so including wet probes makes every coastal site read as rough
      // and disagrees with how the site searches score the same ground.
      let rough = slope(x, z);
      for (let k = 0; k < 8; k++) {
        const [ux, uz] = dirOf(k * 45);
        const px = x + ux * 45, pz = z + uz * 45;
        if (height(px, pz) < 1.5) continue;
        rough = Math.max(rough, slope(px, pz));
      }
      if (!best || rough < best.rough) best = { x, z, y: h, rough, slope: slope(x, z) };
    }
  }
  return best;
}

/** Mean height difference to the surroundings — positive means open/exposed. */
function openness(x, z, r = 120) {
  let sum = 0, n = 0;
  for (let k = 0; k < 16; k++) {
    const [dx, dz] = dirOf(k * 22.5);
    sum += height(x + dx * r, z + dz * r) - height(x, z);
    n++;
  }
  return sum / n;
}

/** Fraction of a fan that sees open sea within 1.2km. */
function seaView(x, z) {
  let hits = 0;
  for (let k = 0; k < 36; k++) {
    const [dx, dz] = dirOf(k * 10);
    for (let d = 40; d <= 1200; d += 20) {
      const px = x + dx * d, pz = z + dz * d;
      const h = height(px, pz);
      if (h <= SEA + 0.15) {
        if (visible(x, z, px, pz, 2, 0)) hits++;
        break;
      }
      if (h > height(x, z) + 12) break;             // ridge in the way
    }
  }
  return hits / 36;
}

/**
 * Barrow field: open seaward heath. Hard constraints are only what would make
 * the site impossible (underwater, too steep to dig a mound into, out of the
 * walkable ring); everything else is scored, so the search reports the best
 * available ground rather than nothing at all.
 */
function findBarrowField(town) {
  const out = [];
  for (let j = 2; j < N - 2; j += 2) {
    for (let i = 2; i < N - 2; i += 2) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < 10 || h > 28) continue;                  // the doc's 10-25m heath
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      const d = dist({ x, z }, town);
      if (d < 500 || d > 1200) continue;
      const s = slope(x, z);
      if (s > 0.12) continue;

      // Nine mounds in a line need a flat open patch, not just a flat point.
      //
      // Requiring all twelve probes to be dry land found nothing: it rules out
      // exactly the seaward-edge ground that has the view. A headland heath has
      // sea on one side by definition, so a third of the ring may be water.
      //
      // Roughness is measured on the same 45m ring flattestNear() uses, so the
      // ranking and the subsequent refine cannot disagree about which ground is
      // flatter — measuring one at 70m and the other at 45m made the "refined"
      // site measurably worse than the one it replaced.
      let sMax = s, wet = 0;
      for (let k = 0; k < 12; k++) {
        const [dx, dz] = dirOf(k * 30);
        const px = x + dx * 45, pz = z + dz * 45;
        if (height(px, pz) < 1.5) { wet++; continue; }
        sMax = Math.max(sMax, slope(px, pz));
      }
      if (wet > 4 || sMax > 0.26) continue;

      const view = seaView(x, z);
      if (view < 0.20) continue;

      let near = Infinity;
      for (let k = 0; k < 24; k++) {
        const w = toWater(x, z, ...dirOf(k * 15), 500);
        if (w !== null) near = Math.min(near, w);
      }

      const score = view * 110
                  + (1 - Math.min(1, s / 0.12)) * 30
                  + (1 - Math.min(1, near / 500)) * 40
                  + (1 - Math.min(1, sMax / 0.26)) * 45
                  + (1 - Math.min(1, Math.abs(d - 750) / 450)) * 35;
      out.push({ x, z, y: h, slope: s, patchMaxSlope: sMax, seaView: view, toWater: near, distTown: d, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * A summit is only useful if a cart track can reach it. Dijkstra on the DTM
 * grid with a gradient cost, which is what a switchbacking track actually
 * optimises. A greedy uphill walk was tried first and reported the summit
 * unreachable — it was stuck in a local minimum, not blocked by terrain.
 *
 * Cost is horizontal distance plus a steep penalty on gradient, so the cheapest
 * route is the one a horse can pull a cart up.
 */
function findTrack(sx, sz, tx, tz, maxGrade = 0.55) {
  const gi = (x, z) => [Math.round((x + HALF) / STEP), Math.round((z + HALF) / STEP)];
  const [si, sj] = gi(sx, sz), [ti, tj] = gi(tx, tz);
  const key = (i, j) => j * N + i;

  const cost = new Float64Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  cost[key(si, sj)] = 0;

  const heap = new Heap();
  heap.push(key(si, sj), 0);
  const goal = key(ti, tj);
  while (heap.size) {
    const [node, c] = heap.pop();
    if (c > cost[node]) continue;                     // stale entry
    if (node === goal) break;
    const i = node % N, j = (node - i) / N;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 1 || nj < 1 || ni >= N - 1 || nj >= N - 1) continue;
        const h0 = data[key(i, j)] * SCALE + MIN_Y;
        const h1 = data[key(ni, nj)] * SCALE + MIN_Y;
        if (h1 < 1.5) continue;                       // no walking on water
        const run = Math.hypot(di, dj) * STEP;
        const grade = Math.abs(h1 - h0) / run;
        if (grade > maxGrade) continue;
        const step = run * (1 + grade * 9);
        const nc = c + step;
        if (nc < cost[key(ni, nj)]) {
          cost[key(ni, nj)] = nc;
          from[key(ni, nj)] = node;
          heap.push(key(ni, nj), nc);
        }
      }
    }
  }

  if (cost[goal] === Infinity) return { ok: false };
  const trail = [];
  let k = goal;
  while (k !== -1) {
    const i = k % N, j = (k - i) / N;
    trail.push({ x: wx(i), z: wz(j), y: data[k] * SCALE + MIN_Y });
    if (k === key(si, sj)) break;
    k = from[k];
  }
  trail.reverse();

  let length = 0, maxGradeSeen = 0, gain = 0;
  for (let n = 1; n < trail.length; n++) {
    const a = trail[n - 1], b = trail[n];
    const run = Math.hypot(b.x - a.x, b.z - a.z);
    length += run;
    maxGradeSeen = Math.max(maxGradeSeen, Math.abs(b.y - a.y) / run);
    if (b.y > a.y) gain += b.y - a.y;
  }
  return { ok: true, trail, length, maxGrade: maxGradeSeen, gain };
}

function findBeacon(town) {
  // Thresholds scaled to the island tile's relief (max ~57m, tile ±1408m) —
  // the beacon hill is the archipelago's high point, not a massif.
  let best = null;
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < 32) continue;
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      const d = dist({ x, z }, town);
      if (d < 400 || d > 1400) continue;
      // Must be a local high point, not a shoulder.
      let peak = true;
      for (let k = 0; k < 12 && peak; k++) {
        const [dx, dz] = dirOf(k * 30);
        if (height(x + dx * 60, z + dz * 60) > h) peak = false;
      }
      if (!peak) continue;
      const score = h - Math.abs(d - 800) * 0.01 - slope(x, z) * 40;
      if (!best || score > best.score) best = { x, z, y: h, distTown: d, score };
    }
  }
  return best;
}

/**
 * A hanging valley: a basin high on the massif, walled on most sides, with a
 * flat enough floor to put a seter on. Enclosure is the whole point, so it
 * carries most of the score; being out of sight of the summit is a bonus, not
 * a requirement, because the massif may not offer both.
 */
function findValley(town, summit, { minRim = 22, band = [70, 160], range = [1100, 2800] } = {}) {
  const out = [];
  let bestRim = { rim: -Infinity };
  for (let j = 3; j < N - 3; j += 2) {
    for (let i = 3; i < N - 3; i += 2) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < band[0] || h > band[1]) continue;
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      const d = dist({ x, z }, town);
      if (d < range[0] || d > range[1]) continue;
      const s = slope(x, z);
      if (s > 0.18) continue;

      // Enclosure, measured as a rim height rather than a count of "uphill"
      // directions. Sampling fixed radii rewarded open hill shelves that happen
      // to sit below a distant ridge; what makes a basin is that you have to
      // climb out of it whichever way you go.
      //
      // For each of 24 bearings take the highest ground within 350m. Sort them
      // and read off the 4th lowest: that is the rim, with three directions
      // allowed to stay low for the gully that the stream and the path use.
      const ridges = [];
      for (let k = 0; k < 24; k++) {
        const [dx, dz] = dirOf(k * 15);
        let top = -Infinity;
        for (let r = 50; r <= 350; r += 25) top = Math.max(top, height(x + dx * r, z + dz * r));
        ridges.push(top - h);
      }
      const sorted = [...ridges].sort((a, b) => a - b);
      const rim = sorted[3];
      if (rim > bestRim.rim) bestRim = { x, z, y: h, rim, dist: d };
      if (rim < minRim) continue;                     // open ground, not a basin
      const gaps = sorted.filter((v) => v < 8).length;
      const walls = ridges.filter((v) => v > 25).length;
      const relief = sorted[12];                      // median rim height

      // Floor flat enough to stand buildings on.
      let floorOk = true, floorSlope = 0;
      for (let k = 0; k < 8 && floorOk; k++) {
        const [dx, dz] = dirOf(k * 45);
        const px = x + dx * 70, pz = z + dz * 70;
        floorSlope = Math.max(floorSlope, slope(px, pz));
        const ph = height(px, pz);
        if (ph < h - 25 || ph > h + 45) floorOk = false;
      }
      if (!floorOk || floorSlope > 0.34) continue;

      const hidden = !visible(summit.x, summit.z, x, z, 2, 4);
      const score = Math.min(80, rim) * 1.6 + Math.min(60, relief) * 0.7
                  + walls * 2 + (hidden ? 45 : 0)
                  + (1 - Math.min(1, s / 0.18)) * 25
                  + (1 - Math.min(1, floorSlope / 0.34)) * 20;
      out.push({ x, z, y: h, slope: s, floorSlope, rim, walls, gaps, relief, ridges, hidden, distTown: d, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  out.bestRim = bestRim;
  return out;
}

/** Largest gentle land patches — candidate farm ground. */
function findFlats(exclude = [], count = 6) {
  const picks = [];
  const taken = [];
  for (let j = 4; j < N - 4; j += 4) {
    for (let i = 4; i < N - 4; i += 4) {
      const h = data[j * N + i] * SCALE + MIN_Y;
      if (h < 3 || h > 70) continue;
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      // Grow the largest radius that stays gentle and on land.
      let r = 0;
      for (let test = 40; test <= 320; test += 20) {
        let ok = true;
        for (let k = 0; k < 16 && ok; k++) {
          const [dx, dz] = dirOf(k * 22.5);
          const px = x + dx * test, pz = z + dz * test;
          if (height(px, pz) < 2.5 || slope(px, pz) > 0.14) ok = false;
        }
        if (!ok) break;
        r = test;
      }
      if (r >= 80) picks.push({ x, z, y: h, radius: r });
    }
  }
  picks.sort((a, b) => b.radius - a.radius);
  const out = [];
  for (const p of picks) {
    if (out.length >= count) break;
    if (taken.some((t) => dist(t, p) < t.radius + p.radius)) continue;
    if (exclude.some((e) => dist(e, p) < 300)) continue;
    out.push(p); taken.push(p);
  }
  return out;
}

// ------------------------------------------------------------------- report

const fmt = (v, d = 1) => v.toFixed(d);
const at = (p) => `(${fmt(p.x, 0)}, ${fmt(p.z, 0)})  y=${fmt(height(p.x, p.z), 2)}m  slope=${fmt(slope(p.x, p.z), 3)}`;

const land = landSurvey();
console.log('=== LAND');
console.log(`elevation ${fmt(land.minE)} .. ${fmt(land.maxE)} m`);
console.log(`sea ${fmt(land.sea / (N * N) * 100)}%  land ${fmt(land.land / (N * N) * 100)}%`);
console.log(`land bbox  x ${fmt(land.bbox[0], 0)} .. ${fmt(land.bbox[2], 0)}   z ${fmt(land.bbox[1], 0)} .. ${fmt(land.bbox[3], 0)}`);
console.log(`buildable  ${fmt(land.buildable / (N * N) * 100)}% of tile, bbox `
  + `x ${fmt(land.build[0], 0)} .. ${fmt(land.build[2], 0)}   z ${fmt(land.build[1], 0)} .. ${fmt(land.build[3], 0)}`);

console.log('\n=== TOWN SEARCH');
const cands = findTown();
console.log(`${cands.length} viable ribbons`);
for (const c of cands.slice(0, 8)) {
  console.log(`  ${fmt(c.score, 1)}  anchor ${at(c)}  bearing ${c.bearing}  shoreSd ${fmt(c.shoreSd)}  `
    + `blocked ${fmt(c.blocked, 2)}  open ${fmt(c.openWaterMean, 0)}m  rise ${fmt(c.riseGain)}m  depth ${fmt(c.depth)}m`);
}
const town = refineTown(cands[0]);
const [tdx, tdz] = dirOf(town.bearing);
const townMid = { x: town.x + tdx * RIBBON / 2, z: town.z + tdz * RIBBON / 2 };

console.log('\n=== HAVNSTAD');
console.log(`anchor      ${at(town)}`);
console.log(`bearing     ${town.bearing} deg (0 = +z north, 90 = +x east)`);
console.log(`length      ${RIBBON} m`);
console.log(`faces       ${fmt((town.bearing + (town.seaSign > 0 ? 90 : -90) + 360) % 360, 0)} deg `
  + `(seaward normal — gable ends point this way)`);
console.log(`channel     ${fmt(town.channel, 0)} m of open water off the quay`);
console.log(`far end     ${at({ x: town.x + tdx * RIBBON, z: town.z + tdz * RIBBON })}`);
console.log(`midpoint    ${at(townMid)}`);
console.log(`quay band   ${fmt(town.quayMin)} .. ${fmt(town.quayMax)} m, mean ${fmt(town.quayMean)}`);
console.log(`slope       mean ${fmt(town.slopeMean, 3)}  max ${fmt(town.slopeMax, 3)}`);
console.log(`waterline   ${fmt(town.shoreMean)} m seaward, sd ${fmt(town.shoreSd)} m over ${RIBBON} m`);
console.log(`upper 90m   +${fmt(town.upperGain)} m   rising 220m inland  +${fmt(town.riseGain)} m (${fmt(town.riseMean)} m)`);
console.log(`quay depth  ${fmt(town.depth)} m below sea level`);
console.log(`shelter     ${fmt(town.blocked * 100, 0)}% of rays blocked inside 1.5km, mean open water ${fmt(town.openWaterMean, 0)} m`);

// Sample the ribbon so the builder can see it really is continuous land.
console.log('\nribbon profile (every 100m):');
for (let d = 0; d <= RIBBON; d += 100) {
  const p = { x: town.x + tdx * d, z: town.z + tdz * d };
  console.log(`  ${String(d).padStart(3)}m  ${at(p)}`);
}

// The quay is not the centreline: it is the strip just inside the waterline.
// Sample the cross-section so the builder knows where each terrace actually is.
const [tpx, tpz] = [tdz * town.seaSign, -tdx * town.seaSign];
console.log('\ncross-section at the midpoint (+ = seaward from the centreline):');
const quayBand = [];
for (let d = 120; d >= -260; d -= 20) {
  const p = { x: townMid.x + tpx * d, z: townMid.z + tpz * d };
  const h = height(p.x, p.z);
  const tag = h <= 0.15 ? 'sea' : '';
  if (h > 0.15 && h < 4) quayBand.push(h);
  console.log(`  ${String(d).padStart(5)}m  ${at(p)} ${tag}`);
}
// One cross-section only crosses the quay strip once. Walk the whole ribbon,
// find the waterline on each perpendicular, and sample the land just inside it:
// that strip is where the piers and boathouses actually stand.
const quaySamples = [];
for (let d = 0; d <= RIBBON; d += 20) {
  const x = town.x + tdx * d, z = town.z + tdz * d;
  const w = toWater(x, z, tpx, tpz, 160);
  if (w === null) continue;
  for (const inset of [8, 16, 24]) {
    const h = height(x + tpx * (w - inset), z + tpz * (w - inset));
    if (h > 0.15) quaySamples.push(h);
  }
}
const quayY = quaySamples.reduce((s, v) => s + v, 0) / quaySamples.length;
console.log(`quay terrace, whole ribbon (land 8-24m inside the waterline): mean y=${fmt(quayY, 2)}m, `
  + `range ${fmt(Math.min(...quaySamples), 2)}..${fmt(Math.max(...quaySamples), 2)}m over ${quaySamples.length} samples`);

const barrowList = findBarrowField(townMid);
const barrows = barrowList[0];
console.log('\n=== GRAVFELTET');
console.log(`${barrowList.length} candidates`);
for (const b of barrowList.slice(0, 5)) {
  console.log(`  ${fmt(b.score, 1)}  ${at(b)}  seaView ${fmt(b.seaView, 2)}  water ${fmt(b.toWater, 0)}m  `
    + `patch maxSlope ${fmt(b.patchMaxSlope, 3)}  dist ${fmt(b.distTown, 0)}m`);
}
// Refining for flatness alone walked the site downhill to a spot with no sea
// view at all, which is the one thing a barrow field must have. Keep the
// defining criteria as hard constraints on the refine.
const barrowSite = barrows
  // The accept test must use the same thresholds the search used, or the refine
  // rejects its own winner and settles for rougher ground.
  ? flattestNear(barrows.x, barrows.z, 90, 8, (x, z, h) => h >= 10 && h <= 28 && seaView(x, z) >= 0.20)
  : null;
if (barrowSite) {
  console.log(`mound platform: ${at(barrowSite)}  max slope within 45m ${fmt(barrowSite.rough, 3)}  `
    + `seaView ${fmt(seaView(barrowSite.x, barrowSite.z), 2)}  dist ${fmt(dist(barrowSite, townMid), 0)}m`);

  // Nine mounds in a line, 15m apart: find the bearing that keeps all nine on
  // gentle open ground. The doc wants the line pointing at the midsummer sunset.
  const lines = [];
  for (let b = 0; b < 180; b += 5) {
    const [dx, dz] = dirOf(b);
    let worst = 0, ok = true;
    for (let m = -4; m <= 4 && ok; m++) {
      const px = barrowSite.x + dx * m * 15, pz = barrowSite.z + dz * m * 15;
      const h = height(px, pz);
      if (h < 5 || h > 28) ok = false;
      worst = Math.max(worst, slope(px, pz));
    }
    if (ok) lines.push({ bearing: b, worst });
  }
  lines.sort((a, b) => a.worst - b.worst);
  const flat = lines[0];
  // At 66N midsummer the sun sets around 320-340 deg, so the doc's alignment
  // wants the line's NW end in that arc.
  const sunset = lines.filter((l) => l.bearing >= 135 && l.bearing <= 160).sort((a, b) => a.worst - b.worst)[0];
  console.log(flat
    ? `mound line, flattest: bearing ${flat.bearing}/${flat.bearing + 180} deg, worst slope ${fmt(flat.worst, 3)}`
    : 'mound line: no 120m alignment stays on gentle ground');
  if (sunset) {
    console.log(`mound line, midsummer-sunset alignment (NW end ${sunset.bearing + 180} deg): `
      + `worst slope ${fmt(sunset.worst, 3)}`);
  }
}

const summit = findBeacon(townMid);
console.log('\n=== VARDEFJELL');
if (!summit) { console.log('none within range'); process.exit(0); }
console.log(`${at(summit)}  dist ${fmt(summit.distTown, 0)}m`);
const start = { x: townMid.x + tdx * 240, z: townMid.z + tdz * 240 };
// Try a cart grade first and only fall back to a footpath grade if the massif
// genuinely does not allow it — the doc calls for a track, not a scramble.
let route = findTrack(start.x, start.z, summit.x, summit.z, 0.30);
let grade = 0.30;
if (!route.ok) { route = findTrack(start.x, start.z, summit.x, summit.z, 0.45); grade = 0.45; }
if (!route.ok) { route = findTrack(start.x, start.z, summit.x, summit.z, 0.60); grade = 0.60; }
console.log(`cart track from ${at(start)}: ${route.ok ? `CLIMBABLE at grade cap ${grade}` : 'BLOCKED'}`);
if (route.ok) {
  console.log(`  ${fmt(route.length, 0)}m of track, +${fmt(route.gain, 0)}m ascent, steepest grade ${fmt(route.maxGrade, 2)}`);
  const every = Math.max(1, Math.floor(route.trail.length / 8));
  for (let i = 0; i < route.trail.length; i += every) console.log(`   ${at(route.trail[i])}`);
  const halfway = route.trail[Math.floor(route.trail.length / 2)];
  console.log(`  halfway stol: ${at(halfway)}`);
}
const direct = findTrack(start.x, start.z, summit.x, summit.z, 0.60);
if (direct.ok) {
  console.log(`  direct footpath at grade cap 0.60: ${fmt(direct.length, 0)}m, steepest ${fmt(direct.maxGrade, 2)}`);
}

let valleyList = findValley(townMid, summit, { minRim: 7, band: [8, 40], range: [350, 1500] });
console.log('\n=== SETERDALEN');
console.log(`${valleyList.length} candidates at rim >= 22m; `
  + `deepest basin anywhere in the band: rim +${fmt(valleyList.bestRim.rim)}m at `
  + `(${fmt(valleyList.bestRim.x, 0)}, ${fmt(valleyList.bestRim.z, 0)})`);

// If the massif has no true hanging valley, say so and take the deepest hollow
// it does offer rather than inventing one.
for (const relax of [20, 18, 16, 14, 12]) {
  if (valleyList.length) break;
  valleyList = findValley(townMid, summit, { minRim: relax });
  if (valleyList.length) console.log(`(relaxed rim threshold to ${relax}m to find any basin at all)`);
}
const valley = valleyList[0];
for (const v of valleyList.slice(0, 5)) {
  console.log(`  ${fmt(v.score, 1)}  ${at(v)}  rim +${fmt(v.rim)}m  median rim +${fmt(v.relief)}m  `
    + `walls ${v.walls}/24  low gaps ${v.gaps}  hidden ${v.hidden}  dist ${fmt(v.distTown, 0)}m`);
}
if (valley) {
  console.log('skyline from the basin floor (rim height above the floor, by bearing):');
  console.log('  ' + valley.ridges.map((v, k) => `${k * 15}:+${v.toFixed(0)}`).join(' '));
  console.log(`  floor slope within 70m: max ${fmt(valley.floorSlope, 3)}`);

  const seter = flattestNear(valley.x, valley.z, 130, 12);
  console.log(`  seter platform: ${at(seter)}  max slope within 45m ${fmt(seter.rough, 3)}`);

  // The gully in: the lowest gap out of the basin, which is the stream's exit.
  let gully = null;
  for (let k = 0; k < 72; k++) {
    const [dx, dz] = dirOf(k * 5);
    let peak = -Infinity;
    for (let d = 60; d <= 320; d += 20) peak = Math.max(peak, height(valley.x + dx * d, valley.z + dz * d));
    if (!gully || peak < gully.peak) gully = { bearing: k * 5, peak, dx, dz };
  }
  console.log(`gully out on bearing ${gully.bearing} deg, saddle only ${fmt(gully.peak)}m `
    + `(+${fmt(gully.peak - valley.y)}m above the floor)`);
  console.log(`gully mouth ${at({ x: valley.x + gully.dx * 320, z: valley.z + gully.dz * 320 })}`);
}

console.log('\n=== FARM FLATS');
for (const f of findFlats([townMid])) {
  console.log(`  ${at(f)}  gentle radius ${f.radius}m  dist to town ${fmt(dist(f, townMid), 0)}m`);
}

console.log('\n=== RELIEF (north up, ~41m per cell)');
console.log(relief(100, 46, [
  { ...town, ch: 'A' },
  { ...townMid, ch: 'H' },
  ...(barrows ? [{ ...barrows, ch: 'G' }] : []),
  { ...summit, ch: 'V' },
  ...(valley ? [{ ...valley, ch: 'S' }] : []),
]));

// === THE DARK TEMPLE — an outlying island in the wildlands
// Label islands by flood fill over dry samples; the temple wants the most
// prominent point on an island that is NOT the town's, far enough out that the
// crossing itself is the journey.
{
  const label = new Int32Array(N * N).fill(-1);
  const isLand = (i) => data[i] * SCALE + MIN_Y > 0.5;
  let nIslands = 0;
  const sizes = [];
  for (let i = 0; i < N * N; i++) {
    if (!isLand(i) || label[i] !== -1) continue;
    const stack = [i]; label[i] = nIslands;
    let size = 0;
    while (stack.length) {
      const j = stack.pop(); size++;
      const x = j % N;
      for (const k of [j - 1, j + 1, j - N, j + N]) {
        if (k < 0 || k >= N * N || Math.abs((k % N) - x) > 1) continue;
        if (isLand(k) && label[k] === -1) { label[k] = nIslands; stack.push(k); }
      }
    }
    sizes.push(size);
    nIslands++;
  }
  const gi = (x, z) => label[Math.round((z + HALF) / STEP) * N + Math.round((x + HALF) / STEP)];
  const townIsland = gi(townMid.x, townMid.z);
  console.log(`\n=== THE DARK TEMPLE`);
  console.log(`${nIslands} islands; town on #${townIsland} (${sizes[townIsland]} samples)`);

  let best = null;
  for (let j = 2; j < N - 2; j++) {
    for (let i = 2; i < N - 2; i++) {
      const isl = label[j * N + i];
      if (isl === -1 || isl === townIsland) continue;
      if (sizes[isl] < 300) continue;                       // needs ground to build on (~0.5ha+)
      const x = wx(i), z = wz(j);
      if (!inBounds(x, z)) continue;
      const h = data[j * N + i] * SCALE + MIN_Y;
      const s = slope(x, z);
      if (s > 0.22) continue;
      const d = dist({ x, z }, townMid);
      if (d < 500) continue;
      const score = h * 2 + Math.min(d, 1600) * 0.02 + sizes[isl] * 0.002 - s * 60;
      if (!best || score > best.score) best = { x, z, y: h, slope: s, island: isl, islandSamples: sizes[isl], distTown: d, score };
    }
  }
  if (best) {
    const flat = flattestNear(best.x, best.z, 60, 10);
    console.log(`temple: ${at(best)}  island #${best.island} (${best.islandSamples} samples)  dist to town ${fmt(best.distTown, 0)}m`);
    console.log(`  build platform: ${at(flat)}  max slope within 45m ${fmt(flat.rough, 3)}`);
  } else {
    console.log('no suitable outlying island');
  }
}
