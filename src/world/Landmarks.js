import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { PROPS, scaleFor } from '../data/catalog.js';

/**
 * The three wilderness points of interest, on the surveyed ground.
 *
 * Gravfeltet, Vardefjell and Seterdalen are each a different *kind* of place —
 * one buried, one vertical, one strange — and each sits on coordinates measured
 * off the Kartverket DTM rather than chosen by eye.
 *
 * Layout is split into a pure planning pass and a loading pass. `planLandmarks`
 * takes anything that answers height/slope and returns every position it intends
 * to use, with the elevation and slope it measured there; `build` then loads the
 * GLBs and puts them at exactly those coordinates. The split exists so the
 * placement rules can be run and asserted headlessly against the raw heightmap
 * (tools/survey/verify-landmarks.mjs) — otherwise the only way to know nothing
 * floats or stands in the sea is to look at it.
 */

// ------------------------------------------------------------------ surveyed

/**
 * Measured sites. See the survey notes in tools/survey/find-sites.mjs; these are
 * not adjustable by taste, they are where the landform actually supports them.
 */
export const SITES = {
  // All coordinates re-surveyed for the island tile (centre 382200,7323500 —
  // see tools/scout-islands.mjs + tools/survey/find-sites.mjs). The playable
  // cluster is one 137ha main island; the temple stands alone on a 35ha
  // wildlands island 1.8km west across open water.
  gravfeltet: {
    name: 'Gravfeltet',
    // The southern headland of the main island. The mound line runs back ENE
    // from this seaward anchor — the only bearing where all nine mounds stay
    // on dry, near-level heath (2m of variation over the 135m line; measured).
    anchor: [186, -1288],
    axisDeg: 250,
    count: 9,
    spacing: 15,
    openIndex: 3,          // the largest mound, and the one with a way in
  },
  vardefjell: {
    name: 'Vardefjell',
    // The archipelago's high point — 57m. Modest, but the tallest thing for a
    // mile of open water, which is what a beacon asks for.
    summit: [306, -1019],
    // The cart track climbs out of the town's shelf and arrives from the NNE.
    approachDeg: 213,
    // The Dijkstra route off the survey, town end first. Cairns mark the turns.
    route: [[595, -699], [575, -751], [523, -787], [471, -803], [419, -855], [399, -891]],
  },
  seterdalen: {
    name: 'Seterdalen',
    // The bowl NW of the summit: 8m floor with a 27m median rim, hidden from
    // the beacon. The platform is the flattest shelf on its west side.
    centre: [310, -867],
    platform: [220, -877],
    gullyMouth: [1, -950],
  },
  temple: {
    name: 'The Red Temple',
    // The wildlands island west across the sound — no road, no pier, no town.
    // The crossing is the journey.
    centre: [-991, 162],
    platform: [-995, 118],
    approachDeg: 90,       // face the water towards the main island
  },
};

// ------------------------------------------------------------------ helpers

/**
 * Deterministic PRNG. Scatter has to land in the same place on every load or
 * quest markers and NPC schedules would point at ground that moved.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compass bearing in degrees to a unit [x, z]. 0 = +z north, 90 = +x east. */
function bearingDir(deg) {
  const r = deg * Math.PI / 180;
  return [Math.sin(r), Math.cos(r)];
}

/**
 * The nearest ground near (x, z) that is dry, above the tide and gentle enough.
 *
 * Distance is weighted as heavily as slope, so a designed position is only
 * abandoned for meaningfully better ground rather than drifting to the flattest
 * spot in the search disc and dissolving the composition. Returns null when
 * there is nothing suitable, so callers drop the prop loudly instead of standing
 * it in the water.
 */
function settle(t, x, z, { maxSlope = 0.3, search = 14, minY = 1.4, samples = 64 } = {}) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < samples; i++) {
    const r = i === 0 ? 0 : Math.sqrt(i / samples) * search;
    const a = i * 2.399963229728653;                  // golden angle, even cover
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const y = t.height(px, pz);
    if (y < minY) continue;
    const s = t.slope(px, pz);
    if (s > maxSlope) continue;
    const score = s / maxSlope + r / Math.max(search, 1e-3);
    if (score < bestScore) {
      bestScore = score;
      best = { x: px, z: pz, y, slope: s, moved: r };
    }
  }
  return best;
}

// -------------------------------------------------------------------- plans

/**
 * GRAVFELTET — nine mounds on the sunset axis, on the seaward heath.
 *
 * The mounds are built procedurally: there is no barrow asset, and a barrow is
 * the one thing here that has to conform to the ground it sits on rather than
 * being a box dropped onto it.
 */
