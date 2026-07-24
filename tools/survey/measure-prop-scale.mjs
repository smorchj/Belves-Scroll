/**
 * Measure every prop's unscaled bounding box and compare the two scaling rules
 * used at runtime: Settlement's measuredScale (cat.metres / measured height) and
 * the catalog's hand-authored cat.scale, which Interior and Landmarks use.
 *
 * Adversarial check only — writes nothing back into the project.
 */
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { getBounds } from '@gltf-transform/core';

import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));

const catSrc = readFileSync(`${root}src/data/catalog.js`, 'utf8');
const m = catSrc.match(/export const PROPS = \{([\s\S]*?)\n\};/);
const PROPS = {};
for (const line of m[1].split('\n')) {
  const e = line.match(/'([^']+)':\s*\{[^}]*scale:\s*([\d.]+),\s*metres:\s*([\d.]+)/);
  if (e) PROPS[e[1]] = { scale: +e[2], metres: +e[3] };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const rows = [];
for (const [name, cat] of Object.entries(PROPS)) {
  let doc;
  try { doc = await io.read(`${root}public/assets/props/${name}.glb`); }
  catch (err) { rows.push({ name, err: err.message.slice(0, 60) }); continue; }
  const scene = doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
  const measured = sy > 1e-4 ? cat.metres / sy : null;
  rows.push({
    name, catScale: cat.scale, metres: cat.metres,
    raw: [sx, sy, sz].map((v) => +v.toFixed(3)),
    measured: measured && +measured.toFixed(3),
    ratio: measured && +(measured / cat.scale).toFixed(2),
    // What each rule renders as, in metres, on the longest horizontal axis:
    catW: +(Math.max(sx, sz) * cat.scale).toFixed(2),
    measW: measured && +(Math.max(sx, sz) * measured).toFixed(2),
    catH: +(sy * cat.scale).toFixed(2),
    measH: measured && +(sy * measured).toFixed(2),
  });
}

rows.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
console.log('name              catScale measured ratio | rawXYZ                 catWxH        measWxH');
for (const r of rows) {
  if (r.err) { console.log(`${r.name.padEnd(18)} ERROR ${r.err}`); continue; }
  console.log(
    `${r.name.padEnd(18)}${String(r.catScale).padStart(7)}${String(r.measured).padStart(9)}${String(r.ratio).padStart(7)} | ` +
    `${r.raw.join(' x ').padEnd(22)} ${`${r.catW}x${r.catH}`.padEnd(13)} ${r.measW}x${r.measH}`,
  );
}
