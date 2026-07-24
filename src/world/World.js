import * as THREE from 'three';
import { Settlement } from './Settlement.js';
import { Landmarks } from './Landmarks.js';
import { Vegetation } from './Vegetation.js';

/**
 * The world layer: Havnstad, the three wilderness landmarks, and the vegetation
 * between them.
 *
 * This file used to *be* the world — a hand-placed POI list with a radial prop
 * scatter, authored for an 850m noise valley. On the real 4096m Herøy tile eight
 * of those twenty-seven locations stood in the sea and the scatter thinned to 28
 * props per square kilometre. All of it is gone. What survives is the part the
 * rest of the engine actually depends on: a stable POI namespace, cylinder
 * collision, and the nearest-place lookup that drives the location readout and
 * every `reach` objective.
 *
 * World now owns nothing geometric. Settlement, Landmarks and Vegetation each
 * plan themselves against the real heightmap; this class builds them in the
 * order their exclusions require and republishes their anchors under the POI ids
 * that npcs.js and quests.js already reference.
 */

/**
 * The POI namespace, bound to anchors published by Settlement and Landmarks.
 *
 * The ids are inherited, not chosen. `src/data/npcs.js` and `src/data/quests.js`
 * reference twenty-seven of them by string across `home`, `work`, `schedule[].poi`
 * and `reach` targets, and NPC.spawn falls back to the first POI in the map on a
 * miss — so a mis-keyed id does not error, it silently piles every affected NPC
 * onto one spot. Renaming them would mean rewriting both content files in the
 * same change. The names and the ground are new; only the keys are old.
 *
 * `from` is an anchor name; `off` displaces from it in metres and is then walked
 * onto dry, gentle ground. Two entries (`ledger-vault`, `reach-drawings`) exist
 * only as dangling `reach` targets in quests.js and had no POI at all before.
 */
