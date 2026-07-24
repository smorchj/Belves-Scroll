import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { assets } from '../core/Assets.js';
import { PROPS } from '../data/catalog.js';

/**
 * Havnstad — the fishing settlement on the north shore of Herøysundet.
 *
 * The layout is a ribbon, not a town: 620m of shore, one road deep, in three
 * terraces (quay, main street, upper road). That shape is measured, not chosen —
 * all six real village cores in the OSM survey are elongated ~1:2.5 along a shore
 * road, and the previous radial-scatter attempt is what made the place read as
 * props on a hillside.
 *
 * Everything geometric lives in `planHavnstad()`, which touches nothing but
 * `terrain.height/slope/isWater` and a seeded RNG. `build()` then hangs meshes off
 * that plan. The split exists so tools/survey/verify-settlement.mjs can measure the
 * exact layout the runtime will build, against the raw heightmap, with no GPU and
 * no GLBs — a placement bug is then a failing assertion rather than a house in the
 * sea that nobody notices.
 */

// Surveyed against the real DTM (tools/survey/find-sites.mjs). The anchor is the
// west end of the ribbon; the bearing runs ESE, so its seaward normal is 208°.
// Re-surveyed for the island tile (centre 381800,7323500): the sheltered
// north shore of the main island; the seaward normal faces 313 so the quay
// looks across the sound towards the temple island.
const SITE = { anchorX: 963, anchorZ: -246, bearingDeg: 223, lengthM: 620 };

const DEG = Math.PI / 180;

/** Compass bearing (0 = +z north, 90 = +x east) to a unit direction. */
function bearingVec(deg) {
  return { x: Math.sin(deg * DEG), z: Math.cos(deg * DEG) };
}

/**
 * Seeded PRNG. The layout has to be identical in the browser and in the
 * verification script, otherwise the script measures a town that never gets built.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Roughly normal, mean 0, sd 1 — three uniforms is close enough for jitter. */
function gauss(rng) {
  return (rng() + rng() + rng() - 1.5) * 1.732;
}

// ---------------------------------------------------------------- the ribbon

/**
 * Ribbon coordinates: `t` runs along the shore from the anchor, `off` runs
 * seaward (negative = inland). Every position in the town is authored in these
 * two numbers, so the whole settlement rotates and slides with the surveyed site.
 */
function makeRibbon() {
  const axis = bearingVec(SITE.bearingDeg);
  const seaward = bearingVec(SITE.bearingDeg + 90);
  return {
    length: SITE.lengthM,
    axis,
    seaward,
    /** Seaward bearing in radians, i.e. the yaw a gable end should face. */
    seawardYaw: Math.atan2(seaward.x, seaward.z),
    at(t, off) {
      return {
        x: SITE.anchorX + axis.x * t + seaward.x * off,
        z: SITE.anchorZ + axis.z * t + seaward.z * off,
      };
    },
  };
}

/**
 * Where each terrace sits, sampled every 10m along the ribbon.
 *
 * The three terraces are found in the ground rather than assumed: the quay is
 * pinned to the actual tideline, the upper road to wherever the hillside first
 * reaches the church band. The waterline wanders from 28m to 120m off the
 * centreline over the 620m, so a fixed offset would put half the boathouses in
 * the strait and the other half in a field.
 */
function terraceProfile(terrain, R) {
  const raw = [];
  for (let t = 0; t <= R.length; t += 10) {
    let water = 200;
    for (let d = 0; d <= 200; d += 2) {
      const p = R.at(t, d);
      if (terrain.isWater(p.x, p.z)) { water = d; break; }
    }

    // Back off the tideline until the ground clears the 1.5m building floor.
    let quay = 0;
    for (let d = water; d >= -20; d -= 2) {
      const p = R.at(t, d);
      if (terrain.height(p.x, p.z) >= 2.2) { quay = d; break; }
    }

    // Capped at 120m inland: where the hillside never reaches the church band —
    // the west end climbs so slowly that 18m is nearly 300m back — the upper
    // terrace stays a terrace of this town rather than wandering off into the
    // fields and breaking the one-road-deep ribbon.
    let upper = 120;
    for (let d = 45; d <= 120; d += 5) {
      const p = R.at(t, -d);
      upper = d;
      if (terrain.height(p.x, p.z) >= 18) break;
    }

    raw.push({ t, water, quay, upper });
  }

  // A road that tracked every sample would zigzag; the terraces are smoothed
  // across ~50m so they read as roads while still following the ground.
  const smoothed = raw.map((s, i) => {
    const acc = { water: 0, quay: 0, upper: 0 };
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const o = raw[clamp(i + k, 0, raw.length - 1)];
      acc.water += o.water; acc.quay += o.quay; acc.upper += o.upper;
      n++;
    }
    return { t: s.t, water: acc.water / n, quay: acc.quay / n, upper: acc.upper / n };
  });

  return {
    stations: smoothed,
    /** Interpolated terrace offset at an arbitrary t. */
    at(t, field) {
      const f = clamp(t / 10, 0, smoothed.length - 1);
      const i = Math.floor(f);
      const a = smoothed[i], b = smoothed[Math.min(i + 1, smoothed.length - 1)];
      return a[field] + (b[field] - a[field]) * (f - i);
    },
  };
}

// ------------------------------------------------------------- site testing

const MIN_GROUND = 1.5;     // the hard floor from the brief
const MAX_SLOPE = 0.2;

/**
 * Build margins, deliberately tighter than the hard limits. A house sited at
 * exactly 1.5m and 0.2 passes the assertion and still has one corner in the tide,
 * because a building occupies ground rather than a point.
 */
const SITE_GROUND = 2.1;
const SITE_SLOPE = 0.165;

/**
 * Lowest terrain height anywhere under a footprint of `radius` around (x, z).
 *
 * Buildings are rigid and the ground is not. Grounding to the centre sample is
 * only correct on level ground; on any slope the downhill corners end up above
 * the terrain and the whole house reads as floating. Taking the minimum over the
 * footprint guarantees no corner is ever left unsupported.
 */
function lowestUnder(terrain, x, z, radius) {
  let lowest = terrain.height(x, z);
  // Corners and edge midpoints, plus an inner ring — the extremes of a
  // rectangular footprint are at its corners, but a convex slope can dip inside.
  for (const f of [1, 0.6]) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const h = terrain.height(x + Math.cos(a) * radius * f, z + Math.sin(a) * radius * f);
      if (h < lowest) lowest = h;
    }
  }
  return lowest;
}

/** Is the ground under a whole footprint buildable, not just its centre? */
function footprintClear(terrain, x, z, radius) {
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
    if (terrain.height(px, pz) < MIN_GROUND) return false;
    if (terrain.slope(px, pz) > MAX_SLOPE + 0.06) return false;
  }
  return true;
}

/**
 * A buildable spot near (t, off), or null.
 *
 * The nominal position is tried first so the composition survives, then jittered
 * candidates. Returning null rather than falling back to the nominal spot is the
 * point — a building the ground refuses is a building that does not get placed.
 */
