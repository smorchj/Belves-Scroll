import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { assets, applyCharacterMaterials } from '../core/Assets.js';
import { applyScalpMask } from './HairLibrary.js';

/**
 * Builds characters the way creategamecharacters.ai's docs describe:
 *
 *   2 prepared bases  (/assets/base/_base_<venus|mars>.glb — rigged, 51 ARKit
 *                      morphs on the head, shared topology)
 * + 1 recipe/character (/assets/recipes/characters/<Name>.json — sparse vertex
 *                      offsets keyed by UV (teeth by index) + skin textures)
 * + seated hair       (/assets/hairsrc/<Style>/<Style>.<base>.glb + coverage
 *                      atlas; conformed to the sculpted skull by
 *                      hair-conform.md's bind-once/replay)
 * + outfit layer      (/assets/outfits/_outfit_<Name>_<base>.glb, skinned to
 *                      the same 73-joint rig, + hideBody RLE ranges that cull
 *                      the body triangles the outfit covers)
 *
 * One base GLB is fetched per lineage and every character is a SkeletonUtils
 * clone of it, so the whole cast costs two downloads plus ~5MB of recipe each.
 */

const BASE_URL = (b) => `${import.meta.env.BASE_URL}assets/base/_base_${b}.glb`;

/** Until the site stops inventing hair for bald characters (they save hair:null). */
const BALD = new Set(['Willow', 'Haggar', 'Charles']);

/** These outfits cover the head (hood/straw hat) — hair must never render under them. */
export const HAIRLESS_OUTFITS = new Set(['Assassin Armor', 'Peasant farmer']);

/** Runtime counterpart of HAIRLESS_OUTFITS for outfit swaps on a built character. */
export function setHairHidden(root, hidden) {
  root.traverse((o) => {
    if (o.isMesh && (/^hair_/.test(o.name) || /CardsMesh/.test(o.name))) o.visible = !hidden;
  });
}

// --------------------------------------------------------------------- bases

const _headRest = {};            // base -> Float32Array neutral head positions

export async function loadBase(base) {
  const gltf = await assets.load(BASE_URL(base));
  if (!_headRest[base]) {
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.name === `GEO-head_${base}`) {
        _headRest[base] = Float32Array.from(o.geometry.getAttribute('position').array);
      }
    });
  }
  return gltf;
}

// ------------------------------------------------------------------- recipes

const _recipes = new Map();      // name -> Promise<recipe json>