function planGravfeltet(t, out) {
  const site = SITES.gravfeltet;
  const rand = rng(0x6ea7f0);
  const [ax, az] = site.anchor;
  const [ux, uz] = bearingDir(site.axisDeg + 180);   // inland, along the axis
  const [vx, vz] = bearingDir(site.axisDeg + 90);    // across it

  // Station along the line, and offset across it, in metres.
  const at = (station, perp = 0) => [
    ax + ux * station * site.spacing + vx * perp,
    az + uz * station * site.spacing + vz * perp,
  ];

  const mouthDeg = site.axisDeg;                     // the way in faces the sea

  for (let i = 0; i < site.count; i++) {
    const [mx, mz] = at(i);
    // A short search keeps the mounds on the alignment; the line measures under
    // 0.06 slope end to end, so they barely move.
    const g = settle(t, mx, mz, { maxSlope: 0.14, search: 3 });
    if (!g) { out.rejected.push({ id: `mound-${i}`, x: mx, z: mz, why: 'no gentle dry ground' }); continue; }

    const open = i === site.openIndex;
    // Real grave fields are not uniform. The opened one is the largest, which is
    // why it is the one that got robbed and the one with a chamber under it.
    const radius = open ? 9.0 : 4.6 + rand() * 3.4;
    const height = open ? 2.6 : 1.0 + rand() * 1.1;

    out.mounds.push({
      id: `gravfeltet-mound-${i}`, poi: 'gravfeltet',
      x: g.x, z: g.z, y: g.y, slope: g.slope,
      radius, height,
      mouthDeg: open ? mouthDeg : null,
      seed: 0x100 + i,
    });
    out.anchors.push([`gravfeltet-mound-${i}`, { x: g.x, y: g.y + height, z: g.z }]);
  }

  const open = out.mounds.find((m) => m.mouthDeg !== null);
  if (open) {
    // The leaning arch over the slumped entrance. Its opening faces down the
    // alignment, so the doorway and the sunset are the same sightline.
    const [dx, dz] = bearingDir(mouthDeg);
    out.props.push(plan(t, {
      id: 'gravfeltet-barrow-mouth', poi: 'gravfeltet', model: 'archway-stone',
      x: open.x + dx * open.radius * 0.82, z: open.z + dz * open.radius * 0.82,
      rotDeg: mouthDeg, tiltZ: -0.09, sink: 0.55, maxSlope: 0.3, search: 4,
    }, out));

    const door = out.props[out.props.length - 1];
    if (door) {
      out.anchors.push(['gravfeltet-door', { x: door.x, y: door.y, z: door.z }]);
      out.doors.push({ id: 'gravfeltet-door', poi: 'gravfeltet', target: 'barrow-chamber', x: door.x, y: door.y, z: door.z });
    }
  }

  // Helleristninger on the flat slabs between the mounds — the thirty-boats
  // clue. Sunk most of the way in so they read as carved bedrock, not statues.
  const carvings = [[1.5, 13], [4.5, -14], [6.6, 12]];
  carvings.forEach(([s, p], i) => {
    const [x, z] = at(s, p);
    out.props.push(plan(t, {
      id: `gravfeltet-carving-${i}`, poi: 'gravfeltet', model: 'rock-drawings',
      // The measured asset is 1.68m; 0.6 into the heath leaves the carved face
      // at knee height on scoured bedrock, which is where it belongs.
      x, z, rotDeg: site.axisDeg + 90 + (rand() - 0.5) * 40, sink: 0.6,
      maxSlope: 0.2, search: 6,
    }, out));
  });

  // Standing stones flanking the line. Leaning, because after three thousand
  // years on a windward heath none of them are upright.
  const flanks = [
    ['pillar-stone', 0.5, -12], ['pillar-stone', 2.4, 13],
    ['pillar-stone', 5.5, -13], ['pillar-stone', 7.6, 12],
    ['pillar-crumbling', 1.4, 12], ['pillar-crumbling', 4.6, 13.5],
    ['pillar-crumbling', 8.2, -11],
    // Two rune stones among the raw menhirs — worked stone with runes and a
    // serpent, the only carved-by-hand markers on the alignment.
    ['rune-stone', 3.3, -14], ['rune-stone', 6.4, 14],
  ];
  flanks.forEach(([model, s, p], i) => {
    const [x, z] = at(s, p);
    out.props.push(plan(t, {
      id: `gravfeltet-stone-${i}`, poi: 'gravfeltet', model,
      x, z, rotDeg: rand() * 360,
      tiltX: (rand() - 0.5) * 0.16, tiltZ: (rand() - 0.5) * 0.16,
      sink: 0.3, maxSlope: 0.22, search: 6,
    }, out));
  });

  scatter(t, out, {
    id: 'gravfeltet-scrub', poi: 'gravfeltet',
    // stump-mossy-b is the same mesh as stump-mossy, 5% smaller, so listing both
    // bought no variety at all — the scatter's own scaleRange does more.
    models: ['stump-mossy'], count: 12,
    centre: at(4), radius: 62, inner: 12, maxSlope: 0.26, rand,
    scaleRange: [0.55, 1.1],
  });

  const [cx, cz] = at(4);
  out.anchors.push(['gravfeltet', { x: cx, y: t.height(cx, cz), z: cz }]);
  out.zones.push({ id: 'gravfeltet', x: cx, z: cz, r: 95 });
}

