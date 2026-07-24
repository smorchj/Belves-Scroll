// Grass card photos -> alpha-keyed, trimmed textures for billboard cards.
//
// The source images are grass clumps shot on solid black with no usable alpha.
// Three things have to happen before they can be used as cards:
//
//  1. Key the black to alpha. Luminance is the key, but a naive threshold eats
//     the blade tips — they are thin, dark and antialiased against the backdrop,
//     so a hard cut leaves every blade with a chopped square end. A soft ramp
//     across the low end keeps the taper.
//
//  2. Remove the black fringe. Once alpha is keyed, the semi-transparent edge
//     pixels still carry the backdrop's black in their RGB, and blending that
//     produces a dark outline around every blade. The fix is to unpremultiply:
//     divide colour by alpha so the edge keeps its true green.
//
//  3. Trim and square. The clump occupies a fraction of the frame, and the empty
//     margin is wasted texture and wasted overdraw on a card that is mostly
//     transparent anyway.
//
//   node tools/process-grass.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public', 'assets', 'grass');
const SRC = path.join(root, 'assets-src', 'grass');

// Sources, in the order they should appear in the atlas. Named for what they are
// rather than by their generated filenames, which carry no meaning.
const CARDS = [
  { file: 'Gemini_Generated_Image_amhf2samhf2samhf.png', name: 'dry',    note: 'wind-flattened, straw over green' },
  { file: 'Gemini_Generated_Image_j1ja3mj1ja3mj1ja.png', name: 'meadow', note: 'mixed grass and clover, flowering' },
  { file: 'Gemini_Generated_Image_5r01eg5r01eg5r01.png', name: 'lush',   note: 'dense upright green blades' },
  { file: 'Gemini_Generated_Image_bzvwzkbzvwzkbzvw.png', name: 'sparse', note: 'tall thin stems, gappy' },
];

// The backdrop is NOT the same black in every image — measured corner luminance
// runs from 0 to 24 out of 255 across this set. A fixed threshold keyed one image
// cleanly and left a grey rectangle of low alpha across another, so the key is
// derived per image from its own corners instead.
const KEY_MARGIN = 10 / 255;    // above the measured backdrop before alpha starts
const KEY_RAMP = 0.085;         // width of the soft band where blade tips live

const SIZE = 1024;      // per-card, square

/**
 * Push colour outward into the transparent region.
 *
 * Transparent pixels are left as RGBA(0,0,0,0) by the key. That is invisible at
 * full resolution, but every mip level averages colour *and* alpha together, so
 * those black RGB values bleed into the blades. A few levels down, texels that
 * still pass the alpha test carry mostly-black colour — which is why distant
 * grass rendered as hard black squares.
 *
 * The standard fix is to make the invisible pixels carry a sensible colour.
 * Repeated dilation floods the nearest opaque colour outward, so any average
 * taken across the edge stays green.
 */
function dilateColour(px, width, height, passes = 24) {
  const idx = (x, y) => (y * width + x) * 4;
  // Track which pixels have a colour worth spreading, independently of alpha —
  // alpha must not be modified or the silhouette changes.
  let filled = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;

  for (let pass = 0; pass < passes; pass++) {
    const next = filled.slice();
    let changed = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (filled[p]) continue;

        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            if (!filled[yy * width + xx]) continue;
            const q = idx(xx, yy);
            r += px[q]; g += px[q + 1]; b += px[q + 2]; n++;
          }
        }
        if (!n) continue;

        const o = p * 4;
        px[o] = r / n; px[o + 1] = g / n; px[o + 2] = b / n;
        // A token alpha of 1/255. PNG encoders are free to throw away the colour
        // of fully-transparent pixels — sharp does — which would silently undo
        // this entire pass. One step above zero keeps the colour on disk while
        // staying far under the 0.42 alpha test, so it is never drawn.
        px[o + 3] = 1;
        next[p] = 1;
        changed++;
      }
    }

    filled = next;
    if (!changed) break;
  }

  // Dilation only reaches as far as it has passes, and a card seen at 75m samples
  // a mip level that averages hundreds of source pixels together — far beyond
  // that reach. Anything still black then bleeds in and the clump renders as a
  // hard black speck. So flood everything that is left with the clump's own mean
  // colour: invisible at full resolution, and correct at every mip level.
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < width * height; i++) {
    if (px[i * 4 + 3] < 128) continue;
    r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++;
  }
  if (!n) return;
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);

  for (let i = 0; i < width * height; i++) {
    if (filled[i]) continue;
    const o = i * 4;
    px[o] = r; px[o + 1] = g; px[o + 2] = b;
    px[o + 3] = 1;        // token alpha, so the encoder keeps the colour
  }
}