export function loadRecipe(name) {
  if (!_recipes.has(name)) {
    _recipes.set(name, fetch(`${import.meta.env.BASE_URL}assets/recipes/characters/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`recipe ${name}: ${r.status}`);
      return r.json();
    }));
  }
  return _recipes.get(name);
}

/**
 * Drop the parsed recipe JSONs once the cast is built. Thirteen ~4.7MB files
 * parse into hundreds of MB of boxed number arrays and base64 strings, and
 * keeping them cached for the whole session is what pushed the tab's JS heap
 * past a gigabyte — squarely into "Aw, Snap" territory on a busy machine.
 * A later spawn (respawn clones the cached templates; the creator refetches
 * from HTTP cache) never needs them hot.
 */
export function releaseRecipeCaches() {
  _recipes.clear();
  _texCache.clear();   // decoded textures live on the GPU; the promises pin the data URIs
}

/**
 * Blend two recipes of one base: offsets lerp linearly (absolute deltas against
 * the same neutral vertices); head/body textures crossfade on a canvas. Used to
 * breed unique villagers from the named cast.
 */
export async function blendRecipes(a, b, w = 0.5) {
  const out = {
    baseMesh: a.baseMesh,
    character: { name: `${a.character?.name ?? '?'}×${b.character?.name ?? '?'}@${w}` },
    geometry: { uvTolerance: a.geometry.uvTolerance, meshes: {} },
    textures: {},
    hair: w < 0.5 ? a.hair : b.hair,
    eyes: a.eyes,
  };
  for (const [name, ga] of Object.entries(a.geometry.meshes)) {
    const gb = b.geometry.meshes[name];
    if (!gb || !ga.movedCount || !gb.movedCount || ga.key !== gb.key) { out.geometry.meshes[name] = ga; continue; }
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
  for (const [name, ua] of Object.entries(a.textures || {})) {
    const ub = (b.textures || {})[name];
    if (typeof ua !== 'string') continue;
    // Never bake a per-character texture — that reintroduces the linear VRAM
    // cost the recipe pipeline exists to kill. Both source maps stay in the
    // shared cache and the material mixes them by weight in the shader, so a
    // hundred villagers cost the same texture memory as the named cast.
    out.textures[name] = (typeof ub !== 'string' || ua === ub)
      ? ua
      : { blend: [ua, ub], w };
  }
  return out;
}

// -------------------------------------------------------------- recipe apply

function findMesh(root, meshName, vertexCount) {
  let byName = null;
  const byCount = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === meshName) byName = o;
    if (o.geometry.getAttribute('position').count === vertexCount) byCount.push(o);
  });
  return byName ?? (byCount.length === 1 ? byCount[0] : null);
}

/**
 * A sparse recipe delta scattered into a dense per-vertex Float32Array for
 * this mesh, without touching its geometry. UV-keyed via nearest lookup on a
 * hash grid (survives reordering); teeth are index-keyed.
 */
export function denseOffsets(mesh, g, tol) {
  const pos = mesh.geometry.getAttribute('position');
  if (pos.count !== g.vertexCount) return null;
  const dense = new Float32Array(pos.count * 3);

  if (g.key === 'uv') {
    const uv = mesh.geometry.getAttribute('uv');
    if (!uv) return null;
    const cell = tol ?? 1e-4;
    const grid = new Map();
    const gk = (u, v) => `${Math.round(u / cell)},${Math.round(v / cell)}`;
    for (let i = 0; i < pos.count; i++) {
      const k = gk(uv.getX(i), uv.getY(i));
      (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
    }
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
      if (best === -1 || bd > cell) continue;
      dense[best * 3] = g.offsets[k * 3];
      dense[best * 3 + 1] = g.offsets[k * 3 + 1];
      dense[best * 3 + 2] = g.offsets[k * 3 + 2];
    }
  } else {
    for (let k = 0; k < g.movedCount; k++) {
      const i = g.indices[k];
      dense[i * 3] = g.offsets[k * 3];
      dense[i * 3 + 1] = g.offsets[k * 3 + 1];
      dense[i * 3 + 2] = g.offsets[k * 3 + 2];
    }
  }
  return dense;
}

/**
 * Every recipe delta of `recipe`, densified against the meshes of `root`.
 * Returns meshName -> Float32Array. The creator lerps two of these live.
 */
export function denseRecipeOffsets(root, recipe) {
  const out = {};
  for (const [meshName, g] of Object.entries(recipe.geometry?.meshes ?? {})) {
    if (!g.movedCount) continue;
    const mesh = findMesh(root, meshName, g.vertexCount);
    const dense = mesh && denseOffsets(mesh, g, recipe.geometry.uvTolerance);
    if (dense) out[meshName] = dense;
  }
  return out;
}

/**
 * Apply sparse offsets to a cloned geometry. Keeps the dense offset field on
 * userData for the hair conform.
 */
function applyOffsets(mesh, g, tol) {
  const dense = denseOffsets(mesh, g, tol);
  if (!dense) return;
  const geo = mesh.geometry = mesh.geometry.clone();
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + dense[i * 3],
      pos.getY(i) + dense[i * 3 + 1],
      pos.getZ(i) + dense[i * 3 + 2]);
  }
  pos.needsUpdate = true;
  mesh.userData.__recipeOffsets = dense;
  // Base normals stay: identity offsets are sub-centimetre, and recomputing
  // per-mesh breaks the authored continuity where head meets body (neck seam).
}

/**
 * Recipes embed their textures as data URIs, and several (eyes, lashes, teeth)
 * are byte-identical across the whole cast. Decoding per character uploaded
 * dozens of duplicate maps in one burst — enough to reset the GPU driver and
 * lose the WebGL context — so decoded textures are cached by their URI.
 */
const _texCache = new Map();     // maxSize|data URI -> Promise<Texture|null>

function decodeDataTexture(uri, maxSize = Infinity) {
  const key = `${maxSize}|${uri}`;
  if (!_texCache.has(key)) {
    _texCache.set(key, (async () => {
      try {
        const blob = await (await fetch(uri)).blob();
        const bmp = await createImageBitmap(blob,
          maxSize < Infinity ? { resizeWidth: maxSize, resizeQuality: 'high' } : {});
        const t = new THREE.Texture(bmp);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        t.anisotropy = 4;
        t.needsUpdate = true;
        return t;
      } catch { return null; }
    })());
  }
  return _texCache.get(key);
}

/**
 * Mix two shared source maps in the shader by a fixed weight. One program
 * serves every blended character (stable cache key); only the two texture
 * bindings and the weight uniform differ per material.
 */
/**
 * Mix up to FOUR shared source maps in one shader pass. One program serves
 * every blended character (stable cache key); unused slots rebind the first
 * map at weight 0. The weights live in a Vector4 that the uniform references
 * directly, so setBlendWeights() updates are free — no recompiles, no clones.
 */
function applyMultiBlendMap(mat, texs, weights) {
  const t = [texs[0], texs[1] ?? texs[0], texs[2] ?? texs[0], texs[3] ?? texs[0]];
  const v = new THREE.Vector4(weights[0] ?? 1, weights[1] ?? 0, weights[2] ?? 0, weights[3] ?? 0);
  const sum = v.x + v.y + v.z + v.w || 1;
  v.divideScalar(sum);

  mat.map = t[0];
  mat.userData.__texBlend = true;
  mat.userData.blendWeights = v;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.blendMap1 = { value: t[1] };
    shader.uniforms.blendMap2 = { value: t[2] };
    shader.uniforms.blendMap3 = { value: t[3] };
    shader.uniforms.blendWeights = { value: mat.userData.blendWeights };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>',
        '#include <map_pars_fragment>\n'
        + 'uniform sampler2D blendMap1;\nuniform sampler2D blendMap2;\n'
        + 'uniform sampler2D blendMap3;\nuniform vec4 blendWeights;')
      .replace('#include <map_fragment>',
        `#ifdef USE_MAP
           diffuseColor *= texture2D( map, vMapUv ) * blendWeights.x
             + texture2D( blendMap1, vMapUv ) * blendWeights.y
             + texture2D( blendMap2, vMapUv ) * blendWeights.z
             + texture2D( blendMap3, vMapUv ) * blendWeights.w;
         #endif`);
  };
  mat.customProgramCacheKey = () => 'recipe-texblend4';
  mat.needsUpdate = true;
}

function applyBlendMap(mat, texA, texB, w) {
  applyMultiBlendMap(mat, [texA, texB], [1 - w, w]);
}

/** Drive every blend material under `root` to new weights — no recompiles. */
export function setBlendWeights(root, ws) {
  const [a = 0, b = 0, c = 0, d = 0] = ws;
  const sum = a + b + c + d || 1;
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (m?.userData?.__texBlend) m.userData.blendWeights.set(a / sum, b / sum, c / sum, d / sum);
    }
  });
}