function findSpot(ctx, t, off, opts = {}) {
  const {
    tJitter = 14, offJitter = 10, gap = 11, radius = 5, tries = 60,
    offMin = -Infinity, offMax = Infinity, maxSlope = SITE_SLOPE,
  } = opts;

  for (let i = 0; i < tries; i++) {
    const tt = i === 0 ? t : t + (ctx.rng() * 2 - 1) * tJitter;
    const oo = clamp(i === 0 ? off : off + (ctx.rng() * 2 - 1) * offJitter, offMin, offMax);
    if (tt < -25 || tt > ctx.R.length + 25) continue;

    const p = ctx.R.at(tt, oo);
    const h = ctx.terrain.height(p.x, p.z);
    if (h < SITE_GROUND) continue;
    if (ctx.terrain.slope(p.x, p.z) > maxSlope) continue;
    if (!footprintClear(ctx.terrain, p.x, p.z, radius)) continue;

    let clash = false;
    for (const b of ctx.buildings) {
      const need = gap + (b.gap ?? 11) - 11;
      if (Math.hypot(p.x - b.x, p.z - b.z) < need) { clash = true; break; }
    }
    if (clash) continue;

    return { t: tt, off: oo, x: p.x, z: p.z, y: h };
  }
  return null;
}

// ------------------------------------------------------------------- houses

// house-highl is deliberately absent: it is a witch's-hut diorama welded to its
// own circular terrain mound — boulder rim, dead trees, picket fence, graves. Four
// of those lined up along the ribbon would each plant a hill through the road and
// through each other. It is a one-off landmark, not a dwelling.
/**
 * The dwellings that may appear in the street ribbon.
 *
 * Deliberately three, not five. The two that were dropped are not houses:
 *   house-trad  is a Japanese minka shopfront with an open produce stall and a
 *               fixed front, so it cannot even be yawed to face the street. It
 *               stood between two European cottages and a stone croft.
 *   house-highl is a witch's-hut diorama welded to its own circular hill —
 *               graveyard, picket fence, dead trees and all. Only ~5m of its 8m
 *               is building. Lined up along a street each instance plants a
 *               graveyard mound through its neighbour and the road.
 * Both are identified from renders in docs/asset-reference.md. Neither was ever
 * a dwelling; the filenames were truncated Meshy prompts.
 */
const HOUSES = ['house-t1', 'house-t2', 'house-t3'];

/**
 * Wall tints. Norwegian villages genuinely are the same house painted
 * differently, so this is the cheapest honest way to stop six meshes reading as
 * copy-paste — and the only one that works at the distance the ribbon is usually
 * seen from, where scale and rotation jitter are invisible.
 */
const PALETTE = [
  { name: 'falu', hex: 0x8f3a2a, strength: 0.72 },
  { name: 'ochre', hex: 0xb98a48, strength: 0.58 },
  { name: 'tar', hex: 0x55534f, strength: 0.62 },
  { name: 'bare', hex: 0xa2917b, strength: 0.44 },
];

/** Weighted toward falu red, which is what this coast actually looks like. */
const TINT_WEIGHTS = [0.44, 0.22, 0.16, 0.18];

function pickTint(rng) {
  let r = rng();
  for (let i = 0; i < PALETTE.length; i++) {
    r -= TINT_WEIGHTS[i];
    if (r <= 0) return { ...PALETTE[i], strength: PALETTE[i].strength * (0.85 + rng() * 0.3) };
  }
  return { ...PALETTE[0] };
}

/** Never the same mesh twice running along the ribbon. */
function nextHouse(ctx) {
  const pool = HOUSES.filter((m) => m !== ctx.lastHouse);
  const m = pool[Math.floor(ctx.rng() * pool.length)];
  ctx.lastHouse = m;
  return m;
}

function addBuilding(ctx, spot, model, role, opts = {}) {
  // Drawn unconditionally, even when overridden, so an explicit tint on one
  // building does not shift the random stream for every building after it.
  const rolled = pickTint(ctx.rng);
  const rec = {
    model,
    role,
    id: opts.id ?? null,
    interior: opts.interior ?? null,
    x: spot.x, z: spot.z, y: spot.y,
    t: spot.t, off: spot.off,
    // Gable to the water: the short wall takes the weather, so the ridge runs
    // seaward. ±8° keeps the row from reading as a drawn line.
    facing: ctx.R.seawardYaw + (opts.jitter ?? 8) * DEG * gauss(ctx.rng) / 1.6,
    scaleMul: opts.scaleMul ?? (0.9 + ctx.rng() * 0.25),
    tint: opts.tint !== undefined ? opts.tint : rolled,
    sink: 0.02 + ctx.rng() * 0.03,
    gap: opts.gap ?? 11,
  };
  ctx.buildings.push(rec);
  return rec;
}

// ---------------------------------------------------------------- the plan

/**
 * The whole settlement as plain numbers. No THREE, no GLBs, no DOM — so the
 * verification script can import and measure it directly.
 */
