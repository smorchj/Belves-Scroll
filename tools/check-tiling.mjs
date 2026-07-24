// Does a texture tile seamlessly?
//
// Compares the wrap seam (last column against first column, as they would meet
// when repeated) with the average difference between neighbouring interior
// columns. A seamless texture's wrap seam looks like any other interior seam;
// a non-tiling one shows a sharp discontinuity there.
//
//   node tools/check-tiling.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2] || 'textures';

function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// Pull column x out of raw RGB data.
function column(data, w, h, ch, x) {
  const out = new Float32Array(h * ch);
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < ch; c++) out[y * ch + c] = data[(y * w + x) * ch + c];
  }
  return out;
}

function row(data, w, h, ch, y) {
  const out = new Float32Array(w * ch);
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < ch; c++) out[x * ch + c] = data[(y * w + x) * ch + c];
  }
  return out;
}

const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f));
console.log(`checking ${files.length} textures in ${dir}/\n`);

for (const f of files) {
  const img = sharp(path.join(dir, f));
  const meta = await img.metadata();
  // Work at a reduced size: tiling is a low-frequency property and full-res
  // comparison is dominated by sensor noise.
  const W = Math.min(1024, meta.width);
  const { data, info } = await img
    .resize(W, Math.round(meta.height * (W / meta.width)))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels: ch } = info;

  // Horizontal wrap: column w-1 meets column 0.
  const hWrap = meanAbsDiff(column(data, w, h, ch, w - 1), column(data, w, h, ch, 0));
  // Vertical wrap: row h-1 meets row 0.
  const vWrap = meanAbsDiff(row(data, w, h, ch, h - 1), row(data, w, h, ch, 0));

  // Baseline: how different are ordinary neighbouring columns/rows?
  let hBase = 0, vBase = 0, n = 0;
  for (let x = 1; x < w - 1; x += Math.floor(w / 64) || 1) {
    hBase += meanAbsDiff(column(data, w, h, ch, x), column(data, w, h, ch, x + 1));
    n++;
  }
  hBase /= n;
  n = 0;
  for (let y = 1; y < h - 1; y += Math.floor(h / 64) || 1) {
    vBase += meanAbsDiff(row(data, w, h, ch, y), row(data, w, h, ch, y + 1));
    n++;
  }
  vBase /= n;

  const hRatio = hWrap / hBase, vRatio = vWrap / vBase;
  const worst = Math.max(hRatio, vRatio);
  // A seamless texture lands near 1.0. Anything past ~2 shows a visible seam.
  const verdict = worst < 1.6 ? 'TILES' : worst < 3 ? 'MARGINAL' : 'DOES NOT TILE';

  console.log(`${f}`);
  console.log(`  ${meta.width}x${meta.height} ${meta.format}  ${(fs.statSync(path.join(dir, f)).size / 1048576).toFixed(1)}MB`);
  console.log(`  horizontal seam ${hRatio.toFixed(2)}x baseline | vertical ${vRatio.toFixed(2)}x  ->  ${verdict}\n`);
}
