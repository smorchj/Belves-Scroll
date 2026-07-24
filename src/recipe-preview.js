/**
 * Recipe pipeline bench.
 *
 * Loads the two prepared bases once, then rebuilds every character from its
 * recipe JSON: sparse vertex offsets (UV- or index-keyed per mesh), per-mesh
 * data-URI textures, and hair from the game's shared hair library. What the
 * game would ship: 2 base GLBs + N small recipes, no per-character GLBs.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyScalpMask } from './character/HairLibrary.js';

const CAST = [
  // venus
  { name: 'Maple' }, { name: 'Willow' }, { name: 'Ember' }, { name: 'Kari' }, { name: 'Mildrid' },
  // mars
  { name: 'Snader' }, { name: 'Haggar' }, { name: 'Travis' }, { name: 'Cedar' }, { name: 'Pobart' }, { name: 'Charles' },
];

const status = document.getElementById('status');
const log = [];
const say = (s) => { log.push(s); status.textContent = log.slice(-30).join('\n'); console.log(s); };

// ------------------------------------------------------------------ rendering
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
window.__scene = scene;
scene.background = new THREE.Color(0x2a3038);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);

scene.add(new THREE.HemisphereLight(0xbfd4e6, 0x4a4238, 0.9));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(3, 6, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 4; sun.shadow.camera.bottom = -2;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xd8e4f0, 0.5);
fill.position.set(-4, 3, -3);
scene.add(fill);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 10),
  new THREE.MeshStandardMaterial({ color: 0x3d444d, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ recipe apply
function decodeTexture(dataUri) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(dataUri, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

/** Find the recipe's target mesh in the clone: exact name, else unique vertex count. */
function findMesh(root, meshName, vertexCount, notes) {
  let byName = null;
  const byCount = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === meshName) byName = o;
    if (o.geometry.getAttribute('position').count === vertexCount) byCount.push(o);
  });
  if (byName) return byName;
  if (byCount.length === 1) {
    notes.push(`  ! ${meshName}: name miss, matched by count -> ${byCount[0].name}`);
    return byCount[0];
  }
  notes.push(`  !! ${meshName}: NOT FOUND (candidates by count: ${byCount.length})`);
  return null;
}

/** Apply sparse offsets. UV-keyed via nearest lookup on a hash grid, else by index. */
function applyOffsets(mesh, g, tol, notes, scale = 1) {
  const geo = mesh.geometry = mesh.geometry.clone();
  const pos = geo.getAttribute('position');
  if (pos.count !== g.vertexCount) { notes.push(`  !! ${mesh.name}: vertex count ${pos.count} != recipe ${g.vertexCount}, skipped`); return; }

  // Dense per-vertex offsets, kept for downstream consumers (hair conforming
  // samples the head's offset field).
  const dense = new Float32Array(pos.count * 3);
  mesh.userData.__recipeOffsets = dense;

  if (g.key === 'uv') {
    const uv = geo.getAttribute('uv');
    if (!uv) { notes.push(`  !! ${mesh.name}: uv-keyed but mesh has no uv attribute`); return; }
    const cell = tol ?? 1e-4;
    const grid = new Map();
    const gk = (u, v) => `${Math.round(u / cell)},${Math.round(v / cell)}`;
    for (let i = 0; i < pos.count; i++) {
      const k = gk(uv.getX(i), uv.getY(i));
      (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
    }
    let missed = 0;
    for (let k = 0; k < g.movedCount; k++) {
      const u = g.uvs[k * 2], v = g.uvs[k * 2 + 1];
      const cu = Math.round(u / cell), cv = Math.round(v / cell);
      let best = -1, bd = Infinity;
      for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
        for (const i of (grid.get(`${cu + du},${cv + dv}`) || [])) {
          const d = Math.hypot(uv.getX(i) - u, uv.getY(i) - v);
          if (d < bd) { bd = d; best = i; }
        }
      }
      if (best === -1 || bd > cell) { missed++; continue; }
      pos.setXYZ(best,
        pos.getX(best) + g.offsets[k * 3] * scale,
        pos.getY(best) + g.offsets[k * 3 + 1] * scale,
        pos.getZ(best) + g.offsets[k * 3 + 2] * scale);
      dense[best * 3] = g.offsets[k * 3] * scale;
      dense[best * 3 + 1] = g.offsets[k * 3 + 1] * scale;
      dense[best * 3 + 2] = g.offsets[k * 3 + 2] * scale;
    }
    if (missed) notes.push(`  ! ${mesh.name}: ${missed}/${g.movedCount} uv lookups missed`);
  } else {
    // index-keyed (teeth) and the old recipe format, which is index-only.
    for (let k = 0; k < g.movedCount; k++) {
      const i = g.indices[k];
      pos.setXYZ(i,
        pos.getX(i) + g.offsets[k * 3] * scale,
        pos.getY(i) + g.offsets[k * 3 + 1] * scale,
        pos.getZ(i) + g.offsets[k * 3 + 2] * scale);
      dense[i * 3] = g.offsets[k * 3] * scale;
      dense[i * 3 + 1] = g.offsets[k * 3 + 1] * scale;
      dense[i * 3 + 2] = g.offsets[k * 3 + 2] * scale;
    }
  }
  pos.needsUpdate = true;
  // Recomputing per-mesh normals breaks the authored continuity where the head
  // and body meshes meet (a lighting seam that looks like a texture seam).
  // ?normals=recompute opts back in; default keeps the base normals, which stay
  // valid for sub-centimetre identity offsets.
  if (new URLSearchParams(location.search).get('normals') === 'recompute') geo.computeVertexNormals();
}