export const PLACES = [
  // ===================================================== HAVNSTAD — the town
  // region 'greenhollow' throughout: the faction and region strings are content,
  // and retagging them would orphan every creature spawn and dialogue check.
  { id: 'greenhollow-market', name: 'Havnstad Market', region: 'greenhollow', kind: 'village', from: 'market', radius: 34 },
  { id: 'greenhollow-guildhall', name: 'Kvitsalen', region: 'greenhollow', kind: 'hall', from: 'hall', radius: 24 },
  { id: 'mildrid-shop', name: 'Apotekaren', region: 'greenhollow', kind: 'shop', from: 'apothecary-door', radius: 14 },
  { id: 'maple-loft', name: 'The Fork & Net', region: 'greenhollow', kind: 'home', from: 'inn-door', radius: 14 },
  // Charles is the fish-buyer, so his "farm" is Bryggja on the quay and his
  // "field" is the working waterfront. The schedule reads the same; the ground
  // under it is now a quay rather than a meadow.
  //
  // Deliberately NOT the `pier-head` anchor, tempting as it is. That anchor is
  // the deck of a pier out over open water, and a POI takes its y from the
  // terrain — so it registered at -5.4m on the seabed and sent Charles wading
  // out to it twice a day. Nothing walks on the piers until they carry a height
  // query of their own.
  { id: 'charles-farm', name: 'Bryggja', region: 'greenhollow', kind: 'home', from: 'quay-east', radius: 22 },
  { id: 'charles-field', name: 'The Fish Quay', region: 'greenhollow', kind: 'work', from: 'quay', radius: 20 },
  { id: 'boundary-sentinel', name: 'Herøy Kyrkje', region: 'greenhollow', kind: 'landmark', from: 'church', radius: 20 },
  { id: 'wayside-tollpost', name: 'The West Road', region: 'greenhollow', kind: 'outpost', from: 'town-west', radius: 22 },

  // ============================================ GRAVFELTET — the barrow field
  // The Quiet Desk keeps its records in a grave. Sundermarsh had no landform on
  // this tile; the barrow field is the closest thing to what its content wants.
  { id: 'desk-chapterhouse', name: 'Gravfeltet', region: 'sundermarsh', kind: 'hall', from: 'gravfeltet', radius: 55 },
  { id: 'drowned-ledger', name: 'The Open Barrow', region: 'sundermarsh', kind: 'dungeon', from: 'gravfeltet-door', radius: 16 },
  { id: 'ledger-vault', name: 'The Barrow Vault', region: 'sundermarsh', kind: 'dungeon', from: 'gravfeltet-mound-7', radius: 12 },
  { id: 'mire-drawings', name: 'The Boat Carvings', region: 'sundermarsh', kind: 'lore', from: 'gravfeltet-mound-1', radius: 12 },

  // ============================================ VARDEFJELL — the beacon summit
  { id: 'bracken-outpost', name: 'The Beacon Camp', region: 'thistlecrag', kind: 'outpost', from: 'vardefjell-camp', radius: 34, hostile: true },
  { id: 'tallyhall', name: 'The Varde', region: 'thistlecrag', kind: 'hall', from: 'vardefjell-varde', radius: 28 },
  { id: 'thistle-archway', name: 'The Beacon Gate', region: 'thistlecrag', kind: 'landmark', from: 'vardefjell-gate', radius: 22 },
  { id: 'crag-drawings', name: 'The High Cairn', region: 'thistlecrag', kind: 'lore', from: 'vardefjell-route-5', radius: 20 },

  // ====================================== THE CART TRACK — Vardefjell approach
  // The route cairns are 15-250m apart up the mountain, which is exactly the
  // spacing the Ashen Vigil's patrol schedules were written against.
  { id: 'vigil-camp', name: 'The Halfway Støl', region: 'cinderfell', kind: 'camp', from: 'vardefjell-route-0', radius: 26 },
  { id: 'cinder-road-towers', name: 'The Track Cairns', region: 'cinderfell', kind: 'landmark', from: 'vardefjell-route-1', radius: 22 },
  { id: 'stagward-tower', name: 'Stagward Cairn', region: 'cinderfell', kind: 'tower', from: 'vardefjell-route-2', radius: 22 },
  { id: 'the-furrow', name: 'The Furrow', region: 'cinderfell', kind: 'landmark', from: 'vardefjell-route-3', radius: 26 },
  { id: 'furrow-drawings', name: 'The Track Carvings', region: 'cinderfell', kind: 'lore', from: 'vardefjell-route-4', radius: 20 },

  // ========================================== SETERDALEN — the hanging valley
  { id: 'hollow-tree', name: 'The Hollow Tree', region: 'hollowmere', kind: 'grove', from: 'seterdalen-tree', radius: 26 },
  { id: 'grovekeeper-treehouse', name: 'Seterdalen', region: 'hollowmere', kind: 'home', from: 'seterdalen', radius: 34 },
  { id: 'clockwork-grove-first', name: 'The Old Seter', region: 'hollowmere', kind: 'landmark', from: 'seterdalen-seter', radius: 28 },
  { id: 'reach-drawings', name: 'The Gorge Carvings', region: 'hollowmere', kind: 'lore', from: 'seterdalen-gully', radius: 20 },

  // ====================================== THE SHORE PATH — west out of town
  // The Ruby Order's four locations have no landform of their own on this tile.
  // world-design.md §4 puts three isolated farms on the shore path west to the
  // barrows, which is where they go: offsets from the barrow field, walked onto
  // dry ground at build time.
  { id: 'citadel-approach', name: 'The Shore Path', region: 'carnelian-reach', kind: 'landmark', from: 'gravfeltet', off: [130, 70], radius: 30 },
  { id: 'ruby-keep', name: 'The Reach Farm', region: 'carnelian-reach', kind: 'fort', from: 'gravfeltet', off: [215, -30], radius: 30 },
  { id: 'crimson-citadel', name: 'The Far Headland', region: 'carnelian-reach', kind: 'city', from: 'gravfeltet', off: [-95, -120], radius: 40 },
  { id: 'crystal-annexe', name: 'Krystallborga Overlook', region: 'carnelian-reach', kind: 'hall', from: 'gravfeltet', off: [-30, 150], radius: 30 },

  // ========================================= THE RED TEMPLE — the wildlands
  // Alone on the island across the sound. No NPC schedules point here; the
  // things that keep it are spawned as creatures.
  { id: 'dark-temple', name: 'The Red Temple', region: 'wildlands', kind: 'dungeon', from: 'temple', radius: 48, hostile: true },
  { id: 'temple-door', name: 'The Temple Steps', region: 'wildlands', kind: 'landmark', from: 'temple-door', radius: 16, hostile: true },
];

/** One keep-clear circle per farm plot — grass and scrub stay off tilled soil. */
function fieldZones(plan) {
  return (plan.fields ?? []).map((f) => {
    let cx = 0, cz = 0;
    for (const c of f.cells) { cx += c.x; cz += c.z; }
    cx /= f.cells.length; cz /= f.cells.length;
    const r = Math.max(...f.cells.map((c) => Math.hypot(c.x - cx, c.z - cz))) + 2.5;
    return { x: cx, z: cz, r };
  });
}

