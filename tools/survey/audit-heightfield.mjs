/**
 * A headless stand-in for Terrain that reads the real .r16 and reproduces
 * Terrain.js's sampling exactly. Written independently of Terrain.js so a bug in
 * the sampler cannot hide behind itself; the arithmetic is transcribed from
 * src/world/Terrain.js lines 60-92 and cross-checked in audit-placement.mjs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadHeightField(root) {
  const base = path.join(root, 'public', 'assets', 'terrain');
  const manifest = JSON.parse(await readFile(path.join(base, 'heroy.json'), 'utf8'));
  const buf = await readFile(path.join(base, 'heroy.r16'));
  const data = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  return new HeightField(manifest, data);
}

export class HeightField {
  constructor(meta, data) {
    this.meta = meta;
    this.size = meta.sizeMetres;
    this.samples = meta.samples;
    this.minY = meta.minElevation;
    this.scale = meta.scale;
    this.data = data;
    this.half = this.size / 2;
    this.step = this.size / (this.samples - 1);
    this.seaLevel = 0.0;
  }

  height(x, z) {
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    const n = this.samples;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= n - 1 || z0 >= n - 1) {
      const cx = Math.min(n - 1, Math.max(0, x0));
      const cz = Math.min(n - 1, Math.max(0, z0));
      return this.data[cz * n + cx] * this.scale + this.minY;
    }
    const tx = fx - x0, tz = fz - z0;
    const d = this.data, i = z0 * n + x0;
    const h00 = d[i], h10 = d[i + 1], h01 = d[i + n], h11 = d[i + n + 1];
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return (a + (b - a) * tz) * this.scale + this.minY;
  }

  normal(x, z) {
    const e = this.step;
    const l = this.height(x - e, z), r = this.height(x + e, z);
    const d = this.height(x, z - e), u = this.height(x, z + e);
    let nx = l - r, ny = 2 * e, nz = d - u;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  slope(x, z) { return 1 - this.normal(x, z).y; }

  isWater(x, z) { return this.height(x, z) <= this.seaLevel + 0.15; }
}