// ----------------------------------------------------------------- hair

const _hair = new Map();   // 'style:base' -> entry

export async function loadHair(style, base) {
  const key = `${style}:${base}`;
  if (_hair.has(key)) return _hair.get(key);
  const p = (async () => {
    const dir = `${import.meta.env.BASE_URL}assets/hairsrc/${style}`;
    const [gltf, mh, scalp] = await Promise.all([
      assets.load(`${dir}/${style}.${base}.glb`),
      fetch(`${dir}/mh_materials.json`).then((r) => r.json()),
      fetch(`${dir}/scalp.json`).then((r) => r.json()).catch(() => ({ darken: 0.55 })),
    ]);
    let geo = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
    const params = mh.materials?.[0]?.params ?? {};
    const loadTex = (file) => new Promise((resolve) => {
      new THREE.TextureLoader().load(`${dir}/${file}`, (t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.flipY = false;
        t.anisotropy = 8;
        resolve(t);
      }, undefined, () => resolve(null));
    });
    const [coverage, scalpMask] = await Promise.all([
      loadTex(mh.materials?.[0]?.textures?.alpha_r ?? `textures/${style}_CardsAtlas_Attribute.png`),
      loadTex('scalp_mask.png'),
    ]);
    return { geo, coverage, scalpMask, scalpDarken: scalp.darken ?? 0.55, params, bind: null };
  })();
  _hair.set(key, p);
  return p;
}

/** Alpha from the atlas's RED channel (mh_materials: alpha_channel "r"); RGB ignored. */
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
    alphaToCoverage: true,
    alphaTest: 0.3,                     // fallback where MSAA is unavailable
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

/** hair-conform.md bind-once: K=4 scalp anchors, card-root rigid, feathered w. */
function bindHair(entry, restHead) {
  const pos = entry.geo.getAttribute('position');
  const n = pos.count;

  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const idx = entry.geo.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]);
    if (b !== a) parent[b] = a;
    if (c !== a) parent[c] = a;
  }

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
  const nearest = new Float32Array(n).fill(Infinity);
  const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    const cx = Math.round(x / cell), cy = Math.round(y / cell), cz = Math.round(z / cell);
    const best = [];
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

  const rootOf = new Map();
  for (let v = 0; v < n; v++) {
    const c = find(v);
    if (!rootOf.has(c) || nearest[v] < nearest[rootOf.get(c)]) rootOf.set(c, v);
  }
  const cardRoot = new Int32Array(n);
  for (let v = 0; v < n; v++) cardRoot[v] = rootOf.get(find(v));

  return { kIdx, kW, w, cardRoot, K, rest: pos.array.slice() };
}

