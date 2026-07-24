// Recipe pipeline validation for Belve's Scroll.
// Parses the two prepared base GLBs + 11 character recipe JSONs and checks:
//  - base rig (joint count/names), mesh names, vertex counts, morph targets
//  - recipe structure, per-mesh keying, UV match rate against the base
//  - reconstruction: apply offsets, compare against the raw GLB export where present
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/smorc/Documents/belves scroll/assets-src/characters';

// ---------------- minimal GLB reader ----------------
function readGLB(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not glb: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorData(glb, idx) {
  const a = glb.json.accessors[idx];
  const bv = glb.json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = NCOMP[a.type];
  const stride = bv.byteStride ? bv.byteStride / T.BYTES_PER_ELEMENT : n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const src = new T(glb.bin.buffer, glb.bin.byteOffset + base, a.count * stride - (stride - n));
  if (stride === n) return { arr: src.slice(0, a.count * n), n, count: a.count, normalized: !!a.normalized, ctype: a.componentType };
  const out = new T(a.count * n);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = src[i * stride + c];
  return { arr: out, n, count: a.count, normalized: !!a.normalized, ctype: a.componentType };
}

function toFloat(d) {
  if (d.ctype === 5126) return Float32Array.from(d.arr);
  const out = new Float32Array(d.arr.length);
  const scale = d.normalized ? (d.ctype === 5123 ? 1 / 65535 : d.ctype === 5121 ? 1 / 255 : d.ctype === 5122 ? 1 / 32767 : 1) : 1;
  for (let i = 0; i < d.arr.length; i++) out[i] = d.arr[i] * scale;
  return out;
}

function meshInventory(glb) {
  const out = [];
  const nodesByMesh = new Map();
  (glb.json.nodes || []).forEach((nd, i) => { if (nd.mesh !== undefined) nodesByMesh.set(nd.mesh, nd.name || `node${i}`); });
  (glb.json.meshes || []).forEach((m, mi) => {
    m.primitives.forEach((p, pi) => {
      const pos = glb.json.accessors[p.attributes.POSITION];
      out.push({
        mesh: m.name || nodesByMesh.get(mi) || `mesh${mi}`, prim: pi,
        verts: pos.count,
        attrs: Object.keys(p.attributes).join(','),
        morphs: (p.targets || []).length,
        morphNames: (m.extras && m.extras.targetNames) ? m.extras.targetNames.length : 0,
        posAcc: p.attributes.POSITION, uvAcc: p.attributes.TEXCOORD_0,
        material: p.material,
      });
    });
  });
  return out;
}

function skinInfo(glb) {
  const skins = glb.json.skins || [];
  return skins.map(s => ({ joints: s.joints.length, names: s.joints.slice(0, 8).map(j => glb.json.nodes[j].name).concat(['…']), all: s.joints.map(j => glb.json.nodes[j].name) }));
}

// ---------------- load bases ----------------
const report = {};
const bases = {};
for (const b of ['venus', 'mars']) {
  const glb = readGLB(path.join(DIR, `_base_${b}.glb`));
  const inv = meshInventory(glb);
  const skins = skinInfo(glb);
  bases[b] = { glb, inv };
  report[b] = {
    file: `_base_${b}.glb`,
    meshes: inv.map(m => ({ mesh: m.mesh, verts: m.verts, attrs: m.attrs, morphs: m.morphs })),
    skins: skins.map(s => ({ joints: s.joints, sample: s.names })),
    animations: (glb.json.animations || []).length,
    images: (glb.json.images || []).length,
    extensionsUsed: glb.json.extensionsUsed || [],
  };
}

// ---------------- analyze recipes ----------------
const RECIPES = ['Maple', 'Willow', 'Ember', 'Kari', 'Mildrid', 'Snader', 'Haggar', 'Travis', 'Cedar', 'Pobart', 'Charles'];
report.recipes = {};

for (const name of RECIPES) {
  const rc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}_recipe.json`), 'utf8'));
  const base = bases[rc.baseMesh];
  const r = {
    kind: rc.kind, version: rc.version, base: rc.baseMesh, baseUrl: rc.baseUrl,
    charId: rc.character?.id ?? null, charName: rc.character?.name,
    hair: rc.hair, eyes: rc.eyes, outfit: rc.outfit ?? null,
    textures: Object.fromEntries(Object.entries(rc.textures || {}).map(([k, v]) => [k, typeof v === 'string' ? `${v.slice(5, v.indexOf(';'))} ${(v.length * 3 / 4 / 1024).toFixed(0)}KB` : typeof v])),
    meshes: {},
  };
  for (const [mn, g] of Object.entries(rc.geometry?.meshes || {})) {
    const bm = base.inv.find(m => m.mesh === mn);
    const entry = {
      key: g.key, vertexCount: g.vertexCount, movedCount: g.movedCount,
      baseFound: !!bm, baseVerts: bm?.verts,
      arrays: { uvs: g.uvs?.length ?? 0, indices: g.indices?.length ?? 0, offsets: g.offsets?.length ?? 0 },
      maxOffset: 0, uvMatch: null,
    };
    for (let k = 0; k < (g.offsets?.length ?? 0); k++) entry.maxOffset = Math.max(entry.maxOffset, Math.abs(g.offsets[k]));
    if (bm && g.key === 'uv' && g.movedCount > 0) {
      const uv = toFloat(accessorData(base.glb, bm.uvAcc));
      // hash grid at 1e-4 cells, nearest match
      const tol = rc.geometry.uvTolerance ?? 1e-4;
      const cell = tol;
      const gridKey = (u, v) => `${Math.round(u / cell)},${Math.round(v / cell)}`;
      const grid = new Map();
      for (let i = 0; i < bm.verts; i++) {
        const k2 = gridKey(uv[i * 2], uv[i * 2 + 1]);
        if (!grid.has(k2)) grid.set(k2, []);
        grid.get(k2).push(i);
      }
      let missed = 0, matched = 0, maxD = 0;
      entry.map = new Int32Array(g.movedCount).fill(-1);
      for (let k = 0; k < g.movedCount; k++) {
        const u = g.uvs[k * 2], v = g.uvs[k * 2 + 1];
        let best = -1, bd = Infinity;
        const cu = Math.round(u / cell), cv = Math.round(v / cell);
        for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
          for (const i of (grid.get(`${cu + du},${cv + dv}`) || [])) {
            const d = Math.hypot(uv[i * 2] - u, uv[i * 2 + 1] - v);
            if (d < bd) { bd = d; best = i; }
          }
        }
        if (best === -1 || bd > tol) missed++;
        else { matched++; maxD = Math.max(maxD, bd); entry.map[k] = best; }
      }
      entry.uvMatch = { matched, missed, maxUVDist: +maxD.toExponential(2) };
    }
    if (bm && g.key === 'index') {
      let oob = 0;
      for (const i of g.indices) if (i < 0 || i >= bm.verts) oob++;
      entry.indexCheck = { outOfRange: oob };
    }
    r.meshes[mn] = entry;
    r._rc = rc; // keep for reconstruction step
  }
  report.recipes[name] = r;
}

// ---------------- round-trip vs raw GLB exports ----------------
// Raw exports from Jul 19 exist for 9 of 11 (not Kari, not Pobart).
report.roundTrip = {};
for (const name of RECIPES) {
  const glbPath = path.join(DIR, `${name}.glb`);
  if (!fs.existsSync(glbPath)) { report.roundTrip[name] = 'no raw GLB export to compare'; continue; }
  const rec = report.recipes[name];
  const rc = rec._rc;
  const base = bases[rc.baseMesh];
  const exp = readGLB(glbPath);
  const expInv = meshInventory(exp);
  const rt = {};
  for (const [mn, g] of Object.entries(rc.geometry.meshes)) {
    if (!g.movedCount) continue;
    const bm = base.inv.find(m => m.mesh === mn);
    if (!bm) continue;
    // reconstruct
    const pos = toFloat(accessorData(base.glb, bm.posAcc));
    const out = Float32Array.from(pos);
    const entry = rec.meshes[mn];
    if (g.key === 'uv' && entry.map) {
      for (let k = 0; k < g.movedCount; k++) {
        const i = entry.map[k];
        if (i < 0) continue;
        out[i * 3] += g.offsets[k * 3]; out[i * 3 + 1] += g.offsets[k * 3 + 1]; out[i * 3 + 2] += g.offsets[k * 3 + 2];
      }
    } else {
      for (let k = 0; k < g.movedCount; k++) {
        const i = g.indices[k];
        out[i * 3] += g.offsets[k * 3]; out[i * 3 + 1] += g.offsets[k * 3 + 1]; out[i * 3 + 2] += g.offsets[k * 3 + 2];
      }
    }
    // find matching mesh in export by vertex count (names may be missing there)
    const cands = expInv.filter(m => m.verts === g.vertexCount);
    if (!cands.length) { rt[mn] = 'no matching mesh in export'; continue; }
    let best = null;
    for (const c of cands) {
      const ep = toFloat(accessorData(exp, c.posAcc));
      let maxE = 0, sum = 0;
      for (let i = 0; i < g.vertexCount * 3; i++) { const e = Math.abs(ep[i] - out[i]); if (e > maxE) maxE = e; sum += e; }
      const res = { mesh: c.mesh || '(unnamed)', maxErr_mm: +(maxE * 1000).toFixed(4), meanErr_mm: +(sum / (g.vertexCount * 3) * 1000).toFixed(4) };
      if (!best || res.maxErr_mm < best.maxErr_mm) best = res;
    }
    rt[mn] = best;
  }
  report.roundTrip[name] = rt;
}

for (const r of Object.values(report.recipes)) { delete r._rc; for (const m of Object.values(r.meshes)) delete m.map; }
fs.writeFileSync(path.join(DIR, '..', '..', 'docs', 'recipe-audit.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, (k, v) => k === 'all' ? undefined : v, 1).slice(0, 12000));
