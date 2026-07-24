// Build a shared hair library with a per-base skull fit as a morph target.
//
// The site fits each hairstyle to whichever skull it is applied to, and the two
// fits of one style are topologically identical (Quiff: 49,789 verts in both;
// MidLengthShag: 30,369) — they differ only in how the cards sit on the head.
// So instead of grafting venus hair onto a mars skull and hoping, both fits are
// exported and the difference is stored as a `marsFit` morph target: influence 0
// is the venus fit, 1 is the mars fit, and anything between works for a skull
// somewhere in the middle.
//
// Geometry is baked into head-bone-local space, so at runtime the mesh parents
// straight onto the Head bone with no correction matrix.
//
//   node tools/build-hair.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { dequantize } from '@gltf-transform/functions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets-src', 'characters');
const OUT = path.join(root, 'public', 'assets', 'hair');

/**
 * Geometry comes from the pre-"Web" exports; the texture comes from the current
 * ones.
 *
 * The Web export quality quantises positions to normalised Int16 and carries no
 * node scale to restore metres with, so its hair dequantises to a 2-unit cube
 * rather than to a head-sized mesh — usable on the GPU as part of a skinned
 * character, but not as raw geometry to bake a library from. The older exports
 * are plain floats in model space and are still correct for that.
 *
 * The textures only appeared in the newer exports, so the two are read from
 * different files and combined here.
 */
const STYLES = {
  Quiff: {
    venus: '_hairfit_Quiff_venus',
    mars: '_hairfit_Quiff_mars',
    texture: 'Mildrid',
  },
  MidLengthShag: {
    venus: '_hairfit_MidLengthShag_venus',
    mars: '_hairfit_MidLengthShag_mars',
    texture: 'Maple',
  },
};

const HEAD_BONE = 'Head';

// --- minimal 4x4 matrix helpers (column-major, glTF convention) ---

function compose(t, r, s) {
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

function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
                   + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13,
         a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

const applyPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const applyDir = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z,
  m[1] * x + m[5] * y + m[9] * z,
  m[2] * x + m[6] * y + m[10] * z,
];

/** World matrix of a node, composed by walking up the scene graph. */
function worldMatrix(node, parents) {
  let m = compose(node.getTranslation(), node.getRotation(), node.getScale());
  let p = parents.get(node);
  while (p) {
    m = multiply(compose(p.getTranslation(), p.getRotation(), p.getScale()), m);
    p = parents.get(p);
  }
  return m;
}

function parentMap(doc) {
  const parents = new Map();
  for (const n of doc.getRoot().listNodes()) {
    for (const c of n.listChildren()) parents.set(c, n);
  }
  return parents;
}

/** Hair positions and normals for `style`, expressed in head-bone-local space. */
async function readFit(io, file, style) {
  const doc = await io.read(path.join(SRC, file + '.glb'));
  // The web export quantises positions to normalised Int16 (KHR_mesh_quantization).
  // Reading the accessor arrays directly then yields raw integers in the +-32767
  // range rather than metres — which is why the skull-fit delta came out as 2752m
  // instead of 8cm. Dequantise before touching any vertex data.
  await doc.transform(dequantize());
  const parents = parentMap(doc);

  let hairNode = null, headNode = null, blendNode = null;
  for (const n of doc.getRoot().listNodes()) {
    if (n.getName() === `${style}_CardsMesh` && n.getMesh()) hairNode = n;
    if (n.getName() === `${style}_CardsMesh__blend` && n.getMesh()) blendNode = n;
    if (n.getName() === HEAD_BONE) headNode = n;
  }
  if (!hairNode) throw new Error(`${file}: no ${style}_CardsMesh`);
  if (!headNode) throw new Error(`${file}: no ${HEAD_BONE} bone`);

  const prim = hairNode.getMesh().listPrimitives()[0];
  const material = prim.getMaterial();
  const texture = material?.getBaseColorTexture();
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  // The exports DO carry hair UVs. They just carry no hair texture, so anything
  // that prunes "unused" attributes throws the UVs away and makes a coverage
  // mask impossible — which is exactly the trap that cost me a rewrite.
  const uv = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices();

  // The cards are authored in model space; the mesh node itself may also carry a
  // transform. Fold both, then move into the head bone's frame.
  const toModel = worldMatrix(hairNode, parents);
  const headWorld = worldMatrix(headNode, parents);
  const headInv = invert(headWorld);
  if (!headInv) throw new Error(`${file}: head bone matrix is singular`);
  const m = multiply(headInv, toModel);

  const n = pos.getCount();
  const positions = new Float32Array(n * 3);
  const normals = nrm ? new Float32Array(n * 3) : null;
  const pa = pos.getArray(), na = nrm?.getArray();

  for (let i = 0; i < n; i++) {
    const [x, y, z] = applyPoint(m, pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]);
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    if (na) {
      const [nx, ny, nz] = applyDir(m, na[i * 3], na[i * 3 + 1], na[i * 3 + 2]);
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / len; normals[i * 3 + 1] = ny / len; normals[i * 3 + 2] = nz / len;
    }
  }

  // Kept so consumers that work in model space (the character creator, which
  // runs on a base mesh with no Head bone) can transform back out of head-local.
  return {
    positions, normals, count: n, headWorld, texture,
    // The export's second pass carries its opacity in the base colour alpha.
    blendOpacity: blendNode?.getMesh()?.listPrimitives()[0]?.getMaterial()?.getBaseColorFactor()?.[3] ?? null,
    alphaMode: material?.getAlphaMode(), alphaCutoff: material?.getAlphaCutoff(),
    uvs: uv ? Float32Array.from(uv.getArray()) : null,
    indices: idx ? Uint32Array.from(idx.getArray()) : null,
  };
}