/**
 * hair-conform.md replay against this character's head offsets. Pass `into` to
 * refresh an existing conformed geometry in place (the creator's live preview)
 * instead of cloning a new one.
 */
export function replayHair(entry, bind, headDisp, into = null) {
  const geo = into ?? entry.geo.clone();
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

// --------------------------------------------------------------- outfits

const OUTFIT_FILE = {
  'Merchant Dress':   { venus: '_outfit_MerchantDress_venus' },
  'Dragon Armor':     { venus: '_outfit_DragonArmor_venus', mars: '_outfit_DragonArmor_mars' },
  'Ruby Armor':       { mars: '_outfit_RubyArmor_mars' },
  'Feral Hide Armor': { mars: '_outfit_FeralHideArmor_mars' },
  'Peasant farmer':   { mars: '_outfit_PeasantFarmer_mars' },
  'Assassin Armor':   { mars: '_outfit_AssassinArmor_mars' },
  'Woodland Dress':   { venus: '_outfit_WoodlandDress_venus' },
  'Fantasy Woodland Armor': { mars: '_outfit_FantasyWoodlandArmor_mars' },
};

/** Outfit names available for a base — the creator's outfit picker. */
export function outfitsFor(base) {
  return Object.keys(OUTFIT_FILE).filter((n) => OUTFIT_FILE[n][base]);
}

const _outfits = new Map();      // file -> Promise<{gltf, meta}>

function loadOutfit(name, base) {
  const file = OUTFIT_FILE[name]?.[base];
  if (!file) return null;
  if (!_outfits.has(file)) {
    _outfits.set(file, Promise.all([
      assets.load(`${import.meta.env.BASE_URL}assets/outfits/${file}.glb`),
      fetch(`${import.meta.env.BASE_URL}assets/outfits/${file}.json`).then((r) => r.json()).catch(() => null),
    ]).then(([gltf, meta]) => ({ gltf, meta })));
  }
  return _outfits.get(file);
}

/** Decode `hiddenRanges` RLE pairs [start,count,...] into a Set of vertex ids. */
function decodeHidden(ranges) {
  const hidden = new Set();
  for (let i = 0; i < ranges.length; i += 2) {
    for (let k = 0; k < ranges[i + 1]; k++) hidden.add(ranges[i] + k);
  }
  return hidden;
}

/**
 * Cull the body triangles an outfit covers. A triangle goes when ALL of its
 * vertices are hidden — edge triangles stay so skin never gaps at the cuffs.
 */
function applyHideBody(root, meta) {
  for (const spec of meta?.hideBody ?? []) {
    const mesh = findMesh(root, spec.mesh, spec.vertexCount);
    if (!mesh?.geometry.index) continue;
    const hidden = decodeHidden(spec.hiddenRanges);
    const src = mesh.geometry.index.array;
    const kept = [];
    for (let t = 0; t < src.length; t += 3) {
      if (hidden.has(src[t]) && hidden.has(src[t + 1]) && hidden.has(src[t + 2])) continue;
      kept.push(src[t], src[t + 1], src[t + 2]);
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setIndex(kept);
  }
}

/**
 * Attach an outfit to a character: clone its skinned meshes and rebind them to
 * the character's skeleton by bone NAME (same 73-joint rig, but joint order in
 * the outfit file is its own).
 */
function attachOutfit(root, outfitScene) {
  const boneByName = new Map();
  root.traverse((o) => { if (o.isBone) boneByName.set(o.name, o); });

  const clone = cloneSkeleton(outfitScene);
  const toAttach = [];
  clone.traverse((o) => { if (o.isSkinnedMesh) toAttach.push(o); });

  for (const sm of toAttach) {
    const bones = sm.skeleton.bones.map((b) => boneByName.get(b.name) ?? b);
    const skeleton = new THREE.Skeleton(bones, sm.skeleton.boneInverses);
    sm.removeFromParent();
    sm.bind(skeleton, sm.bindMatrix);
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    root.add(sm);
  }
  return toAttach;
}

/**
 * Put an outfit on a built root. Returns `{ nodes, preHide }` — the attached
 * meshes and each culled body mesh's pre-cull geometry — so a live preview can
 * take the outfit off again. Returns null when the outfit has no version for
 * this base.
 */
export async function wearOutfit(root, name, base) {
  const loaded = loadOutfit(name, base);
  if (!loaded) return null;
  const { gltf, meta } = await loaded;
  const preHide = new Map();
  for (const spec of meta?.hideBody ?? []) {
    const mesh = findMesh(root, spec.mesh, spec.vertexCount);
    if (mesh) preHide.set(mesh, mesh.geometry);
  }
  const nodes = attachOutfit(root, gltf.scene);
  applyHideBody(root, meta);
  return { nodes, preHide };
}

// ------------------------------------------------------------------ assembly

/**
 * Build a fully-dressed character.
 *
 * `spec`: { recipe: 'Maple' | recipeObject, outfit?: 'Merchant Dress',
 *           hairColour?: '#…' (override), bald?: bool }
 * Returns the root Object3D (bind pose), ready for CharacterAnimator.
 *
 * Named recipes are assembled once per (recipe, outfit, hair) and every further
 * spawn is a SkeletonUtils clone of that template — three Maples share one set
 * of geometry, materials and textures. Blended recipe objects (unique NPCs)
 * skip the cache.
 */
const _templates = new Map();    // key -> Promise<root>

// Assemblies run one at a time: 11 concurrent builds (each decoding megabytes
// of texture and grinding the hair conform) starved the main thread and piled
// GPU uploads into one frame — the driver-reset recipe. Clones stay instant.
let _assemblyChain = Promise.resolve();
function enqueueAssembly(spec) {
  const run = _assemblyChain.then(() => assembleFromRecipe(spec));
  _assemblyChain = run.catch(() => {});
  return run;
}

export async function buildFromRecipe(spec) {
  if (typeof spec.recipe !== 'string') return enqueueAssembly(spec);
  const key = [spec.recipe, spec.outfit ?? '', spec.bald ?? '', spec.hairColour ?? ''].join('|');
  if (!_templates.has(key)) _templates.set(key, enqueueAssembly(spec));
  return cloneSkeleton(await _templates.get(key));
}

/**
 * Parent the hair to the head bone so it follows head animation (look-at,
 * dialog nods). attach() keeps the world transform, so call it while the root
 * is in bind pose — the geometry is authored in model space.
 */
export function attachHairToHead(root, hairMesh) {
  let headBone = null;
  root.traverse((o) => { if (!headBone && o.isBone && o.name === 'Head') headBone = o; });
  if (!headBone) { root.add(hairMesh); return; }
  root.updateMatrixWorld(true);
  root.add(hairMesh);
  headBone.attach(hairMesh);
}

/**
 * A conformed hair mesh (core + blend pass) for a skull displaced by
 * `headDisp` (dense per-vertex offsets against the neutral base head, or null
 * for the neutral skull). Shared by the in-game creator's live preview and the
 * player build — the same bind-once/replay the NPCs use, per hair-conform.md.
 */
export async function conformedHair(style, base, colour, headDisp) {
  const entry = await loadHair(style, base);
  if (!entry.geo) return null;
  if (!entry.bind) {
    await loadBase(base);              // guarantees _headRest[base]
    entry.bind = bindHair(entry, _headRest[base]);
  }
  const geo = headDisp ? replayHair(entry, entry.bind, headDisp) : entry.geo.clone();
  const { core, blend } = hairMaterials(entry, new THREE.Color(colour));
  const coreMesh = new THREE.Mesh(geo, core);
  coreMesh.name = `hair_${style}`;
  coreMesh.castShadow = true;
  coreMesh.frustumCulled = false;
  const blendMesh = new THREE.Mesh(geo, blend);
  blendMesh.name = `hair_${style}__blend`;
  blendMesh.renderOrder = 2;
  blendMesh.frustumCulled = false;
  coreMesh.add(blendMesh);
  return { mesh: coreMesh, entry };
}

/** The named cast recipes on disk, per base — the creator's heritage parents. */
export const RECIPES_BY_BASE = {
  venus: ['Maple', 'Willow', 'Ember', 'Kari', 'Mildrid', 'Adala', 'Woodland Huldra'],
  mars: ['Snader', 'Haggar', 'Travis', 'Cedar', 'Pobart', 'Charles',
         'Cander', 'Makal', 'Roger', 'Woodland Druid'],
};

/**
 * Stamp a weighted mix of up to four named recipes onto a root: textures as a
 * single 4-slot shader mix over shared sources, geometry (optionally) as the
 * weighted sum of each parent's dense offsets, baked in. Returns the summed
 * dense head offsets for the hair conform.
 */
/**
 * Mars and venus share one topology (vertex IDs and head UVs), so recipes
 * transfer across bases — only the mesh NAMES carry a base suffix. Ancestors
 * from both casts therefore key their deltas to one canonical mesh name.
 */
const canonMesh = (name) => name.replace(/_(venus|mars)$/, '');

function specFor(recipe, canon) {
  const g = recipe.geometry?.meshes ?? {};
  return g[canon] ?? g[`${canon}_venus`] ?? g[`${canon}_mars`] ?? null;
}
function texFor(recipe, canon) {
  const t = recipe.textures ?? {};
  const u = t[canon] ?? t[`${canon}_venus`] ?? t[`${canon}_mars`];
  return typeof u === 'string' ? u : null;
}

/**
 * Which ancestors may contribute TEXTURES on this base. One-way rule: a venus
 * body never takes a mars map (beards and stubble are baked into the male
 * skin), while mars takes anything. Geometry is never filtered — a daughter
 * still gets her father's jaw, just not his beard.
 */
function textureEligible(recipes, base) {
  return recipes
    .map((r, i) => (base === 'venus' && r.baseMesh === 'mars' ? -1 : i))
    .filter((i) => i !== -1);
}

export async function applyHeritage(root, names, weights, { geometry = true, base = null } = {}) {
  const recipes = await Promise.all(names.map(loadRecipe));
  const sum = weights.reduce((s, w) => s + (w || 0), 0) || 1;
  const ws = weights.map((w) => (w || 0) / sum);
  const texIdx = base ? textureEligible(recipes, base) : recipes.map((_, i) => i);

  let headDisp = null;
  if (geometry) {
    const meshNames = new Set(recipes.flatMap((r) => Object.keys(r.geometry?.meshes ?? {}).map(canonMesh)));
    for (const canon of meshNames) {
      const specs = recipes.map((r) => specFor(r, canon));
      const any = specs.find((g) => g?.movedCount);
      if (!any) continue;
      const mesh = findMesh(root, canon, any.vertexCount);
      if (!mesh) continue;
      let total = null;
      specs.forEach((g, i) => {
        if (!g?.movedCount || !ws[i]) return;
        const dense = denseOffsets(mesh, g, recipes[i].geometry.uvTolerance);
        if (!dense) return;
        if (!total) total = new Float32Array(dense.length);
        for (let k = 0; k < dense.length; k++) total[k] += dense[k] * ws[i];
      });
      if (!total) continue;
      const geo = mesh.geometry = mesh.geometry.clone();
      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) + total[i * 3], pos.getY(i) + total[i * 3 + 1], pos.getZ(i) + total[i * 3 + 2]);
      }
      pos.needsUpdate = true;
      mesh.userData.__recipeOffsets = total;
      if (/^GEO-head/.test(canon)) headDisp = total;
    }
  }

  // Textures: only the eligible ancestors contribute, with their weights
  // renormalised inside that subset. One multi-blend material per mesh whose
  // sources differ; shared sources collapse to a plain map. Missing parent
  // maps fall back to the first eligible one so the weight math stays honest.
  let texturesApplied = false;
  if (texIdx.length) {
    const texRecipes = texIdx.map((i) => recipes[i]);
    const texWs = texIdx.map((i) => ws[i]);
    const texNames = new Set(texRecipes.flatMap((r) => Object.keys(r.textures ?? {}).map(canonMesh)));
    for (const canon of texNames) {
      const uris = texRecipes.map((r) => texFor(r, canon));
      const first = uris.find(Boolean);
      if (!first) continue;
      const filled = uris.map((u) => u ?? first);
      const mesh = findMesh(root, canon, specFor(texRecipes[0], canon)?.vertexCount ?? -1);
      if (!mesh) continue;
      const cap = /eye|teeth|lash/i.test(canon) ? 512 : Infinity;
      if (filled.every((u) => u === first)) {
        const tex = await decodeDataTexture(first, cap);
        if (!tex) continue;
        mesh.material = mesh.material.clone();
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
      } else {
        const texs = await Promise.all(filled.map((u) => decodeDataTexture(u, cap)));
        if (!texs[0]) continue;
        mesh.material = mesh.material.clone();
        applyMultiBlendMap(mesh.material, texs.map((t) => t ?? texs[0]), texWs);
      }
      texturesApplied = true;
    }
  }
  return { headDisp, texIdx, texturesApplied };
}