/**
 * Give every invisible pixel the clump's mean colour.
 *
 * Run on the FINAL raster, after all resampling. Mip generation averages colour
 * and alpha together, so any texel that is black-and-transparent drags the blades
 * toward black as the card recedes; at 75m the card samples a mip that averages
 * hundreds of source pixels and the clump collapses into a hard black speck.
 * Filling costs nothing at full resolution — alpha still hides these pixels — and
 * makes every mip level average toward grass instead of toward black.
 */
function fillTransparentWithMeanColour(px, width, height) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < width * height; i++) {
    if (px[i * 4 + 3] < 128) continue;
    r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++;
  }
  if (!n) return;
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (px[o + 3] >= 128) continue;
    // Blend toward the mean by how transparent the pixel is, so the soft edge
    // of a blade keeps its own colour and only the empty field is replaced.
    const t = 1 - px[o + 3] / 128;
    px[o] = px[o] * (1 - t) + r * t;
    px[o + 1] = px[o + 1] * (1 - t) + g * t;
    px[o + 2] = px[o + 2] * (1 - t) + b * t;
  }
}

/** The image's own backdrop level, from pixels that cannot be subject. */
function backdropLuminance(data, width, height) {
  const lum = (i) => (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  const samples = [];
  const inset = 3;
  for (let x = inset; x < width - inset; x += 17) {
    samples.push(lum((inset * width + x) * 4));
    samples.push(lum(((height - 1 - inset) * width + x) * 4));
  }
  for (let y = inset; y < height - inset; y += 17) {
    samples.push(lum((y * width + inset) * 4));
    samples.push(lum((y * width + width - 1 - inset) * 4));
  }
  samples.sort((a, b) => a - b);
  // The high end of the border sample, so a blade touching an edge cannot drag
  // the estimate down and leave the rest of the backdrop keyed in.
  return samples[Math.floor(samples.length * 0.85)];
}

async function keyOut(file) {
  const src = sharp(file);
  const { width, height } = await src.metadata();
  const { data } = await src.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const backdrop = backdropLuminance(data, width, height);
  const KEY_LOW = backdrop + KEY_MARGIN;
  const KEY_HIGH = KEY_LOW + KEY_RAMP;

  // These images carry a small four-pointed watermark near the bottom-right.
  // It keys as subject and would appear as a floating glyph in the grass.
  const wmX0 = Math.floor(width * 0.90), wmY0 = Math.floor(height * 0.82);

  const out = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let i = 0; i < width * height; i++) {
    const px = i % width, py = (i / width) | 0;
    if (px >= wmX0 && py >= wmY0) continue;      // watermark corner stays empty

    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;

    let a = (lum - KEY_LOW) / (KEY_HIGH - KEY_LOW);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    // Smoothstep, so the ramp has no visible banding along the soft edges.
    a = a * a * (3 - 2 * a);

    if (a > 0.004) {
      // Unpremultiply: recover the blade's own colour from a pixel that was
      // composited over black. Without this every soft edge stays sooty.
      const k = 1 / Math.max(a, 0.15);
      out[i * 4] = Math.min(255, data[i * 4] * k);
      out[i * 4 + 1] = Math.min(255, data[i * 4 + 1] * k);
      out[i * 4 + 2] = Math.min(255, data[i * 4 + 2] * k);
      out[i * 4 + 3] = Math.round(a * 255);

      if (a > 0.25) {
        const x = i % width, y = (i / width) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error(`${file}: keyed to nothing — check KEY_LOW`);

  // Every one of these photographs sits on a strip of dark soil and root mat.
  // It keys as subject because it is well above the backdrop, and it is the one
  // part of the card that is SOLID — so as distance mips the thin blades away,
  // the soil survives and each clump collapses into a hard black speck. Fading
  // it out over the bottom of the clump also lets the card meet the ground
  // without a visible cut line.
  const clumpH = maxY - minY + 1;
  const soilTop = maxY - clumpH * 0.14;
  for (let y = Math.max(0, Math.floor(soilTop)); y <= maxY; y++) {
    // 1 at the top of the band, 0 at the very base.
    const k = 1 - (y - soilTop) / Math.max(1, maxY - soilTop);
    const fade = Math.max(0, Math.min(1, k)) ** 1.6;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4 + 3;
      if (out[o] > 1) out[o] = Math.round(out[o] * fade);
    }
  }
  // Re-measure the bottom edge: the band just faded may have been the lowest
  // opaque content, and the crop must not keep a strip of near-nothing.
  const originalMaxY = maxY;
  for (let y = originalMaxY; y >= minY; y--) {
    let solid = false;
    for (let x = minX; x <= maxX && !solid; x++) {
      if (out[(y * width + x) * 4 + 3] > 64) solid = true;
    }
    if (solid) { maxY = y; break; }
  }

  dilateColour(out, width, height);

  // Pad a little so the trim never clips a stray blade tip.
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);

  return {
    backdrop,
    image: sharp(out, { raw: { width, height, channels: 4 } })
      .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }),
    crop: { w: maxX - minX + 1, h: maxY - minY + 1, of: `${width}x${height}` },
  };
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