/**
 * VARDEFJELL — the beacon on the summit, held by people the town did not invite.
 */
function planVardefjell(t, out) {
  const site = SITES.vardefjell;
  const rand = rng(0x1c3d55);
  const [sx, sz] = site.summit;
  const from = (deg, r) => {
    const [dx, dz] = bearingDir(deg);
    return [sx + dx * r, sz + dz * r];
  };

  // The varde itself. Everything else on this summit is dressing on top of the
  // one structure that has a reason to be here.
  const vg = settle(t, sx, sz, { maxSlope: 0.2, search: 4 });
  if (vg) {
    out.cairns.push({
      id: 'vardefjell-varde', poi: 'vardefjell',
      x: vg.x, z: vg.z, y: vg.y, slope: vg.slope,
      height: 3.4, radius: 2.1, seed: 0x901, beacon: true,
    });
    out.anchors.push(['vardefjell-varde', { x: vg.x, y: vg.y + 3.4, z: vg.z }]);
    out.anchors.push(['vardefjell', { x: vg.x, y: vg.y, z: vg.z }]);
  }

  // The keep as a ruin: sunk deep into the summit and tipped off level, so it
  // reads as collapsed masonry rather than a castle someone parked here.
  //
  // The asset is a walled compound, not a keep, and its `metres` went 15 -> 35
  // once the gatehouse arch was measured against a figure. That is a 62m
  // footprint on a summit whose composition was laid out around a 15m object, so
  // the sink carries the fix: at 13m down the 7m curtain walls are entirely
  // buried and only the great hall and the tower caps break the skyline. What the
  // player sees is a fortress the fell has swallowed, which is the better read
  // anyway — and the collider tracks that visible mass, not the buried footprint.
  const [kx, kz] = from(135, 30);
  out.props.push(plan(t, {
    id: 'vardefjell-keep', poi: 'vardefjell', model: 'castle-keep',
    x: kx, z: kz, rotDeg: 296, tiltX: 0.055, tiltZ: -0.095,
    sink: 11, maxSlope: 0.4, search: 8, collide: 12,
  }, out));

  const [tx, tz] = from(228, 27);
  out.props.push(plan(t, {
    id: 'vardefjell-tower', poi: 'vardefjell', model: 'tower-round',
    x: tx, z: tz, rotDeg: 40, tiltZ: 0.03, sink: 1.4,
    maxSlope: 0.4, search: 8, collide: 4.5,
  }, out));

  // Two crags flanking the arrival, so the player walks between them into the site.
  //
  // `sentinel-statue` is a misnomer — the mesh is a slate outcrop with no figure,
  // no face and no plinth, so the original intent here (they "look back at the
  // player") was never something the asset could deliver. What it does have is a
  // short stone stair at its foot, which is its only worked element and its only
  // front, so the stairs are turned to face the climb rather than the summit.
  const [gx, gz] = from(site.approachDeg, 34);
  const [px, pz] = bearingDir(site.approachDeg + 90);
  [-7.5, 7.5].forEach((o, i) => {
    out.props.push(plan(t, {
      id: `vardefjell-crag-${i}`, poi: 'vardefjell', model: 'sentinel-statue',
      x: gx + px * o, z: gz + pz * o, rotDeg: site.approachDeg,
      tiltZ: (i ? 0.05 : -0.04), sink: 0.4, maxSlope: 0.4, search: 6, collide: 2.4,
    }, out));
  });
  out.anchors.push(['vardefjell-gate', { x: gx, y: t.height(gx, gz), z: gz }]);

  out.props.push(plan(t, {
    id: 'vardefjell-pillar-0', poi: 'vardefjell', model: 'pillar-stone',
    ...pt(from(112, 30)), rotDeg: 20, tiltX: 0.07, sink: 0.4, maxSlope: 0.4, search: 6,
  }, out));
  out.props.push(plan(t, {
    id: 'vardefjell-pillar-1', poi: 'vardefjell', model: 'pillar-crumbling',
    ...pt(from(255, 22)), rotDeg: 200, tiltZ: -0.11, sink: 0.5, maxSlope: 0.4, search: 6,
  }, out));

  // The camp. Bandits live at the varde, not in the ruin — the ruin has no roof.
  const [cx, cz] = from(160, 15);
  out.anchors.push(['vardefjell-camp', { x: cx, y: t.height(cx, cz), z: cz }]);

  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2, r = 4 + rand() * 9;
    out.props.push(plan(t, {
      id: `vardefjell-barrel-${i}`, poi: 'vardefjell', model: 'barrel',
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
      rotDeg: rand() * 360, tiltX: rand() < 0.3 ? 1.5 : 0, maxSlope: 0.4, search: 5,
    }, out));
  }

  // `treasure` used to fill the third slot here. It is not a container — it is a
  // 3m mossy cave mouth on its own oval of baked terrain, named for the coins in
  // its ground texture — so a bandit camp's loot line had a rockery in it.
  // Replaced with a real chest; see the catalog note for where treasure belongs.
  [['chest-iron', 5, 40], ['chest-plain', 7, 210], ['chest-vine', 4.5, 300]].forEach(([model, r, deg], i) => {
    const [dx, dz] = bearingDir(deg);
    out.props.push(plan(t, {
      id: `vardefjell-loot-${i}`, poi: 'vardefjell', model,
      x: cx + dx * r, z: cz + dz * r, rotDeg: deg + 90, maxSlope: 0.4, search: 5,
    }, out));
  });

  // Logs laid across the approach as a makeshift barricade. Tipped on their side
  // — the asset is an upright bundle, and a barricade is not upright.
  for (let i = 0; i < 5; i++) {
    const o = (i - 2) * 3.4;
    const [bx, bz] = from(site.approachDeg, 27 + (i % 2) * 3.5);
    out.props.push(plan(t, {
      id: `vardefjell-barricade-${i}`, poi: 'vardefjell', model: 'logs',
      x: bx + px * o, z: bz + pz * o,
      rotDeg: site.approachDeg + 90 + (rand() - 0.5) * 24,
      tiltX: Math.PI / 2, sink: 0.15, maxSlope: 0.45, search: 4,
    }, out));
  }

  out.zones.push({ id: 'vardefjell', x: sx, z: sz, r: 70 });

  // Route cairns. The climb is the content, so the track has to be legible from
  // the ground — a walker looks for the next stone pile, not for a path texture.
  site.route.forEach(([rx, rz], i) => {
    const g = settle(t, rx, rz, { maxSlope: 0.45, search: 16 });
    if (!g) { out.rejected.push({ id: `route-cairn-${i}`, x: rx, z: rz, why: 'no gentle dry ground' }); return; }
    out.cairns.push({
      id: `vardefjell-route-${i}`, poi: 'vardefjell-route',
      x: g.x, z: g.z, y: g.y, slope: g.slope,
      height: 1.5, radius: 0.85, seed: 0x910 + i, beacon: false,
    });
    out.anchors.push([`vardefjell-route-${i}`, { x: g.x, y: g.y, z: g.z }]);
    out.zones.push({ id: `vardefjell-route-${i}`, x: g.x, z: g.z, r: 9 });
  });
}