/** Normalise the two heritage shapes: legacy { a, b, w } and { parents, weights }. */
export function heritageParents(h) {
  if (!h) return null;
  let names = [], weights = [];
  if (Array.isArray(h.parents)) {
    h.parents.forEach((name, i) => {
      if (!name) return;
      const at = names.indexOf(name);
      if (at !== -1) { weights[at] += h.weights?.[i] ?? 0; return; }   // same ancestor twice
      names.push(name); weights.push(h.weights?.[i] ?? 1);
    });
  } else if (h.a && h.b) {
    names = [h.a, h.b]; weights = [1 - (h.w ?? 0.5), h.w ?? 0.5];
  }
  names = names.slice(0, 4); weights = weights.slice(0, names.length);
  return names.length && weights.some((w) => w > 0) ? { names, weights } : null;
}

/**
 * Build the player from the creator's result:
 * `{ base, heritage?, skin, skinExplicit?, hair, hairColour, outfit, sliders }`.
 *
 * Same shared-base pipeline as the NPCs — clone the prepared base, blend the
 * heritage parents into it (geometry on the CPU, textures mixed in the shader
 * from shared sources), bake the 68 identity sliders on top, put on the chosen
 * skin and outfit, conform the chosen hair to the sculpted skull.
 */
export async function buildFromCreator(build) {
  const base = build?.base === 'mars' ? 'mars' : 'venus';
  const gltf = await loadBase(base);
  const root = cloneSkeleton(gltf.scene);

  // Heritage first: the blend defines the face the sliders then sculpt.
  // Ancestors come from BOTH casts — the bases share topology, so a mars
  // grandfather's deltas land on a venus body and vice versa. Textures follow
  // the one-way rule (no male maps on a venus body).
  let heritageDisp = null;
  let heritageTextured = false;
  const her = heritageParents(build?.heritage);
  if (her) {
    const applied = await applyHeritage(root, her.names, her.weights, { base });
    heritageDisp = applied.headDisp;
    heritageTextured = applied.texturesApplied;
  }

  let headDisp = heritageDisp;
  if (build?.sliders && Object.keys(build.sliders).length) {
    const { FaceRecipe } = await import('./FaceRecipe.js');
    const recipe = await FaceRecipe.load(base);
    recipe.apply(root, build.sliders);
    const sliderDisp = recipe.displacement(root, `GEO-head_${base}`);
    recipe.release(root);
    if (sliderDisp && heritageDisp) {
      headDisp = new Float32Array(sliderDisp.length);
      for (let i = 0; i < sliderDisp.length; i++) headDisp[i] = sliderDisp[i] + heritageDisp[i];
    } else headDisp = sliderDisp ?? heritageDisp;
  }

  let headMesh = null;
  root.traverse((o) => { if (o.isMesh && /^GEO-head_/.test(o.name)) headMesh = o; });

  // Heritage carries the ancestors' skin. Over it, an explicit complexion
  // pick is a TONE — a tint on the inherited maps, normalised against a mid
  // skin tone so it can lighten or darken. Without heritage textures the
  // baked shade textures apply as before.
  if (build?.skin && heritageTextured && build.skinExplicit) {
    const manifest = await fetch(`${import.meta.env.BASE_URL}assets/skin/${base}/shades.json`).then((r) => r.json()).catch(() => null);
    const hex = manifest?.shades?.find((s) => s.name === build.skin)?.hex;
    const { skinToneTint } = await import('./Creator.js');
    const tint = skinToneTint(hex, manifest);
    root.traverse((o) => {
      if (o.isMesh && /^GEO-(head|body)_/.test(o.name)) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.color.copy(tint);
      }
    });
  } else if (build?.skin && !heritageTextured) {
    const dir = `${import.meta.env.BASE_URL}assets/skin/${base}`;
    const byName = { [`GEO-head_${base}`]: `${build.skin}_head.jpg`, [`GEO-body_${base}`]: `${build.skin}_body.jpg` };
    root.traverse((o) => {
      const file = o.isMesh && byName[o.name];
      if (!file) return;
      o.material = o.material.clone();
      delete o.material.onBeforeCompile;
      delete o.material.customProgramCacheKey;
      o.material.map = assets.texture(`${dir}/${file}`);
      o.material.needsUpdate = true;
    });
  }

  // Outfit before hair so the hairless rule can see what is being worn.
  if (build?.outfit) await wearOutfit(root, build.outfit, base);

  if (build?.hair && !HAIRLESS_OUTFITS.has(build.outfit)) {
    const hair = await conformedHair(build.hair, base, build.hairColour ?? 0x2e2119, headDisp);
    if (hair) {
      attachHairToHead(root, hair.mesh);
      if (headMesh) applyScalpMask(headMesh, hair.entry, new THREE.Color(build.hairColour ?? 0x2e2119));
    }
  }

  applyCharacterMaterials(root);
  root.traverse((o) => { delete o.userData.__recipeOffsets; });
  return root;
}