const manifest = { cards: [], size: SIZE };

for (const card of CARDS) {
  const srcPath = fs.existsSync(path.join(SRC, card.name + '-source.png'))
    ? path.join(SRC, card.name + '-source.png')
    : path.join(root, card.file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ! missing ${card.file}`);
    continue;
  }

  const { image, crop, backdrop } = await keyOut(srcPath);

  // Fit into a square without distorting: a card's aspect matters, since the
  // quad it is mapped onto is built from these proportions.
  //
  // Resize FIRST, then fill. sharp premultiplies by alpha internally when it
  // resamples, so a pixel carrying colour at alpha 1/255 has that colour
  // multiplied to zero and rounded away before it is unpremultiplied back — the
  // fill has to happen on the final raster or it is silently discarded.
  const resized = await image
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer();

  fillTransparentWithMeanColour(resized, SIZE, SIZE);

  const buf = await sharp(resized, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(path.join(OUT, `${card.name}.png`), buf);

  // Coverage drives how much overdraw each card costs and how dense it looks.
  const { data } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 40) opaque++;
  const coverage = opaque / (SIZE * SIZE);

  manifest.cards.push({
    name: card.name,
    note: card.note,
    aspect: +(crop.w / crop.h).toFixed(3),
    coverage: +coverage.toFixed(3),
  });

  // Keep the originals under assets-src rather than loose in the project root.
  if (srcPath !== path.join(SRC, card.name + '-source.png')) {
    fs.renameSync(srcPath, path.join(SRC, card.name + '-source.png'));
  }

  console.log(`  ${card.name.padEnd(8)} ${crop.of} -> crop ${crop.w}x${crop.h}`
    + `  aspect ${(crop.w / crop.h).toFixed(2)}  coverage ${(coverage * 100).toFixed(0)}%  backdrop ${(backdrop*255).toFixed(0)}`);
}

fs.writeFileSync(path.join(OUT, 'grass.json'), JSON.stringify(manifest, null, 2));
console.log(`\n  ${manifest.cards.length} cards -> public/assets/grass`);