/**
 * SETERDALEN — the abandoned summer farm in the hanging valley.
 *
 * Not hostile and not safe. The buildings are on the shelf; the strangeness is
 * 130m east at the valley's centre, so you have to walk to it.
 */
function planSeterdalen(t, out) {
  const site = SITES.seterdalen;
  const rand = rng(0x5e7e12);
  const [px, pz] = site.platform;
  const [cx, cz] = site.centre;

  // `house-highl` — a witch's-hut diorama that arrives welded to its own hill,
  // with a graveyard, a picket fence and dead trees. That made it unusable in the
  // street ribbon, where every instance drove a burial mound through its
  // neighbour. Here it is exactly right: Seterdalen is the valley that is not
  // hostile but is not safe, and the hut brings its own unsettling ground with it.
  //
  // No sink and no tilt: the mound IS the asset's base, so bedding it in would
  // bury the graves it is carrying.
  out.props.push(plan(t, {
    id: 'seterdalen-cabin', poi: 'seterdalen', model: 'house-highl',
    x: px, z: pz, rotDeg: 300, sink: 0.05,
    maxSlope: 0.22, search: 14, collide: 5.5,
  }, out));

  // Companions sit in metres off the surveyed platform/centre, so the whole
  // composition travels with the site when the survey moves it.
  [[16, 19, 118, 1.0], [-14, -21, 24, 0.78]].forEach(([ox, oz, deg, mul], i) => {
    out.props.push(plan(t, {
      id: `seterdalen-seter-${i}`, poi: 'seterdalen', model: 'ruins-timber',
      x: px + ox, z: pz + oz, rotDeg: deg, scaleMul: mul, tiltX: 0.03 * (i ? -1 : 1),
      sink: 0.7, maxSlope: 0.3, search: 10, collide: 4.2 * mul,
    }, out));
  });

  out.props.push(plan(t, {
    id: 'seterdalen-well', poi: 'seterdalen', model: 'wishing-well',
    x: px + 13, z: pz - 6, rotDeg: 285, sink: 0.2, maxSlope: 0.26, search: 9, collide: 1.0,
  }, out));

  const seter = out.props.find((p) => p?.id === 'seterdalen-cabin');
  if (seter) out.anchors.push(['seterdalen-seter', { x: seter.x, y: seter.y, z: seter.z }]);
  out.zones.push({ id: 'seterdalen-seter', x: px, z: pz, r: 48 });

  // The huldra's tree. It is the landmark, so it stands alone at the centre and
  // everything else keeps its distance.
  out.props.push(plan(t, {
    id: 'seterdalen-hollow-tree', poi: 'seterdalen', model: 'tree-hollow',
    x: cx, z: cz, rotDeg: 24, maxSlope: 0.3, search: 12, collide: 3.6,
  }, out));

  const tree = out.props.find((p) => p?.id === 'seterdalen-hollow-tree');
  if (tree) out.anchors.push(['seterdalen-tree', { x: tree.x, y: tree.y, z: tree.z }]);

  // metres went 26 -> 15 (the 26 was residue from the potion-house mix-up), so
  // the footprint and its collider come down with it. The oval grass base baked
  // into the mesh needs burying or it reads as a platform.
  out.props.push(plan(t, {
    id: 'seterdalen-treehouse', poi: 'seterdalen', model: 'treehouse',
    x: cx - 22, z: cz + 16, rotDeg: 205, sink: 0.35, maxSlope: 0.3, search: 12, collide: 2.4,
  }, out));

  // The grove that ticks. Two stands, because one wide low blob reads as a bush
  // and two reads as a thicket someone planted.
  //
  // This is a row of five trees on individual display plinths, and its `metres`
  // was measuring the width of the row, not the height of anything — each tree
  // stood 1.41m, below the player's eyeline. At the corrected 16m the trees are
  // 5-6m, so the sink has to rise with them to bury five plinth slabs, and the
  // collider is set to the visible mass rather than the full 16m span, which as a
  // radius would be an invisible wall across the valley.
  [[11, 22, 70, 1.0], [23, -14, 300, 0.85]].forEach(([ox, oz, deg, mul], i) => {
    out.props.push(plan(t, {
      id: `seterdalen-grove-${i}`, poi: 'seterdalen', model: 'clockwork-grove',
      x: cx + ox, z: cz + oz, rotDeg: deg, scaleMul: mul, sink: 0.9 * mul,
      maxSlope: 0.28, search: 12, collide: 5.0 * mul,
    }, out));
  });

  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2, r = 10 + rand() * 26;
    out.props.push(plan(t, {
      id: `seterdalen-logs-${i}`, poi: 'seterdalen', model: 'logs',
      x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r,
      rotDeg: rand() * 360, tiltX: Math.PI / 2, sink: 0.2, maxSlope: 0.3, search: 6,
    }, out));
  }

  // The seter's working clutter: hay put up for winter, split firewood, and a
  // handcart left by the cabin — a summer farm someone still works.
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2, r = 9 + rand() * 15;
    out.props.push(plan(t, {
      id: `seterdalen-hay-${i}`, poi: 'seterdalen', model: 'haystack',
      x: px + Math.cos(a) * r, z: pz + Math.sin(a) * r,
      rotDeg: rand() * 360, scaleMul: 0.9 + rand() * 0.3, sink: 0.05,
      maxSlope: 0.3, search: 6,
    }, out));
  }
  out.props.push(plan(t, {
    id: 'seterdalen-woodpile', poi: 'seterdalen', model: 'woodpile',
    x: px + 9, z: pz + 7, rotDeg: 40, maxSlope: 0.3, search: 6,
  }, out));
  out.props.push(plan(t, {
    id: 'seterdalen-cart', poi: 'seterdalen', model: 'handcart',
    x: px - 8, z: pz + 4, rotDeg: 160, maxSlope: 0.28, search: 6,
  }, out));

  // Dense stumps — this is a cleared summer pasture that the wood is taking back.
  scatter(t, out, {
    id: 'seterdalen-stumps-a', poi: 'seterdalen',
    models: ['stump-mossy'], count: 14,
    centre: [cx, cz], radius: 46, inner: 9, maxSlope: 0.3, rand,
    scaleRange: [0.7, 1.35],
  });
  scatter(t, out, {
    id: 'seterdalen-stumps-b', poi: 'seterdalen',
    models: ['stump-mossy'], count: 10,
    centre: [px, pz], radius: 38, inner: 11, maxSlope: 0.3, rand,
    scaleRange: [0.6, 1.15],
  });

  out.anchors.push(['seterdalen', { x: cx, y: t.height(cx, cz), z: cz }]);
  out.anchors.push(['seterdalen-gully', {
    x: site.gullyMouth[0], y: t.height(...site.gullyMouth), z: site.gullyMouth[1],
  }]);
  out.zones.push({ id: 'seterdalen', x: cx, z: cz, r: 58 });
}