export function planHavnstad(terrain) {
  const R = makeRibbon();
  const P = terraceProfile(terrain, R);
  const ctx = {
    terrain, R, P,
    rng: mulberry32(0x48564e44),      // 'HVND'
    buildings: [],
    lastHouse: null,
  };

  const L = R.length;

  // Main street runs along the surveyed centreline; the seaward row has to stay
  // clear of the quay, which at the west end is only ~28m out.
  const seawardCap = (t) => Math.min(30, P.at(t, 'quay') - 16);
  const upperOff = (t) => -P.at(t, 'upper');

  // --- the three buildings that anchor the composition, sited first so they
  // get the ground they need and the dwellings fill in around them.

  const hall = findSpot(ctx, 335, upperOff(335), { tJitter: 45, offJitter: 22, radius: 8, gap: 20 });
  if (hall) addBuilding(ctx, hall, 'guild-hall', 'hall',
    { id: 'kvitsalen', interior: 'hall', jitter: 6, scaleMul: 1, tint: null, gap: 20 });

  // A Norse stave church is the village's proper landmark — tarred timber,
  // tiered shingle roofs, dragon finials and a bell turret. It replaces the
  // stone campanile that stood in for it. Wider footprint, so more clearance.
  const church = findSpot(ctx, 235, upperOff(235), { tJitter: 45, offJitter: 22, radius: 9, gap: 22 });
  if (church) addBuilding(ctx, church, 'stave-church', 'church',
    { id: 'heroy-kyrkje', jitter: 4, scaleMul: 1, tint: null, gap: 22 });

  // The inn was a Japanese minka shopfront. house-t2 is the right building for
  // it: it already carries a lean-to porch, a hanging lantern and a barrel, which
  // is exactly the dressing an inn wants, and it has a proper door to enter by.
  const inn = findSpot(ctx, 300, -22, { tJitter: 40, offJitter: 12, radius: 6, gap: 15 });
  if (inn) addBuilding(ctx, inn, 'house-t2', 'inn',
    { id: 'fork-and-net', interior: 'inn', scaleMul: 1.18, tint: { ...PALETTE[0], strength: 0.78 }, gap: 15 });
  ctx.lastHouse = 'house-t2';

  const apothecary = findSpot(ctx, 240, 20, { tJitter: 40, offJitter: 12, radius: 6, gap: 15, offMax: seawardCap(240) });
  if (apothecary) addBuilding(ctx, apothecary, 'potion-house', 'apothecary',
    { id: 'apotekaren', interior: 'apothecary', scaleMul: 1, tint: { ...PALETTE[1], strength: 0.5 }, gap: 15 });

  // --- boathouses. Naust are 9m square and are built in rows, gable to the
  // water, so they go down in pairs rather than singly — which is also what keeps
  // an isolated one from sitting 90m from its nearest neighbour.
  //
  // These were ruins-timber, on the assumption its name meant a ruined timber
  // building. It is a debris heap with no readable architecture at all — no wall
  // stubs, no doorway — so the waterfront was six rubble piles where six sheds
  // should be. house-t3 is the long low single-storey croft, which is the closest
  // thing in the catalog to a naust, run small so it does not read as a dwelling.
  for (let g = 0; g < 3; g++) {
    const base = 70 + g * 200 + gauss(ctx.rng) * 15;
    for (let i = 0; i < 2; i++) {
      const t = base + i * (17 + ctx.rng() * 9);
      const spot = findSpot(ctx, t, P.at(t, 'quay') - 6, { tJitter: 26, offJitter: 9, radius: 6, gap: 16 });
      if (spot) addBuilding(ctx, spot, 'house-t3', 'boathouse',
        { jitter: 6, scaleMul: 0.72 + ctx.rng() * 0.16, tint: { ...PALETTE[2], strength: 0.7 }, gap: 16 });
    }
  }

  // --- the upper farms, where the ribbon dissolves into the fields. Each is a
  // dwelling and an outbuilding around a yard: the farmstead of 2-5 buildings is
  // the dominant unit in the survey, and it is what stops the upper terrace
  // reading as a row of identical barns strung 120m apart.
  for (let g = 0; g < 5; g++) {
    const base = 55 + g * 128 + gauss(ctx.rng) * 18;
    for (let i = 0; i < 2; i++) {
      const t = base + i * (18 + ctx.rng() * 12);
      const off = upperOff(t) + (ctx.rng() * 2 - 1) * 18;
      const spot = findSpot(ctx, t, off, { tJitter: 34, offJitter: 24, radius: 7, gap: 17 });
      if (spot) addBuilding(ctx, spot, 'farmstead', 'farm',
        { id: `farm-${g}-${i}`, interior: 'domicile',
          jitter: 26, scaleMul: 0.8 + ctx.rng() * 0.35, gap: 17 });
    }
  }

  // --- the dwellings, in tun.
  //
  // 22 houses evenly spread over 620m would sit 28m apart and read as a comb.
  // The measured distribution (p10 10.8, median 19.6, p90 43.8) is not uniform
  // spacing at all — it is tight clusters with open ground between them, which
  // is exactly the farmstead-of-2-to-5 unit the survey found dominating the
  // landscape. So the ribbon is laid as clusters, and the spacing statistics
  // fall out of that rather than being imposed on top.
  // A cluster sits entirely on one side of the road — a tun is a yard, not a
  // street elevation — and clusters alternate sides down the ribbon. Keeping
  // members on one side is what actually produces the measured median: two houses
  // facing each other across a 5m road are 35m apart, so a strictly alternating
  // row can never spacing-match no matter how tightly it is packed.
  const TARGET_DWELLINGS = 20;
  let dwellings = 0;

  // Several passes down the ribbon. The first lays the obvious tun; later ones
  // fill the gaps the terrain or an earlier neighbour refused, which is how the
  // count is met without loosening the 11m floor.
  for (let pass = 0; pass < 4 && dwellings < TARGET_DWELLINGS; pass++) {
    let t = 25 + pass * 19;
    let side = pass % 2 === 0 ? -1 : 1;

    while (t < L - 20 && dwellings < TARGET_DWELLINGS) {
      const cap = seawardCap(t);
      const thisSide = side > 0 && cap < 15 ? -1 : side;
      const members = 2 + Math.floor(ctx.rng() * 3);
      let ct = t;

      for (let i = 0; i < members && dwellings < TARGET_DWELLINGS; i++) {
        const off = thisSide > 0
          ? clamp(15 + ctx.rng() * 13, 15, Math.max(15, seawardCap(ct)))
          : -(15 + ctx.rng() * 15);

        const spot = findSpot(ctx, ct, off, {
          tJitter: 10, offJitter: 8, radius: 5, gap: 11,
          offMax: thisSide > 0 ? seawardCap(ct) : Infinity,
          offMin: thisSide > 0 ? 12 : -Infinity,
        });
        if (spot) {
          // Every house is enterable: the shared 'domicile' room, one door each.
          // Gap 13: the corrected house-t3 is an 11.5m longhouse, and two of
          // them 11m apart stand wall-in-wall.
          addBuilding(ctx, spot, nextHouse(ctx), 'dwelling',
            { id: `dwelling-${dwellings}`, interior: 'domicile', gap: 13 });
          dwellings++;
        }
        ct += 12 + ctx.rng() * 8;
      }

      t = ct + 24 + ctx.rng() * 30;
      side = -side;
    }
  }

  // house-cabin, which two instances used to be backed into the hillside here as
  // a "1.5m-deep facade", is a kitchen dresser — the Meshy filename truncated
  // "Cabinet" to "Cabi". It is catalogued as `cabinet` and lives indoors. There is
  // no facade to hide, so the block is gone rather than re-pointed at another
  // mesh. It had also been calling addBuilding(ctx, spot, 'dwelling', {gap:13}),
  // passing the role where the model goes, so both instances failed to load and
  // the village had been two buildings short in silence.

  // --- the burnt plot. One gap in the ribbon that nobody rebuilds.
  const burnt = findSpot(ctx, 390, -18, { tJitter: 45, offJitter: 10, radius: 5, gap: 14 });
  if (burnt) addBuilding(ctx, burnt, 'ruins-timber', 'burnt-house',
    { id: 'the-burnt-house', scaleMul: 0.8, tint: { ...PALETTE[2], strength: 0.8 }, gap: 14 });

  const roads = planRoads(terrain, R, P);
  return {
    site: SITE,
    ribbon: R,
    terraces: P,
    buildings: ctx.buildings,
    roads,
    piers: planPiers(ctx),
    dressing: planDressing(ctx),
    fields: planFields(ctx, roads),
  };
}

/**
 * Tilled fields behind the farms — the ground people actually live off. Each
 * farm gets one plot of row crops (cabbage and succulent, alternating) with a
 * post-and-rail fence, laid in ribbon coordinates so the rows follow the
 * street grain. Cells the ground refuses (wet, steep, on a road, against a
 * wall) are simply not sown, which is also how real plots meet real ground.
 */
function planFields(ctx, roads) {
  const { R, rng, terrain } = ctx;
  const fields = [];
  const roadPts = [roads.quay, roads.main, roads.upper].flatMap((r) =>
    r.pts.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z, r: r.width / 2 + 3 })));
  const nearRoad = (x, z) => roadPts.some((p) => Math.hypot(x - p.x, z - p.z) < p.r);

  const farms = ctx.buildings.filter((b) => b.role === 'farm');
  for (const farm of farms.slice(0, 8)) {
    const SP = 2.2;                       // row / plant spacing, metres
    const COLS = 8 + Math.floor(rng() * 4);
    const ROWS = 4 + Math.floor(rng() * 2);
    const t0 = farm.t - (COLS * SP) / 2 + (rng() - 0.5) * 8;
    const off0 = farm.off - 14 - rng() * 8;   // landward of the farmhouse

    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = R.at(t0 + c * SP, off0 - r * SP);
        const y = terrain.height(p.x, p.z);
        if (y < 2.0 || terrain.slope(p.x, p.z) > 0.14) continue;
        if (nearRoad(p.x, p.z)) continue;
        if (ctx.buildings.some((b) => Math.hypot(p.x - b.x, p.z - b.z) < 9)) continue;
        cells.push({ x: p.x, z: p.z, y, crop: r % 2 === 0 ? 'cabbage' : 'succulent' });
      }
    }
    if (cells.length < ROWS * COLS * 0.55) continue;   // ground refused the plot

    // Fence the plot's rectangle, dropping segments the ground refuses.
    const fence = [];
    const corner = (tc, oc) => R.at(tc, oc);
    const rect = [
      [corner(t0 - SP, off0 + SP), corner(t0 + COLS * SP, off0 + SP)],
      [corner(t0 + COLS * SP, off0 + SP), corner(t0 + COLS * SP, off0 - ROWS * SP)],
      [corner(t0 + COLS * SP, off0 - ROWS * SP), corner(t0 - SP, off0 - ROWS * SP)],
      [corner(t0 - SP, off0 - ROWS * SP), corner(t0 - SP, off0 + SP)],
    ];
    for (const [a, b] of rect) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const segs = Math.max(1, Math.round(len / 2.6));
      for (let s = 0; s < segs; s++) {
        const f0 = s / segs, f1 = (s + 1) / segs;
        const p0 = { x: a.x + (b.x - a.x) * f0, z: a.z + (b.z - a.z) * f0 };
        const p1 = { x: a.x + (b.x - a.x) * f1, z: a.z + (b.z - a.z) * f1 };
        const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 };
        if (terrain.height(mid.x, mid.z) < 1.8 || terrain.slope(mid.x, mid.z) > 0.22) continue;
        if (nearRoad(mid.x, mid.z)) continue;   // a gate where the road passes
        fence.push({
          x0: p0.x, z0: p0.z, y0: terrain.height(p0.x, p0.z),
          x1: p1.x, z1: p1.z, y1: terrain.height(p1.x, p1.z),
        });
      }
    }

    fields.push({ cells, fence, t0, off0, cols: COLS, rows: ROWS, sp: SP });
  }
  return fields;
}

