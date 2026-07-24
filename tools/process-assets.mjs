// Asset pipeline: assets-src/**  ->  public/assets/**
//
// The raw exports are authoring-quality: a single character GLB carries ~17MB of
// texture (including an 8192x8192 sheet) against ~39k verts. Geometry is free;
// textures are the entire budget. So this pass is mostly "resize hard, recompress
// to WebP", plus Draco for the chunky static props.
//
//   node tools/process-assets.mjs [--only <substring>] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup, draco, resample } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { PROPS, CREATURES } from '../src/data/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'assets-src');
const OUT = path.join(root, 'public', 'assets');

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const force = argv.includes('--force');

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const MB = (n) => (n / 1048576).toFixed(2) + 'MB';

/**
 * Strip every morph target from a character.
 *
 * All characters share one topology, so the ARKit deltas are byte-identical in
 * all twelve files — ~4.8MB of the same data, twelve times. tools/extract-morphs
 * pulls one sparse copy into public/assets/morphs/arkit.bin (1.2MB for all 58
 * shapes), and FaceLibrary re-attaches it at runtime to whoever is speaking. The
 * full expression range is preserved; only the duplication is removed.
 */
function stripMorphTargets(doc) {
  let dropped = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const target of prim.listTargets()) {
        prim.removeTarget(target);
        target.dispose();
        dropped++;
      }
    }
    if (mesh.getExtras()?.targetNames) {
      const extras = { ...mesh.getExtras() };
      delete extras.targetNames;
      mesh.setExtras(extras);
    }
    mesh.setWeights([]);
  }
  return dropped;
}

// Textures are the only thing this pass touches — geometry is left exactly as
// authored so that vertex order stays valid for the shared morph library and the
// face recipe, both of which address vertices by index.
//
// Faces are what the player actually looks at during dialogue, and outfits are
// read close-up, so characters keep 2048 (which mostly just caps the stray
// 8192x8192 sheet in the exports). Nothing that a character wears ever drops
// below 1024.
function textureBudget(kind) {
  return kind === 'character' ? 2048 : kind === 'creature' ? 1024 : 1024;
}

async function processGlb(srcFile, outFile, kind) {
  const srcSize = fs.statSync(srcFile).size;
  if (!force && fs.existsSync(outFile) && fs.statSync(outFile).mtimeMs > fs.statSync(srcFile).mtimeMs) {
    return { skipped: true, srcSize, outSize: fs.statSync(outFile).size };
  }

  const doc = await io.read(srcFile);
  const limit = textureBudget(kind);
  const droppedMorphs = kind === 'character' ? stripMorphTargets(doc) : 0;

  // Normal maps suffer badly from chroma subsampling, so they go to lossless-ish
  // WebP; colour maps take the lossy path.
  const normalTextures = new Set();
  for (const mat of doc.getRoot().listMaterials()) {
    const n = mat.getNormalTexture();
    if (n) normalTextures.add(n);
  }

  await doc.transform(
    resample(),
    prune(),
    dedup(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [limit, limit],
      quality: 85,
      slots: /^(?!normalTexture)/,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [limit, limit],
      quality: 95,
      slots: /^normalTexture$/,
    }),
  );

  // Draco on skinned+morphed characters risks visible drift in the face, and the
  // geometry is tiny anyway — only compress the static props, where meshes are
  // dense and there is nothing to drift.
  const skinned = doc.getRoot().listSkins().length > 0;
  const hasMorphs = doc.getRoot().listMeshes()
    .some((m) => m.listPrimitives().some((p) => p.listTargets().length > 0));
  if (!skinned && !hasMorphs) {
    await doc.transform(draco({ method: 'edgebreaker' }));
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await io.write(outFile, doc);
  return { skipped: false, srcSize, outSize: fs.statSync(outFile).size, draco: !skinned && !hasMorphs, droppedMorphs };
}

// ---------------------------------------------------------------- job list

const jobs = [];