// ---------------------------------------------------------------- build

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
fs.mkdirSync(OUT, { recursive: true });

const manifest = { version: 1, styles: {} };
const chunks = [];
let offset = 0;

for (const [style, srcs] of Object.entries(STYLES)) {
  const venus = await readFit(io, srcs.venus, style);
  const mars = await readFit(io, srcs.mars, style);

  if (venus.count !== mars.count) {
    console.error(`  ${style}: FIT MISMATCH ${venus.count} vs ${mars.count} — skipped`);
    continue;
  }

  // The morph is the pure skull-fit difference, both fits already being in
  // head-local space — so it carries no head-position offset to double-apply.
  const delta = new Float32Array(venus.count * 3);
  let maxD = 0;
  for (let i = 0; i < venus.count * 3; i++) {
    delta[i] = mars.positions[i] - venus.positions[i];
    if (Math.abs(delta[i]) > maxD) maxD = Math.abs(delta[i]);
  }

  const entry = {
    count: venus.count,
    maxDelta: +maxD.toFixed(4),
    headWorld: { venus: venus.headWorld, mars: mars.headWorld },
  };
  const put = (name, arr) => {
    entry[name] = { offset, length: arr.length };
    chunks.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    offset += arr.byteLength;
  };
  put('positions', venus.positions);
  if (venus.normals) put('normals', venus.normals);
  if (venus.uvs) put('uvs', venus.uvs);
  put('marsDelta', delta);
  if (venus.indices) put('indices', venus.indices);
  entry.hasUV = !!venus.uvs;

  // One texture per style: both fits share it, since only the fit differs.
  const texSrc = srcs.texture ? await readFit(io, srcs.texture, style) : null;
  const tex = texSrc?.texture ?? venus.texture ?? mars.texture;
  if (tex) {
    const mime = tex.getMimeType();
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    const file = `${style}.${ext}`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(tex.getImage()));
    entry.texture = file;
    entry.textureSize = tex.getSize();
    // The site marks hair as alpha-MASK with a cutoff. Carrying those through
    // matters: rendered opaque, the cards are solid slabs rather than strands.
    entry.alphaMode = venus.alphaMode ?? 'MASK';
    entry.alphaCutoff = venus.alphaCutoff ?? 0.5;
    entry.blendOpacity = texSrc?.blendOpacity ?? venus.blendOpacity ?? 0.3;
  } else {
    console.warn(`  ! ${style} has no hair texture — it will render untextured`);
  }

  manifest.styles[style] = entry;
  console.log(`  ${style.padEnd(16)} ${venus.count} verts, fit shift ${maxD.toFixed(3)}m, tex ${entry.texture ?? 'NONE'} ${entry.textureSize?.join('x') ?? ''}`);
}

const bin = Buffer.concat(chunks);
fs.writeFileSync(path.join(OUT, 'hair.bin'), bin);
fs.writeFileSync(path.join(OUT, 'hair.json'), JSON.stringify(manifest));
console.log(`\n  hair.bin ${(bin.length / 1048576).toFixed(2)}MB  (${Object.keys(manifest.styles).length} styles)`);