/** Terrace centrelines as world polylines, riding the ground. */
function planRoads(terrain, R, P) {
  const STEP = 6;
  const ts = [];
  for (let t = -10; t <= R.length + 10; t += STEP) ts.push(t);

  const road = (offsets, width) => ({
    width,
    pts: ts.map((t, i) => {
      const p = R.at(t, offsets[i]);
      return { x: p.x, z: p.z, y: terrain.height(p.x, p.z), t, off: offsets[i] };
    }),
  });

  // Smoothing the terrace offsets is what keeps a road from zigzagging, but it
  // also lets the quay drift over the tide where the shore is convex. So the quay
  // is re-solved per station against the actual ground and then smoothed, with
  // the road's own half-width taken off — the seaward kerb has to be on land, not
  // just the centreline.
  const quayWidth = 7;
  const quayRaw = ts.map((t) => {
    const start = P.at(clamp(t, 0, R.length), 'quay');
    for (let d = start + 8; d >= start - 45; d -= 1) {
      const p = R.at(t, d);
      if (terrain.height(p.x, p.z) >= 1.9) return d - quayWidth / 2 - 1;
    }
    return start - 14;
  });
  const kerbsDry = (t, off) => {
    for (const w of [-quayWidth / 2, 0, quayWidth / 2]) {
      const p = R.at(t, off + w);
      if (terrain.height(p.x, p.z) < 1.0) return false;
    }
    return true;
  };

  const quay = quayRaw.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = -2; k <= 2; k++) { sum += quayRaw[clamp(i + k, 0, quayRaw.length - 1)]; n++; }
    // Smoothing averages across neighbours, which on a convex stretch of shore
    // pushes the mean back over the tide. Walking the smoothed offset inland
    // until both kerbs are dry corrects only the stations that need it and leaves
    // the rest of the curve alone.
    let off = sum / n;
    for (let k = 0; k < 60 && !kerbsDry(ts[i], off); k++) off -= 1;
    return off;
  });

  return {
    quay: road(quay, quayWidth),
    main: road(ts.map(() => 0), 5.5),
    upper: road(ts.map((t) => -P.at(clamp(t, 0, R.length), 'upper')), 4),
  };
}

/**
 * Piers. Real Herøy has 44 of them across the area — the waterfront is a
 * workplace, and a quay with nothing on it reads as a promenade.
 */
function planPiers(ctx) {
  const { R, P, terrain, rng } = ctx;
  const out = [];
  for (let i = 0; i < 9; i++) {
    const t = 40 + i * 66 + gauss(rng) * 9;
    if (t < 10 || t > R.length - 10) continue;

    // Root the pier on the last dry ground. The quay offset is smoothed along the
    // ribbon, so at any one station it can already be over the tide; walking out
    // from well inland of it and taking the last dry metre of the first
    // continuous run of land finds the shore wherever the smoothing put the road.
    const quay = P.at(t, 'quay');
    let root = null;
    for (let d = quay - 18; d <= quay + 40; d += 1) {
      const p = R.at(t, d);
      if (terrain.height(p.x, p.z) >= 1.2) root = d;
      else if (root !== null) break;
    }
    if (root === null) continue;

    // Run out until there is enough water under the boats, then a few metres
    // further so the mooring is at the head rather than at the last post. A steep
    // drop-off gives a short pier and a shelving one gives a long pier, which is
    // exactly how they are built.
    let mooring = 34;
    for (let d = 4; d <= 34; d += 1) {
      const p = R.at(t, root + d);
      mooring = d;
      if (terrain.height(p.x, p.z) < -2.2) break;
    }

    const p = R.at(t, root);
    out.push({
      t, x: p.x, z: p.z,
      length: clamp(mooring + 4 + rng() * 7, 11, 34),
      width: 2.4 + rng() * 1.4,
      deckY: Math.max(1.85, terrain.height(p.x, p.z) + 0.5) + rng() * 0.25,
      yaw: R.seawardYaw + gauss(rng) * 5 * DEG,
    });
  }
  return out;
}

/**
 * Dressing. Clutter with a reason: barrels and crates where the boats land,
 * firewood beside the houses, and one well where the street is widest.
 */
/** Assets whose modelled orientation is not how they rest on the ground. */
const REST_TILT_X = { logs: Math.PI / 2 };

