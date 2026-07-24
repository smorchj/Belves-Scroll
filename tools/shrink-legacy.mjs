// Texture-only shrink of the legacy character GLBs that still load in-game.
//
// These five predate the recipe pipeline and ship authoring-size textures
// (up to 8192²) that together push the tab's JS heap past 1.1GB. This pass
// re-encodes ONLY the textures (WebP, capped 2048 — same budget as the recipe
// pipeline's outfits): geometry, skinning, morph targets and node structure
// are byte-identical, so nothing that addresses vertices or shapes can drift.
//
//   node tools/shrink-legacy.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'assets', 'characters');
const SRCDIR = path.join(root, 'assets-src', 'characters');

// Only the ones the game still loads — the rest of the legacy set is dead
// weight on disk but never touches the heap.
const STILL_LOADED = ['miriam', 'makal', 'woodland-druid', 'woodland-huldra', 'lilly-raider'];

const force = process.argv.includes('--force');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const MB = (n) => (n / 1048576).toFixed(1) + 'MB';

for (const slug of STILL_LOADED) {
  const out = path.join(OUT, slug + '.glb');
  // Prefer the pristine authoring copy; fall back to shrinking in place.
  const srcCandidates = fs.existsSync(SRCDIR)
    ? fs.readdirSync(SRCDIR).filter((f) => f.replace(/\.glb$/, '').replace(/\s+/g, '-').toLowerCase() === slug)
    : [];
  const src = srcCandidates.length ? path.join(SRCDIR, srcCandidates[0]) : out;
  if (!fs.existsSync(src)) { console.log(`  MISSING ${slug}`); continue; }

  const before = fs.statSync(out).size;
  if (!force && before < 15 * 1048576) { console.log(`  skip ${slug} (already ${MB(before)})`); continue; }

  const doc = await io.read(src);
  const morphs = doc.getRoot().listMeshes()
    .reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.listTargets().length, 0), 0);

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 85, slots: /^(?!normalTexture)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 95, slots: /^normalTexture$/ }),
  );

  await io.write(out, doc);
  const after = fs.statSync(out).size;
  console.log(`  ok ${slug.padEnd(18)} ${MB(before)} -> ${MB(after)}  (morph targets kept: ${morphs})`);
}
console.log('done');
