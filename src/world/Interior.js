import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { PROPS } from '../data/catalog.js';

/**
 * Enterable interiors — generated room shells dressed with catalogued furniture.
 *
 * There is no interior geometry in the asset set, so the shell is built from
 * primitives: a room box sized to the building's exterior footprint, walls and a
 * beamed ceiling textured from the terrain maps, and the Meshy furniture placed
 * inside it. Interiors never match their exteriors in this genre and nobody
 * notices — what the player reads is the doorway, the warmth and the clutter.
 *
 * Scaling differs deliberately from World._place. Outdoors, props are sized by
 * measuring the assembled model and solving for `cat.metres`. Indoors that is
 * wrong: `metres` is authored as *height* for tall props but as *longest axis*
 * for wide ones, so solving against height turns a 1.8m-wide table into a 1.8m-
 * tall one. The hand-authored `cat.scale` is correct for every entry (verified
 * against the asset survey), so interiors use it directly.
 *
 * The transition is designed to survive whether or not Stage has learnt about
 * multiple scenes. If `stage.setActiveScene` exists the interior renders as its
 * own scene; otherwise it adopts into the exterior scene and suppresses the
 * outdoor rig every frame. Both paths present the same interface.
 */

// A fixed light count per interior. WebGLLights counts *visible* lights, and the
// count is baked into every MeshStandardMaterial program — so an interior with
// four candles and one with six must still declare six, or the hero's twenty
// materials recompile on the first indoor frame. Unused slots get intensity 0
// and stay visible.
const MAX_POINTS = 6;

const HEIGHT_BY_KIND = { cottage: 2.6, shop: 2.8, inn: 3.4, hall: 5.0, chamber: 3.2 };

const WARM_DUSK = new THREE.Color(0.95, 0.66, 0.44);

// ---------------------------------------------------------------- textures

let _texPromise = null;

/**
 * Borrow the terrain's ground maps for the shell.
 *
 * Only cobble and ground are usable indoors — heath is coastal grass and shingle
 * is beach pebble. Tinted warm and tiled small, `ground` reads convincingly as
 * daub or limewashed plank at game distance; that is the honest best available
 * until the timber planking map arrives.
 */