function planDressing(ctx) {
  const { R, P, rng } = ctx;
  const out = [];

  const drop = (model, t, off, opts = {}) => {
    // gap 8 keeps a barrel off a house wall: findSpot measures to the building
    // centre, and a house is ~4m from its centre to its gable.
    for (let attempt = 0; attempt < 6; attempt++) {
      const spot = findSpot(ctx, t, off, {
        tJitter: opts.tJitter ?? 10, offJitter: opts.offJitter ?? 6,
        radius: 2, gap: 8, tries: opts.tries ?? 20, offMax: opts.offMax ?? Infinity,
        maxSlope: opts.maxSlope,
      });
      if (!spot) return null;
      // findSpot only knows about buildings, so props are spaced against each
      // other here — otherwise two barrels quietly occupy the same square metre.
      if (out.some((o) => Math.hypot(o.x - spot.x, o.z - spot.z) < 2.6)) continue;

      const rec = {
        model, x: spot.x, z: spot.z, y: spot.y,
        yaw: rng() * Math.PI * 2,
        scaleMul: 0.85 + rng() * 0.35,
        // `logs` is modelled standing on end. Landmarks and Vegetation both tip it
        // over; this module did not, so every log dropped along the quay stood up
        // as a 2.2m totem pole over the player's head.
        tiltX: REST_TILT_X[model] ?? 0,
      };
      out.push(rec);
      return rec;
    }
    return null;
  };

  // The waterfront: what comes off a boat and what waits to go back on one.
  for (let i = 0; i < 16; i++) {
    const t = 40 + rng() * (R.length - 80);
    drop(rng() < 0.72 ? 'barrel' : 'logs', t, P.at(t, 'quay') - 3 - rng() * 8);
  }
  for (let i = 0; i < 4; i++) {
    const t = 60 + rng() * (R.length - 120);
    const model = ['chest-plain', 'chest-iron', 'chest-vine', 'chest-overgrown'][i];
    drop(model, t, P.at(t, 'quay') - 4 - rng() * 6);
  }

  // Firewood and stores between the houses, on the landward side out of the wind.
  for (let i = 0; i < 8; i++) {
    const t = 40 + rng() * (R.length - 80);
    drop(rng() < 0.5 ? 'logs' : 'barrel', t, -(20 + rng() * 16));
  }

  // --- generated dressing (2026-07-23): the working life of a fishing village.
  // Market square around the well/market anchor: stalls, carts and shop signs.
  for (let i = 0; i < 3; i++) {
    drop('market-stall', 288 + i * 13 + rng() * 6, (i % 2 ? 1 : -1) * (9 + rng() * 5), { tJitter: 6, offJitter: 4 });
  }
  drop('handcart', 302 + rng() * 18, -(10 + rng() * 6));
  drop('handcart', 250 + rng() * 18, 10 + rng() * 6);
  drop('sign-post', 300, -13);          // by the inn
  drop('sign-post', 240, 14);           // by the apothecary

  // Waterfront working clutter: cargo crates, fish-drying racks (hjell) and
  // rowboats pulled up on the beach just landward of the quay line.
  for (let i = 0; i < 5; i++) {
    const t = 50 + rng() * (R.length - 100);
    drop('crates', t, P.at(t, 'quay') - 3 - rng() * 5, { tJitter: 8 });
  }
  for (let i = 0; i < 3; i++) {
    const t = 60 + rng() * (R.length - 120);
    drop('fish-rack', t, P.at(t, 'quay') - 4 - rng() * 4);
  }
  for (let i = 0; i < 4; i++) {
    const t = 70 + rng() * (R.length - 140);
    drop('rowboat', t, P.at(t, 'quay') - 2 - rng() * 3, { tJitter: 10 });
  }

  // Woodpiles between the houses and haystacks up by the farms.
  for (let i = 0; i < 6; i++) {
    const t = 40 + rng() * (R.length - 80);
    drop('woodpile', t, -(18 + rng() * 18));
  }
  for (let i = 0; i < 4; i++) {
    const t = 55 + rng() * (R.length - 110);
    drop('haystack', t, -(26 + rng() * 18));
  }

  // A weathered rune stone at the landward edge — the village's old lore marker.
  drop('rune-stone', 175 + rng() * 45, -(30 + rng() * 10));

  // The well is the gathering point, so it goes on the street rather than
  // beside it — and a well is dug where the ground is LEVEL and easy to reach
  // with buckets, never on a hillside. Slope capped at a third of what a
  // house accepts, with a wide search so a flat spot is actually found.
  const well = drop('wishing-well', 300, -7, {
    tJitter: 110, offJitter: 8, tries: 60, maxSlope: 0.055,
  });
  if (well) well.anchor = 'market';

  return out;
}

// ------------------------------------------------------------------- render

/** Scale that renders `node` at the catalog's intended height in metres. */
function measuredScale(node, cat) {
  // Delegates to the catalog so every module scales identically. Kept as a
  // wrapper because call sites pass the loaded node, which the catalog does not
  // need — the authored multiplier already accounts for the mesh's real size.
  return cat?.scale ?? 1;
}

/**
 * Tint one building's walls without touching every other copy of the same mesh.
 *
 * Materials arrive shared across the cached GLB, so tinting in place would repaint
 * the whole village the moment the second instance loaded. Cloning per instance —
 * once per source material, so a building stays one draw call per material — is
 * what makes per-instance colour possible at all.
 */
