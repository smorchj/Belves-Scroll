import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * GLB loading, caching and instancing.
 *
 * Props are Draco-compressed by the asset pipeline; characters are not (their
 * vertex order has to stay stable for the shared morph library and face recipe,
 * and Draco reorders vertices).
 */
class AssetManager {
  constructor() {
    this.gltf = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltf.setDRACOLoader(draco);
    // The site's "Web" export quality uses EXT_meshopt_compression. Without this
    // decoder registered the loader throws on every character rather than
    // degrading, so it is not optional.
    this.gltf.setMeshoptDecoder(MeshoptDecoder);

    this.cache = new Map();     // url -> Promise<GLTF>
    this.textures = new Map();
    this.onProgress = null;
    this._loaded = 0;
    this._total = 0;
  }

  load(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    this._total++;
    const p = new Promise((resolve, reject) => {
      this.gltf.load(url, (gltf) => {
        this._loaded++;
        this.onProgress?.(this._loaded, this._total, url);
        resolve(gltf);
      }, undefined, (err) => {
        this._loaded++;
        console.error(`failed to load ${url}`, err);
        reject(err);
      });
    });
    this.cache.set(url, p);
    return p;
  }

  texture(url) {
    if (this.textures.has(url)) return this.textures.get(url);
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;                 // glTF convention, matches the exports
    t.anisotropy = 8;
    this.textures.set(url, t);
    return t;
  }

  /**
   * A fresh, independently-posable copy. SkeletonUtils.clone is required for
   * skinned meshes — a plain clone shares the skeleton and every copy would move
   * as one.
   */
  async instance(url) {
    const gltf = await this.load(url);
    const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
    const root = clone(gltf.scene);
    return { root, animations: gltf.animations };
  }

  async prop(name) { return this.instance(`${import.meta.env.BASE_URL}assets/props/${name}.glb`); }

  /**
   * A prop as a THREE.LOD: the full-detail `<name>.glb` up close, swapping to
   * `<name>.lod1.glb` past `far` metres. Falls back to a plain instance when no
   * lod1 exists, so callers can use it unconditionally. The LOD registers
   * itself for per-frame distance updates (see updateLODs).
   */
  async propLOD(name, far = 65) {
    const near = await this.instance(`${import.meta.env.BASE_URL}assets/props/${name}.glb`);
    let low = null;
    try { low = await this.instance(`${import.meta.env.BASE_URL}assets/props/${name}.lod1.glb`); } catch { /* no far level */ }
    if (!low) return near;

    const lod = new THREE.LOD();
    lod.addLevel(near.root, 0);
    lod.addLevel(low.root, far);
    lod.name = `lod-${name}`;
    registerLOD(lod);
    return { root: lod, animations: near.animations };
  }
  async character(name) {
    // The neutral bases moved to /assets/base/ when the recipe pipeline landed;
    // everything else still lives per-character under /assets/characters/.
    const dir = /^_base_/.test(name) ? 'base' : 'characters';
    return this.instance(`${import.meta.env.BASE_URL}assets/${dir}/${name}.glb`);
  }
  async creature(name) { return this.instance(`${import.meta.env.BASE_URL}assets/creatures/${name}.glb`); }
}

export const assets = new AssetManager();

/**
 * Live THREE.LOD objects, updated once per frame from the camera so each picks
 * its level by distance. A WeakRef set would be tidier, but the world's
 * buildings live for the whole session, so a plain array with a detached-node
 * sweep is enough and avoids per-frame allocation.
 */
const _lods = [];
export function registerLOD(lod) { _lods.push(lod); }
export function updateLODs(camera) {
  // LOD.update reads camera.matrixWorld; guarantee it reflects this frame's
  // camera position even when called before the renderer updates it.
  camera.updateMatrixWorld();
  for (let i = _lods.length - 1; i >= 0; i--) {
    if (!_lods[i].parent) { _lods.splice(i, 1); continue; }   // building removed
    _lods[i].update(camera);
  }
}

/**
 * A hair-card coverage mask, generated once.
 *
 * The documented pipeline expects a texture whose red channel is per-pixel
 * coverage — but the character exports arrive with no hair texture at all, just
 * a solid black base colour. Without a mask every card renders as an opaque
 * quad, which reads as glossy slabs rather than hair. So the mask is synthesised
 * here: strands running along the card with soft edges and a fade toward the tip.
 */
let _hairMask = null;
function hairCoverageMask(size = 256) {
  if (_hairMask) return _hairMask;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // Strands run down the card (V), varying across its width (U).
  const strands = 46;
  for (let i = 0; i < strands; i++) {
    const x = (i + 0.5) / strands * size + (Math.random() - 0.5) * 4;
    const w = 1.1 + Math.random() * 2.6;
    const alpha = 0.55 + Math.random() * 0.45;
    const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    // Strands stop short of the tip by varying amounts so the end isn't a
    // straight cut across the card.
    const len = size * (0.72 + Math.random() * 0.28);
    ctx.fillRect(x - w, 0, w * 2, len);
  }

  // Taper the last fifth so tips fade instead of ending abruptly.
  const fade = ctx.createLinearGradient(0, size * 0.78, 0, size);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, size * 0.78, size, size * 0.22);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  _hairMask = tex;
  return tex;
}

/** Hair meshes carry the name on the material, not always on the mesh. */
function isHair(mesh) {
  if (/hair/i.test(mesh.name)) return true;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => /hair/i.test(m?.name ?? ''));
}

