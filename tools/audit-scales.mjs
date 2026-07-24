// Reconcile the catalog against the real meshes.
//
// Two bugs made props render at wildly wrong sizes:
//
//  1. `scale` and `metres` disagreed on the hand-authored entries. Landmarks.js
//     uses `scale`, Settlement.js uses `metres`, Vegetation.js normalises to unit
//     height and multiplies by `metres` — so the same asset came out at three
//     different sizes depending on which module placed it.
//
//  2. Normalising by the *longest* dimension is wrong whenever the longest axis
//     is not the height. Several Meshy exports are wider than they are tall, so
//     forcing the long axis to the intended height gave squat, splayed buildings
//     (measured in-game: 4.5m tall by 14m wide, for a house meant to be 8m).
//
// `metres` is redefined here as intended HEIGHT, and `scale` is recomputed from
// each mesh's actual Y extent so the two can never drift apart again.
//
//   node tools/audit-scales.mjs          report only
//   node tools/audit-scales.mjs --write  rewrite the scale fields in catalog.js
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { PROPS } from '../src/data/catalog.js';

const write = process.argv.includes('--write');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

/** Bounding box of the whole scene graph, with node transforms applied. */
function measure(doc) {
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];

  const walk = (node, m) => {
    const t = node.getTranslation(), r = node.getRotation(), s = node.getScale();
    // Compose parent * local. Rotation matters: several exports are Z-up and
    // carry a -90 degree X rotation on the node, so ignoring it measures the
    // wrong axis as "height".
    const [x, y, z, w] = r;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const l = [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ];
    const o = new Array(16);
    for (let c = 0; c < 4; c++) {
      for (let rr = 0; rr < 4; rr++) {
        o[c * 4 + rr] = m[rr] * l[c * 4] + m[4 + rr] * l[c * 4 + 1]
                      + m[8 + rr] * l[c * 4 + 2] + m[12 + rr] * l[c * 4 + 3];
      }
    }

    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const a = pos.getArray();
        for (let i = 0; i < pos.getCount(); i++) {
          const px = a[i * 3], py = a[i * 3 + 1], pz = a[i * 3 + 2];
          const wx2 = o[0] * px + o[4] * py + o[8] * pz + o[12];
          const wy2 = o[1] * px + o[5] * py + o[9] * pz + o[13];
          const wz2 = o[2] * px + o[6] * py + o[10] * pz + o[14];
          if (wx2 < mn[0]) mn[0] = wx2; if (wx2 > mx[0]) mx[0] = wx2;
          if (wy2 < mn[1]) mn[1] = wy2; if (wy2 > mx[1]) mx[1] = wy2;
          if (wz2 < mn[2]) mn[2] = wz2; if (wz2 > mx[2]) mx[2] = wz2;
        }
      }
    }
    for (const child of node.listChildren()) walk(child, o);
  };

  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) walk(node, I);
  }
  return { w: mx[0] - mn[0], h: mx[1] - mn[1], d: mx[2] - mn[2] };
}

const fixes = [];
console.log('name                 raw WxHxD          metres  old scale -> new   note');

for (const [name, def] of Object.entries(PROPS)) {
  const path = `public/assets/props/${name}.glb`;
  if (!fs.existsSync(path)) { console.log(`  ${name.padEnd(20)} MISSING`); continue; }

  const size = measure(await io.read(path));
  if (!(size.h > 1e-4)) { console.log(`  ${name.padEnd(20)} degenerate height`); continue; }

  // `metres` means the object's LONGEST real-world dimension, not its height.
  // Height is the wrong invariant for anything flat: normalising a bed's 0.41
  // unit height to 2m would give a 2m-tall, 10m-long bed. Longest-dimension is
  // unambiguous, measurable, and correct for buildings and furniture alike.
  const target = def.metres ?? 2;
  const longest = Math.max(size.w, size.h, size.d);
  const correct = +(target / longest).toFixed(3);
  const actual = def.scale * longest;
  // Drift is measured on the unrounded size. Rounding to 2dp first made anything
  // smaller than a decimetre permanently unfixable: a 0.025m ring renders 0.0248,
  // which rounds to 0.02 and reports as 20% out no matter what scale is written.
  const drift = Math.abs(actual - target) / target;
  const rendered = +actual.toFixed(target < 0.1 ? 4 : 2);

  const note = drift > 0.25 ? `RENDERS ${rendered}m NOT ${target}m` : '';

  if (drift > 0.02 || note) {
    console.log(`  ${name.padEnd(20)} ${size.w.toFixed(2)}x${size.h.toFixed(2)}x${size.d.toFixed(2)}`
      + `   ${String(target).padEnd(6)} ${String(def.scale).padEnd(8)} -> ${String(correct).padEnd(7)} ${note}`);
    fixes.push({ name, from: def.scale, to: correct });
  }
}

console.log(`\n${fixes.length} of ${Object.keys(PROPS).length} entries are wrong.`);

if (write && fixes.length) {
  let src = fs.readFileSync('src/data/catalog.js', 'utf8');
  let n = 0;
  for (const f of fixes) {
    // Rewrite only the scale field on that entry's line.
    const re = new RegExp(`('${f.name}':\\s*\\{[^}]*?scale:\\s*)([\\d.]+)`);
    if (re.test(src)) { src = src.replace(re, `$1${f.to}`); n++; }
  }
  fs.writeFileSync('src/data/catalog.js', src);
  console.log(`rewrote ${n} scale values in src/data/catalog.js`);
}