function tintBuilding(node, spec) {
  if (!spec) return;
  const target = new THREE.Color(spec.hex);
  const clones = new Map();

  node.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const next = mats.map((m) => {
      if (!m) return m;
      let c = clones.get(m);
      if (!c) {
        c = m.clone();
        if (c.color) c.color.lerp(target, clamp(spec.strength, 0, 0.9));
        // Painted board and tarred timber are matte; the exports default to a
        // sheen that reads as wet plastic under a low northern sun.
        c.roughness = clamp((c.roughness ?? 0.8) + 0.15, 0, 1);
        c.metalness = 0;
        clones.set(m, c);
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

/** A coloured box, baked into world space, ready to merge. */
function boxGeometry(w, h, d, x, y, z, yaw, colour) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = colour.r; c[i * 3 + 1] = colour.g; c[i * 3 + 2] = colour.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** The shared weathered-plank material for all wooden structures. */
let _plankMat = null;
function plankMaterial() {
  if (_plankMat) return _plankMat;
  const load = (file, srgb) => {
    const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/props/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  _plankMat = new THREE.MeshStandardMaterial({
    map: load('plank.webp', true),
    normalMap: load('plank_n.webp', false),
    vertexColors: true,               // per-plank tonal jitter tints the map
    roughness: 0.92, metalness: 0,
  });
  return _plankMat;
}

export class Settlement {
  constructor(terrain) {
    this.terrain = terrain;
    this._group = new THREE.Group();
    this._group.name = 'havnstad';
    this._colliders = [];
    this._doors = [];
    this._anchors = new Map();
    this.plan = null;
  }

  get group() { return this._group; }
  get colliders() { return this._colliders; }

  /**
   * Road coverage at a world point, 0..1 — read from the very mask the terrain
   * shader paints with.
   *
   * Anything that scatters over the ground needs to agree with where the streets
   * are, and the mask is the only authority on that. Testing against circles
   * along the centreline instead leaves tufts standing on the crown of the road
   * wherever the spacing and the width disagree.
   */
  roadCoverageAt(x, z) {
    const m = this._roadMask;
    if (!m) return 0;
    const u = (x - m.originX) / m.size;
    const v = (z - m.originZ) / m.size;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    if (!this._maskPixels) {
      // Read the mask back once, at build time, into a plain array. Sampling a
      // canvas per candidate would be thousands of getImageData calls a reseed.
      const c = m.texture.image;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      this._maskPixels = ctx.getImageData(0, 0, c.width, c.height);
    }
    const px = this._maskPixels;
    const ix = Math.min(px.width - 1, Math.max(0, Math.round(u * (px.width - 1))));
    const iy = Math.min(px.height - 1, Math.max(0, Math.round(v * (px.height - 1))));
    return px.data[(iy * px.width + ix) * 4] / 255;
  }

  /**
   * Keep-clear circles along every street, for the vegetation pass.
   *
   * Ground scatter is placed by ecology — slope, shelter, elevation — none of
   * which knows a road is there, so boulders and scrub were landing in the middle
   * of the carriageway. A road is the one place on this island where the ground
   * is definitively cleared, so it has to be published as an exclusion rather
   * than left for the scatter to discover.
   */
  get roadZones() {
    if (!this.plan) return [];
    const zones = [];
    for (const road of [this.plan.roads.quay, this.plan.roads.main, this.plan.roads.upper]) {
      // Overlapping circles along the centreline. Stepping by less than the
      // radius leaves no gaps between them for a rock to slip through.
      const r = road.width * 0.5 + 2.5;
      const step = r * 0.8;
      for (let i = 0; i < road.pts.length; i++) {
        const p = road.pts[i];
        const prev = zones[zones.length - 1];
        if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < step) continue;
        zones.push({ x: p.x, z: p.z, r });
      }
    }
    return zones;
  }
  get doors() { return this._doors; }
  get anchors() { return this._anchors; }

  async build(onProgress) {
    const plan = this.plan = planHavnstad(this.terrain);

    // No road geometry. The streets are handed to the terrain as a coverage mask
    // and painted into its surface, which is the only way to get a soft verge and
    // no depth fighting — a separate strip either hovers or flickers, and its
    // border is always a hard polygon edge against the grass.
    this.roadMask = this.buildRoadMask(plan);
    this._roadMask = this.roadMask;
    this.terrain.setRoadMask?.(this.roadMask);

    // Cut-and-fill: one level pad per planned building, all derived from the
    // ORIGINAL slope and stamped as a single weighted batch, so no pad ever
    // re-cuts the ground under an already-grounded neighbour.
    if (this.terrain.flattenPads) {
      this.terrain.flattenPads(plan.buildings.map((b) => {
        const r = Math.min(9, ((PROPS[b.model]?.metres ?? 8) / 2) * (b.scaleMul ?? 1));
        return { x: b.x, z: b.z, r, y: lowestUnder(this.terrain, b.x, b.z, r) + 0.02 };
      }));
    }

    this._group.add(await this._buildPiers(plan));

    const total = plan.buildings.length + plan.dressing.length;
    let done = 0;
    for (const b of plan.buildings) {
      await this._placeBuilding(b);
      onProgress?.(++done / total);
    }
    for (const d of plan.dressing) {
      await this._placeDressing(d);
      onProgress?.(++done / total);
    }

    // One mesh update for every pad the buildings stamped.
    this.terrain.commitPads?.();

    this._group.add(this._buildFields(plan));
    await this._buildFieldSucculents(plan);
    this._group.add(this._buildContactAO(plan));

    this._markAnchors(plan);
    return this;
  }

  /**
   * Soil, crops and fences for the farm plots — all programmatic, three draw
   * calls for the whole town (soil+fences merged, cabbages instanced).
   */
  _buildFields(plan) {
    const g = new THREE.Group();
    g.name = 'fields';
    const t = this.terrain;

    const fenceParts = [];
    const wood = new THREE.Color(0x6b5a44);

    let cabbageCount = 0;
    for (const f of plan.fields) cabbageCount += f.cells.filter((c) => c.crop === 'cabbage').length;

    // Cabbages: squashed icosahedra, two greens per head via instance colour.
    const cabbageGeo = new THREE.IcosahedronGeometry(0.26, 1);
    cabbageGeo.scale(1, 0.72, 1);
    const cabbageMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    const cabbages = new THREE.InstancedMesh(cabbageGeo, cabbageMat, Math.max(1, cabbageCount));
    cabbages.castShadow = true;
    cabbages.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const cc = new THREE.Color();
    let ci = 0;

    for (const f of plan.fields) {
      // The tilled soil itself is PAINTED into the terrain via the coverage
      // mask (green channel) — no geometry on top of the ground, ever.
      for (const cell of f.cells) {
        if (cell.crop === 'cabbage' && ci < cabbageCount) {
          const sc = 0.7 + ((cell.x * 13.7 + cell.z * 7.3) % 1 + 1) % 1 * 0.45;
          e.set(0, (cell.x * 5.1 + cell.z * 3.7) % (Math.PI * 2), 0);
          // Sat a third into the soil — a cabbage grows out of the furrow, it
          // does not rest on it like an egg. Height re-sampled: the building
          // pads may have nudged the ground since the plan measured it.
          m4.compose(
            new THREE.Vector3(cell.x, t.height(cell.x, cell.z) + 0.11 * sc, cell.z),
            q.setFromEuler(e),
            new THREE.Vector3(sc, sc, sc));
          cabbages.setMatrixAt(ci, m4);
          cc.setHSL(0.27 + ((cell.z * 3.1) % 1) * 0.05, 0.5, 0.26 + ((cell.x * 1.7) % 1) * 0.09);
          cabbages.setColorAt(ci, cc);
          ci++;
        }
      }

      // Post-and-rail fence, merged boxes.
      for (const seg of f.fence) {
        const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
        const yaw = Math.atan2(seg.x1 - seg.x0, seg.z1 - seg.z0);
        const my = (seg.y0 + seg.y1) / 2;
        fenceParts.push(boxGeometry(0.13, 1.05, 0.13, seg.x0, seg.y0 + 0.5, seg.z0, 0, wood));
        for (const railY of [0.45, 0.88]) {
          fenceParts.push(boxGeometry(0.07, 0.09, len, (seg.x0 + seg.x1) / 2, my + railY, (seg.z0 + seg.z1) / 2, yaw, wood));
        }
      }
    }
    cabbages.count = ci;
    cabbages.instanceMatrix.needsUpdate = true;
    if (cabbages.instanceColor) cabbages.instanceColor.needsUpdate = true;

    if (fenceParts.length) {
      const fenceMesh = new THREE.Mesh(mergeGeometries(fenceParts), plankMaterial());
      fenceMesh.castShadow = true;
      fenceMesh.receiveShadow = true;
      g.add(fenceMesh);
    }
    if (ci) g.add(cabbages);
    return g;
  }

  /** The succulent rows use the real farmed plant, thinly. */
  async _buildFieldSucculents(plan) {
    const spots = plan.fields.flatMap((f) => f.cells.filter((c) => c.crop === 'succulent'));
    if (!spots.length) return;
    let inst;
    try { inst = await assets.load(`${import.meta.env.BASE_URL}assets/props/plant-succulent.glb`); } catch { return; }
    let src = null;
    inst.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    if (!src) return;

    const mesh = new THREE.InstancedMesh(src.geometry, src.material, spots.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const cat = PROPS['plant-succulent'];
    spots.forEach((cell, i) => {
      const sc = (cat?.scale ?? 1) * (0.5 + ((cell.x * 3.3 + cell.z) % 1 + 1) % 1 * 0.25);
      e.set(0, (cell.x * 7.7) % (Math.PI * 2), 0);
      m4.compose(new THREE.Vector3(cell.x, this.terrain.height(cell.x, cell.z), cell.z), q.setFromEuler(e), new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this._group.add(mesh);
  }

  /**
   * Contact AO: a soft dark skirt hugging the ground around every building and
   * pier root. One merged mesh, vertex-alpha ring fading outward — the cheap
   * trick that stops placed geometry reading as if it floats on the grass.
   */
  _buildContactAO(plan) {
    const rings = [];
    const t = this.terrain;
    const SEGS = 20;

    const ring = (x, z, inner, outer, strength) => {
      const pos = [], col = [], idx = [];
      for (let s = 0; s <= SEGS; s++) {
        const a = (s / SEGS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (const [r, al] of [[inner, strength], [outer, 0]]) {
          const px = x + ca * r, pz = z + sa * r;
          pos.push(px, t.height(px, pz) + 0.07, pz);
          col.push(0, 0, 0, al);
        }
      }
      for (let s = 0; s < SEGS; s++) {
        const i0 = s * 2;
        idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      g.setIndex(idx);
      rings.push(g);
    };

    for (const b of plan.buildings) {
      if (!b.node) continue;
      const r = Math.max(b.halfX ?? 4, b.halfZ ?? 4);
      ring(b.x, b.z, r * 0.72, r * 1.35, 0.34);
    }
    for (const p of plan.piers) ring(p.x, p.z, 1.6, 3.4, 0.25);
    for (const d of plan.dressing) {
      if (d.model === 'wishing-well' && d.node) ring(d.x, d.z, 1.1, 2.4, 0.3);
    }
    if (!rings.length) return new THREE.Group();

    const mesh = new THREE.Mesh(mergeGeometries(rings), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mesh.renderOrder = 1;
    mesh.name = 'contact-ao';
    return mesh;
  }

  async _placeBuilding(rec) {
    let inst;
    // Buildings with a far-LOD variant load as a THREE.LOD; everything else is
    // a plain instance. propLOD degrades to a plain instance when no lod1 file
    // is present, so this is safe for every building.
    try {
      inst = PROPS[rec.model]?.lodFar ? await assets.propLOD(rec.model) : await assets.prop(rec.model);
    } catch { return null; }

    const cat = PROPS[rec.model];
    const node = inst.root;
    const scale = measuredScale(node, cat) * rec.scaleMul;
    node.scale.setScalar(scale);

    // Gable to the water. Which local axis is the ridge differs per mesh, so it
    // is measured rather than assumed — half the set is authored along x and half
    // along z, and guessing turns every second house broadside to the weather.
    node.rotation.y = 0;
    node.updateMatrixWorld(true);
    const flat = new THREE.Box3().setFromObject(node);
    const spanX = flat.max.x - flat.min.x;
    const spanZ = flat.max.z - flat.min.z;
    node.rotation.y = rec.facing - (spanX > spanZ ? Math.PI / 2 : 0);

    node.position.set(rec.x, rec.y, rec.z);

    // Meshy centres every prop in its normalisation cube, so a node placed at
    // ground level is buried to the eaves. Measure the posed bounds and lift the
    // base onto the terrain, then settle it a few centimetres in.
    node.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(node);
    if (Number.isFinite(box.min.y)) {
      // Ground to the LOWEST point under the footprint, not to the centre.
      // A building is a rigid box on ground that slopes: matching the centre
      // height leaves the downhill corners hanging in the air, which is what
      // makes houses on the hillside look like they are floating. Sitting on the
      // low corner instead buries the uphill side into the slope, which is both
      // correct and what a real cut-and-fill foundation looks like.
      const footprint = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
      // The pads were stamped before any building loaded (see build()), so
      // this measures the LEVELLED ground and the house lands flush on its pad.
      const groundY = lowestUnder(this.terrain, rec.x, rec.z, footprint);
      node.position.y += groundY - box.min.y - rec.sink;
    }

    tintBuilding(node, rec.tint);
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    node.name = rec.id ?? `${rec.role}-${rec.model}`;
    this._group.add(node);

    // Collider from the actual XZ footprint. Deriving it from height instead —
    // which is what the old World did — makes a wide low barn permeable and a
    // narrow tower a wall.
    node.updateMatrixWorld(true);
    const placed = new THREE.Box3().setFromObject(node);
    const hx = (placed.max.x - placed.min.x) / 2;
    const hz = (placed.max.z - placed.min.z) / 2;
    this._colliders.push({ x: rec.x, z: rec.z, r: Math.max(1.2, (hx + hz) / 2 * 0.9) });

    rec.node = node;
    rec.halfX = hx;
    rec.halfZ = hz;

    if (rec.interior) this._emitDoor(rec, placed);
    return node;
  }

  /**
   * Door on the seaward face — which, with the gable to the water, is the gable
   * end. That is where the entrance actually goes on this coast, and it is also
   * the face the player walks up to from the street.
   */
  _emitDoor(rec, box) {
    const R = this.plan.ribbon;
    const reach = Math.abs(R.seaward.x) * (box.max.x - box.min.x) / 2
                + Math.abs(R.seaward.z) * (box.max.z - box.min.z) / 2;
    const x = rec.x + R.seaward.x * (reach + 0.6);
    const z = rec.z + R.seaward.z * (reach + 0.6);
    this._doors.push({
      id: rec.id,
      interior: rec.interior,
      x, y: this.terrain.height(x, z), z,
      yaw: R.seawardYaw,
    });
  }

  async _placeDressing(rec) {
    let inst;
    try { inst = await assets.prop(rec.model); } catch { return null; }

    const cat = PROPS[rec.model];
    const node = inst.root;
    node.scale.setScalar(measuredScale(node, cat) * rec.scaleMul);
    node.rotation.set(rec.tiltX ?? 0, rec.yaw, 0);
    node.position.set(rec.x, rec.y, rec.z);

    node.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(node);
    if (Number.isFinite(box.min.y)) node.position.y += rec.y - box.min.y - 0.03;

    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this._group.add(node);

    if (rec.model === 'wishing-well') {
      this._colliders.push({ x: rec.x, z: rec.z, r: 1.3 });
      // Level the gathering ground around it — buckets are set down here.
      this.terrain.flattenPad?.(rec.x, rec.z, 3.2, rec.y + 0.02);
    }
    rec.node = node;
    return node;
  }

  /**
   * The three terrace roads, as one mesh.
   *
   * Vertex colours rather than a texture: the ribbon needs the *line* of the
   * street more than it needs gravel detail, and a mottled untextured strip costs
   * nothing and cannot tile visibly.
   */
  /**
   * The roads as a coverage mask, for the terrain shader to paint with.
   *
   * A road built as its own geometry can only ever hover above the ground or
   * fight it for depth, and its border is a hard polygon edge against grass.
   * Painting instead means the surface *is* the terrain: no second surface, no
   * z-fighting, and the verge can be blended over a couple of metres so the
   * cobble creeps into the heath the way a real track does.
   *
   * The mask covers only the town's own extent rather than the whole 4km tile,
   * so it can afford ~0.5m per texel where a world-wide mask of the same cost
   * would give 4m and quantise every edge into steps.
   */
  buildRoadMask(plan, resolution = 2048) {
    const R = plan.ribbon;
    const roads = [plan.roads.quay, plan.roads.main, plan.roads.upper];

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const road of roads) {
      for (const p of road.pts) {
        const half = road.width * 0.5 + 6;
        if (p.x - half < minX) minX = p.x - half;
        if (p.x + half > maxX) maxX = p.x + half;
        if (p.z - half < minZ) minZ = p.z - half;
        if (p.z + half > maxZ) maxZ = p.z + half;
      }
    }
    for (const f of plan.fields ?? []) {
      for (const c of f.cells) {
        if (c.x - 4 < minX) minX = c.x - 4;
        if (c.x + 4 > maxX) maxX = c.x + 4;
        if (c.z - 4 < minZ) minZ = c.z - 4;
        if (c.z + 4 > maxZ) maxZ = c.z + 4;
      }
    }
    if (!Number.isFinite(minX)) return null;

    // Square the region so one scalar converts world metres to texels.
    const size = Math.max(maxX - minX, maxZ - minZ);
    const originX = (minX + maxX) / 2 - size / 2;
    const originZ = (minZ + maxZ) / 2 - size / 2;
    const perTexel = size / resolution;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, resolution, resolution);

    const toPx = (x, z) => [(x - originX) / perTexel, (z - originZ) / perTexel];

    // Two passes per road: a wide, faint one for the worn verge, then the solid
    // carriageway. The verge is what stops the edge reading as a cut line.
    // Roads live in the RED channel; the fields' tilled soil in the GREEN —
    // both painted into the terrain surface, never laid on top of it.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pass of [{ grow: 5.0, alpha: 0.45 }, { grow: 0, alpha: 1 }]) {
      for (const road of roads) {
        if (road.pts.length < 2) continue;
        ctx.strokeStyle = `rgba(255,0,0,${pass.alpha})`;
        ctx.lineWidth = (road.width + pass.grow * 2) / perTexel;
        ctx.beginPath();
        road.pts.forEach((p, i) => {
          const [px, pz] = toPx(p.x, p.z);
          if (i === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz);
        });
        ctx.stroke();
      }
    }

    // Trampled ground around the well — the whole town fetches water here, so
    // the grass is worn to bare track for a few metres in every direction.
    const well = plan.dressing.find((d) => d.model === 'wishing-well');
    if (well) {
      const [wx, wz] = toPx(well.x, well.z);
      const r = 4.6 / perTexel;
      const grad = ctx.createRadialGradient(wx, wz, r * 0.25, wx, wz, r);
      grad.addColorStop(0, 'rgba(255,0,0,0.9)');
      grad.addColorStop(0.6, 'rgba(255,0,0,0.5)');
      grad.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(wx, wz, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The plots: one soft blob per sown cell, so a refused cell leaves a real
    // gap and the plot's outline follows the ground that accepted it.
    for (const f of plan.fields ?? []) {
      const r = (f.sp * 0.8) / perTexel;
      for (const pass of [{ mul: 1.6, alpha: 0.4 }, { mul: 1.0, alpha: 0.95 }]) {
        ctx.fillStyle = `rgba(0,255,0,${pass.alpha})`;
        for (const c of f.cells) {
          const [px, pz] = toPx(c.x, c.z);
          ctx.beginPath();
          ctx.arc(px, pz, r * pass.mul, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Soften once more so there is no single-texel step anywhere on the border.
    ctx.filter = `blur(${Math.max(1, 1.6 / perTexel)}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;

    return { texture: tex, originX, originZ, size };
  }

  _buildRoads(plan) {
    const positions = [];
    const colours = [];
    const indices = [];
    const rng = mulberry32(0x524f4144);
    const R = plan.ribbon;
    const across = 4;

    for (const road of [plan.roads.quay, plan.roads.main, plan.roads.upper]) {
      const base = positions.length / 3;
      const rows = road.pts.length;

      for (let i = 0; i < rows; i++) {
        const p = road.pts[i];
        for (let j = 0; j <= across; j++) {
          const w = (j / across - 0.5) * road.width;
          const x = p.x + R.seaward.x * w;
          const z = p.z + R.seaward.z * w;
          // Sampled per vertex, and lifted just clear of the 4m terrain grid.
          positions.push(x, this.terrain.height(x, z) + 0.02, z);
          const v = 0.34 + rng() * 0.13;
          // Worn to bare grit down the middle, grass creeping in at the verges.
          const edge = Math.abs(j / across - 0.5) * 2;
          const g = v * (1 - edge * 0.18);
          colours.push(g * 1.06, g * 1.0, g * 0.86);
        }
      }

      for (let i = 0; i < rows - 1; i++) {
        for (let j = 0; j < across; j++) {
          const a = base + i * (across + 1) + j;
          const b = a + 1, c = a + across + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
      // Sits within a couple of centimetres of the ground and relies on the
      // depth offset rather than height to stay on top. It used to be lifted
      // 14cm, which reads as a kerb the player never steps onto: the controller
      // grounds to terrain height, so the character walked with its feet buried
      // to the ankle in the road surface.
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });

    // Vertex colours alone left the road a flat white slab. Cobble is sampled in
    // world space so no UV attribute is needed and the paving stays a constant
    // real-world size however the ribbon bends.
    const cobble = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/terrain/cobble.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
    });
    const cobbleN = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/terrain/cobble_n.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 16;
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uCobble = { value: cobble };
      shader.uniforms.uCobbleN = { value: cobbleN };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n varying vec3 vRoadPos;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n vRoadPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\n uniform sampler2D uCobble;\n uniform sampler2D uCobbleN;\n varying vec3 vRoadPos;')
        .replace('#include <map_fragment>', `
          // ~2.4m per repeat: big enough that individual stones read at walking
          // height without the sheet turning to noise at the end of the street.
          vec2 ruv = vRoadPos.xz * 0.42;
          vec3 stone = texture2D(uCobble, ruv).rgb;
          vec3 broad = texture2D(uCobble, ruv * 0.173 + 5.1).rgb;
          diffuseColor.rgb *= mix(stone, broad, 0.3) * 1.35;
        `);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'havnstad-roads';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  /**
   * The piers, as one merged mesh.
   *
   * No pier asset exists, so they are built from boxes — but as *individual
   * planks* with gaps between them rather than a textured slab. The gaps are what
   * make a deck read as a deck at any distance, and they cost nothing once the
   * whole waterfront merges into a single draw call.
   */
  async _buildPiers(plan) {
    const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');
    const rng = mulberry32(0x50494552);
    const parts = [];
    const col = new THREE.Color();

    const timber = (base, spread) => col.setHSL(0.08, 0.10, base + rng() * spread).clone();

    for (const pier of plan.piers) {
      const dx = Math.sin(pier.yaw), dz = Math.cos(pier.yaw);
      const nx = Math.cos(pier.yaw), nz = -Math.sin(pier.yaw);
      const deckTop = pier.deckY;
      const deckBottom = deckTop - 0.12;

      // Deck planks, laid across the pier.
      const pitch = 0.34;
      for (let d = 0.4; d < pier.length; d += pitch) {
        parts.push(boxGeometry(
          pier.width, 0.12, 0.28,
          pier.x + dx * d, deckBottom + 0.06, pier.z + dz * d,
          pier.yaw, timber(0.38, 0.16),
        ));
      }

      // Stringers carrying the planks, and the posts carrying the stringers.
      for (const side of [-1, 1]) {
        const ox = nx * side * (pier.width / 2 - 0.25);
        const oz = nz * side * (pier.width / 2 - 0.25);
        parts.push(boxGeometry(
          0.16, 0.22, pier.length,
          pier.x + ox + dx * pier.length / 2, deckBottom - 0.11, pier.z + oz + dz * pier.length / 2,
          pier.yaw, timber(0.30, 0.08),
        ));

        for (let d = 0.8; d < pier.length; d += 3.4) {
          const px = pier.x + ox + dx * d;
          const pz = pier.z + oz + dz * d;
          const bed = this.terrain.height(px, pz) - 0.6;
          const h = deckBottom - 0.2 - bed;
          if (h <= 0.2) continue;
          parts.push(boxGeometry(
            0.26, h, 0.26, px, bed + h / 2, pz, pier.yaw, timber(0.22, 0.07),
          ));
        }
      }
    }

    const mesh = new THREE.Mesh(
      parts.length ? mergeGeometries(parts, false) : new THREE.BufferGeometry(),
      plankMaterial(),           // real weathered planks, tinted per-plank by the vertex colours
    );
    mesh.name = 'havnstad-piers';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Named positions the NPC schedules bind to. */
  _markAnchors(plan) {
    const R = plan.ribbon, P = plan.terraces;
    const set = (name, x, z) => this._anchors.set(name, new THREE.Vector3(x, this.terrain.height(x, z), z));

    const quayMid = R.at(R.length / 2, P.at(R.length / 2, 'quay') - 4);
    set('quay', quayMid.x, quayMid.z);

    const west = R.at(30, P.at(30, 'quay') - 4);
    const east = R.at(R.length - 30, P.at(R.length - 30, 'quay') - 4);
    set('quay-west', west.x, west.z);
    set('quay-east', east.x, east.z);

    const wIn = R.at(20, 0), eIn = R.at(R.length - 20, 0);
    set('town-west', wIn.x, wIn.z);
    set('town-east', eIn.x, eIn.z);

    const well = plan.dressing.find((d) => d.anchor === 'market');
    const mid = R.at(300, -7);
    set('market', well ? well.x : mid.x, well ? well.z : mid.z);

    if (plan.piers.length) {
      const p = plan.piers[Math.floor(plan.piers.length / 2)];
      // The head of a pier is over open water, so its anchor takes the deck
      // height. Grounding it on the terrain would put the fish-buyer on the
      // seabed, seven metres under.
      this._anchors.set('pier-head', new THREE.Vector3(
        p.x + Math.sin(p.yaw) * p.length * 0.8,
        p.deckY,
        p.z + Math.cos(p.yaw) * p.length * 0.8,
      ));
    }

    for (const b of plan.buildings) {
      if (b.role === 'church') set('church', b.x, b.z);
      if (b.role === 'hall') set('hall', b.x, b.z);
    }
    for (const d of this._doors) {
      this._anchors.set(`${d.interior}-door`, new THREE.Vector3(d.x, d.y, d.z));
    }
  }
}