/**
 * Blend two recipes of the same base: offsets lerp linearly (they are absolute
 * deltas against the same neutral vertices), textures crossfade on a canvas.
 * Only meshes present in both and uv/index-keyed the same way are blended.
 */
async function blendRecipes(a, b, w) {
  const out = { baseMesh: a.baseMesh, geometry: { uvTolerance: a.geometry.uvTolerance, meshes: {} }, textures: {}, hair: w < 0.5 ? a.hair : b.hair };
  for (const [name, ga] of Object.entries(a.geometry.meshes)) {
    const gb = b.geometry.meshes[name];
    if (!gb || !ga.movedCount || !gb.movedCount || ga.key !== gb.key) { out.geometry.meshes[name] = ga; continue; }
    // accumulate into a map keyed by the recipe's own key space
    const acc = new Map();
    const add = (g, weight) => {
      for (let k = 0; k < g.movedCount; k++) {
        const key = g.key === 'uv' ? `${g.uvs[k * 2].toFixed(5)},${g.uvs[k * 2 + 1].toFixed(5)}` : g.indices[k];
        const e = acc.get(key) || { uv: g.key === 'uv' ? [g.uvs[k * 2], g.uvs[k * 2 + 1]] : null, i: g.key === 'uv' ? null : key, d: [0, 0, 0] };
        e.d[0] += g.offsets[k * 3] * weight;
        e.d[1] += g.offsets[k * 3 + 1] * weight;
        e.d[2] += g.offsets[k * 3 + 2] * weight;
        acc.set(key, e);
      }
    };
    add(ga, 1 - w); add(gb, w);
    const n = acc.size;
    const g = { key: ga.key, vertexCount: ga.vertexCount, movedCount: n,
                uvs: ga.key === 'uv' ? new Float64Array(n * 2) : [],
                indices: ga.key === 'uv' ? [] : new Array(n),
                offsets: new Float64Array(n * 3) };
    let k = 0;
    for (const e of acc.values()) {
      if (ga.key === 'uv') { g.uvs[k * 2] = e.uv[0]; g.uvs[k * 2 + 1] = e.uv[1]; }
      else g.indices[k] = e.i;
      g.offsets[k * 3] = e.d[0]; g.offsets[k * 3 + 1] = e.d[1]; g.offsets[k * 3 + 2] = e.d[2];
      k++;
    }
    out.geometry.meshes[name] = g;
  }
  // crossfade textures both recipes carry as data URIs
  for (const [name, ua] of Object.entries(a.textures || {})) {
    const ub = (b.textures || {})[name];
    if (typeof ua !== 'string') continue;
    if (typeof ub !== 'string' || ua === ub) { out.textures[name] = ua; continue; }
    const [ia, ib] = await Promise.all([ua, ub].map((u) => new Promise((res) => {
      const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = u;
    })));
    if (!ia || !ib) { out.textures[name] = ua; continue; }
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(ia, 0, 0);
    ctx.globalAlpha = w;
    ctx.drawImage(ib, 0, 0, c.width, c.height);
    out.textures[name] = c.toDataURL('image/jpeg', 0.9);
  }
  return out;
}