export class World {
  constructor(stage, terrain) {
    this.stage = stage;
    this.terrain = terrain;
    this.pois = new Map();
    this.colliders = [];       // { x, z, r } cylinders the player can't walk through
    this.doors = [];           // { id, x, y, z, yaw, interior } from Settlement

    this.group = new THREE.Group();
    this.group.name = 'world';
    stage.scene.add(this.group);

    this.settlement = new Settlement(terrain);
    this.landmarks = new Landmarks(terrain);
    this.vegetation = new Vegetation(terrain);
    this.anchors = new Map();
  }

  poi(id) { return this.pois.get(id); }

  /** A named position published by Settlement or Landmarks. */
  anchor(name) { return this.anchors.get(name) ?? null; }

  /**
   * Build order is forced by what each stage needs from the one before.
   *
   * Landmarks first because it publishes the exclusion zones the town must not
   * be planted inside; Settlement second because its buildings are the other
   * half of those exclusions; Vegetation last, because it is the only one that
   * has to avoid everything else.
   */
  async build(onProgress) {
    const step = (base, span) => (p) => onProgress?.(base + Math.min(1, p ?? 0) * span);

    await this.landmarks.build();
    this.group.add(this.landmarks.group);
    onProgress?.(0.25);

    await this.settlement.build(step(0.25, 0.45));
    this.group.add(this.settlement.group);
    onProgress?.(0.70);

    this._collectAnchors();
    this._registerPlaces();
    this.colliders = [...this.settlement.colliders, ...this.landmarks.colliders];
    this.doors = this.settlement.doors.map((d) => ({ ...d }));

    // The temple's red door, on the citadel's approach side (bearing 90 — see
    // SITES.temple.approachDeg). The only door on the wildlands island.
    const templeDoor = this.anchors.get('temple-door');
    if (templeDoor) {
      this.doors.push({
        id: 'dark-temple', interior: 'dark-temple',
        x: templeDoor.x, y: templeDoor.y, z: templeDoor.z, yaw: Math.PI / 2,
      });
    }
    onProgress?.(0.74);

    await this.vegetation.build(this._exclusionZones());
    this.group.add(this.vegetation.group);
    onProgress?.(0.9);

    // Grass last. It is the only thing here that follows the player rather than
    // being placed once, and it needs every other system's footprint first so it
    // does not grow through a floor, a barrow or the middle of a street.
    const { GrassField } = await import('./GrassField.js');
    this.grass = await GrassField.load(this.terrain, {
      exclusions: this._grassExclusions(),
      roadAt: (x, z) => this.settlement.roadCoverageAt(x, z),
    });
    this.group.add(this.grass.group);
    onProgress?.(1);

    return this;
  }

  /**
   * Where grass may not grow. Tighter than the vegetation exclusions: a tree is
   * refused anywhere near a building, but grass is fine right up to a wall — it
   * only has to stay out of the footprint itself and off the piers.
   */
  _grassExclusions() {
    const zones = [];
    const plan = this.settlement.plan;
    if (plan) {
      for (const b of plan.buildings) zones.push({ x: b.x, z: b.z, r: 7 });
      for (const p of plan.piers) zones.push({ x: p.x, z: p.z, r: 9 });
      zones.push(...fieldZones(plan));
      // The trampled ground around the well is painted into the terrain —
      // grass growing through it would hide the one patch the whole town wears
      // bare.
      const well = plan.dressing.find((d) => d.model === 'wishing-well');
      if (well) zones.push({ x: well.x, z: well.z, r: 5 });
    }
    for (const z of this.landmarks.zones) zones.push({ x: z.x, z: z.z, r: z.r * 0.45 });
    return zones;
  }

  /** Advance the grass, and move its disc with the player. */
  updateGrass(dt, viewer) {
    this.grass?.update(dt, viewer);
  }

  /**
   * Placed props the player can open: chests (in town and out at the barrows,
   * seter and temple) and the fish-drying racks on the quay. Returns world
   * positions so Game can hang a Lootable on each.
   */
  containers() {
    const CHEST = /^chest-/;
    const out = [];
    const scan = (recs) => {
      for (const r of recs ?? []) {
        if (!r?.model) continue;
        if (CHEST.test(r.model)) out.push({ model: r.model, kind: 'chest', x: r.x, y: r.y, z: r.z });
        else if (r.model === 'fish-rack') out.push({ model: r.model, kind: 'fish', x: r.x, y: r.y, z: r.z });
      }
    };
    scan(this.settlement.plan?.dressing);
    scan(this.landmarks.props);
    return out;
  }