/**
 * THE RED TEMPLE — alone on the wildlands island across the sound.
 *
 * No road leads here and nothing friendly lives past the shoreline. The
 * citadel is the island's only architecture; everything else is what two
 * hundred years of weather does to a place people stopped visiting on purpose.
 */
function planTemple(t, out) {
  const site = SITES.temple;
  const rand = rng(0x7e3a91);
  const [px, pz] = site.platform;
  const [cx, cz] = site.centre;

  out.props.push(plan(t, {
    id: 'temple-citadel', poi: 'temple', model: 'citadel-crimson',
    x: px, z: pz, rotDeg: site.approachDeg, sink: 0.9,
    maxSlope: 0.24, search: 16, collide: 11,
  }, out));

  const citadel = out.props.find((p) => p?.id === 'temple-citadel');
  if (citadel) {
    out.anchors.push(['temple', { x: citadel.x, y: citadel.y, z: citadel.z }]);
    // The doorstep, on the approach side, where the POI and any future
    // interior door belong.
    const [ax, az] = [Math.sin(site.approachDeg * Math.PI / 180), Math.cos(site.approachDeg * Math.PI / 180)];
    const dx = citadel.x + ax * 16, dz = citadel.z + az * 16;
    out.anchors.push(['temple-door', { x: dx, y: t.height(dx, dz), z: dz }]);
  }

  // A processional pair of sentinels on the walk up from the water.
  [[26, 8], [40, -6]].forEach(([od, os], i) => {
    const a = site.approachDeg * Math.PI / 180;
    const x = px + Math.sin(a) * od + Math.cos(a) * os;
    const z = pz + Math.cos(a) * od - Math.sin(a) * os;
    out.props.push(plan(t, {
      id: `temple-sentinel-${i}`, poi: 'temple', model: 'sentinel-statue',
      x, z, rotDeg: site.approachDeg + 180 + (rand() - 0.5) * 14,
      sink: 0.4, maxSlope: 0.3, search: 8, collide: 1.8,
    }, out));
  });

  // The rest of the island: broken pillars and one ruin, sinking into the heath.
  scatter(t, out, {
    id: 'temple-pillars', poi: 'temple',
    models: ['pillar-crumbling', 'pillar-stone'], count: 6,
    centre: [cx, cz], radius: 90, inner: 24, maxSlope: 0.28, rand,
    scaleRange: [0.7, 1.25],
  });
  out.props.push(plan(t, {
    id: 'temple-ruin', poi: 'temple', model: 'ruins-timber',
    x: cx + 34, z: cz + 42, rotDeg: rand() * 360, sink: 0.8,
    maxSlope: 0.3, search: 10, collide: 4.2,
  }, out));

  out.zones.push({ id: 'temple', x: px, z: pz, r: 70 });
}

