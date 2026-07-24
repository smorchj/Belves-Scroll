// Generate catalog entries for newly imported props.
//
// Meshy normalises every export to a ~2-unit bounding cube, so the file carries
// no real scale. The intended real-world size is authored here by hand, and the
// multiplier is computed against each asset's *measured* longest dimension —
// assuming a flat 2.0 would misplace anything that didn't normalise exactly.
//
//   node tools/add-catalog.mjs
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// name -> [real metres along its longest axis, tags]
const SIZES = {
  // trees and plants
  'tree-fir':        [9.0,  ['nature', 'tree']],
  'tree-old':        [7.5,  ['nature', 'tree']],
  'tree-verdant':    [7.0,  ['nature', 'tree']],
  'tree-cluster':    [9.5,  ['nature', 'tree']],
  'plant-succulent': [0.5,  ['nature', 'plant']],
  'logs':            [2.2,  ['nature', 'prop']],

  // structures
  'house-cabin':     [7.0,  ['building', 'house']],
  'wishing-well':    [2.2,  ['structure']],
  'archway-stone':   [4.2,  ['structure', 'ruin']],
  'pillar-crumbling':[3.4,  ['structure', 'ruin']],

  // interior furniture
  'bed':             [2.0,  ['interior', 'furniture']],
  'bathtub':         [1.7,  ['interior', 'furniture']],
  'stump-chair':     [0.9,  ['interior', 'furniture']],
  'stone-throne':    [1.7,  ['interior', 'furniture']],
  'candelabra':      [0.5,  ['interior', 'light']],

  // containers and loot
  'chest-plain':     [1.0,  ['prop', 'container', 'loot']],
  'chest-iron':      [1.0,  ['prop', 'container', 'loot']],
  'chest-vine':      [1.1,  ['prop', 'container', 'loot']],
  'chest-overgrown': [1.1,  ['prop', 'container', 'loot']],

  // tableware and dressing
  'goblet-gold':     [0.2,  ['interior', 'clutter']],
  'chalice-vine':    [0.24, ['interior', 'clutter']],
  'vase':            [0.7,  ['interior', 'clutter']],
  'decor-carving':   [0.8,  ['interior', 'clutter']],

  // weapons
  'sword-enchanted': [1.05, ['weapon']],
  'sword-shadow':    [1.05, ['weapon']],
  'axe-viking':      [0.9,  ['weapon']],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const lines = [];

for (const [name, [metres, tags]] of Object.entries(SIZES)) {
  const path = `assets-src/meshy/${name}.glb`;
  if (!fs.existsSync(path)) { console.warn(`  ! no source for ${name}`); continue; }

  const doc = await io.read(path);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const a = pos.getMin([]), b = pos.getMax([]);
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a[i]); mx[i] = Math.max(mx[i], b[i]); }
    }
  }
  const longest = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const scale = +(metres / longest).toFixed(3);

  lines.push(`  '${name}':${' '.repeat(Math.max(1, 19 - name.length))}`
    + `{ src: '${name}',${' '.repeat(Math.max(1, 20 - name.length))}`
    + `scale: ${scale}, metres: ${metres}, tags: [${tags.map((t) => `'${t}'`).join(', ')}] },`);
  console.log(`  ${name.padEnd(18)} longest ${longest.toFixed(2)}u -> ${metres}m  scale ${scale}`);
}

const out = '\n  // --- imported batch: trees, furniture, containers, weapons ---\n'
  + lines.join('\n') + '\n';
fs.writeFileSync('tools/catalog-additions.txt', out);
console.log(`\nwrote ${lines.length} entries to tools/catalog-additions.txt`);
