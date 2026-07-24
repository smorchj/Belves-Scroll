// Asset survey: does every catalogued prop exist, load, and end up the size the
// catalog claims?
//
// The catalog's `scale` is authored by hand against an intended height in metres,
// and nothing verifies it. A prop whose raw bbox is not the usual ~2-unit Meshy
// cube silently lands at the wrong size in the world, and the only symptom is a
// house you can step over. This measures the real thing.
//
//   node tools/survey/survey-assets.mjs [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { PROPS, CREATURES } from '../../src/data/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROP_DIR = path.join(root, 'public', 'assets', 'props');
const CREATURE_DIR = path.join(root, 'public', 'assets', 'creatures');
const MESHY_DIR = path.join(root, 'assets-src', 'meshy');

const asJson = process.argv.includes('--json');

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

// ------------------------------------------------------------ 4x4 maths
// Column-major, matching glTF's node matrices.

const IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

function fromTRS(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function nodeLocalMatrix(node) {
  const m = node.getMatrix?.();
  if (m && m.length === 16 && !m.every((v, i) => v === IDENTITY[i])) return [...m];
  return fromTRS(node.getTranslation(), node.getRotation(), node.getScale());
}

function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ------------------------------------------------------------ bounds

function emptyBox() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function grow(box, p) {
  for (let i = 0; i < 3; i++) {
    if (p[i] < box.min[i]) box.min[i] = p[i];
    if (p[i] > box.max[i]) box.max[i] = p[i];
  }
}

function boxSize(box) {
  if (!Number.isFinite(box.min[0])) return null;
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

/** World matrix per node, walking down from the scene roots. */
function worldMatrices(doc) {
  const map = new Map();
  const walk = (node, parent) => {
    const world = multiply(parent, nodeLocalMatrix(node));
    map.set(node, world);
    for (const child of node.listChildren()) walk(child, world);
  };
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) walk(node, IDENTITY);
  }
  return map;
}

/**
 * The bounding box as the renderer will actually see it.
 *
 * Static primitives take the node's world matrix. Skinned ones must not: glTF
 * cancels the mesh node's own transform and posts vertices through
 * jointGlobal * inverseBind instead. That distinction is the whole point here —
 * Meshy bipeds ship an armature scaled 0.01 with inverse-bind matrices that undo
 * it, so reading the node transform alone reports a character 100x too small.
 */
function sceneBounds(doc) {
  const world = worldMatrices(doc);
  const box = emptyBox();
  let vertices = 0;
  let skinnedPrims = 0;

  for (const node of world.keys()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const skin = node.getSkin();

    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      vertices += pos.getCount();

      if (skin) {
        skinnedPrims++;
        growSkinned(box, prim, skin, world);
      } else {
        // Static: the accessor's own min/max corners are exact under an affine
        // transform, so there is no need to walk every vertex.
        const m = world.get(node);
        const lo = pos.getMin([]), hi = pos.getMax([]);
        for (let i = 0; i < 8; i++) {
          grow(box, transformPoint(m,
            i & 1 ? hi[0] : lo[0],
            i & 2 ? hi[1] : lo[1],
            i & 4 ? hi[2] : lo[2]));
        }
      }
    }
  }
  return { box, vertices, skinnedPrims };
}

function growSkinned(box, prim, skin, world) {
  const pos = prim.getAttribute('POSITION');
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  const ibmAcc = skin.getInverseBindMatrices();
  const jointNodes = skin.listJoints();

  // jointGlobal * inverseBind, one per joint.
  const skinMats = jointNodes.map((jn, i) => {
    const jw = world.get(jn) ?? IDENTITY;
    if (!ibmAcc) return jw;
    return multiply(jw, ibmAcc.getElement(i, []));
  });

  const p = [], j = [], w = [];
  for (let v = 0; v < pos.getCount(); v++) {
    pos.getElement(v, p);
    if (!joints || !weights) { grow(box, transformPoint(skinMats[0] ?? IDENTITY, p[0], p[1], p[2])); continue; }
    joints.getElement(v, j);
    weights.getElement(v, w);
    let x = 0, y = 0, z = 0, total = 0;
    for (let k = 0; k < 4; k++) {
      const weight = w[k];
      if (!weight) continue;
      const m = skinMats[j[k]];
      if (!m) continue;
      const t = transformPoint(m, p[0], p[1], p[2]);
      x += t[0] * weight; y += t[1] * weight; z += t[2] * weight;
      total += weight;
    }
    if (total > 0) grow(box, [x / total, y / total, z / total]);
  }
}

// ------------------------------------------------------------ plausibility

/**
 * Sanity ranges keyed on what the asset's *name* promises, in metres of the
 * largest dimension. Deliberately generous — this is here to catch a 40m barrel,
 * not to police 20cm.
 */