export function applyHairShader(root, colour = 0x3a2a1e) {
  root.traverse((o) => {
    if (!o.isMesh || !isHair(o)) return;

    // The exports ship the cards twice: a solid alpha-tested pass and a
    // translucent '__blend' overlay at alpha 0.3. This used to be hidden, which
    // was right when there was no hair texture and the overlay only doubled the
    // cost of a slab. Now that the strand texture exists it is the pass that
    // softens the cutout edge, so it is kept and set up as a blended overlay.
    const isBlend = /__blend$/i.test(o.name)
      || (Array.isArray(o.material) ? o.material[0] : o.material)?.name?.endsWith('__blend');
    if (isBlend) {
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        m.transparent = true;
        m.opacity = 0.3;
        m.alphaTest = 0.02;
        m.depthWrite = false;      // must not occlude the strands behind it
        m.side = THREE.DoubleSide;
        if (m.color) m.color.set(colour);
        m.needsUpdate = true;
      }
      o.castShadow = false;
      o.renderOrder = 2;
      return;
    }

    // Whether a coverage mask is even usable depends on the export. These hair
    // meshes ship with position/normal/skin weights and *no uv attribute*, so
    // there is nothing to sample a mask against — applying one makes the hair
    // vanish entirely. They are modelled strand clumps rather than flat cards,
    // so opaque is the correct read; the job is just to kill the plastic sheen.
    const hasUV = !!o.geometry.attributes.uv;

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m.side = THREE.DoubleSide;

      if (hasUV) {
        if (!m.map && !m.alphaMap) m.alphaMap = hairCoverageMask();
        // Alpha-to-coverage avoids the sorting artefacts plain alpha blending
        // produces on overlapping cards.
        m.alphaToCoverage = true;
        m.alphaTest = 0.32;          // fallback path when MSAA is unavailable
      } else {
        m.alphaMap = null;
        m.alphaToCoverage = false;
        m.alphaTest = 0;
      }

      m.transparent = false;
      m.depthWrite = true;
      if (m.color) m.color.set(colour);
      // Hair is not a mirror. The exports default to a low roughness that reads
      // as wet plastic under a directional key light.
      m.roughness = 0.88;
      m.metalness = 0.0;
      if (m.sheen !== undefined) { m.sheen = 0.35; m.sheenRoughness = 0.6; }
      m.needsUpdate = true;
    }
  });
}

/** Mean linear colour of a texture, sampled at low resolution. */
function meanColour(texture, samples = 48) {
  const img = texture?.image;
  if (!img || !img.width) return null;
  const c = document.createElement('canvas');
  c.width = c.height = samples;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(img, 0, 0, samples, samples); } catch { return null; }

  let r = 0, g = 0, b = 0, n = 0;
  const data = ctx.getImageData(0, 0, samples, samples).data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;                  // skip transparent padding
    const lr = data[i] / 255, lg = data[i + 1] / 255, lb = data[i + 2] / 255;
    // Very dark texels are UV gutter or hair/brow, not skin — they drag the mean.
    if (lr + lg + lb < 0.12) continue;
    const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    r += toLin(lr); g += toLin(lg); b += toLin(lb); n++;
  }
  return n ? { r: r / n, g: g / n, b: b / n } : null;
}

/**
 * Grade the body to the head.
 *
 * The head texture is rebuilt from the player's photo during character creation
 * but the body keeps its base shade, and the two ship unmatched — which leaves a
 * hard colour seam at the neck. Matching the body's mean tone to the head's and
 * applying it as a material tint closes the seam without touching the textures.
 */
export function matchSkinTone(root) {
  let head = null, bodies = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (/skin_head/i.test(m.name ?? '')) head = m;
      else if (/skin_body/i.test(m.name ?? '')) bodies.push(m);
    }
  });
  if (!head || !bodies.length) return false;

  const hm = meanColour(head.map);
  if (!hm) return false;

  for (const body of bodies) {
    const bm = meanColour(body.map);
    if (!bm) continue;
    // Clamped so an odd texture can't produce a lurid tint.
    const k = (a, b) => THREE.MathUtils.clamp(b > 1e-4 ? a / b : 1, 0.55, 1.8);
    body.color.setRGB(k(hm.r, bm.r), k(hm.g, bm.g), k(hm.b, bm.b));
    body.needsUpdate = true;
  }
  return true;
}

/** Eyelashes and the eye overlays need the same coverage treatment. */
export function applyCharacterMaterials(root) {
  // Neither overlay mesh belongs on a character. The docs' export set is
  // body/head/eyes/lashes/teeth and "eyes are self-contained — don't add
  // anything" (eyes-and-lashes.md): the tearline (wetlayer) reads as a hard
  // line across the lower lid, and the eye_shadow overlay is an editor-side
  // aid, not runtime geometry. Eye AO waits for the site's shader recipe
  // rather than a homegrown one.
  const overlays = [];
  root.traverse((o) => { if (o.isMesh && /wetlayer|eye_shadow/i.test(o.name)) overlays.push(o); });
  for (const t of overlays) t.removeFromParent();

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;   // skinned bounds go stale under procedural posing

    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (/lash|brow/i.test(o.name)) {
        m.transparent = true;
        m.alphaTest = 0.4;
        m.side = THREE.DoubleSide;
        m.depthWrite = false;
      }
      if (/^eye(L|R|\.L|\.R)$/i.test(o.name)) {
        m.roughness = 0.08;
        m.metalness = 0.0;
      }
      // Skin reads waxy at default roughness.
      if (/head|body|GEO-/i.test(o.name)) {
        m.roughness = 0.62;
        m.metalness = 0.0;
      }
    }
  });
}