/**
 * Build a villager blended from two named recipes of the same base.
 * `spec`: { a: 'Charles', b: 'Pobart', w: 0.45, outfit?, hairColour?, bald? }
 * Cached like the named templates — respawning the same blend clones it.
 */
export async function buildBlend(spec) {
  const key = ['blend', spec.a, spec.b, spec.w, spec.outfit ?? '', spec.bald ?? '', spec.hairColour ?? ''].join('|');
  if (!_templates.has(key)) {
    _templates.set(key, (async () => {
      const [ra, rb] = await Promise.all([loadRecipe(spec.a), loadRecipe(spec.b)]);
      if (ra.baseMesh !== rb.baseMesh) {
        throw new Error(`buildBlend: ${spec.a} (${ra.baseMesh}) and ${spec.b} (${rb.baseMesh}) are different bases`);
      }
      const recipe = await blendRecipes(ra, rb, spec.w ?? 0.5);
      return enqueueAssembly({ ...spec, recipe });
    })());
  }
  return cloneSkeleton(await _templates.get(key));
}

/**
 * Stamp a recipe's identity onto a cloned base root: sparse geometry offsets
 * plus textures (plain, or `{ blend: [a, b], w }` mixed in the shader from the
 * shared cache). Returns the head mesh and its dense offsets for hair conform.
 * Used by NPC assembly and by the creator's heritage blending alike.
 */