// ------------------------------------------------------------ hair (per docs)
//
// Source assets, on disk, exactly as embed.md lists them:
//   /assets-src/hair/<Style>/<Style>.glb                     — the cards mesh
//   /assets-src/hair/<Style>/textures/<Style>_CardsAtlas_Attribute.png
//   /assets-src/hair/<Style>/scalp_mask.png  + scalp.json ({darken})
// mh_materials.json: alpha_channel "r", ignore_gltf_map, roughness floor 0.62,
// blend_opacity 0.3, blend_roughness 0.84.
//
// Shading is hair-shader.md Case B: the atlas RED channel is coverage, colour
// comes from the material. Core pass = alpha-to-coverage; plus the light blended
// overlay from the material params. Fitting is hair-conform.md bind-once/replay.

const RAW_HAIR = new Map();   // 'style:base' -> {geo, coverage, scalpMask, darken, params}
const HEAD_REST = {};         // base -> Float32Array of the neutral head positions

/** The per-base SEATED asset (embed.md): `<Style>.<base>.glb`, "already seated
 *  on that base's head" — loaded with no transform. */
async function loadRawHair(style, baseMesh) {
  const key = `${style}:${baseMesh}`;
  if (RAW_HAIR.has(key)) return RAW_HAIR.get(key);
  const base = `/assets-src/hair/${style}`;
  const loader = new GLTFLoader();
  const [gltf, mh, scalp] = await Promise.all([
    loader.loadAsync(`${base}/${style}.${baseMesh}.glb`),
    fetch(`${base}/mh_materials.json`).then((r) => r.json()),
    fetch(`${base}/scalp.json`).then((r) => r.json()).catch(() => ({ darken: 0.55 })),
  ]);
  let geo = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
  const params = mh.materials?.[0]?.params ?? {};
  const loadTex = (file, colour = false) => new Promise((resolve) => {
    new THREE.TextureLoader().load(`${base}/${file}`, (t) => {
      t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.flipY = false;
      t.anisotropy = 8;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  const entry = {
    geo,
    coverage: await loadTex(mh.materials?.[0]?.textures?.alpha_r ?? `textures/${style}_CardsAtlas_Attribute.png`),
    scalpMask: await loadTex('scalp_mask.png'),
    scalpDarken: scalp.darken ?? 0.55,
    params,
    bind: null,   // computed once against this base's rest head
  };
  RAW_HAIR.set(key, entry);
  return entry;
}

/** Alpha from the atlas's RED channel; RGB ignored (mh_materials: alpha_channel "r"). */
function bindRedCoverage(mat, coverage) {
  mat.map = coverage;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
         diffuseColor.a *= texture2D( map, vMapUv ).r;
       #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'hair-alpha-from-red';
}

function hairMaterials(entry, colour) {
  const p = entry.params;
  const core = new THREE.MeshStandardMaterial({
    transparent: false, side: THREE.DoubleSide, metalness: 0,
    roughness: p.hair_roughness_floor ?? 0.62,
    color: new THREE.Color(colour),
    alphaToCoverage: true,       // hair-shader.md primary path (MSAA canvas)
  });
  bindRedCoverage(core, entry.coverage);
  const blend = new THREE.MeshStandardMaterial({
    transparent: true, opacity: p.blend_opacity ?? 0.3, alphaTest: 0.02,
    depthWrite: false, side: THREE.DoubleSide, metalness: 0,
    roughness: p.blend_roughness ?? 0.84,
    color: new THREE.Color(colour),
  });
  bindRedCoverage(blend, entry.coverage);
  return { core, blend };
}

/**
 * hair-conform.md bind-once/replay.
 *
 * Bind (once per style, against the REST skull the asset was authored on):
 *  - card segmentation: connected components over the index buffer
 *  - per hair vertex: K=4 nearest rest-scalp vertices, inverse-distance weights,
 *    influence w = 1 within 2cm of the scalp, smoothstep to 0 by 8cm
 *  - per card: root sample = the card vertex closest to the scalp
 *
 * Replay (per character): each vertex moves by its card root's displacement
 * plus w × (K-blended scalp displacement − root displacement).
 */
function bindHair(entry, restHead) {
  const pos = entry.geo.getAttribute('position');
  const n = pos.count;

  // connected components = cards
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const idx = entry.geo.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    if (b !== a) parent[b] = a;
    if (c !== a) parent[c] = a;
  }

  // grid over the rest scalp
  const cell = 0.03, grid = new Map();
  const gk = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
  for (let i = 0; i < restHead.length / 3; i++) {
    const k = gk(restHead[i * 3], restHead[i * 3 + 1], restHead[i * 3 + 2]);
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }

  const K = 4;
  const kIdx = new Int32Array(n * K).fill(-1);
  const kW = new Float32Array(n * K);
  const w = new Float32Array(n);
  const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  const nearest = new Float32Array(n).fill(Infinity);
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const cx = Math.round(x / cell), cy = Math.round(y / cell), cz = Math.round(z / cell);
    // gather candidates within a 2-cell neighbourhood (≥ 9cm reach)
    const best = [];   // [d2, i] kept sorted, max K
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      for (const i of (grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || [])) {
        const d2 = (restHead[i * 3] - x) ** 2 + (restHead[i * 3 + 1] - y) ** 2 + (restHead[i * 3 + 2] - z) ** 2;
        if (best.length < K) { best.push([d2, i]); best.sort((p, q) => p[0] - q[0]); }
        else if (d2 < best[K - 1][0]) { best[K - 1] = [d2, i]; best.sort((p, q) => p[0] - q[0]); }
      }
    }
    if (!best.length) { w[v] = 0; continue; }
    nearest[v] = Math.sqrt(best[0][0]);
    let sum = 0;
    for (let k = 0; k < best.length; k++) sum += 1 / (Math.sqrt(best[k][0]) + 1e-6);
    for (let k = 0; k < best.length; k++) {
      kIdx[v * K + k] = best[k][1];
      kW[v * K + k] = (1 / (Math.sqrt(best[k][0]) + 1e-6)) / sum;
    }
    w[v] = 1 - smoothstep(0.02, 0.08, nearest[v]);
  }

  // per-card root = vertex nearest the scalp
  const rootOf = new Map();   // component -> vertex
  for (let v = 0; v < n; v++) {
    const c = find(v);
    if (!rootOf.has(c) || nearest[v] < nearest[rootOf.get(c)]) rootOf.set(c, v);
  }
  const cardRoot = new Int32Array(n);
  for (let v = 0; v < n; v++) cardRoot[v] = rootOf.get(find(v));

  return { kIdx, kW, w, cardRoot, K, rest: pos.array.slice() };
}

/** Replay onto a cloned geometry given per-head-vertex displacement (current − rest). */
function replayHair(entry, bind, headDisp) {
  const geo = entry.geo.clone();
  const pos = geo.getAttribute('position');
  const { kIdx, kW, w, cardRoot, K, rest } = bind;
  const disp = (v, out) => {
    out[0] = out[1] = out[2] = 0;
    for (let k = 0; k < K; k++) {
      const i = kIdx[v * K + k];
      if (i < 0) continue;
      const wk = kW[v * K + k];
      out[0] += headDisp[i * 3] * wk; out[1] += headDisp[i * 3 + 1] * wk; out[2] += headDisp[i * 3 + 2] * wk;
    }
  };
  const dv = [0, 0, 0], dr = [0, 0, 0];
  for (let v = 0; v < pos.count; v++) {
    disp(v, dv); disp(cardRoot[v], dr);
    pos.setXYZ(v,
      rest[v * 3]     + dr[0] + w[v] * (dv[0] - dr[0]),
      rest[v * 3 + 1] + dr[1] + w[v] * (dv[1] - dr[1]),
      rest[v * 3 + 2] + dr[2] + w[v] * (dv[2] - dr[2]));
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

async function buildCharacter(recipe, base, notes, opts = {}) {
  const root = cloneSkeleton(base.scene);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

  for (const [meshName, g] of Object.entries(recipe.geometry.meshes)) {
    if (!g.movedCount) continue;
    const mesh = findMesh(root, meshName, g.vertexCount, notes);
    if (!mesh) continue;
    applyOffsets(mesh, g, recipe.geometry.uvTolerance, notes, opts.scale ?? 1);
  }

  let headMesh = null;
  for (const [meshName, uri] of Object.entries(recipe.textures || {})) {
    if (typeof uri !== 'string') {
      if (uri !== null) notes.push(`  ! ${meshName}: texture is ${typeof uri}, ignored`);
      else notes.push(`  ! ${meshName}: texture null (old recipe format) — base skin kept`);
      continue;
    }
    const mesh = findMesh(root, meshName, recipe.geometry.meshes[meshName]?.vertexCount ?? -1, notes);
    if (!mesh) continue;
    const tex = await decodeTexture(uri);
    if (!tex) { notes.push(`  !! ${meshName}: texture failed to decode`); continue; }
    mesh.material = mesh.material.clone();
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  }
  root.traverse((o) => { if (o.isMesh && /head/i.test(o.name)) headMesh = o; });

  // hair from the game's shared library: baked to model space for this lineage,
  // then CONFORMED to the sculpted skull by sampling the head's recipe-offset
  // field — for each hair vertex, take the offset of the nearest neutral-base
  // scalp vertex, feathered out with distance. ?conform=0 disables to compare.
  // The exporter invents hair for bald characters (it emits the base-default
  // hair). Verified against the site's characterStore: these three save hair: null.
  const BALD = ['Willow', 'Haggar', 'Charles'];
  if (BALD.includes(recipe.character?.name)) recipe.hair = null;

  if (recipe.hair?.style) {
    const entry = await loadRawHair(recipe.hair.style, recipe.baseMesh);
    const colour = new THREE.Color(recipe.hair.color || '#2e2119');
    if (entry.geo) {
      if (!entry.bind) entry.bind = bindHair(entry, HEAD_REST[recipe.baseMesh]);

      let geo = entry.geo.clone();
      const off = headMesh?.userData.__recipeOffsets;
      const applyConform = opts.conform !== false && params.get('conform') !== '0';
      if (applyConform && off) {
        // hair-conform.md replay: displacement = this character's head offsets
        geo = replayHair(entry, entry.bind, off);
        notes.push(`hair ${recipe.hair.style}.${recipe.baseMesh}: bind-once/replay`);
      }
      const { core, blend } = hairMaterials(entry, colour);
      const coreMesh = new THREE.Mesh(geo, core);
      coreMesh.castShadow = true;
      coreMesh.frustumCulled = false;
      const blendMesh = new THREE.Mesh(geo, blend);
      blendMesh.renderOrder = 2;
      blendMesh.frustumCulled = false;
      coreMesh.add(blendMesh);
      root.add(coreMesh);
      if (headMesh) applyScalpMask(headMesh, entry, colour);
    }
  }
  return root;
}

// ------------------------------------------------------------------ main
const params = new URLSearchParams(location.search);
// default is the single-character inspector; lineup views stay reachable via ?view=
const view = params.get('view') || 'inspect';
const group = params.get('group');   // 'venus' | 'mars' filters the lineup
const GROUPS = { venus: ['Maple', 'Willow', 'Ember', 'Kari', 'Mildrid'],
                 mars: ['Snader', 'Haggar', 'Travis', 'Cedar', 'Pobart', 'Charles'],
                 // worst head/body grading offenders + Maple as the control
                 seams: ['Maple', 'Willow', 'Snader', 'Haggar', 'Cedar'] };
const cast = view === 'seams'
  ? CAST.filter((c) => GROUPS.seams.includes(c.name))
  : group ? CAST.filter((c) => GROUPS[group]?.includes(c.name)) : CAST;

(async () => {
  const loader = new GLTFLoader();
  const [venus, mars] = await Promise.all([
    loader.loadAsync('/assets-src/characters/_base_venus.glb'),
    loader.loadAsync('/assets-src/characters/_base_mars.glb'),
  ]);
  for (const [b, g] of [['venus', venus], ['mars', mars]]) {
    g.scene.traverse((o) => {
      if (o.isMesh && o.name === `GEO-head_${b}`) HEAD_REST[b] = Float32Array.from(o.geometry.getAttribute('position').array);
    });
  }
  say('bases loaded');

  // Default: one character at a time, orbit camera, ◀ ▶ / arrow keys to flip.
  if (view === 'inspect') {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, 0);
    controls.enableDamping = true;
    camera.position.set(0, 1.6, 1.0);
    camera.fov = 40; camera.updateProjectionMatrix();

    const cache = new Map();
    let idx = 0, loading = false;
    const who = document.getElementById('who');

    async function show(i) {
      if (loading) return;
      loading = true;
      idx = (i + cast.length) % cast.length;
      const { name } = cast[idx];
      who.textContent = `… ${name}`;
      for (const e of cache.values()) scene.remove(e.root);
      if (!cache.has(name)) {
        const notes = [];
        try {
          const recipe = await fetch(`/assets-src/characters/${name}_recipe.json`).then((r) => r.json());
          const root = await buildCharacter(recipe, recipe.baseMesh === 'mars' ? mars : venus, notes);
          cache.set(name, { root, notes, base: recipe.baseMesh, hair: recipe.hair });
        } catch (e2) {
          who.textContent = `${name}: ${e2.message}`;
          loading = false;
          return;
        }
      }
      const e = cache.get(name);
      scene.add(e.root);
      who.textContent = `${idx + 1}/${cast.length} — ${name} (${e.base})  hair: ${e.hair?.style ?? '—'} ${e.hair?.color ?? ''}`;
      status.textContent = e.notes.join('\n');
      status.style.display = e.notes.length ? 'block' : 'none';
      loading = false;
    }

    document.getElementById('prev').onclick = () => show(idx - 1);
    document.getElementById('next').onclick = () => show(idx + 1);
    addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });
    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    });

    await show(cast.findIndex((c) => c.name === (params.get('who') || 'Maple')) ?? 0);
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    window.__benchReady = true;
    return;
  }

  document.getElementById('ui').style.display = 'none';

  // ?view=hairfit&who=Kari[&exaggerate=2.5] — the same character twice:
  // left = hair as shipped (neutral-base fit), right = conformed to the skull.
  // exaggerate scales the head offsets on BOTH copies to magnify the effect.
  if (view === 'hairfit') {
    const name = params.get('who') || 'Kari';
    const scale = +(params.get('exaggerate') || 1);
    const recipe = await fetch(`/assets-src/characters/${name}_recipe.json`).then((r) => r.json());
    const base = recipe.baseMesh === 'mars' ? mars : venus;
    const labels = [['base fit', false], ['conformed', true]];
    const allNotes = [];
    for (let i = 0; i < 2; i++) {
      const [label, conform] = labels[i];
      const notes = [];
      const root = await buildCharacter(recipe, base, notes, { conform, scale });
      root.position.x = (i - 0.5) * 0.55;
      scene.add(root);
      allNotes.push(`${label}: ${notes.filter((n) => n.includes('hair fit')).join(' ')}`);
      const c = document.createElement('canvas'); c.width = 512; c.height = 64;
      const g2 = c.getContext('2d'); g2.font = '30px system-ui'; g2.textAlign = 'center';
      g2.fillStyle = '#fff'; g2.fillText(`${name} — ${label}${scale !== 1 ? ` (${scale}× head offsets)` : ''}`, 256, 42);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
      spr.scale.set(0.62, 0.078, 1); spr.position.set((i - 0.5) * 0.55, 1.93, 0);
      scene.add(spr);
    }
    status.textContent = allNotes.join('\n');
    camera.position.set(0, 1.66, 1.15);
    camera.lookAt(0, 1.63, 0);
    camera.fov = 42; camera.updateProjectionMatrix();
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
    window.__benchReady = true;
    return;
  }

  // ?view=blend&a=Maple&b=Willow renders parent A, the 50/50 blend, parent B
  if (view === 'blend') {
    const an = params.get('a') || 'Maple', bn = params.get('b') || 'Willow';
    const [ra, rb] = await Promise.all([an, bn].map((n) =>
      fetch(`/assets-src/characters/${n}_recipe.json`).then((r) => r.json())));
    const rblend = await blendRecipes(ra, rb, +(params.get('w') || 0.5));
    const trio = [[an, ra], [`${an}×${bn}`, rblend], [bn, rb]];
    for (let i = 0; i < 3; i++) {
      const [label, rc] = trio[i];
      const notes = [];
      const root = await buildCharacter(rc, rc.baseMesh === 'mars' ? mars : venus, notes);
      root.position.x = (i - 1) * 0.55;
      scene.add(root);
      say(`${label} built${notes.length ? '\n' + notes.join('\n') : ''}`);
      const c = document.createElement('canvas'); c.width = 512; c.height = 64;
      const g2 = c.getContext('2d'); g2.font = '32px system-ui'; g2.textAlign = 'center';
      g2.fillStyle = '#fff'; g2.fillText(label, 256, 42);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
      spr.scale.set(1, 0.125, 1); spr.position.set((i - 1) * 0.55, 1.95, 0);
      scene.add(spr);
    }
    camera.position.set(0, 1.62, 2.6);
    camera.lookAt(0, 1.6, 0);
    camera.fov = Math.atan2((3 * 0.55 / 2 + 0.2) / camera.aspect, 2.6) * 2 * 57.3;
    camera.updateProjectionMatrix();
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
    window.__benchReady = true;
    return;
  }

  const spacing = view === 'heads' || view === 'seams' ? 0.5 : 0.85;
  const labels = [];
  for (let i = 0; i < cast.length; i++) {
    const { name } = cast[i];
    const notes = [];
    try {
      const recipe = await fetch(`/assets-src/characters/${name}_recipe.json`).then((r) => r.json());
      const base = recipe.baseMesh === 'mars' ? mars : venus;
      const t0 = performance.now();
      const root = await buildCharacter(recipe, base, notes);
      const ms = (performance.now() - t0).toFixed(0);
      root.position.x = (i - (cast.length - 1) / 2) * spacing;
      scene.add(root);
      labels.push({ x: root.position.x, name });
      say(`${name} (${recipe.baseMesh}) rebuilt in ${ms}ms${notes.length ? '\n' + notes.join('\n') : ''}`);
    } catch (e) {
      say(`${name} FAILED: ${e.message}`);
    }
  }

  const width = cast.length * spacing;
  // seams: tight on the neck/shoulder line where the head and body maps meet
  const dist = view === 'heads' ? 3.4 : view === 'seams' ? 2.6 : 8.2;
  const eyeY = view === 'heads' ? 1.62 : view === 'seams' ? 1.5 : 1.15;
  camera.position.set(0, eyeY, dist);
  camera.lookAt(0, view === 'heads' ? 1.6 : view === 'seams' ? 1.48 : 0.95, 0);
  camera.fov = Math.atan2((width / 2 + 0.3) / camera.aspect, dist) * 2 * 57.3;
  camera.updateProjectionMatrix();

  // name tags as sprites
  for (const { x, name } of labels) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '32px system-ui'; g.textAlign = 'center';
    g.fillStyle = '#fff'; g.fillText(name, 128, 42);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    spr.scale.set(0.5, 0.125, 1);
    spr.position.set(x, view === 'heads' ? 1.92 : 1.98, 0);
    scene.add(spr);
  }

  renderer.setAnimationLoop(() => renderer.render(scene, camera));
  window.__benchReady = true;
})();