/** Convenience for spreading a [x, z] pair into a plan spec. */
function pt([x, z]) { return { x, z }; }

/**
 * Ground one prop and record what was measured there. Returns null (and logs a
 * rejection) when the requested area has nothing that passes.
 */
function plan(t, spec, out) {
  const g = settle(t, spec.x, spec.z, {
    maxSlope: spec.maxSlope ?? 0.3,
    search: spec.search ?? 8,
    minY: spec.minY ?? 1.4,
  });
  if (!g) {
    out.rejected.push({ id: spec.id, x: spec.x, z: spec.z, why: 'no gentle dry ground' });
    return null;
  }
  const p = { ...spec, x: g.x, z: g.z, y: g.y, slope: g.slope, moved: g.moved };
  return p;
}

/** Scattered ground clutter within an annulus, deterministic per site. */
function scatter(t, out, opts) {
  const [cx, cz] = opts.centre;
  const [lo, hi] = opts.scaleRange ?? [0.7, 1.2];
  let placed = 0, guard = 0;
  while (placed < opts.count && guard++ < opts.count * 12) {
    const a = opts.rand() * Math.PI * 2;
    const r = opts.inner + Math.sqrt(opts.rand()) * (opts.radius - opts.inner);
    const model = opts.models[placed % opts.models.length];
    const p = plan(t, {
      id: `${opts.id}-${placed}`, poi: opts.poi, model,
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r,
      rotDeg: opts.rand() * 360, scaleMul: lo + opts.rand() * (hi - lo),
      sink: 0.15, maxSlope: opts.maxSlope, search: 4,
    }, { rejected: [] });
    if (!p) continue;
    out.props.push(p);
    placed++;
  }
}

/**
 * Every position the landmarks will use, measured against `t`.
 *
 * `t` need only answer height(x, z) and slope(x, z), which is what lets the
 * verification script run this against the raw .r16 with no browser.
 */
export function planLandmarks(t) {
  const out = { mounds: [], cairns: [], props: [], anchors: [], zones: [], doors: [], rejected: [] };
  planGravfeltet(t, out);
  planVardefjell(t, out);
  planSeterdalen(t, out);
  planTemple(t, out);
  out.props = out.props.filter(Boolean);
  return out;
}

