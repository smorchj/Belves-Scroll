/**
 * World-space AABB of a GLB, read from the glTF JSON chunk alone.
 *
 * The props are Draco-compressed, so decoding geometry headlessly would need the
 * decoder wasm. It is not necessary: the spec requires POSITION accessors to
 * carry min/max, and Box3.setFromObject does exactly this — transform each
 * geometry's eight bbox corners by its world matrix and union the result. So the
 * numbers here are the same numbers the runtime measures.
 */
import { readFile } from 'node:fs/promises';

function parseGLB(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + off + 8, len)));
    }
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  throw new Error('no JSON chunk');
}

// --- 4x4 column-major, same convention as three.
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
                   + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function fromTRS(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  return fromTRS(n.translation, n.rotation, n.scale);
}

function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Local AABB of one glTF mesh, unioned across its primitives. */
function meshBox(gltf, meshIndex) {
  const mesh = gltf.meshes[meshIndex];
  let box = null;
  for (const prim of mesh.primitives ?? []) {
    const acc = gltf.accessors?.[prim.attributes?.POSITION];
    if (!acc?.min || !acc?.max) continue;
    box = box ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.min(box.min[i], acc.min[i]);
      box.max[i] = Math.max(box.max[i], acc.max[i]);
    }
  }
  return box;
}

/**
 * AABB of the GLB's default scene under an extra local rotation.
 * `rotX/rotY/rotZ` are applied in three's default XYZ Euler order, matching
 * Object3D.rotation.set(x, y, z), then a uniform scale on top.
 */
export function boundsOf(gltf, { rotX = 0, rotY = 0, rotZ = 0, scale = 1 } = {}) {
  const rx = [1, 0, 0, 0, 0, Math.cos(rotX), Math.sin(rotX), 0, 0, -Math.sin(rotX), Math.cos(rotX), 0, 0, 0, 0, 1];
  const ry = [Math.cos(rotY), 0, -Math.sin(rotY), 0, 0, 1, 0, 0, Math.sin(rotY), 0, Math.cos(rotY), 0, 0, 0, 0, 1];
  const rz = [Math.cos(rotZ), Math.sin(rotZ), 0, 0, -Math.sin(rotZ), Math.cos(rotZ), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const S = [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1];
  const root = mul(S, mul(rx, mul(ry, rz)));   // three: XYZ order => R = Rx*Ry*Rz

  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let any = false;

  const sceneIdx = gltf.scene ?? 0;
  const roots = gltf.scenes?.[sceneIdx]?.nodes ?? [];

  const walk = (idx, parent) => {
    const n = gltf.nodes[idx];
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined) {
      const b = meshBox(gltf, n.mesh);
      if (b) {
        any = true;
        for (let i = 0; i < 8; i++) {
          const p = apply(m, [
            i & 1 ? b.max[0] : b.min[0],
            i & 2 ? b.max[1] : b.min[1],
            i & 4 ? b.max[2] : b.min[2],
          ]);
          for (let k = 0; k < 3; k++) {
            if (p[k] < out.min[k]) out.min[k] = p[k];
            if (p[k] > out.max[k]) out.max[k] = p[k];
          }
        }
      }
    }
    for (const c of n.children ?? []) walk(c, m);
  };

  for (const r of roots) walk(r, root);
  return any ? out : null;
}

export async function loadGLTF(file) {
  return parseGLB(await readFile(file));
}
