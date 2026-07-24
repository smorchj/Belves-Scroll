import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { PROPS } from '../data/catalog.js';

/**
 * Ground cover for a treeless coast.
 *
 * Herøy sits at 66°N with the open Norwegian Sea on its weather side. The real
 * place is heath, bog, scoured bedrock and grass; trees survive only where the
 * landform itself breaks the wind, and then only below a very low treeline. So
 * nothing here is scattered uniformly — every tree has to earn its position by
 * measuring how much higher ground shields it, and the result is a handful of
 * distinct copses in hollows and lee slopes with kilometres of bare heath
 * between them. Scarcity is the effect we are after: a blanket of trees would
 * be less convincing than bare ground.
 *
 * The heath itself is dressed with scrub and glacial erratics, which is what
 * actually covers this coast and is authentic rather than a consolation prize.
 *
 * Placement is deterministic (seeded PRNG) so tools/survey/survey-vegetation.mjs
 * can import this module and measure the very positions the runtime will use.
 */

// ------------------------------------------------------------------ tuning

const TREELINE = 70;              // metres; trees stop hard here
const TREELINE_FADE = 48;         // density starts falling from here up
const TREE_MIN_ELEV = 2.5;        // above the storm tideline
const TREE_MAX_SLOPE = 0.35;
const SCRUB_MAX_SLOPE = 0.42;

// Prevailing weather is WSW. Shelter from that quarter is worth far more than
// shelter from the lee side, so the exposure fan is weighted rather than even.
const WEATHER_BEARING = 247.5;
const SHELTER_RINGS = [24, 55, 110, 200];
const SHELTER_BEARINGS = 16;
// A surrounding rise of ~0.30 (17°) counts as full shelter; above that a
// hollow is not meaningfully more sheltered, it is just deeper.
const SHELTER_FULL = 0.30;

const STAND_SHELTER_MIN = 0.34;   // a seed must clear this to found a stand
const STAND_WEATHER_MIN = 0.30;   // ...and this from the WSW quarter alone
const TREE_SHELTER_MIN = 0.24;    // individual trees may sit on the stand edge
const TREE_WEATHER_MIN = 0.20;

const STAND_MAX = 18;
const STAND_SEPARATION = 150;     // metres between stand centres
const SEED_STEP = 32;             // coarse search grid
// height() clamps outside the tile, which reads back as perfectly flat ground
// and therefore as perfect shelter — the first run put its best-scoring stands
// on that artefact. The margin has to exceed the widest shelter ring so every
// probe lands on real data, not on the clamp.
const EDGE_MARGIN = SHELTER_RINGS[SHELTER_RINGS.length - 1] + 24;

// stump-mossy and stump-mossy-b are the same mesh at a 5% size difference, so
// splitting 580 stumps across the two produced no variety the player could read —
// it just spent two draw batches saying the same thing. One entry, and the
// per-instance scale jitter below does the varying.
const SCRUB_COUNTS = {
  'plant-succulent': 2200,
  'stump-mossy': 580,
};

/**
 * Assets whose modelled orientation is not how they rest on the ground.
 * Radians, applied before the geometry is normalised for instancing.
 */
const REST_ROTATION = {
  logs: [Math.PI * 0.5, 0, 0],   // modelled upright; firewood lies down
};
const ROCK_COUNT = 5200;
const ROCK_VARIANTS = 4;

/**
 * Species as a weighted roll rather than a threshold ladder.
 *
 * Thresholds sorted the wood into concentric rings of one species each, and
 * because most accepted ground clears the top threshold, one asset took 73% of
 * the trees. Weights that slide with shelter mix the stand instead: the tall
 * dense forms appear only where the ground genuinely protects them, and even
 * there they stay a minority, which is what a marginal coastal wood looks like.
 * `u` is 0 at the acceptance floor and 1 at full shelter.
 */