// ------------------------------------------------------------------ geometry

const TAU = Math.PI * 2;

/** Smooth 0..1 ramp, same shape as GLSL smoothstep. */
function smoothstep(a, b, x) {
  const tt = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return tt * tt * (3 - 2 * tt);
}

/**
 * A burial mound: a low dome that follows the ground under it.
 *
 * Written straight into world coordinates and merged with its neighbours, so the
 * whole grave field is one draw call. The rim is deliberately buried 0.35m below
 * the terrain instead of meeting it — a dome that lands exactly on the DTM is
 * coplanar with it over a wide annulus and z-fights along the entire edge.
 */
function appendMound(m, t, arrays) {
  const RINGS = 15, SEGS = 30;
  const { positions, colours, indices } = arrays;
  const base = positions.length / 3;

  // Two harmonics keep the plan irregular but closed — a mound with a seam in it
  // is worse than a perfect circle.
  const wobble = rng(m.seed);
  const ph = [wobble() * TAU, wobble() * TAU, wobble() * TAU];
  const plan2 = (a) => 0.88 + 0.08 * Math.sin(a * 2 + ph[0]) + 0.06 * Math.sin(a * 3 + ph[1]);
  const crest = (a) => 0.86 + 0.14 * Math.sin(a * 3 + ph[2]);

  const mouth = m.mouthDeg === null ? null : m.mouthDeg * Math.PI / 180;

  const FOOT = new THREE.Color(0x4a5330);      // damp, shaded turf at the foot
  const TOP = new THREE.Color(0x7d7f4c);       // wind-burnt crown
  const c = new THREE.Color();

  for (let i = 0; i <= RINGS; i++) {
    const tRad = i / RINGS;
    for (let j = 0; j < SEGS; j++) {
      // Angle measured as a compass bearing so the mouth lines up with the axis.
      const a = (j / SEGS) * TAU;
      const rad = m.radius * plan2(a) * tRad;
      const dx = Math.sin(a) * rad, dz = Math.cos(a) * rad;

      let dome = m.height * crest(a) * Math.pow(Math.max(0, 1 - tRad * tRad), 1.3);

      if (mouth !== null) {
        // A slumped corridor cut in from the rim toward the centre. It fades out
        // before the middle so the chamber under the crown still stands proud.
        let da = Math.abs(((a - mouth + Math.PI * 3) % TAU) - Math.PI);
        const cut = Math.exp(-Math.pow(da / 0.5, 2)) * smoothstep(0.12, 0.55, tRad);
        dome *= 1 - 0.92 * cut;
      }

      // Bury the skirt so nothing is coplanar with the terrain.
      dome -= 0.35 * smoothstep(0.82, 1.0, tRad);

      const wx = m.x + dx, wz = m.z + dz;
      positions.push(wx, t.height(wx, wz) + dome, wz);

      c.copy(FOOT).lerp(TOP, smoothstep(0.0, 0.8, dome / Math.max(m.height, 0.001)));
      colours.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const j2 = (j + 1) % SEGS;
      const a = base + i * SEGS + j;
      const b = base + i * SEGS + j2;
      const cc = base + (i + 1) * SEGS + j2;
      const d = base + (i + 1) * SEGS + j;
      indices.push(a, cc, d, a, b, cc);
    }
  }
}

/**
 * Stone transforms for one cairn, stacked into a taper.
 *
 * Rocks are one instanced mesh across every cairn in the world — a varde is
 * thirty stones and there are seven of them, which is not worth thirty meshes.
 */
