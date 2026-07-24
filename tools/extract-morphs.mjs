// Extract the ARKit expression set once into a shared, sparse morph library.
//
// Every character exported from creategamecharacters.ai shares one topology
// (9338-vert body, 6162-vert head, 7669-vert teeth) regardless of base mesh or
// how far the face was warped — the photo fit moves vertices, it doesn't reorder
// them. ARKit shapes are *relative* deltas, so a single library applies correctly
// to any face. Shipping all 51 shapes inside all 12 character GLBs was paying
// ~4.8MB twelve times over for data that is byte-identical each time.
//
// So: strip the morphs from the characters, keep one library, and attach it at
// runtime to whoever is actually speaking (see src/character/FaceLibrary.js).
//
// Most shapes only move a small patch of the face, so the library is stored
// sparsely — indices + deltas for touched vertices only, which is ~10x smaller
// than dense arrays.
//
//   node tools/extract-morphs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'assets', 'morphs');

// Any fully-featured export works as the donor; the deltas are identical across
// characters. Charles is a mars base, and mars/venus share topology.
const DONOR = path.join(root, 'assets-src', 'characters', 'Charles.glb');

// Vertex counts identify which mesh is which — the exporter leaves them unnamed.
const ROLE_BY_VERTS = { 6162: 'head', 7669: 'teeth', 9338: 'body', 480: 'lashes' };

// Deltas below this are rounding noise and cost real bytes to store.
const EPSILON = 1e-5;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(DONOR);

const chunks = [];
let byteOffset = 0;
const manifest = { version: 1, source: path.basename(DONOR), meshes: {} };

for (const mesh of doc.getRoot().listMeshes()) {
  const prim = mesh.listPrimitives()[0];
  const targets = prim.listTargets();
  if (!targets.length) continue;

  const vertexCount = prim.getAttribute('POSITION').getCount();
  const role = ROLE_BY_VERTS[vertexCount];
  if (!role) { console.warn(`  ? unknown mesh with ${vertexCount} verts — skipped`); continue; }

  const names = mesh.getExtras()?.targetNames ?? targets.map((_, i) => `morph_${i}`);
  const entry = { vertexCount, targets: [] };

  targets.forEach((target, ti) => {
    const pos = target.getAttribute('POSITION');
    if (!pos) return;
    const arr = pos.getArray();

    // Collect only vertices this shape actually moves.
    const indices = [];
    for (let v = 0; v < vertexCount; v++) {
      const x = arr[v * 3], y = arr[v * 3 + 1], z = arr[v * 3 + 2];
      if (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON || Math.abs(z) > EPSILON) indices.push(v);
    }

    const idx = new Uint16Array(indices);
    const deltas = new Float32Array(indices.length * 3);
    indices.forEach((v, k) => {
      deltas[k * 3] = arr[v * 3];
      deltas[k * 3 + 1] = arr[v * 3 + 1];
      deltas[k * 3 + 2] = arr[v * 3 + 2];
    });

    // Float32 views must start on a 4-byte boundary.
    const idxBytes = idx.byteLength;
    const pad = (4 - (idxBytes % 4)) % 4;

    entry.targets.push({
      name: names[ti] ?? `morph_${ti}`,
      count: indices.length,
      indexOffset: byteOffset,
      deltaOffset: byteOffset + idxBytes + pad,
    });

    chunks.push(Buffer.from(idx.buffer, idx.byteOffset, idxBytes));
    if (pad) chunks.push(Buffer.alloc(pad));
    chunks.push(Buffer.from(deltas.buffer, deltas.byteOffset, deltas.byteLength));
    byteOffset += idxBytes + pad + deltas.byteLength;
  });

  manifest.meshes[role] = entry;
  const moved = entry.targets.reduce((a, t) => a + t.count, 0);
  console.log(`  ${role.padEnd(6)} ${entry.targets.length} shapes, ${vertexCount} verts, ${moved} sparse entries`);
}

fs.mkdirSync(OUT, { recursive: true });
const bin = Buffer.concat(chunks);
fs.writeFileSync(path.join(OUT, 'arkit.bin'), bin);
fs.writeFileSync(path.join(OUT, 'arkit.json'), JSON.stringify(manifest));

const dense = Object.values(manifest.meshes)
  .reduce((a, m) => a + m.targets.length * m.vertexCount * 12, 0);
console.log(`\n  arkit.bin  ${(bin.length / 1048576).toFixed(2)}MB sparse`
  + `  (dense would be ${(dense / 1048576).toFixed(2)}MB)`);
console.log(`  shapes: ${Object.values(manifest.meshes).reduce((a, m) => a + m.targets.length, 0)}`);