export async function applyRecipeToRoot(root, recipe, { geometry = true } = {}) {
  if (geometry) {
    for (const [meshName, g] of Object.entries(recipe.geometry?.meshes ?? {})) {
      if (!g.movedCount) continue;
      const mesh = findMesh(root, meshName, g.vertexCount);
      if (mesh) applyOffsets(mesh, g, recipe.geometry.uvTolerance);
    }
  }

  let headMesh = null;
  root.traverse((o) => { if (o.isMesh && /^GEO-head_/.test(o.name)) headMesh = o; });

  for (const [meshName, uri] of Object.entries(recipe.textures ?? {})) {
    const mesh = findMesh(root, meshName, recipe.geometry?.meshes?.[meshName]?.vertexCount ?? -1);
    if (!mesh) continue;
    // Eyes/teeth/lashes ship at 2048² but cover a handful of pixels on screen —
    // 512 is indistinguishable and ~16× less VRAM. Head/body keep full res.
    const cap = /eye|teeth|lash/i.test(meshName) ? 512 : Infinity;
    if (typeof uri === 'string') {
      const tex = await decodeDataTexture(uri, cap);
      if (!tex) continue;
      mesh.material = mesh.material.clone();
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    } else if (uri?.blend) {
      // Blended character: both source maps come from the shared cache.
      const [ta, tb] = await Promise.all(uri.blend.map((u) => decodeDataTexture(u, cap)));
      if (!ta) continue;
      mesh.material = mesh.material.clone();
      if (tb) applyBlendMap(mesh.material, ta, tb, uri.w);
      else { mesh.material.map = ta; mesh.material.needsUpdate = true; }
    }
  }
  return { headMesh, headDisp: headMesh?.userData.__recipeOffsets ?? null };
}