function appendCairn(cairn, t, list) {
  const rand = rng(cairn.seed);
  // Layer spacing is set against the stone size below, so consecutive courses
  // overlap. Thinner layers leave daylight through the pile.
  const layers = Math.max(3, Math.round(cairn.height / 0.34));
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (let k = 0; k < layers; k++) {
    const f = k / (layers - 1);
    const ringR = cairn.radius * Math.pow(1 - f, 0.75);
    const n = Math.max(1, Math.round(ringR * 5.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand() * 0.7;
      const r = n === 1 ? 0 : ringR * (0.65 + rand() * 0.35);
      const x = cairn.x + Math.cos(a) * r;
      const z = cairn.z + Math.sin(a) * r;
      // Every stone is grounded on the terrain under it as well as stacked, so a
      // cairn on a tilted summit shelf beds in rather than hovering on one side.
      const y = Math.max(t.height(x, z), cairn.y) + f * cairn.height * 0.94;
      const s = (0.42 + rand() * 0.28) * (1 - f * 0.35);
      pos.set(x, y, z);
      e.set(rand() * TAU, rand() * TAU, rand() * TAU);
      q.setFromEuler(e);
      scl.set(s * (0.8 + rand() * 0.5), s * (0.6 + rand() * 0.4), s * (0.8 + rand() * 0.5));
      list.push(new THREE.Matrix4().compose(pos, q, scl));
    }
  }
}

// ------------------------------------------------------------------- runtime

export class Landmarks {
  constructor(terrain) {
    this.terrain = terrain;
    this._group = new THREE.Group();
    this._group.name = 'landmarks';
    this._colliders = [];
    this._anchors = new Map();
    this._zones = [];
    this.doors = [];
    this.plan = null;
  }

  get group() { return this._group; }
  get colliders() { return this._colliders; }
  get anchors() { return this._anchors; }
  get zones() { return this._zones; }

  /** World position of a named anchor, or null. */
  anchor(name) { return this._anchors.get(name) ?? null; }

  async build() {
    const t = this.terrain;
    const plan = planLandmarks(t);
    this.plan = plan;

    for (const [name, p] of plan.anchors) this._anchors.set(name, new THREE.Vector3(p.x, p.y, p.z));
    this._zones = plan.zones.map((z) => ({ ...z }));
    this.doors = plan.doors.map((d) => ({ ...d }));

    for (const r of plan.rejected) {
      console.warn(`landmark rejected: ${r.id} at ${r.x.toFixed(0)},${r.z.toFixed(0)} — ${r.why}`);
    }

    this._buildMounds(plan.mounds);
    this._buildCairns(plan.cairns);
    await this._buildProps(plan.props);

    return this;
  }

  _buildMounds(mounds) {
    if (!mounds.length) return;
    const arrays = { positions: [], colours: [], indices: [] };
    for (const m of mounds) {
      appendMound(m, this.terrain, arrays);
      // Ground height comes from the DTM, not from this mesh, so a walkable
      // mound would put the player's feet inside it. They are obstacles.
      this._colliders.push({ x: m.x, z: m.z, r: m.radius * 0.82 });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arrays.colours, 3));
    geo.setIndex(arrays.indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.98, metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'barrows';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._group.add(mesh);
  }

  _buildCairns(cairns) {
    if (!cairns.length) return;
    const list = [];
    for (const c of cairns) {
      appendCairn(c, this.terrain, list);
      if (c.beacon) this._colliders.push({ x: c.x, z: c.z, r: c.radius });
    }

    // Faceted low-poly stone: a cairn is broken rock, and smooth shading on 30
    // spheres reads as a pile of eggs.
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8d8c85, roughness: 0.92, metalness: 0.0, flatShading: true,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'cairns';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._group.add(mesh);
  }

  async _buildProps(props) {
    const needed = new Set(props.map((p) => p.model));
    for (const model of needed) {
      try { await assets.prop(model); } catch { console.warn(`landmark prop missing: ${model}`); }
    }

    for (const p of props) {
      const node = await this._placeProp(p);
      if (node) p.node = node;
    }
  }

  async _placeProp(p) {
    let inst;
    try { inst = await assets.prop(p.model); } catch { return null; }

    const cat = PROPS[p.model];
    const node = inst.root;

    // The catalog's `scale` is authored per asset against Meshy's ~2-unit
    // normalisation and is required — a prop placed without it arrives at the
    // same size as every other prop.
    node.scale.setScalar(scaleFor(p.model) * (p.scaleMul ?? 1));
    node.rotation.set(p.tiltX ?? 0, (p.rotDeg ?? 0) * Math.PI / 180, p.tiltZ ?? 0);
    node.position.set(p.x, p.y, p.z);

    // Meshy centres every prop in its cube, so placing at terrain height buries
    // the bottom half. Measure the assembled, rotated bounds and lift the model
    // until its base sits on the ground; `sink` then settles it deliberately.
    node.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(node);
    if (Number.isFinite(box.min.y)) {
      node.position.y += p.y - box.min.y - (p.sink ?? 0.05);
    }

    node.name = p.id;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this._group.add(node);

    // Collider radius from the measured footprint rather than from the scale
    // factor: castle-keep is 26.6m across at scale 14, and the two do not track.
    //
    // An explicit `collide` counts as the caller asserting the prop is solid. The
    // tag list alone is too brittle: re-tagging ruins-timber as debris and
    // clockwork-grove as a cluster — both accurate — silently dropped colliders
    // from props that had been given an explicit radius at their placement site.
    const SOLID_TAGS = ['building', 'ruin', 'landmark', 'structure', 'rock', 'debris'];
    const solid = p.collide != null || cat?.tags?.some((tag) => SOLID_TAGS.includes(tag));
    if (solid) {
      const r = p.collide ?? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.38;
      if (r > 0.6) this._colliders.push({ x: p.x, z: p.z, r });
    }

    return node;
  }

  /** Push a position out of anything solid at a landmark. */
  resolveCollision(pos, radius = 0.42) {
    for (const c of this._colliders) {
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
}