export function loadInteriorTextures(base = `${import.meta.env.BASE_URL}assets/terrain`) {
  if (_texPromise) return _texPromise;

  const load = (name, colorSpace) => new Promise((resolve) => {
    new THREE.TextureLoader().load(`${base}/${name}.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 16;
      t.colorSpace = colorSpace;
      resolve(t);
    }, undefined, () => resolve(null));
  });

  const loadFrom = (dir, name, colorSpace) => new Promise((resolve) => {
    new THREE.TextureLoader().load(`${dir}/${name}.webp`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 16;
      t.colorSpace = colorSpace;
      resolve(t);
    }, undefined, () => resolve(null));
  });

  _texPromise = Promise.all([
    load('cobble', THREE.SRGBColorSpace),
    load('cobble_n', THREE.NoColorSpace),
    load('ground', THREE.SRGBColorSpace),
    load('ground_n', THREE.NoColorSpace),
    loadFrom(`${import.meta.env.BASE_URL}assets/props`, 'plank', THREE.SRGBColorSpace),
    loadFrom(`${import.meta.env.BASE_URL}assets/props`, 'plank_n', THREE.NoColorSpace),
  ]).then(([cobble, cobble_n, ground, ground_n, plank, plank_n]) =>
    ({ cobble, cobble_n, ground, ground_n, plank, plank_n }));

  return _texPromise;
}

/**
 * A tiled copy of a shared map.
 *
 * Textures carry repeat/offset per instance, so each surface needs its own
 * clone. A clone shares the uploaded GPU texture, so this costs no VRAM.
 */
function tiled(tex, rx, rz) {
  if (!tex) return null;
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, rz);
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------- room shell

/**
 * Build the room volume.
 *
 * Local space, centred on the origin, floor at y = 0 — so interior local space
 * is interior world space and every debug print reads straight.
 *
 * @returns {{ group: THREE.Group, inner: {w,d,h}, doorway: {x,z}, colliders: Array, surfaces: object }}
 */
export function buildRoom(spec, tex) {
  const inner = { w: spec.w, d: spec.d, h: spec.h };
  const t = spec.wallThickness ?? 0.25;
  const doorW = spec.doorWidth ?? 1.15;
  const doorH = spec.doorHeight ?? 2.15;
  const group = new THREE.Group();
  group.name = 'room-shell';
  const colliders = [];

  const floorMat = new THREE.MeshStandardMaterial({
    map: tiled(tex.cobble, inner.w / 2, inner.d / 2),
    normalMap: tiled(tex.cobble_n, inner.w / 2, inner.d / 2),
    color: 0x9a9288, roughness: 0.92, metalness: 0,
  });
  if (floorMat.normalMap) floorMat.normalScale.set(0.6, 0.6);

  // Walls are TIMBER by default — these are log-and-plank buildings, and the
  // terrain's mossy ground texture on a wall read as exactly that. Stone rooms
  // (the temple) opt in via `walls: 'stone'`, which reuses the cobble without
  // the outdoor moss. The wallColour tint (limewash, tar, red stain) rides on
  // top either way.
  const stoneWalls = spec.walls === 'stone';
  const wallTex = stoneWalls ? tex.cobble : (tex.plank ?? tex.ground);
  const wallTexN = stoneWalls ? tex.cobble_n : (tex.plank_n ?? tex.ground_n);
  const wallMat = (len) => {
    const m = new THREE.MeshStandardMaterial({
      map: tiled(wallTex, stoneWalls ? len / 2.2 : len / 3.4, stoneWalls ? inner.h / 2.2 : inner.h / 1.9),
      normalMap: tiled(wallTexN, stoneWalls ? len / 2.2 : len / 3.4, stoneWalls ? inner.h / 2.2 : inner.h / 1.9),
      color: spec.wallColour ?? 0xb8a68c, roughness: 0.95, metalness: 0,
    });
    if (m.normalMap) m.normalScale.set(0.8, 0.8);
    return m;
  };

  // Timber ceiling too — you look up at joists and boards, not at turf.
  const ceilMat = new THREE.MeshStandardMaterial({
    map: tiled(tex.plank ?? tex.ground, inner.w / 3.4, inner.d / 3.4),
    normalMap: tiled(tex.plank_n ?? tex.ground_n, inner.w / 3.4, inner.d / 3.4),
    color: 0x6b5c4c, roughness: 0.98, metalness: 0,
  });
  if (ceilMat.normalMap) ceilMat.normalScale.set(0.5, 0.5);

  const add = (mesh, cast = true, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  };

  // Floor and ceiling are planes; they are never seen edge-on from inside.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(inner.w, inner.d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  add(floor, false, true);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(inner.w, inner.d), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = inner.h;
  ceil.name = 'ceiling';
  add(ceil, false, true);

  // Walls are six-sided volumes, not an inverted box. A BackSide box has zero
  // thickness at the door reveal, inverts normal-map handedness and confuses the
  // shadow bias.
  const hw = inner.w / 2, hd = inner.d / 2;
  const wall = (w, h, d, x, y, z, len) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat(len));
    m.position.set(x, y, z);
    m.name = 'wall';
    return add(m);
  };

  wall(inner.w + t * 2, inner.h, t, 0, inner.h / 2, -hd - t / 2, inner.w);   // back  (-Z)
  wall(t, inner.h, inner.d, -hw - t / 2, inner.h / 2, 0, inner.d);           // left  (-X)
  wall(t, inner.h, inner.d, hw + t / 2, inner.h / 2, 0, inner.d);            // right (+X)

  // The door wall is split into two jambs and a lintel. Exact, three primitives,
  // and it leaves a real reveal of depth `t` that the player walks through.
  const jamb = (inner.w - doorW) / 2 + t;
  const jambX = (inner.w + doorW) / 4 + t / 4;
  wall(jamb, inner.h, t, -jambX, inner.h / 2, hd + t / 2, jamb);
  wall(jamb, inner.h, t, jambX, inner.h / 2, hd + t / 2, jamb);
  wall(doorW, inner.h - doorH, t, 0, doorH + (inner.h - doorH) / 2, hd + t / 2, doorW);

  // A door slab, hinged open against the jamb. It exists so the exit prompt has
  // a visible referent.
  if (spec.doorSlab !== false) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(doorW - 0.06, doorH - 0.04, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.8, metalness: 0 }),
    );
    slab.position.set(-doorW / 2 - 0.02, (doorH - 0.04) / 2, hd + t / 2);
    slab.rotation.y = -1.36;                 // ~78 degrees open
    slab.geometry.translate((doorW - 0.06) / 2, 0, 0);   // hinge on the jamb edge
    slab.name = 'door-slab';
    add(slab);
  }

  // Beams. The ceiling reads as a lid without them.
  if (spec.beams !== false) {
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x3b2d20, roughness: 0.85, metalness: 0 });
    const gap = spec.beamGap ?? 1.25;
    const n = Math.max(2, Math.floor(inner.d / gap));
    for (let i = 0; i < n; i++) {
      const z = -hd + (inner.d * (i + 0.5)) / n;
      const b = new THREE.Mesh(new THREE.BoxGeometry(inner.w + t * 2, 0.2, 0.16), beamMat);
      b.position.set(0, inner.h - 0.14, z);
      b.name = 'beam';
      add(b, true, false);
    }
  }

  // Windows are not lights — they are the *sight* of daylight, which is what
  // tells the player it is still afternoon outside. Their brightness is driven
  // from stage.day in update().
  const panes = [];
  const paneMat = new THREE.MeshBasicMaterial({ color: 0xdce8f2 });
  for (const w of spec.windows ?? []) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w.w ?? 0.8, w.h ?? 1.0), paneMat);
    const y = w.y ?? Math.min(inner.h - 0.9, 1.55);
    if (w.wall === 'x-') { pane.position.set(-hw + 0.03, y, w.at); pane.rotation.y = Math.PI / 2; }
    else if (w.wall === 'x+') { pane.position.set(hw - 0.03, y, w.at); pane.rotation.y = -Math.PI / 2; }
    else if (w.wall === 'z-') { pane.position.set(w.at, y, -hd + 0.03); }
    else { pane.position.set(w.at, y, hd - 0.03); pane.rotation.y = Math.PI; }
    pane.name = 'window';
    group.add(pane);
    panes.push(pane);

    // A reveal box so the pane does not read as a sticker on a flat wall.
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry((w.w ?? 0.8) + 0.16, (w.h ?? 1.0) + 0.16, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x54443a, roughness: 0.9, metalness: 0 }),
    );
    frame.position.copy(pane.position);
    frame.rotation.copy(pane.rotation);
    frame.translateZ(-0.05);
    add(frame);
  }

  // Built furniture: plinths, shelves, daises, loft decks. The asset set has no
  // shelving or hearth, and boxes read correctly at game distance.
  const blockMats = new Map();
  const blockMat = (colour, kind) => {
    const key = `${colour}:${kind}`;
    if (blockMats.has(key)) return blockMats.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: colour, roughness: kind === 'stone' ? 1.0 : 0.86, metalness: 0,
    });
    if (kind === 'stone' && tex.cobble) {
      m.map = tiled(tex.cobble, 2, 2);
      m.normalMap = tiled(tex.cobble_n, 2, 2);
      m.color.set(colour);
    }
    blockMats.set(key, m);
    return m;
  };

  for (const b of spec.blocks ?? []) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      blockMat(b.colour ?? 0x4a3a2a, b.mat ?? 'wood'),
    );
    m.position.set(b.at[0], (b.y ?? 0) + b.h / 2, b.at[1]);
    m.rotation.y = b.rot ?? 0;
    m.name = b.name ?? 'block';
    add(m);
    if (b.solid !== false && b.h > 0.4) {
      colliders.push({ x: b.at[0], z: b.at[1], r: Math.max(b.w, b.d) * 0.5 });
    }
  }

  // Stairs. Eight boxes read as a stair from any angle a player stands at.
  for (const s of spec.stairs ?? []) {
    const steps = s.steps ?? 8;
    const mat = blockMat(s.colour ?? 0x46362a, 'wood');
    for (let i = 0; i < steps; i++) {
      const f = (i + 1) / steps;
      const h = s.rise * f;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.run), mat);
      const z = s.from[1] + (s.to[1] - s.from[1]) * ((i + 0.5) / steps);
      const x = s.from[0] + (s.to[0] - s.from[0]) * ((i + 0.5) / steps);
      m.position.set(x, h / 2, z);
      m.name = 'stair';
      add(m);
    }
  }

  // Banners. Double-sided quads, no cloth simulation — they hang still, which is
  // correct for a hall with the doors shut.
  for (const b of spec.banners ?? []) {
    const mat = new THREE.MeshStandardMaterial({
      color: b.colour ?? 0x5a6a7e, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w ?? 1.2, b.h ?? 3.6), mat);
    const top = b.top ?? inner.h - 0.7;
    if (b.wall === 'x-') { m.position.set(-hw + 0.07, top - (b.h ?? 3.6) / 2, b.at); m.rotation.y = Math.PI / 2; }
    else if (b.wall === 'x+') { m.position.set(hw - 0.07, top - (b.h ?? 3.6) / 2, b.at); m.rotation.y = -Math.PI / 2; }
    else { m.position.set(b.at, top - (b.h ?? 3.6) / 2, -hd + 0.07); }
    m.name = 'banner';
    add(m, true, true);
  }

  return {
    group,
    inner,
    doorway: { x: 0, z: inner.d / 2 },
    colliders,
    surfaces: { panes },
  };
}

// -------------------------------------------------------------- the hearth

/** Firebox, flame quads and the light that makes the room feel lived in. */
function buildHearth(spec, tex, inner) {
  const g = new THREE.Group();
  const [x, z] = spec.at;
  const yaw = spec.facing ?? 0;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;

  const stone = new THREE.MeshStandardMaterial({
    map: tiled(tex.cobble, 2, 2),
    normalMap: tiled(tex.cobble_n, 2, 2),
    color: 0x53504a, roughness: 1.0, metalness: 0,
  });

  const w = spec.w ?? 1.7, d = spec.d ?? 0.8, h = spec.h ?? 1.25;
  const box = (bw, bh, bd, bx, by, bz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), stone);
    m.position.set(bx, by, bz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };

  // Opening faces local -Z, so `facing` is the yaw the opening points along.
  box(w, h, 0.22, 0, h / 2, d / 2 - 0.11);                  // back
  box(0.26, h, d, -w / 2 + 0.13, h / 2, 0);                 // left cheek
  box(0.26, h, d, w / 2 - 0.13, h / 2, 0);                  // right cheek
  box(w, 0.22, d + 0.16, 0, h - 0.11, 0.08);                // mantel
  box(w - 0.5, 0.12, d - 0.2, 0, 0.06, 0);                  // hearthstone

  // A chimney breast, so the hearth does not stop at head height in a tall room.
  const breast = Math.max(0.4, inner.h - h);
  box(w - 0.35, breast, d - 0.15, 0, h + breast / 2, 0.05);

  // Flame: two crossed quads. Cheap, and at candle scale the eye reads motion,
  // not shape.
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7a2a, transparent: true, opacity: 0.85,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const flames = [];
  for (let i = 0; i < 2; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), flameMat);
    q.position.set(0, 0.32, -0.02);
    q.rotation.y = i * Math.PI / 2;
    q.name = 'flame';
    g.add(q);
    flames.push(q);
  }

  return { group: g, flames, lightAt: new THREE.Vector3(x, 0.55, z) };
}

// -------------------------------------------------------------- placement

/** World-space AABB of a node, after its transform is settled. */
function measure(node, out = new THREE.Box3()) {
  node.updateMatrixWorld(true);
  return out.setFromObject(node);
}

// ------------------------------------------------------------------ data

/**
 * Three interiors, each with a distinct read.
 *
 * Coordinates are room-local: the door is always the +Z wall, centred, so the
 * entry pose is a constant rather than a per-interior calculation. `on` is the
 * surface height a prop is grounded to (a table top, a shelf, a dais); omitted
 * means the floor.
 */
export const INTERIORS = {
  // ================================================== The Fork & Net (inn)
  // Warm, busy, the most dressed of the three. A sleeping loft over the west
  // side gives the upstairs the exterior promises without a second room.
  'fork-and-net': {
    id: 'fork-and-net',
    name: 'The Fork & Net',
    kind: 'inn',
    building: 'inn-forknet',
    door: { off: [0, 4.6], yaw: 0 },
    w: 9, d: 12, h: 4.2,
    wallColour: 0xb8a68c,
    occupants: ['maple'],
    hearth: { at: [4.02, -1.2], facing: -Math.PI / 2, w: 1.7, d: 0.8, h: 1.25 },
    windows: [
      { wall: 'x+', at: 3.4, w: 0.9, h: 1.1, y: 1.7 },
      { wall: 'x+', at: 1.2, w: 0.9, h: 1.1, y: 1.7 },
      { wall: 'z+', at: -3.2, w: 0.8, h: 1.0, y: 1.7 },
    ],
    blocks: [
      // The bar-plinth that used to stand here is gone. inn-bar was catalogued at
      // 3.0m, which put its counter at 0.63m — knee height — so it had been given
      // a 0.42m base to stand on. The mesh's internal proportions were always
      // right; it was simply scaled to 57% of life. At the corrected 5.3m the
      // counter sits at 1.10m on its own and the plinth would overshoot it.
      // Sleeping loft along the west wall.
      { name: 'loft-deck', at: [-3.2, -2.5], y: 2.17, w: 2.6, h: 0.18, d: 7.0, colour: 0x6b5138, solid: false },
      { name: 'loft-post', at: [-1.98, -5.4], w: 0.16, h: 2.17, d: 0.16, colour: 0x3b2d20 },
      { name: 'loft-post', at: [-1.98, -2.6], w: 0.16, h: 2.17, d: 0.16, colour: 0x3b2d20 },
      { name: 'loft-post', at: [-1.98, 0.4], w: 0.16, h: 2.17, d: 0.16, colour: 0x3b2d20 },
      { name: 'loft-rail', at: [-1.98, -2.5], y: 2.35, w: 0.1, h: 0.9, d: 7.0, colour: 0x3b2d20, solid: false },
      { name: 'loft-rail', at: [-3.2, 0.95], y: 2.35, w: 2.6, h: 0.9, d: 0.1, colour: 0x3b2d20, solid: false },
    ],
    stairs: [
      { from: [-3.3, 3.4], to: [-3.3, 1.2], w: 1.1, run: 0.3, rise: 2.35, steps: 8, colour: 0x46362a },
    ],
    props: [
      // 5.30 wide x 3.21 deep once corrected, so it is centred at x 0.85 to clear
      // the loft posts at x -1.98, and pulled to z -4.3 so its back edge stops
      // 0.1m short of the z- wall instead of standing through it.
      { model: 'inn-bar', at: [0.85, -4.3], rot: 0 },

      { model: 'inn-table', at: [1.2, -1.6], rot: 0 },
      { model: 'inn-table', at: [2.4, 1.6], rot: 0.35 },
      { model: 'inn-table', at: [-0.8, 2.7], rot: -0.3 },
      { model: 'inn-table', at: [1.6, 4.5], rot: 0.2 },

      { model: 'stump-chair', at: [-0.2, -1.6], rot: 1.5708 },
      { model: 'stump-chair', at: [2.6, -1.6], rot: -1.5708 },
      { model: 'stump-chair', at: [0.8, 1.4], rot: 1.4 },
      { model: 'stump-chair', at: [4.0, 1.9], rot: -1.6 },
      { model: 'stump-chair', at: [-0.8, 1.25], rot: 3.14 },
      { model: 'stump-chair', at: [0.9, 2.9], rot: -1.5 },
      { model: 'stump-chair', at: [0.1, 4.4], rot: 1.5 },
      { model: 'stump-chair', at: [3.1, 4.6], rot: -1.5 },

      // All four barrels moved to the west wall under the loft: the corrected bar
      // now occupies x -1.8..3.5 by z -5.9..-2.7, which is where they used to
      // stand. Under-loft is the better place for them anyway — that is the store
      // nook, and it keeps them behind the counter rather than in the room.
      // A barrel turned 30 degrees measures 1.04m across its diagonal, so its
      // centre sits 0.58m off the wall, not its 0.39m radius.
      { model: 'barrel', at: [-3.92, -5.4], rot: 0.3 },
      { model: 'barrel', at: [-3.92, -4.3], rot: 1.1 },
      { model: 'barrel', at: [-3.92, -3.2], rot: 0.5 },
      { model: 'barrel', at: [-3.92, -2.1], rot: 2.2 },

      // Loft: two beds, a tub and a strongbox in the gap between the beds.
      { model: 'bed', at: [-3.5, -4.95], rot: 1.5708, on: 2.35 },
      { model: 'bed', at: [-3.5, -1.75], rot: 1.5708, on: 2.35 },
      { model: 'bathtub', at: [-3.4, 0.15], rot: 1.5708, on: 2.35 },
      { model: 'chest-overgrown', at: [-2.6, -3.35], rot: 0.15, on: 2.35 },

      { model: 'chest-plain', at: [3.85, 3.4], rot: 0.3 },
      // A `vase` and a `decor-carving` used to stand here. Both names undersold
      // what the meshes are: the first is an Attic Greek black-figure amphora, the
      // second a Moorish brass tray table. Neither belongs in a fishing village's
      // tavern, where they read as imports nobody in Havnstad could have owned.
      // Left empty rather than back-filled — the room is already densely dressed.

      { model: 'goblet-gold', at: [0.7, -1.4], rot: 0.4, on: 0.70 },
      { model: 'chalice-vine', at: [2.0, 1.9], rot: 1.1, on: 0.70 },

      // On the bar top, which is 1.10m now the plinth is gone.
      { model: 'candelabra', at: [2.6, -4.6], rot: 0.2, on: 1.10, light: true },
      { model: 'candelabra', at: [1.2, -1.6], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [2.4, 1.6], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [-2.2, -2.0], rot: 0, on: 2.35, light: true },
    ],
  },

  // ===================================================== Kvitsalen (hall)
  // Long, high and cold. Fewer props than the inn but each one is bigger, and
  // the sight line runs 20m to the throne.
  kvitsalen: {
    id: 'kvitsalen',
    name: 'Kvitsalen',
    kind: 'hall',
    building: 'greenhollow-guildhall',
    door: { off: [0, 7.2], yaw: 0 },
    w: 10, d: 20, h: 6.5,
    wallColour: 0xa8a49c,           // cold limewash, not the inn's warm daub
    fogColour: 0x0e1014,
    keyColour: 0xffe0bb,
    hemiSky: 0x3e4450,
    hemiGround: 0x14161a,
    occupants: ['ember'],
    beamGap: 1.6,
    windows: [
      { wall: 'x-', at: -5.0, w: 1.0, h: 2.2, y: 3.9 },
      { wall: 'x-', at: 0.0, w: 1.0, h: 2.2, y: 3.9 },
      { wall: 'x+', at: -5.0, w: 1.0, h: 2.2, y: 3.9 },
      { wall: 'x+', at: 0.0, w: 1.0, h: 2.2, y: 3.9 },
    ],
    banners: [
      { wall: 'x-', at: -6.5, w: 1.3, h: 3.8, top: 5.8, colour: 0x4d5f78 },
      { wall: 'x-', at: -2.0, w: 1.3, h: 3.8, top: 5.8, colour: 0x6a5064 },
      { wall: 'x-', at: 2.5, w: 1.3, h: 3.8, top: 5.8, colour: 0x4d5f78 },
      { wall: 'x+', at: -6.5, w: 1.3, h: 3.8, top: 5.8, colour: 0x6a5064 },
      { wall: 'x+', at: -2.0, w: 1.3, h: 3.8, top: 5.8, colour: 0x4d5f78 },
      { wall: 'x+', at: 2.5, w: 1.3, h: 3.8, top: 5.8, colour: 0x6a5064 },
      { wall: 'z-', at: 0, w: 2.0, h: 4.4, top: 6.0, colour: 0x5a4a32 },
    ],
    blocks: [
      { name: 'dais', at: [0, -8.4], w: 4.0, h: 0.45, d: 3.0, colour: 0x6b675e, mat: 'stone', solid: false },
      { name: 'dais-step', at: [0, -6.6], w: 4.6, h: 0.22, d: 0.7, colour: 0x6b675e, mat: 'stone', solid: false },
    ],
    props: [
      { model: 'stone-throne', at: [0, -8.6], rot: 0, on: 0.45 },

      // Two long tables, each three inn-tables end to end along Z.
      { model: 'inn-table', at: [-2.6, -3.0], rot: 1.5708 },
      { model: 'inn-table', at: [-2.6, -1.1], rot: 1.5708 },
      { model: 'inn-table', at: [-2.6, 0.8], rot: 1.5708 },
      { model: 'inn-table', at: [2.6, -3.0], rot: 1.5708 },
      { model: 'inn-table', at: [2.6, -1.1], rot: 1.5708 },
      { model: 'inn-table', at: [2.6, 0.8], rot: 1.5708 },

      { model: 'stump-chair', at: [-4.0, -2.6], rot: 1.5708 },
      { model: 'stump-chair', at: [-4.0, -0.9], rot: 1.5708 },
      { model: 'stump-chair', at: [-4.0, 0.8], rot: 1.5708 },
      { model: 'stump-chair', at: [4.0, -2.6], rot: -1.5708 },
      { model: 'stump-chair', at: [4.0, -0.9], rot: -1.5708 },
      { model: 'stump-chair', at: [4.0, 0.8], rot: -1.5708 },

      // A 1.81m-square pillar turned 45 degrees spans 2.56m, so 3.6 is the
      // furthest out any of the four can stand regardless of its rotation.
      { model: 'pillar-crumbling', at: [-3.6, -5.5], rot: 0.2 },
      { model: 'pillar-crumbling', at: [3.6, -5.5], rot: -0.4 },
      { model: 'pillar-crumbling', at: [-3.6, 3.5], rot: 0.9 },
      { model: 'pillar-crumbling', at: [3.6, 3.5], rot: 1.4 },

      // `treasure` stood in the left-hand slot. It is not a chest — it is a 3m
      // mossy cave mouth sitting on its own oval of grass and dirt, so the hall
      // had a piece of hillside indoors beside the throne. A real chest instead.
      { model: 'chest-vine', at: [-3.4, -7.6], rot: 0.5 },
      { model: 'chest-iron', at: [3.4, -7.6], rot: -0.2 },

      // `decor-carving` is a low brass tray table, not a relief, so these two
      // stand on the dais floor flanking the throne rather than being read as
      // wall pieces. 0.45 is the dais top, which is the floor they stand on.
      { model: 'decor-carving', at: [-1.4, -7.2], rot: 0, on: 0.45 },
      { model: 'decor-carving', at: [1.4, -7.2], rot: 0, on: 0.45 },

      { model: 'goblet-gold', at: [-2.6, -2.4], rot: 0.3, on: 0.70 },
      { model: 'goblet-gold', at: [2.6, 0.2], rot: 1.9, on: 0.70 },
      { model: 'chalice-vine', at: [-2.6, 0.4], rot: 0.8, on: 0.70 },
      { model: 'chalice-vine', at: [2.6, -2.8], rot: 2.4, on: 0.70 },

      { model: 'candelabra', at: [-2.6, -2.0], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [2.6, -2.0], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [-2.6, 1.2], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [2.6, 1.2], rot: 0, on: 0.70, light: true },
      // The ceiling spot reaches maybe eight metres of a twenty-metre hall, so
      // without these the throne — the one thing the room is pointed at — sits
      // in the dark. Cooler and longer-reaching than the table candles, so the
      // dais reads formal rather than cosy.
      { model: 'candelabra', at: [-1.6, -8.6], rot: 0, on: 0.45, light: true, lightColour: 0xffc98a, lightIntensity: 17, lightRange: 12 },
      { model: 'candelabra', at: [1.6, -8.6], rot: 0, on: 0.45, light: true, lightColour: 0xffc98a, lightIntensity: 17, lightRange: 12 },
    ],
  },

  // ================================================ Mildrid's (apothecary)
  // Cramped and cluttered: shelves on two walls, a counter across the middle,
  // and barely two metres of floor to stand in.
  apotekaren: {
    id: 'apotekaren',
    name: "Mildrid's",
    kind: 'shop',
    building: 'mildrid-shop',
    door: { off: [0, 5.4], yaw: 0 },
    w: 5, d: 6.5, h: 2.7,
    wallColour: 0xc2ab8a,
    // A downward key in a room this shallow leaves every vertical face black,
    // and a shop is read off its counter front. Lift the fill rather than add a
    // light — the point-light count is fixed.
    hemiSky: 0x5a4a3a,
    hemiGround: 0x2a2018,
    occupants: ['mildrid'],
    beamGap: 0.95,
    windows: [
      { wall: 'x+', at: 1.4, w: 0.7, h: 0.9, y: 1.6 },
      { wall: 'z+', at: -1.6, w: 0.6, h: 0.8, y: 1.6 },
    ],
    blocks: [
      // West-wall shelving, three tiers.
      { name: 'shelf', at: [-2.225, -1.125], y: 0.55, w: 0.55, h: 0.06, d: 4.25, colour: 0x6b5138, solid: false },
      { name: 'shelf', at: [-2.225, -1.125], y: 1.15, w: 0.55, h: 0.06, d: 4.25, colour: 0x6b5138, solid: false },
      { name: 'shelf', at: [-2.225, -1.125], y: 1.75, w: 0.55, h: 0.06, d: 4.25, colour: 0x6b5138, solid: false },
      { name: 'shelf-end', at: [-2.225, -3.22], w: 0.55, h: 2.1, d: 0.06, colour: 0x3b2d20, solid: false },
      { name: 'shelf-end', at: [-2.225, 0.97], w: 0.55, h: 2.1, d: 0.06, colour: 0x3b2d20, solid: false },
      // Back-wall shelving.
      { name: 'shelf', at: [0.275, -2.975], y: 0.55, w: 4.45, h: 0.06, d: 0.55, colour: 0x6b5138, solid: false },
      { name: 'shelf', at: [0.275, -2.975], y: 1.15, w: 4.45, h: 0.06, d: 0.55, colour: 0x6b5138, solid: false },
      { name: 'shelf', at: [0.275, -2.975], y: 1.75, w: 4.45, h: 0.06, d: 0.55, colour: 0x6b5138, solid: false },
      // Counter.
      { name: 'counter', at: [0.9, -0.2], w: 2.6, h: 0.95, d: 0.8, colour: 0x6b5138 },
    ],
    props: [
      // Turned along the shelf wall, and clear of the entry pose at (0, 1.85) —
      // there is barely two metres of standing floor in here.
      { model: 'inn-table', at: [-1.2, 1.6], rot: 1.5708 },

      // All four barrels line the east wall. A barrel's diagonal is 1.07m, so
      // its centre stands 0.53m off the wall whatever its rotation.
      { model: 'barrel', at: [1.95, -2.3], rot: 0.4 },
      { model: 'barrel', at: [1.95, -1.4], rot: 1.7 },
      { model: 'barrel', at: [1.95, 1.4], rot: 0.9 },
      { model: 'barrel', at: [1.95, 2.6], rot: 2.5 },

      { model: 'chest-vine', at: [-1.0, -2.2], rot: 0.25 },

      // The shelf tiers are 0.60m apart and this amphora is 0.70m tall, so on a
      // shelf it grew straight through the one above. It is a floor-standing
      // storage jar anyway; it goes at the end of the shelf run, clear of the
      // table's footprint. Its Attic styling passes here — this is the one room
      // in Havnstad whose owner would plausibly have an imported jar.
      { model: 'vase', at: [-1.7, 0.5], rot: 0 },
      { model: 'vase', at: [0.4, -0.2], rot: 1.4, on: 0.95 },
      { model: 'chalice-vine', at: [-2.24, 0.2], rot: 0.7, on: 1.81 },
      { model: 'chalice-vine', at: [-2.24, -2.2], rot: 2.1, on: 0.61 },
      { model: 'goblet-gold', at: [-0.1, -0.2], rot: 0.5, on: 0.95 },
      // A `decor-carving` sat on the counter here, on the assumption the name
      // meant a small relief. It is a 0.80m brass tray table on three legs — a
      // piece of floor furniture — so it was a table standing on a counter. There
      // is no floor space for it in a room this size, so it is simply gone.

      { model: 'plant-succulent', at: [-2.24, -2.6], rot: 0, on: 1.21 },
      { model: 'plant-succulent', at: [-2.24, 0.5], rot: 0, on: 0.61 },
      { model: 'plant-succulent', at: [1.0, -2.97], rot: 0, on: 1.21 },

      { model: 'candelabra', at: [-0.3, 0.05], rot: 0, on: 0.95, light: true },
      { model: 'candelabra', at: [-2.24, -0.6], rot: 0, on: 1.81, light: true },
      // A floor stand by the door. The counter candle sits above and behind the
      // counter's front face, so that face — the first thing a customer looks
      // at — receives nothing from it. This rakes it from the doorway side.
      { model: 'candelabra', at: [1.0, 2.2], rot: 0.3, light: true, lightIntensity: 9, lightRange: 6 },
    ],
  },

  // ================================================== Domicile (every house)
  // The one cottage room the whole village lives in, reused by every dwelling
  // and farm door. Hearth, two beds, a table — the interior of a household
  // that works outdoors all day.
  domicile: {
    id: 'domicile',
    name: 'Hjemmet',
    kind: 'cottage',
    door: { off: [0, 2.6], yaw: 0 },
    w: 6.5, d: 8, h: 2.8,
    wallColour: 0xb0997c,
    occupants: [],
    hearth: { at: [2.82, -1.4], facing: -Math.PI / 2, w: 1.5, d: 0.7, h: 1.15 },
    windows: [
      { wall: 'x-', at: 0.6, w: 0.8, h: 0.9, y: 1.55 },
      { wall: 'z+', at: -1.9, w: 0.7, h: 0.9, y: 1.55 },
    ],
    props: [
      { model: 'bed', at: [-2.35, -2.9], rot: 1.5708 },
      { model: 'bed', at: [-2.35, -0.6], rot: 1.5708 },
      { model: 'inn-table', at: [0.6, 0.9], rot: 0.2 },
      { model: 'stump-chair', at: [-0.5, 0.9], rot: 1.6 },
      { model: 'stump-chair', at: [1.7, 0.7], rot: -1.4 },
      { model: 'chest-plain', at: [2.6, 2.6], rot: -0.4 },
      { model: 'barrel', at: [-2.7, 2.9], rot: 0.8 },
      { model: 'cabinet', at: [0.9, -3.55], rot: 0 },
      { model: 'goblet-gold', at: [0.6, 0.9], rot: 0.9, on: 0.70 },
      { model: 'candelabra', at: [0.6, 0.9], rot: 0, on: 0.70, light: true },
      { model: 'candelabra', at: [-2.6, 1.4], rot: 0.4, light: true, lightIntensity: 8, lightRange: 5 },
    ],
  },

  // ================================================ The Red Temple (wildlands)
  // Behind the red door. Cold stone, one aisle, and the stone-singers' seat at
  // the far end. Nothing here is cosy; the candles burn without anyone to
  // tend them, which is the point.
  'dark-temple': {
    id: 'dark-temple',
    name: 'The Red Temple',
    kind: 'hall',
    walls: 'stone',                 // the one masonry interior — never timber
    door: { off: [0, 6.8], yaw: 0 },
    w: 9, d: 16, h: 6.5,
    wallColour: 0x5a3d3a,           // red-stained stone
    fogColour: 0x120a0c,
    keyColour: 0xff6a4a,            // the wrong-red light the fishermen see
    hemiSky: 0x33202a,
    hemiGround: 0x0e0a0c,
    occupants: [],
    beamGap: 2.0,
    windows: [
      { wall: 'x-', at: -4.0, w: 0.7, h: 2.0, y: 3.8 },
      { wall: 'x+', at: -4.0, w: 0.7, h: 2.0, y: 3.8 },
    ],
    blocks: [
      // The dais the throne stands on, and an altar slab mid-aisle.
      { name: 'dais', at: [0, -6.6], y: 0, w: 5.4, h: 0.45, d: 2.6, colour: 0x3c2826 },
      { name: 'altar', at: [0, -2.2], w: 1.6, h: 1.0, d: 0.9, colour: 0x2e1f1e },
    ],
    props: [
      { model: 'stone-throne', at: [0, -7.0], rot: 0, on: 0.45 },
      { model: 'sentinel-statue', at: [-3.4, -5.6], rot: 0.5 },
      { model: 'sentinel-statue', at: [3.4, -5.6], rot: -0.5 },
      { model: 'pillar-stone', at: [-3.1, -0.4], rot: 0.2 },
      { model: 'pillar-stone', at: [3.1, -0.4], rot: 1.3 },
      { model: 'pillar-crumbling', at: [-3.1, 3.6], rot: 2.1 },
      { model: 'pillar-stone', at: [3.1, 3.6], rot: 0.8 },
      { model: 'treasure', at: [2.6, -6.9], rot: 0.7, on: 0.45 },
      { model: 'mask-owl', at: [0, -2.2], rot: 0, on: 1.0 },
      { model: 'chest-iron', at: [-2.6, -6.8], rot: 0.3, on: 0.45 },
      { model: 'candelabra', at: [-1.4, -2.2], rot: 0.2, light: true, lightIntensity: 10, lightRange: 7 },
      { model: 'candelabra', at: [1.4, -2.2], rot: 1.1, light: true, lightIntensity: 10, lightRange: 7 },
      { model: 'candelabra', at: [-2.4, -5.9], rot: 0, on: 0.45, light: true },
      { model: 'candelabra', at: [2.4, 1.8], rot: 0.5, light: true },
    ],
  },
};

// ------------------------------------------------------------------ class

export class Interior {
  /**
   * @param {object} def   an INTERIORS entry
   * @param {object} stage the Stage that owns the renderer and the day cycle
   * @param {object} [world] the exterior World, for door anchors and occupants
   */
  constructor(def, stage, world = null) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.stage = stage;
    this.world = world;

    this.scene = new THREE.Scene();
    // Near-black and warm, so distance falls to shadow rather than to haze. At
    // 0.030 the falloff is ~35% at 14m: invisible in a 5m shop, and exactly what
    // stops the far end of the 20m hall reading as a flat lit wall.
    this.scene.fog = new THREE.FogExp2(def.fogColour ?? 0x120d08, def.fogDensity ?? 0.030);

    this.root = new THREE.Group();
    this.root.name = `interior:${def.id}`;
    this.scene.add(this.root);

    this.inner = { w: def.w, d: def.d, h: def.height ?? def.h ?? HEIGHT_BY_KIND[def.kind] ?? 2.8 };
    this.colliders = [];
    this.npcs = [];
    this.lootables = [];
    this.props = [];
    this.active = false;
    this.built = false;

    this.maxCameraDistance = def.maxCameraDistance ?? 2.4;
    this.ceiling = this.inner.h - 0.25;
    this.allowJump = true;

    // World duck-type, so NPC needs no branch: an NPC with no POI drops into its
    // wander behaviour, which is right for someone standing in their own inn.
    this.pois = new Map();

    this._t = 0;
    this._flickers = [];
    this._panes = [];
    this._saved = null;
    this._tmpBox = new THREE.Box3();
  }

  // ------------------------------------------------------------ geometry

  /** Idempotent. Builds the shell, dresses it and wires the light rig. */
  async build() {
    if (this.built) return this;
    this.built = true;

    const tex = this.stage?.terrain?.textures ?? await loadInteriorTextures();
    const def = this.def;

    const room = buildRoom({
      w: this.inner.w, d: this.inner.d, h: this.inner.h,
      wallColour: def.wallColour,
      windows: def.windows,
      blocks: def.blocks,
      stairs: def.stairs,
      banners: def.banners,
      beamGap: def.beamGap,
    }, tex);

    this.shell = room;
    this.doorway = room.doorway;
    this.colliders.push(...room.colliders);
    this._panes = room.surfaces.panes;
    this.root.add(room.group);

    this._buildLights();

    if (def.hearth) {
      const hearth = buildHearth(def.hearth, tex, this.inner);
      this.root.add(hearth.group);
      this._hearth = hearth;
      this.colliders.push({ x: def.hearth.at[0], z: def.hearth.at[1], r: (def.hearth.w ?? 1.7) * 0.5 });
      this._claimLight(hearth.lightAt, 0xff8a3c, 30, 13, { amp: 2 });
    }

    await this._dress();
    return this;
  }

  /** Warm the asset cache. Safe to call repeatedly; the cache does the rest. */
  async preload() {
    const models = new Set((this.def.props ?? []).map((p) => p.model));
    await Promise.all([...models].map((m) => assets.prop(m).catch(() => null)));
  }

  async _dress() {
    for (const p of this.def.props ?? []) {
      let inst;
      try { inst = await assets.prop(p.model); } catch { console.warn(`interior prop missing: ${p.model}`); continue; }

      const cat = PROPS[p.model];
      if (!cat) { console.warn(`prop not catalogued: ${p.model}`); continue; }

      const node = inst.root;
      const base = p.on ?? 0;

      // The catalog's hand-authored scale, always. See the file header for why
      // the outdoor measured-height path is wrong indoors.
      node.scale.setScalar(cat.scale * (p.scaleMul ?? 1));
      node.rotation.y = p.rot ?? 0;
      node.position.set(p.at[0], base, p.at[1]);

      // Meshy centres every prop in its normalisation cube, so placing the node
      // at floor level buries the bottom half. Measure the scaled bounds and
      // lift until the base sits on the surface.
      const box = measure(node);
      if (Number.isFinite(box.min.y)) node.position.y += base - box.min.y;

      node.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });

      this.root.add(node);
      measure(node, box);
      this.props.push({ def: p, node, box: box.clone() });

      // Anything tall enough to walk into blocks movement; clutter does not.
      const h = box.max.y - box.min.y;
      if (h > 0.5 && base < 0.5) {
        this.colliders.push({
          x: p.at[0], z: p.at[1],
          r: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42,
        });
      }

      if (p.light) {
        // Candles sit at the top of the prop, not at its base.
        this._claimLight(
          new THREE.Vector3(p.at[0], box.max.y + 0.05, p.at[1]),
          p.lightColour ?? 0xffb46b, p.lightIntensity ?? 14, p.lightRange ?? 9, {},
        );
      }
      if (p.loot) this.lootables.push({ id: `${this.id}:${p.loot}`, table: p.loot, node });
    }
  }

  // -------------------------------------------------------------- lights

  _buildLights() {
    const h = this.inner.h;

    // Key. The only shadow caster in the room — a single 2D depth pass, which is
    // cheaper than the exterior sun's 2048 ortho over a million-vertex terrain.
    // Six competing candle shadows would read as chaos, not as candlelight.
    this.spot = new THREE.SpotLight(this.def.keyColour ?? 0xffd7a8, 26, h * 3, Math.PI / 3.4, 0.62, 2);
    this.spot.position.set(0, h - 0.15, 0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.4;
    this.spot.shadow.camera.far = h * 2.5;
    this.spot.shadow.bias = -0.0009;
    // Far less than the outdoor 0.08 — the near plane here is 0.4m, not 1m.
    this.spot.shadow.normalBias = 0.03;
    this.spot.target.position.set(0, 0, 0);
    this.root.add(this.spot);
    this.root.add(this.spot.target);

    // Fill. Deliberately warm-brown, not the outdoor 0xa8c8ff — this single
    // value is what makes the room read as enclosed. No AmbientLight: it has no
    // direction, flattens every surface equally, and is exactly what makes a
    // generated box look like a generated box.
    this.hemi = new THREE.HemisphereLight(
      this.def.hemiSky ?? 0x4a4034, this.def.hemiGround ?? 0x1a1512, 0.35);
    this.root.add(this.hemi);

    // Window. The only cool light in the room, which is what makes the
    // candlelight read as candlelight. Driven from the day cycle so interiors
    // darken at night.
    this.window = new THREE.DirectionalLight(0xbcd0e8, 0.4);
    this.window.position.set(-0.5, 0.8, 0.35).normalize().multiplyScalar(20);
    this.window.castShadow = false;
    this.window.target.position.set(0, 1, 0);
    this.root.add(this.window);
    this.root.add(this.window.target);

    // A fixed six. Unused slots keep intensity 0 and stay visible — WebGLLights
    // skips invisible lights when counting, so hiding one changes
    // NUM_POINT_LIGHTS and recompiles every material in the scene.
    this.points = [];
    for (let i = 0; i < MAX_POINTS; i++) {
      const l = new THREE.PointLight(0xffb46b, 0, 9, 2);
      l.castShadow = false;
      l.visible = true;
      this.root.add(l);
      this.points.push(l);
    }
    this._pointsUsed = 0;
  }

  _claimLight(at, colour, intensity, distance, { amp = 1 } = {}) {
    if (this._pointsUsed >= MAX_POINTS) {
      console.warn(`${this.id}: out of point-light slots, dropping one`);
      return null;
    }
    const l = this.points[this._pointsUsed++];
    l.color.set(colour);
    l.intensity = intensity;
    l.distance = distance;
    l.position.copy(at);
    this._flickers.push({ light: l, base: intensity, home: at.clone(), amp, seed: Math.random() * 10 });
    return l;
  }

  // ------------------------------------------------------------ per frame

  /** Flicker, flame, window light. Call after stage.update(). */
  update(dt, stage = this.stage) {
    this._t += dt;
    const t = this._t;

    for (const f of this._flickers) {
      // Two out-of-phase sines beat against each other. A single sine reads as a
      // pulse, and Math.random() reads as a fault in the renderer.
      const wob = 0.06 * f.amp * Math.sin(t * 7.3 + f.seed)
                + 0.04 * f.amp * Math.sin(t * 11.9 + f.seed * 2.1);
      f.light.intensity = f.base * (0.90 + wob);
      // Barely perceptible on the light, but it makes the shadow edges breathe,
      // which is where the eye actually reads flame.
      f.light.position.x = f.home.x + Math.sin(t * 9.1 + f.seed) * 0.015;
      f.light.position.z = f.home.z + Math.cos(t * 6.7 + f.seed) * 0.015;
    }

    if (this._hearth) {
      const s = 0.9 + 0.16 * Math.sin(t * 7.9) + 0.1 * Math.sin(t * 12.7 + 1.3);
      for (const q of this._hearth.flames) q.scale.set(1, s, 1);
    }

    const day = stage?.day ?? this._dayFrom(stage);
    const dusk = stage?.dusk ?? 0;
    if (this.window) {
      this.window.intensity = 0.10 + day * 0.45;
      this.window.color.setRGB(0.74, 0.82, 0.91).lerp(WARM_DUSK, dusk);
    }
    for (const p of this._panes) p.material.color.setRGB(0.86 * day + 0.05, 0.91 * day + 0.05, 0.95 * day + 0.07);

    if (this.active) this._applyStageOverrides(stage);
  }

  /** Stage does not publish `day` yet; recover it from the sun elevation. */
  _dayFrom(stage) {
    const e = stage?.sunPosition?.y ?? 0.6;
    return THREE.MathUtils.clamp(e * 3.2, 0, 1);
  }

  // ---------------------------------------------------- ground contract

  height() { return 0; }
  slope() { return 0; }
  poi() { return undefined; }

  /** Duck-typed for Player's valley clamp, which must never bite indoors. */
  get size() { return 1e5; }

  /** Room box plus furniture cylinders. Mutates pos.x / pos.z. */
  clampPosition(pos, radius = 0.42) {
    const m = radius + 0.06;
    const hw = this.inner.w / 2 - m, hd = this.inner.d / 2 - m;
    pos.x = THREE.MathUtils.clamp(pos.x, -hw, hw);
    pos.z = THREE.MathUtils.clamp(pos.z, -hd, hd);
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

  /** Alias, so NPC's `world.resolveCollision` call needs no branch. */
  resolveCollision(pos, radius = 0.42) { return this.clampPosition(pos, radius); }

  /**
   * Keep the camera inside the walls.
   *
   * A ray shorten, not an axis clamp — clamping each axis independently slides
   * the camera along the wall and swings the view wildly at corners.
   */
  clampCamera(target, desired) {
    const m = 0.30;
    const hx = this.inner.w / 2 - m, hz = this.inner.d / 2 - m;
    const dx = desired.x - target.x, dz = desired.z - target.z, dy = desired.y - target.y;
    let t = 1;
    if (dx > 1e-5) t = Math.min(t, (hx - target.x) / dx);
    if (dx < -1e-5) t = Math.min(t, (-hx - target.x) / dx);
    if (dz > 1e-5) t = Math.min(t, (hz - target.z) / dz);
    if (dz < -1e-5) t = Math.min(t, (-hz - target.z) / dz);
    // The floor stops the camera collapsing into the character's skull; the view
    // goes near-first-person in a corner, which is the expected behaviour.
    t = THREE.MathUtils.clamp(t, 0.18, 1);
    desired.set(target.x + dx * t, target.y + dy * t, target.z + dz * t);
    desired.y = Math.min(Math.max(desired.y, 0.5), this.inner.h - 0.35);
    return desired;
  }

  // ------------------------------------------------------- transitions

  /**
   * Take the world. Fades out, swaps under full black, fades back in.
   *
   * @param {object} player  the Player; its `terrain` is repointed at this room
   * @param {object} [opts]  { anchor } exterior door anchor, for the return pose
   */
  async enter(player, opts = {}) {
    if (this.active) return this;
    await fadeTo(true, opts.fadeMs ?? 350, opts.ui);
    const held = Date.now();

    await this.build();

    this.returnPose = opts.returnPose ?? this._returnPoseFrom(opts.anchor, player);
    this._takeStage(player, opts);

    // Compile under the black, or the first indoor frame stalls for a few
    // hundred milliseconds recompiling the hero's materials against a different
    // light-count signature.
    const r = this.stage?.renderer;
    if (r?.compileAsync) { try { await r.compileAsync(this._hostScene, this.stage.camera); } catch { /* not fatal */ } }
    this.stage?.render?.();

    // A minimum hold, so a warm interior does not blink — without it the
    // transition reads as a glitch rather than as a door.
    const wait = (opts.holdMs ?? 250) - (Date.now() - held);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));

    this.active = true;
    // Control returns as the image appears, not after it.
    fadeTo(false, opts.fadeMs ?? 350, opts.ui);
    return this;
  }

  /** Give it back. The interior stays built and cached for the session. */
  async leave(player, opts = {}) {
    if (!this.active) return;
    await fadeTo(true, opts.fadeMs ?? 350, opts.ui);
    const held = Date.now();

    this._giveStage(player);
    this.active = false;

    const r = this.stage?.renderer;
    if (r?.compileAsync && this._exteriorScene) {
      try { await r.compileAsync(this._exteriorScene, this.stage.camera); } catch { /* not fatal */ }
    }
    this.stage?.render?.();

    const wait = (opts.holdMs ?? 250) - (Date.now() - held);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));

    fadeTo(false, opts.fadeMs ?? 350, opts.ui);
  }

  /**
   * Where the player lands on the way out.
   *
   * Captured from the authored door anchor, not from wherever they happened to
   * be standing — entering a door from an awkward angle must not spit you out
   * somewhere different from where you went in.
   */
  /**
   * Nudge the exit point off water and off cut banks. Sweeps outward from the
   * door, trying the intended exit direction first and fanning to the sides,
   * and returns the nearest spot that is dry and walkable.
   */
  _safeExit(terrain, pose) {
    if (!pose || !terrain?.isWater) return pose;
    const bad = (x, z) => terrain.isWater(x, z) || terrain.slope(x, z) > 0.6;
    if (!bad(pose.x, pose.z)) return pose;
    const dirs = [];
    for (let d = 0; d < 16; d++) {
      const k = Math.ceil(d / 2) * (d % 2 ? 1 : -1);      // 0, +1, -1, +2, -2, …
      dirs.push(pose.yaw + k * (Math.PI / 8));
    }
    for (let r = 1.4; r <= 14; r += 1.2) {
      for (const ang of dirs) {
        const x = pose.x + Math.sin(ang) * r;
        const z = pose.z + Math.cos(ang) * r;
        if (!bad(x, z)) return { x, z, yaw: pose.yaw };
      }
    }
    return pose;
  }

  _returnPoseFrom(anchor, player) {
    if (!anchor) {
      const p = player?.position;
      return p ? { x: p.x, z: p.z, yaw: player.yaw ?? 0 } : { x: 0, z: 0, yaw: 0 };
    }
    return {
      x: anchor.x + Math.sin(anchor.yaw) * 1.3,
      z: anchor.z + Math.cos(anchor.yaw) * 1.3,
      yaw: anchor.yaw + Math.PI,
    };
  }

  _takeStage(player, opts) {
    const stage = this.stage;
    this._exteriorScene = stage?.scene ?? null;

    // Two paths. If Stage has learnt about multiple scenes, render this one.
    // Otherwise adopt into the exterior scene and suppress the outdoor rig every
    // frame — the exterior sun, hemisphere and fog are rewritten by stage.update
    // on every tick, so a one-shot mute would be undone immediately.
    this._twoScene = typeof stage?.setActiveScene === 'function';
    this._hostScene = this._twoScene ? this.scene : stage.scene;

    this._saved = {
      terrain: player?.terrain ?? null,
      yaw: player?.yaw ?? 0,
      pitch: player?.pitch ?? 0.22,
      targetDistance: player?.targetDistance ?? 4.2,
      hidden: [],
      sunShadow: stage?.sun?.castShadow ?? true,
      exposure: stage?.renderer?.toneMappingExposure ?? 1,
      fogColour: stage?.scene?.fog?.color?.clone?.() ?? null,
      fogDensity: stage?.scene?.fog?.density ?? null,
    };

    if (this._twoScene) {
      stage.setActiveScene(this.scene);
      this.scene.add(this.root);
      if (player?.char?.root) this.scene.add(player.char.root);
      for (const npc of this.npcs) if (npc.char?.root) this.scene.add(npc.char.root);
    } else {
      // Hide everything outdoors except the cast. Lights are left alone; their
      // intensities are overridden per frame instead, so the material light-count
      // signature never changes and nothing recompiles.
      const keep = new Set([this.root]);
      if (player?.char?.root) keep.add(player.char.root);
      for (const npc of this.npcs) if (npc.char?.root) keep.add(npc.char.root);
      for (const child of stage.scene.children) {
        if (keep.has(child) || child.isLight) continue;
        if (child.visible) { this._saved.hidden.push(child); child.visible = false; }
      }
      stage.scene.add(this.root);
    }

    if (stage?.sun) stage.sun.castShadow = false;   // the ortho pass is dead weight indoors

    // Entry pose. The doorway is always +Z, so this is a constant: camera
    // outside the door looking in, W walks into the room, body facing away.
    if (player) {
      player.terrain = this;
      const root = player.char?.root;
      if (root) {
        root.position.set(0, 0, this.inner.d / 2 - 1.4);
        root.rotation.y = Math.PI;
        root.userData.groundY = 0;
      }
      player.yaw = 0;
      // Flatter than the outdoor 0.22 — low ceilings make the default angle
      // stare at the beams.
      player.pitch = 0.14;
      player.targetDistance = Math.min(player.targetDistance, this.maxCameraDistance);
      player.distance = player.targetDistance;
      this._snapCamera(player);
    }

    for (const npc of this.npcs) { npc.terrain = this; npc.world = this; }

    this._applyStageOverrides(stage);
  }

  _giveStage(player) {
    const stage = this.stage;
    const saved = this._saved ?? {};

    if (this._twoScene) {
      stage.setActiveScene(this._exteriorScene);
      this.scene.add(this.root);
      if (player?.char?.root) this._exteriorScene.add(player.char.root);
      for (const npc of this.npcs) if (npc.char?.root) this._exteriorScene.add(npc.char.root);
    } else {
      this.scene.add(this.root);                 // out of the exterior scene
      for (const o of saved.hidden ?? []) o.visible = true;
      if (this._sky !== undefined) this._sky = undefined;
    }

    if (stage?.sun) stage.sun.castShadow = saved.sunShadow ?? true;
    if (stage) stage.exposureOverride = null;    // update() resumes driving it

    // The exterior fog, sun, hemisphere and exposure are all rewritten by
    // stage.update on the next tick, so only the fog needs restoring here for
    // the single frame before that happens.
    if (stage?.scene?.fog && saved.fogColour) {
      stage.scene.fog.color.copy(saved.fogColour);
      stage.scene.fog.density = saved.fogDensity;
    }

    if (player) {
      player.terrain = saved.terrain;
      player.targetDistance = saved.targetDistance ?? 4.2;
      // The authored door-out point can land in the sea or on a cut bank for a
      // waterfront or hill-set building; nudge it to the nearest dry, walkable
      // ground before grounding so stepping outside never drops you underwater.
      const pose = this._safeExit(saved.terrain, this.returnPose);
      // spawnAt re-grounds against the terrain, so a retuned heightmap cannot
      // leave the player buried or falling.
      if (pose && player.spawnAt) player.spawnAt(pose.x, pose.z);
      // Camera behind the building looking out at the street, which is the right
      // shot on stepping outside — and it guarantees the camera is not inside
      // the wall just walked through.
      if (pose) player.yaw = pose.yaw;
      player.pitch = saved.pitch ?? 0.22;
      player.distance = player.targetDistance;
      this._snapCamera(player);
    }

    for (const npc of this.npcs) { npc.terrain = saved.terrain; npc.world = this.world; }
    this._saved = null;
  }

  /**
   * Without this the camera lerp flies across four kilometres over the first
   * second indoors.
   */
  _snapCamera(player) {
    const cam = player.camera ?? this.stage?.camera;
    const root = player.char?.root;
    if (!cam || !root) return;
    const target = new THREE.Vector3(root.position.x, root.position.y + 1.55, root.position.z);
    const cp = Math.cos(player.pitch);
    const desired = new THREE.Vector3(
      target.x + Math.sin(player.yaw) * cp * player.distance,
      target.y + Math.sin(player.pitch) * player.distance + 0.35,
      target.z + Math.cos(player.yaw) * cp * player.distance,
    );
    if (this.active || player.terrain === this) this.clampCamera(target, desired);
    cam.position.copy(desired);
    cam.lookAt(target);
  }

  /**
   * Hold the outdoor rig down.
   *
   * stage.update() rewrites the sun, hemisphere, fog and exposure every frame
   * from the day factor, so a one-shot mute in enter() would be undone on the
   * next tick — the interior has to reassert itself after it.
   *
   * Exposure applies on both paths: it is a renderer property, not a scene one,
   * so a second scene does not protect it. Left alone, the 0.55..1.10 daily
   * swing means entering a lit inn at 02:00 gives a black screen. The rest only
   * matters when the interior is sharing the exterior scene.
   */
  _applyStageOverrides(stage = this.stage) {
    if (!stage) return;
    // `exposureOverride` is the hook Stage will read once it learns about
    // interiors; writing the value directly is what actually holds it today.
    stage.exposureOverride = this.def.exposure ?? 1.0;
    if (stage.renderer) stage.renderer.toneMappingExposure = this.def.exposure ?? 1.0;
    if (this._twoScene) return;

    if (stage.sun) { stage.sun.intensity = 0; stage.sun.castShadow = false; }
    if (stage.moon) stage.moon.intensity = 0;
    if (stage.hemi) {
      stage.hemi.intensity = 0.35;
      stage.hemi.color.set(this.def.hemiSky ?? 0x4a4034);
      stage.hemi.groundColor.set(this.def.hemiGround ?? 0x1a1512);
    }
    if (stage.scene?.fog) {
      stage.scene.fog.color.set(this.def.fogColour ?? 0x120d08);
      stage.scene.fog.density = this.def.fogDensity ?? 0.030;
    }
  }

  /** Keep the player and the camera inside the room. Call after player.update. */
  confine(player) {
    if (!player) return;
    player.targetDistance = Math.min(player.targetDistance, this.maxCameraDistance);
    if (player.position) {
      this.clampPosition(player.position, 0.42);
      const root = player.char?.root;
      if (root) root.userData.groundY = 0;
      player.position.y = 0;
    }
    const cam = player.camera ?? this.stage?.camera;
    const root = player.char?.root;
    if (cam && root) {
      const target = new THREE.Vector3(root.position.x, root.position.y + 1.55, root.position.z);
      this.clampCamera(target, cam.position);
      cam.lookAt(target);
    }
  }

  // ------------------------------------------------------------ checking

  /**
   * Geometry audit: floating props, props through a wall, props inside each
   * other. Used by the preview page — cheaper to assert than to eyeball.
   *
   * @returns {Array<{ level, model, detail }>}
   */
  validate() {
    const issues = [];
    const hw = this.inner.w / 2, hd = this.inner.d / 2;

    for (const p of this.props) {
      const base = p.def.on ?? 0;
      const gap = p.box.min.y - base;
      if (Math.abs(gap) > 0.01) {
        issues.push({
          level: Math.abs(gap) > 0.05 ? 'error' : 'warn',
          model: p.def.model,
          detail: `base off its surface by ${(gap * 100).toFixed(1)}cm`,
        });
      }
      const out = [];
      if (p.box.min.x < -hw - 0.01) out.push(`x- by ${((-hw - p.box.min.x) * 100).toFixed(0)}cm`);
      if (p.box.max.x > hw + 0.01) out.push(`x+ by ${((p.box.max.x - hw) * 100).toFixed(0)}cm`);
      if (p.box.min.z < -hd - 0.01) out.push(`z- by ${((-hd - p.box.min.z) * 100).toFixed(0)}cm`);
      if (p.box.max.z > hd + 0.01) out.push(`z+ by ${((p.box.max.z - hd) * 100).toFixed(0)}cm`);
      if (p.box.max.y > this.inner.h + 0.01) out.push(`ceiling by ${((p.box.max.y - this.inner.h) * 100).toFixed(0)}cm`);
      if (out.length) issues.push({ level: 'error', model: p.def.model, detail: `through ${out.join(', ')}` });
    }

    // Pairwise intersection. Vertical overlap is required, so a goblet standing
    // on a table is not reported as intersecting it.
    for (let i = 0; i < this.props.length; i++) {
      for (let j = i + 1; j < this.props.length; j++) {
        const a = this.props[i], b = this.props[j];
        const ox = Math.min(a.box.max.x, b.box.max.x) - Math.max(a.box.min.x, b.box.min.x);
        const oz = Math.min(a.box.max.z, b.box.max.z) - Math.max(a.box.min.z, b.box.min.z);
        const oy = Math.min(a.box.max.y, b.box.max.y) - Math.max(a.box.min.y, b.box.min.y);
        if (ox > 0.03 && oz > 0.03 && oy > 0.03) {
          issues.push({
            level: 'warn',
            model: `${a.def.model} / ${b.def.model}`,
            detail: `overlap ${(ox * 100).toFixed(0)}x${(oz * 100).toFixed(0)}x${(oy * 100).toFixed(0)}cm`,
          });
        }
      }
    }
    return issues;
  }

  // ------------------------------------------------------------- teardown

  /**
   * Not called in normal play — interiors are cached for the session, and the
   * whole set costs under five megabytes because cloned props share geometry
   * and materials with the cache. This exists for hot reload.
   */
  dispose() {
    this.shell?.group.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.map?.dispose(); m.normalMap?.dispose(); m.dispose(); }
    });
    this.scene.clear();
    this.root.clear();
    this.props.length = 0;
    this.built = false;
  }
}

// -------------------------------------------------------------- the fade

let _fadeEl = null;

function fadeElement() {
  if (_fadeEl) return _fadeEl;
  _fadeEl = document.createElement('div');
  _fadeEl.className = 'interior-fade';
  Object.assign(_fadeEl.style, {
    position: 'fixed', inset: '0', background: '#000',
    opacity: '0', pointerEvents: 'none', zIndex: '90',
    transition: 'opacity 350ms ease',
  });
  document.body.appendChild(_fadeEl);
  return _fadeEl;
}

/**
 * Fade to or from black. Resolves when the transition has finished.
 *
 * Defers to `ui.fadeTo` when the UI grows one. The slack on the timer is
 * deliberate: resolving on `transitionend` is correct in principle and
 * unreliable in practice when the tab is throttled or the frame budget is
 * blown, which is precisely the moment this runs.
 */
export function fadeTo(black, ms = 350, ui = null) {
  if (ui?.fadeTo) return ui.fadeTo(black, ms);
  const el = fadeElement();
  el.style.transitionDuration = `${ms}ms`;
  // Force a reflow so a fade started in the same tick as creation still runs.
  void el.offsetWidth;
  el.style.opacity = black ? '1' : '0';
  return new Promise((res) => setTimeout(res, ms + 20));
}

/** Every interior, built lazily and cached for the session. */
export class InteriorSet {
  constructor(stage, world = null) {
    this.stage = stage;
    this.world = world;
    this.map = new Map();
  }

  get(id) {
    if (!this.map.has(id)) {
      const def = INTERIORS[id];
      if (!def) throw new Error(`no interior '${id}'`);
      this.map.set(id, new Interior(def, this.stage, this.world));
    }
    return this.map.get(id);
  }

  /** Warm every interior's props. A handful of megabytes, and it removes the
   *  network entirely from the transition. */
  async preloadAll() {
    await Promise.all(Object.keys(INTERIORS).map((id) => this.get(id).preload()));
  }
}