const EXPECTED = [
  [/^(sword|dagger|axe)/, 0.3, 1.6],
  [/^(ring|goblet|chalice)/, 0.03, 0.4],
  [/^mask/, 0.1, 0.6],
  [/^(castle|citadel)/, 8, 60],
  [/^tower/, 6, 45],
  [/^(house|farmstead|guild-hall|potion-house|treehouse)/, 3, 30],
  [/^inn-bar/, 0.9, 1.3],
  [/^ruins/, 1.5, 20],
  [/^(archway|pillar|sentinel)/, 1.5, 15],
  [/^tree/, 2, 30],
  [/^(stump|plant|logs)/, 0.2, 4],
  [/^(barrel|chest|treasure|vase|candelabra|decor)/, 0.2, 2.5],
  [/^(bed|bathtub|inn-table|stone-throne|stump-chair|wishing-well)/, 0.3, 3.5],
  [/^(clockwork-grove|rock-drawings)/, 1, 20],
];

/** Names whose real-world identity implies a volume, not a signboard. */
const SOLID = /^(house|castle|citadel|guild-hall|potion-house|farmstead|tower|treehouse|ruins|chest|barrel|treasure)/;

function plausibility(name, sizeM, catalogMetres) {
  const flags = [];
  const [w, h, d] = sizeM;
  const largest = Math.max(w, h, d);
  const smallest = Math.min(w, h, d);

  const rule = EXPECTED.find(([re]) => re.test(name));
  if (rule && (h < rule[1] || h > rule[2])) {
    flags.push(`height ${h.toFixed(2)}m outside the plausible ${rule[1]}–${rule[2]}m for "${name}"`);
  }

  // `metres` is used loosely in the catalog — height for tall props, longest axis
  // for wide ones. Only complain when it matches neither reading.
  if (catalogMetres) {
    const near = (v) => v / catalogMetres >= 0.78 && v / catalogMetres <= 1.28;
    if (!near(h) && !near(largest)) {
      flags.push(`catalog says ${catalogMetres}m; measures h=${h.toFixed(2)} max=${largest.toFixed(2)}`);
    }
  }

  // A building whose thinnest axis is a fraction of its longest is a facade, and
  // will read as cardboard the moment the player walks round it.
  if (SOLID.test(name) && smallest < largest * 0.3) {
    flags.push(`slab-like: ${fmt3(sizeM)}m — thinnest axis is ${(smallest / largest * 100).toFixed(0)}% of longest`);
  }

  // Footprint matters for anything placed on a street ribbon at 15–25m spacing.
  const footprint = Math.max(w, d);
  if (SOLID.test(name) && footprint > h * 1.6 && footprint > 8) {
    flags.push(`footprint ${footprint.toFixed(1)}m is wide relative to its ${h.toFixed(1)}m height — check spacing`);
  }
  return flags;
}

// ------------------------------------------------------------ per-file report

async function measure(file, scale) {
  const doc = await io.read(file);
  const { box, vertices, skinnedPrims } = sceneBounds(doc);
  const raw = boxSize(box);
  if (!raw) throw new Error('no geometry / empty bounding box');
  return {
    raw,
    scaled: raw.map((v) => v * scale),
    minY: box.min[1],
    vertices,
    skinnedPrims,
    doc,
  };
}

function fmt3(a) { return a.map((v) => v.toFixed(2)).join(' x '); }

const rows = [];
const problems = [];

async function surveyEntry(kind, name, def, file) {
  const row = { kind, name, file: path.relative(root, file), scale: def.scale, claimed: def.metres };
  if (!fs.existsSync(file)) {
    row.status = 'MISSING';
    problems.push(`${name}: file missing at ${row.file}`);
    rows.push(row);
    return;
  }
  row.bytes = fs.statSync(file).size;
  try {
    const m = await measure(file, def.scale);
    row.status = 'ok';
    row.raw = m.raw;
    row.scaled = m.scaled;
    row.vertices = m.vertices;
    row.flags = plausibility(name, m.scaled, def.metres);
    // Every prop is supposed to arrive inside Meshy's ~2-unit normalisation cube.
    // Anything far outside it means `scale` was authored against a different
    // assumption than the file actually satisfies.
    const rawMax = Math.max(...m.raw);
    if (kind === 'prop' && (rawMax < 1.5 || rawMax > 2.6)) {
      row.flags.push(`raw bbox max ${rawMax.toFixed(3)} is outside the ~2-unit Meshy cube`);
    }
    for (const f of row.flags) problems.push(`${name}: ${f}`);
  } catch (err) {
    row.status = 'FAIL';
    row.error = err.message;
    problems.push(`${name}: failed to load — ${err.message}`);
  }
  rows.push(row);
}