  _collectAnchors() {
    for (const [name, v] of this.landmarks.anchors) this.anchors.set(name, v);
    // Settlement second: if the two ever collide on a name, the town wins,
    // because that is the one the player is standing in.
    for (const [name, v] of this.settlement.anchors) this.anchors.set(name, v);
  }

  _registerPlaces() {
    for (const def of PLACES) {
      const base = this.anchors.get(def.from);
      if (!base) {
        console.warn(`world: no anchor '${def.from}' for poi '${def.id}' — skipped`);
        continue;
      }

      let x = base.x + (def.off?.[0] ?? 0);
      let z = base.z + (def.off?.[1] ?? 0);
      if (def.off) ({ x, z } = this._settle(x, z, base));

      // Eight of the old twenty-seven POIs stood in the strait and nothing said
      // so — NPCs simply walked into the sea. It is worth one test per place.
      if (this.terrain.isWater(x, z)) {
        console.warn(`world: poi '${def.id}' is in the water at ${x.toFixed(0)},${z.toFixed(0)}`);
      }

      this.pois.set(def.id, {
        ...def,
        position: new THREE.Vector3(x, this.terrain.height(x, z), z),
      });
    }
  }

  /**
   * Walk an offset position onto ground worth standing on.
   *
   * An offset authored in metres from an anchor can land in the strait or on a
   * cliff — the coastline is real and does not care about the design's compass
   * directions. Try flat ground nearby first, then fall back to stepping in
   * towards the anchor, which is dry by construction.
   */
  _settle(x, z, base) {
    const t = this.terrain;
    const ok = (px, pz) => !t.isWater(px, pz) && t.slope(px, pz) < 0.30;

    const flat = t.findFlat(x, z, 60, 0.20);
    if (flat && ok(flat.x, flat.z)) return { x: flat.x, z: flat.z };
    if (ok(x, z)) return { x, z };

    for (let f = 0.9; f > 0.05; f -= 0.1) {
      const px = base.x + (x - base.x) * f;
      const pz = base.z + (z - base.z) * f;
      if (ok(px, pz)) return { x: px, z: pz };
    }
    return { x: base.x, z: base.z };
  }

  /** Ground the vegetation must leave alone: buildings, piers, and landmarks. */
  _exclusionZones() {
    const zones = this.landmarks.zones.map((z) => ({ x: z.x, z: z.z, r: z.r }));
    const plan = this.settlement.plan;
    if (plan) {
      for (const b of plan.buildings) zones.push({ x: b.x, z: b.z, r: 26 });
      for (const p of plan.piers) zones.push({ x: p.x, z: p.z, r: 20 });
      zones.push(...fieldZones(plan));
      // The streets themselves. Ground scatter is chosen by slope and shelter,
      // neither of which knows a road exists, so without this boulders end up
      // sitting in the middle of the carriageway.
      zones.push(...this.settlement.roadZones);
    }
    for (const poi of this.pois.values()) {
      zones.push({ x: poi.position.x, z: poi.position.z, r: poi.radius });
    }
    return zones;
  }

  /** Push a position out of any building it has walked into. */
  resolveCollision(pos, radius = 0.42) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d2 = dx * dx + dz * dz;
      const min = c.r + radius;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    return pos;
  }

  /**
   * Keep a walker out of the strait.
   *
   * Terrain height is carved below zero for the sea floor, so nothing stops a
   * body walking off the quay and tracking the bottom at -40m, under the water
   * plane. Reverting to the last dry position is cruder than a shoreline normal
   * but it never traps anyone: `prev` is by definition somewhere they stood.
   */
  clampToLand(pos, prev) {
    if (!this.terrain.isWater(pos.x, pos.z)) return pos;
    if (prev && !this.terrain.isWater(prev.x, prev.z)) {
      pos.x = prev.x;
      pos.z = prev.z;
    }
    return pos;
  }

  /**
   * Nearest place the player is actually inside, for the location readout and
   * `reach` objectives.
   *
   * Scored on how deep into a radius the point is rather than on raw distance,
   * so standing in the doorway of a 14m shop inside a 34m market reads as the
   * shop. Raw distance picked the market every time, and the id has to be stable
   * — it fires journal.notify('reach') on every change.
   */
  nearest(pos) {
    let best = null, bestScore = Infinity;
    for (const poi of this.pois.values()) {
      const d = Math.hypot(pos.x - poi.position.x, pos.z - poi.position.z);
      if (d >= poi.radius) continue;
      const score = d / poi.radius;
      if (score < bestScore) { bestScore = score; best = poi; }
    }
    return best;
  }
}