async function assembleFromRecipe(spec) {
  const recipe = typeof spec.recipe === 'string' ? await loadRecipe(spec.recipe) : spec.recipe;
  const base = recipe.baseMesh === 'mars' ? 'mars' : 'venus';
  const gltf = await loadBase(base);
  const root = cloneSkeleton(gltf.scene);

  const { headMesh } = await applyRecipeToRoot(root, recipe);

  // hair — seated per-base asset, conformed to this skull
  const name = recipe.character?.name;
  const isBald = HAIRLESS_OUTFITS.has(spec.outfit) || (spec.bald ?? BALD.has(name));
  if (!isBald && recipe.hair?.style) {
    const colour = new THREE.Color(spec.hairColour ?? recipe.hair.color ?? '#2e2119');
    const hair = await conformedHair(recipe.hair.style, base, colour,
      headMesh?.userData.__recipeOffsets ?? null);
    if (hair) {
      attachHairToHead(root, hair.mesh);
      if (headMesh) applyScalpMask(headMesh, hair.entry, colour);
    }
  }

  // outfit layer
  if (spec.outfit) {
    const loaded = await loadOutfit(spec.outfit, base);
    if (loaded) {
      const { gltf: outfitGltf, meta } = await loaded;
      attachOutfit(root, outfitGltf.scene);
      applyHideBody(root, meta);
    } else {
      console.warn(`[CharacterFactory] no ${base} version of outfit "${spec.outfit}"`);
    }
  }

  applyCharacterMaterials(root);
  // The dense offset field fed the hair conform; leaving it on userData makes
  // every template clone JSON-copy a 70k-float array.
  root.traverse((o) => { delete o.userData.__recipeOffsets; });
  return root;
}