for (const [name, def] of Object.entries(PROPS)) {
  await surveyEntry('prop', name, def, path.join(PROP_DIR, name + '.glb'));
}
for (const [name, def] of Object.entries(CREATURES)) {
  await surveyEntry('creature', name, def, path.join(CREATURE_DIR, name + '.glb'));
}

// ------------------------------------------------------- uncatalogued rigs

/** Detail a rigged file has to answer for before it can be catalogued. */
async function inspectRig(label, file) {
  const doc = await io.read(file);
  const { box, vertices } = sceneBounds(doc);
  const r = doc.getRoot();
  const skins = r.listSkins();
  const world = worldMatrices(doc);

  const roots = r.listScenes()[0]?.listChildren() ?? [];
  return {
    label,
    file: path.relative(root, file),
    bytes: fs.statSync(file).size,
    vertices,
    size: boxSize(box),
    minY: box.min[1],
    skins: skins.length,
    joints: skins[0]?.listJoints().length ?? 0,
    jointNames: skins[0]?.listJoints().map((j) => j.getName()) ?? [],
    rootNodes: roots.map((n) => ({ name: n.getName(), scale: n.getScale(), translation: n.getTranslation() })),
    // Armature scale as it reaches the joints, to test the Meshy 0.01 trick.
    firstJointWorldScale: (() => {
      const j = skins[0]?.listJoints()[0];
      if (!j) return null;
      const m = world.get(j);
      if (!m) return null;
      const col = (i) => Math.hypot(m[i * 4], m[i * 4 + 1], m[i * 4 + 2]);
      return [col(0), col(1), col(2)];
    })(),
    clips: r.listAnimations().map((a) => ({
      name: a.getName(),
      duration: Math.max(0, ...a.listSamplers().map((s) => {
        const input = s.getInput();
        return input ? input.getMax([])[0] : 0;
      })),
    })),
  };
}

const rigTargets = [
  ['walker-a', path.join(MESHY_DIR, 'walker-a.glb')],
  ['walker-b', path.join(MESHY_DIR, 'walker-b.glb')],
];
const ravenDir = path.join(MESHY_DIR, 'raven');
if (fs.existsSync(ravenDir)) {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.glb') ? [path.join(dir, e.name)] : []);
  for (const f of walk(ravenDir)) rigTargets.push(['raven/' + path.basename(f), f]);
}

const rigs = [];
for (const [label, file] of rigTargets) {
  if (!fs.existsSync(file)) { problems.push(`${label}: file missing at ${file}`); continue; }
  try {
    const g = await inspectRig(label, file);
    rigs.push(g);
    // A Meshy biped should land at roughly human height once the 0.01 armature
    // and its inverse-bind compensation cancel. Anything else means they don't.
    const h = g.size?.[1] ?? 0;
    if (h < 0.8 || h > 3.5) {
      problems.push(`${label}: renders ${h.toFixed(3)}m tall — needs x${(1.7 / h).toFixed(0)} to reach human scale`);
    }
  } catch (err) {
    problems.push(`${label}: failed to load — ${err.message}`);
  }
}

// ------------------------------------------------------------ output

if (asJson) {
  console.log(JSON.stringify({ rows, rigs, problems }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('asset', 22) + pad('kind', 10) + pad('scale', 8) + pad('claimed', 9) + pad('raw bbox', 24) + pad('scaled (m)', 26) + 'status');
  console.log('-'.repeat(110));
  for (const r of rows) {
    console.log(
      pad(r.name, 22) + pad(r.kind, 10) + pad(r.scale, 8) + pad(r.claimed ? r.claimed + 'm' : '-', 9) +
      pad(r.raw ? fmt3(r.raw) : '-', 24) + pad(r.scaled ? fmt3(r.scaled) : '-', 26) +
      (r.flags?.length ? 'FLAG' : r.status),
    );
  }

  console.log('\n--- uncatalogued rigs ---');
  for (const g of rigs) {
    console.log(`\n${g.label}  (${(g.bytes / 1048576).toFixed(2)}MB)`);
    console.log(`  verts ${g.vertices}  size ${g.size ? fmt3(g.size) : '-'}m  minY ${g.minY?.toFixed(3)}`);
    console.log(`  skins ${g.skins}  joints ${g.joints}`);
    console.log(`  root nodes: ${g.rootNodes.map((n) => `${n.name} scale=[${n.scale.join(',')}]`).join(' | ')}`);
    console.log(`  first joint world scale: ${g.firstJointWorldScale?.map((v) => v.toFixed(4)).join(', ')}`);
    console.log(`  joint names: ${g.jointNames.join(', ')}`);
    console.log(`  clips: ${g.clips.map((c) => `${c.name} (${c.duration.toFixed(2)}s)`).join(', ') || 'none'}`);
  }

  console.log('\n--- problems ---');
  if (!problems.length) console.log('  none');
  for (const p of problems) console.log('  ! ' + p);
}