const SPECIES = [
  { model: 'tree-cluster', weight: (u) => u ** 4 * 0.55 },
  { model: 'tree-fir', weight: (u) => u ** 2 * 0.85 },
  { model: 'tree-old', weight: () => 0.8 },
  { model: 'tree-verdant', weight: (u) => 0.35 + 1.2 * (1 - u) },
];

function pickSpecies(shelter, roll) {
  const u = clamp01((shelter - TREE_SHELTER_MIN) / 0.45);
  const w = SPECIES.map((s) => s.weight(u));
  const total = w.reduce((a, b) => a + b, 0);
  let t = roll * total;
  for (let i = 0; i < SPECIES.length; i++) {
    t -= w[i];
    if (t <= 0) return SPECIES[i];
  }
  return SPECIES[SPECIES.length - 1];
}

// ------------------------------------------------------------------ helpers

/** Small deterministic PRNG — the survey tool must reproduce these positions. */
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function angularDelta(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d) * Math.PI / 180;
}

/**
 * How much higher ground shields (x, z), as 0 exposed .. 1 sheltered.
 *
 * For each bearing take the steepest rise seen at any of the sample radii —
 * that is the horizon angle in that direction, which is what a wind actually
 * has to climb over. Weighting the fan towards WSW is the whole point: a hollow
 * open to the north-east is still a good place for a tree here, and one open to
 * the sea is not, even though an even fan would score them alike.
 *
 * `weather` is the same measure restricted to the weather quarter, returned
 * separately so an exposed west-facing shore can be rejected outright rather
 * than being rescued by shelter on its landward side.
 */
export function shelterAt(terrain, x, z, h = terrain.height(x, z)) {
  let sum = 0, weight = 0;
  let wSum = 0, wWeight = 0;

  for (let b = 0; b < SHELTER_BEARINGS; b++) {
    const deg = (b * 360) / SHELTER_BEARINGS;
    const rad = deg * Math.PI / 180;
    const dx = Math.sin(rad), dz = Math.cos(rad);

    let rise = 0;
    for (const r of SHELTER_RINGS) {
      const t = (terrain.height(x + dx * r, z + dz * r) - h) / r;
      if (t > rise) rise = t;
    }
    const s = clamp01(rise / SHELTER_FULL);

    const off = angularDelta(deg, WEATHER_BEARING);
    const cos = Math.cos(off);
    const w = 0.18 + 0.82 * Math.max(0, cos) ** 2;
    sum += s * w; weight += w;

    if (off < Math.PI / 3) { wSum += s; wWeight += 1; }
  }

  return { shelter: sum / weight, weather: wSum / Math.max(1, wWeight) };
}

/** Inside the tile by enough that every shelter probe reads real data. */
function inBounds(terrain, x, z) {
  const limit = terrain.size / 2 - EDGE_MARGIN;
  return Math.abs(x) <= limit && Math.abs(z) <= limit;
}

/** Trees need land, gentle ground, height above the tide and below the treeline. */
function treeGroundOk(terrain, x, z, h) {
  if (!inBounds(terrain, x, z)) return false;
  if (h < TREE_MIN_ELEV || h > TREELINE) return false;
  if (terrain.isWater(x, z)) return false;
  return terrain.slope(x, z) <= TREE_MAX_SLOPE;
}

function inExclusion(zones, x, z) {
  for (const e of zones) {
    const dx = x - e.x, dz = z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) return true;
  }
  return false;
}

// ----------------------------------------------------------------- planning

/**
 * Decide where everything goes, without touching three.js.
 *
 * Exported so the survey tool can measure the plan directly instead of
 * re-implementing it and slowly drifting out of agreement with the runtime.
 */