// CHARACTER GLBs ARE NOT SHIPPED AT ALL.
//
// Every character in the game is built by the blending system: a per-character
// recipe JSON (public/assets/recipes/characters/) applied to one of the two
// shared base meshes, or a blend of those recipes. The old per-character GLB
// exports in assets-src/characters stay as archive only — copying them into
// public put ~830MB on the wire and crashed tabs, and the user has ruled them
// out of the game entirely.

// Meshy props and creatures, named from the curated catalog. Deriving names from
// the Meshy filenames collided badly — three different swords all reduced to
// "sword.glb" and silently overwrote each other.
const meshyDir = path.join(SRC, 'meshy');
for (const [name, def] of Object.entries(PROPS)) {
  // Older assets keep their raw Meshy filename; newer ones are imported under a
  // plain name, so accept either.
  const candidates = [
    path.join(meshyDir, `Meshy_AI_${def.src}_texture.glb`),
    path.join(meshyDir, `${def.src}.glb`),
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) { console.warn(`  ! missing source for ${name}: ${def.src}`); continue; }
  jobs.push({ src, out: path.join(OUT, 'props', name + '.glb'), kind: 'prop' });

  // A building with a `lodFar` src ships a second, low-poly GLB as `<name>.lod1.glb`
  // — the far level the runtime THREE.LOD swaps to at distance.
  if (def.lodFar) {
    const farCands = [
      path.join(meshyDir, `Meshy_AI_${def.lodFar}_texture.glb`),
      path.join(meshyDir, `${def.lodFar}.glb`),
    ];
    const far = farCands.find((p) => fs.existsSync(p));
    if (far) jobs.push({ src: far, out: path.join(OUT, 'props', name + '.lod1.glb'), kind: 'prop' });
    else console.warn(`  ! missing lodFar source for ${name}: ${def.lodFar}`);
  }
}
for (const [name, def] of Object.entries(CREATURES)) {
  const src = path.join(meshyDir, def.src + '.glb');
  if (!fs.existsSync(src)) { console.warn(`  ! missing source for ${name}: ${def.src}`); continue; }
  jobs.push({ src, out: path.join(OUT, 'creatures', name + '.glb'), kind: 'creature' });
}

// Skin textures for the character creator's shade picker.
function copySkins() {
  const src = path.join(SRC, 'characters', 'skin');
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const base of fs.readdirSync(src)) {
    const dstDir = path.join(OUT, 'skin', base);
    fs.mkdirSync(dstDir, { recursive: true });
    for (const f of fs.readdirSync(path.join(src, base))) {
      fs.copyFileSync(path.join(src, base, f), path.join(dstDir, f));
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------- run

const selected = only ? jobs.filter((j) => j.src.toLowerCase().includes(only.toLowerCase())) : jobs;
console.log(`processing ${selected.length} asset(s) -> public/assets\n`);

let totalIn = 0, totalOut = 0, failed = 0;
for (const job of selected) {
  const label = path.relative(OUT, job.out).padEnd(42);
  try {
    const r = await processGlb(job.src, job.out, job.kind);
    totalIn += r.srcSize; totalOut += r.outSize;
    const pct = ((1 - r.outSize / r.srcSize) * 100).toFixed(0);
    const notes = [r.draco ? 'draco' : '', r.droppedMorphs ? `-${r.droppedMorphs} morphs` : ''].filter(Boolean).join(' ');
    console.log(`  ${r.skipped ? 'skip' : ' ok '} ${label} ${MB(r.srcSize)} -> ${MB(r.outSize)}  (-${pct}%) ${notes}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${label} ${err.message}`);
  }
}

const skins = copySkins();
console.log(`\n  copied ${skins} skin textures`);
console.log(`\ntotal: ${MB(totalIn)} -> ${MB(totalOut)}  (-${((1 - totalOut / totalIn) * 100).toFixed(0)}%)${failed ? `  ${failed} FAILED` : ''}`);
