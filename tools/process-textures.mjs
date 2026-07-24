// textures/*.png  ->  public/assets/terrain/*.webp
//
// Two jobs:
//
// 1. Close the wrap seams. The source set is *nearly* seamless — measured edge
//    deltas of 0.4-11.8 / 255 — so a narrow cross-fade across the wrap is enough,
//    and is far less destructive than a full offset-and-heal.
//
// 2. Flatten the low-frequency lighting gradient on albedo. A photo carries the
//    lighting of the day it was shot; tiled over a hillside that gradient becomes
//    a visible grid of light and dark patches. Dividing by a heavily blurred copy
//    keeps the detail and removes the drift. Normal maps are left alone — their
//    channels encode direction, not brightness.
//
//   node tools/process-textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'textures');
const OUT = path.join(root, 'public', 'assets', 'terrain');

// Source name -> game name. The gaps (bare granite, snow) are noted in the
// design doc; these four cover the ground surfaces.
const MAP = {
  'grass': 'heath',              // coastal grass / heather
  'gravel': 'shingle',           // beach pebbles and worn track
  'varied ground': 'ground',     // mixed dirt and turf, the transition surface
  'CobbleStone': 'cobble',       // quay paving, and rocky outcrop at large scale
  'Cobble stone': 'cobble',      // the normal map is named with a space
};

const BLEND = 48;   // px of cross-fade across each wrap edge

/** Cross-fade opposite edges into each other so the wrap is continuous. */
function healSeams(data, w, h, ch) {
  const out = Float32Array.from(data);

  for (let y = 0; y < h; y++) {
    for (let k = 0; k < BLEND; k++) {
      // Weight goes 0.5 at the very edge to 0 at the inner limit, so the two
      // sides meet exactly halfway and neither is favoured.
      const t = 0.5 * (1 - k / BLEND);
      const li = (y * w + k) * ch;
      const ri = (y * w + (w - 1 - k)) * ch;
      for (let c = 0; c < ch; c++) {
        const l = data[li + c], r = data[ri + c];
        out[li + c] = l * (1 - t) + r * t;
        out[ri + c] = r * (1 - t) + l * t;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let k = 0; k < BLEND; k++) {
      const t = 0.5 * (1 - k / BLEND);
      const ti = (k * w + x) * ch;
      const bi = ((h - 1 - k) * w + x) * ch;
      for (let c = 0; c < ch; c++) {
        const a = out[ti + c], b = out[bi + c];
        out[ti + c] = a * (1 - t) + b * t;
        out[bi + c] = b * (1 - t) + a * t;
      }
    }
  }
  return out;
}

/** Divide out the blurred luminance so only local contrast survives. */
async function flattenLighting(data, w, h, ch) {
  const u8 = Buffer.from(Uint8ClampedArray.from(data));
  // Blur radius ~1/6 of the tile: large enough to be "lighting", small enough
  // to leave the texture's own structure intact.
  const blurred = await sharp(u8, { raw: { width: w, height: h, channels: ch } })
    .blur(w / 6).raw().toBuffer();

  const out = Float32Array.from(data);
  // Target the tile's own mean so the result keeps its overall tone.
  let mean = 0;
  for (let i = 0; i < data.length; i += ch) {
    mean += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  mean /= (data.length / ch);

  for (let i = 0; i < data.length; i += ch) {
    const lum = blurred[i] * 0.299 + blurred[i + 1] * 0.587 + blurred[i + 2] * 0.114;
    // Clamp the correction so a very dark or bright patch can't blow up.
    const gain = Math.max(0.75, Math.min(1.35, mean / Math.max(1, lum)));
    for (let c = 0; c < Math.min(3, ch); c++) out[i + c] = data[i + c] * gain;
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(SRC).filter((f) => /\.png$/i.test(f));
console.log(`processing ${files.length} textures -> public/assets/terrain\n`);

for (const file of files) {
  const stem = file.replace(/\.png$/i, '');
  const isNormal = /\s*(nm|normal)$/i.test(stem);
  const baseName = stem.replace(/\s*(nm|normal)$/i, '').trim();
  const name = MAP[baseName];
  if (!name) { console.log(`  skip ${file} (unmapped)`); continue; }

  const src = sharp(path.join(SRC, file));
  const { data, info } = await src.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  let processed = healSeams(data, w, h, ch);
  if (!isNormal) processed = await flattenLighting(processed, w, h, ch);

  const outName = `${name}${isNormal ? '_n' : ''}.webp`;
  const buf = Buffer.from(Uint8ClampedArray.from(processed));
  await sharp(buf, { raw: { width: w, height: h, channels: ch } })
    // Normals hold up badly under chroma loss, so they get a much higher quality.
    .webp({ quality: isNormal ? 95 : 88, effort: 5 })
    .toFile(path.join(OUT, outName));

  const inSize = fs.statSync(path.join(SRC, file)).size;
  const outSize = fs.statSync(path.join(OUT, outName)).size;
  console.log(`  ${file.padEnd(22)} -> ${outName.padEnd(14)} ${(inSize / 1048576).toFixed(1)}MB -> ${(outSize / 1048576).toFixed(2)}MB`
    + `${isNormal ? '  (normal: seams only)' : '  (seams + lighting flattened)'}`);
}

console.log('\ndone');