export function planVegetation(terrain, exclusionZones = [], seed = 0x5eed) {
  const zones = exclusionZones ?? [];
  const stands = findStands(terrain, zones);
  const trees = plantStands(terrain, zones, stands, rng(seed ^ 0x11));
  const scrub = scatterScrub(terrain, zones, stands, rng(seed ^ 0x22));
  const rocks = scatterRocks(terrain, zones, rng(seed ^ 0x33));
  return { stands, trees, scrub, rocks };
}

/**
 * Coarse sweep for the most sheltered ground on the island, thinned to a set of
 * well-separated stand centres. Taking local winners with a minimum separation
 * is what produces distinct copses; taking every cell above a threshold would
 * produce the even carpet this island must not have.
 */
function findStands(terrain, zones) {
  const limit = terrain.size / 2 - EDGE_MARGIN;
  const candidates = [];

  for (let x = -limit; x <= limit; x += SEED_STEP) {
    for (let z = -limit; z <= limit; z += SEED_STEP) {
      const h = terrain.height(x, z);
      if (!treeGroundOk(terrain, x, z, h)) continue;
      if (inExclusion(zones, x, z)) continue;

      const { shelter, weather } = shelterAt(terrain, x, z, h);
      if (shelter < STAND_SHELTER_MIN || weather < STAND_WEATHER_MIN) continue;

      // Below the treeline fade a stand is unremarkable; above it, thinning.
      const alt = 1 - 0.75 * clamp01((h - TREELINE_FADE) / (TREELINE - TREELINE_FADE));
      const flat = 1 - clamp01(terrain.slope(x, z) / TREE_MAX_SLOPE) * 0.5;
      candidates.push({ x, z, y: h, shelter, weather, score: shelter * alt * flat });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const chosen = [];
  const sep2 = STAND_SEPARATION * STAND_SEPARATION;
  for (const c of candidates) {
    if (chosen.length >= STAND_MAX) break;
    if (chosen.some((s) => (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < sep2)) continue;
    // Quality drives both how wide the copse spreads and how many trees fill
    // it, so the best hollow reads as a wood and a marginal one as three
    // wind-bent trees in a dip.
    // Squared, so a merely adequate hollow gets a handful of wind-bent trees
    // and only the genuinely protected ones grow into something worth walking
    // to. A linear curve made every stand the same size and the island read as
    // evenly dotted with identical copses.
    const q = clamp01((c.shelter - STAND_SHELTER_MIN) / (1 - STAND_SHELTER_MIN));
    chosen.push({ ...c, quality: q, radius: 20 + q * 48, target: Math.round(4 + q ** 2 * 46) });
  }
  return chosen;
}

/** Fill each stand, densest at its heart, thinning to nothing at the edge. */
function plantStands(terrain, zones, stands, rand) {
  const trees = [];

  for (const stand of stands) {
    const placed = [];
    let guard = 0;
    while (placed.length < stand.target && guard++ < stand.target * 60) {
      // sqrt would spread evenly over the disc; the extra power pulls trees in
      // towards the sheltered middle.
      const r = stand.radius * rand() ** 0.85;
      const a = rand() * Math.PI * 2;
      const x = stand.x + Math.cos(a) * r;
      const z = stand.z + Math.sin(a) * r;

      const h = terrain.height(x, z);
      if (!treeGroundOk(terrain, x, z, h)) continue;
      if (inExclusion(zones, x, z)) continue;

      // Crowns need room; without this the copse centre becomes one solid mass.
      if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 25)) continue;

      const { shelter, weather } = shelterAt(terrain, x, z, h);
      if (shelter < TREE_SHELTER_MIN || weather < TREE_WEATHER_MIN) continue;

      // Density falls off sharply with exposure and with altitude, so stands
      // fray at their windward edge instead of ending on a circle.
      const alt = 1 - clamp01((h - TREELINE_FADE) / (TREELINE - TREELINE_FADE));
      const chance = clamp01((shelter - TREE_SHELTER_MIN) / 0.3) ** 1.5 * (0.25 + 0.75 * alt);
      if (rand() > chance) continue;

      const species = pickSpecies(shelter, rand());
      const metres = PROPS[species.model]?.metres ?? 8;
      // Wind-pruned: the more exposed the tree, the smaller it stays, so the
      // jitter is biased by shelter rather than being free-running noise.
      const vigour = 0.78 + 0.42 * clamp01((shelter - TREE_SHELTER_MIN) / 0.45);
      const jitter = Math.min(1.3, Math.max(0.75, (0.82 + rand() * 0.5) * vigour));

      placed.push({
        model: species.model,
        x, y: h, z,
        rot: rand() * Math.PI * 2,
        scale: metres * jitter,
        shelter, weather,
        slope: terrain.slope(x, z),
        stand: stands.indexOf(stand),
      });
    }
    trees.push(...placed);
  }
  return trees;
}

/**
 * Scrub is what the open heath actually wears: low succulent-like cushions,
 * old cut stumps at field edges, and driftwood-grey logs. It tolerates
 * exposure, so it goes almost everywhere trees cannot — with a deliberate
 * thickening around the copses, where the wood's edge would be.
 */
function scatterScrub(terrain, zones, stands, rand) {
  const limit = terrain.size / 2 - EDGE_MARGIN;
  const out = [];

  for (const [model, count] of Object.entries(SCRUB_COUNTS)) {
    const metres = PROPS[model]?.metres ?? 1;   // longest real dimension
    let placed = 0, guard = 0;

    while (placed < count && guard++ < count * 30) {
      let x, z;
      // A third of the scrub clusters at the wood edge; the rest dresses the
      // open ground. Uniform scatter alone reads as static noise.
      if (stands.length && rand() < 0.33) {
        const s = stands[(rand() * stands.length) | 0];
        const r = s.radius * (0.6 + rand() * 1.4);
        const a = rand() * Math.PI * 2;
        x = s.x + Math.cos(a) * r;
        z = s.z + Math.sin(a) * r;
      } else {
        x = (rand() * 2 - 1) * limit;
        z = (rand() * 2 - 1) * limit;
      }
      if (!inBounds(terrain, x, z)) continue;

      const h = terrain.height(x, z);
      // Above ~180m the doc puts bare scree; nothing rooted grows up there.
      if (h < 1.6 || h > 180) continue;
      if (terrain.isWater(x, z)) continue;
      if (terrain.slope(x, z) > SCRUB_MAX_SLOPE) continue;
      if (inExclusion(zones, x, z)) continue;

      // Stumps and logs imply trees once stood here, so they follow shelter;
      // the low cushion plant does not care.
      if (model !== 'plant-succulent') {
        const { shelter } = shelterAt(terrain, x, z, h);
        if (rand() > clamp01(shelter / 0.4) * 0.9 + 0.1) continue;
      }

      out.push({
        model, x, y: h, z,
        rot: rand() * Math.PI * 2,
        scale: metres * (0.75 + rand() * 0.55),
      });
      placed++;
    }
  }
  return out;
}

/**
 * Glacial erratics. There is no rock asset, so these are generated: the whole
 * coast is strewn with boulders the ice left behind, and their absence is more
 * noticeable than any single missing prop would be.
 *
 * They favour thin-soil ground — steep shoulders, high ground and the shingle
 * just above the tideline — because that is where the bedrock and its debris
 * are not buried under heath.
 */
function scatterRocks(terrain, zones, rand) {
  const limit = terrain.size / 2 - EDGE_MARGIN;
  const out = [];
  let placed = 0, guard = 0;

  while (placed < ROCK_COUNT && guard++ < ROCK_COUNT * 12) {
    const x = (rand() * 2 - 1) * limit;
    const z = (rand() * 2 - 1) * limit;
    if (!inBounds(terrain, x, z)) continue;
    const h = terrain.height(x, z);
    if (h < 0.8) continue;
    if (terrain.isWater(x, z)) continue;
    const s = terrain.slope(x, z);
    if (s > 0.55) continue;                       // sheer faces shed their debris
    if (inExclusion(zones, x, z)) continue;

    const thinSoil = clamp01(s / 0.4) * 0.5
                   + clamp01((h - 90) / 120) * 0.4
                   + clamp01((4.5 - h) / 3.5) * 0.35;
    if (rand() > 0.22 + thinSoil) continue;

    // Mostly cobbles and small boulders, with the occasional erratic that is
    // large enough to be a landmark in its own right.
    const roll = rand();
    const size = roll > 0.985 ? 2.4 + rand() * 1.9
               : roll > 0.88 ? 1.1 + rand() * 1.1
               : 0.28 + rand() * 0.7;

    out.push({
      variant: (rand() * ROCK_VARIANTS) | 0,
      x, y: h, z,
      rot: rand() * Math.PI * 2,
      scale: size,
      tilt: (rand() - 0.5) * 0.35,
    });
    placed++;
  }
  return out;
}

// ---------------------------------------------------------------- geometry

/**
 * A low-poly boulder: a subdivided icosahedron pushed around by cheap value
 * noise, squashed slightly and flattened underneath so it sits into the ground
 * rather than balancing on it. Flat-shaded, because glacially plucked granite
 * reads as facets, not as a smooth pebble.
 */
function boulderGeometry(seed) {
  const rand = rng(seed);
  const geo = new THREE.IcosahedronGeometry(0.5, 2);
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');

  // Three noise lobes per boulder, so no two variants share a silhouette.
  const lobes = [];
  for (let i = 0; i < 3; i++) {
    lobes.push({
      f: 1.6 + rand() * 3.4,
      p: rand() * 6.283,
      q: rand() * 6.283,
      a: 0.10 + rand() * 0.16,
    });
  }
  const squash = new THREE.Vector3(0.85 + rand() * 0.4, 0.62 + rand() * 0.3, 0.85 + rand() * 0.4);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let d = 1;
    for (const l of lobes) {
      d += l.a * Math.sin(n.x * l.f + l.p) * Math.cos(n.z * l.f + l.q) * Math.sin(n.y * l.f * 0.7);
    }
    v.multiplyScalar(d).multiply(squash);
    // Bury the underside: real erratics are bedded, not perched.
    if (v.y < -0.18) v.y = -0.18 - (v.y + 0.18) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeBoundingBox();
  const box = geo.boundingBox;
  geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geo.computeBoundingBox();
  const k = 1 / Math.max(1e-3, geo.boundingBox.max.y);
  geo.scale(k, k, k);

  // Per-vertex mottling stands in for lichen and wet/dry patches; a single grey
  // over five thousand instances reads as plastic.
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const m = 0.78 + 0.22 * Math.sin(v.x * 9.1 + v.y * 5.7 + v.z * 7.3 + seed);
    colours[i * 3] = m;
    colours[i * 3 + 1] = m * (0.98 + 0.04 * Math.sin(v.y * 11.3));
    colours[i * 3 + 2] = m * 0.96;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------- class

export class Vegetation {
  constructor(terrain) {
    this.terrain = terrain;
    this._group = new THREE.Group();
    this._group.name = 'vegetation';
    this.plan = null;
    this.counts = {};
  }

  get group() { return this._group; }

  async build(exclusionZones = []) {
    this.plan = planVegetation(this.terrain, exclusionZones);

    const byModel = new Map();
    for (const p of [...this.plan.trees, ...this.plan.scrub]) {
      if (!byModel.has(p.model)) byModel.set(p.model, []);
      byModel.get(p.model).push(p);
    }

    for (const [model, placements] of byModel) {
      try {
        await this._instanceProp(model, placements);
        this.counts[model] = placements.length;
      } catch {
        console.warn(`vegetation: prop missing: ${model}`);
      }
    }

    this._buildRocks();
    return this;
  }

  /**
   * One InstancedMesh per source mesh in the GLB.
   *
   * The meshes inside a Meshy export sit under transformed parent nodes, and
   * instancing the raw geometry silently discards those transforms — which is
   * what shrank an earlier scatter in this project to specks. So the
   * local-to-root matrix is baked in first. Every mesh of a prop is then
   * re-origined against the *root's* bounds, not its own, or the parts of a
   * multi-mesh tree would each be normalised differently and come apart.
   */
  async _instanceProp(model, placements) {
    const inst = await assets.prop(model);
    inst.root.updateMatrixWorld(true);

    // Meshy exports carry no notion of which way up a thing rests. `logs` is
    // modelled standing on end — its long axis is Y — so scattering it as-is
    // plants pairs of upright trunks along the beach instead of laying driftwood
    // on it. Tip it onto its side before the geometry is normalised, so the
    // unit-height and base-drop maths below see the resting orientation.
    const rest = REST_ROTATION[model];
    if (rest) {
      inst.root.rotation.set(rest[0], rest[1], rest[2]);
      inst.root.updateMatrixWorld(true);
    }

    const box = new THREE.Box3().setFromObject(inst.root);
    // Normalise by the LONGEST dimension, matching the catalog's definition of
    // `metres`. Dividing by height instead works for a tree, whose longest axis
    // *is* its height, but breaks the moment something rests on its side: laying
    // the logs down left a 0.39-unit height, and scaling that to 2.2m stretched
    // them into 7m tree trunks on the beach.
    const longest = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    if (!Number.isFinite(longest) || longest < 1e-4) return;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const k = 1 / longest;

    const sources = [];
    inst.root.traverse((o) => { if (o.isMesh) sources.push(o); });

    for (const src of sources) {
      const geo = src.geometry.clone();
      geo.applyMatrix4(src.matrixWorld);
      // Centre horizontally on the trunk so the random Y rotation spins the
      // tree about itself, and drop the base to y=0 so an instance placed at
      // terrain height stands on the ground instead of half-buried.
      geo.translate(-cx, -box.min.y, -cz);
      geo.scale(k, k, k);              // unit longest-axis: instance scale is metres
      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      const mesh = new THREE.InstancedMesh(geo, src.material, placements.length);
      this._fill(mesh, placements);
      this._group.add(mesh);
    }
  }

  _buildRocks() {
    const material = this._rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x8d8f88,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
      vertexColors: true,
    });

    const buckets = Array.from({ length: ROCK_VARIANTS }, () => []);
    for (const r of this.plan.rocks) buckets[r.variant % ROCK_VARIANTS].push(r);

    buckets.forEach((bucket, i) => {
      if (!bucket.length) return;
      const mesh = new THREE.InstancedMesh(boulderGeometry(0x60c + i * 977), material, bucket.length);
      this._fill(mesh, bucket, true);
      this._group.add(mesh);
    });
    this.counts.rocks = this.plan.rocks.length;
  }

  _fill(mesh, placements, tilt = false) {
    // Deliberately not a shadow caster. A single InstancedMesh spans the whole
    // 4km tile, and handing that to a shadow camera fitted to a ±45m box around
    // the player collapses its depth range and drops the scene into shadow —
    // the same trap the World scatter hit.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    placements.forEach((p, i) => {
      pos.set(p.x, p.y, p.z);
      if (tilt) e.set(p.tilt ?? 0, p.rot, (p.tilt ?? 0) * 0.6, 'YXZ');
      else e.set(0, p.rot, 0);
      q.setFromEuler(e);
      scl.setScalar(p.scale);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    // Geometry is cloned per instanced mesh so it is ours to free; materials are
    // shared with the cached GLB and must not be, apart from the rock material
    // which is created here.
    this._group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      o.geometry.dispose();
      o.dispose();
    });
    this._rockMaterial?.dispose();
    this._group.clear();
  }
}
