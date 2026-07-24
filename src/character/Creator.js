import * as THREE from 'three';
import { assets, applyHairShader, applyCharacterMaterials } from '../core/Assets.js';
import { SKIN_SHADES, HAIR_STYLES } from '../data/catalog.js';
import { FaceRecipe } from './FaceRecipe.js';
import { applyScalpMask, clearScalpMask, setScalpColour } from './HairLibrary.js';

/**
 * The character creator.
 *
 * Runs a studio of its own — its own scene, camera and three-point rig — drawn
 * with the game's renderer. The game's sun swings through a day/night cycle and
 * would have the player sculpting a face in the dark, so none of it is reused.
 *
 * The model layer is the same recipe pipeline the NPCs use: the prepared base
 * (73-joint rig) is cloned, the 68 identity sliders sculpt it, and hair is the
 * seated per-base asset conformed to the sculpted skull live via
 * hair-conform.md's bind-once/replay (see CharacterFactory).
 */

const BASES = ['venus', 'mars'];

const HAIR_COLOURS = [
  ['Jet',     0x1b1614], ['Coal',    0x2e2119], ['Chestnut', 0x4a2f1d],
  ['Auburn',  0x6d3319], ['Copper',  0x8f4a1e], ['Wheat',    0xb08b4f],
  ['Flaxen',  0xd9c08a], ['Ash',     0x8d8577], ['Silver',   0xd8d3c6],
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** 'noseBridgeW' -> 'Nose Bridge W' */
const humanise = (s) => cap(s.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim());

/**
 * A material.color tint for a complexion swatch, relative to the manifest's
 * middle shade and softened. Exported thinking: identity at the middle swatch,
 * proportional lightening/darkening either side, never a straight multiply by
 * a near-black hex.
 */
export function skinToneTint(hex, manifest) {
  const shades = manifest?.shades ?? [];
  const midHex = shades[Math.floor(shades.length / 2)]?.hex ?? '#7a5a48';
  const c = new THREE.Color(hex ?? midHex);
  const mid = new THREE.Color(midHex);
  const rel = new THREE.Color(
    c.r / Math.max(mid.r, 0.02),
    c.g / Math.max(mid.g, 0.02),
    c.b / Math.max(mid.b, 0.02));
  // A touch of softening toward identity, and floors so nothing goes to
  // black — ACES compresses the extremes, so the range stays wide.
  rel.lerp(new THREE.Color(1, 1, 1), 0.12);
  rel.r = Math.min(2.0, Math.max(0.2, rel.r));
  rel.g = Math.min(2.0, Math.max(0.2, rel.g));
  rel.b = Math.min(2.0, Math.max(0.2, rel.b));
  return rel;
}

const NAME_PARTS = [
  ['Bel', 'Cor', 'Ael', 'Mor', 'Ser', 'Thal', 'Bran', 'Eir', 'Hal', 'Vess', 'Rhun', 'Ort'],
  ['ve', 'wen', 'ric', 'dis', 'mar', 'gan', 'wyn', 'thas', 'ley', 'dor', 'sha', 'nel'],
];

export class Creator {
  constructor(stage) {
    this.stage = stage;
    this.renderer = stage.renderer;

    this.build = {
      base: 'venus',
      name: '',
      heritage: null,          // { a, b, w } — two named recipes blended
      skin: 'fair',
      skinExplicit: false,     // player picked a shade over the heritage skin
      hair: null,
      hairColour: 0x2e2119,
      outfit: 'Merchant Dress',
      sliders: {},
    };
    // The family tree: four grandparents (father's and mother's parents),
    // male ancestors from the mars cast, female from venus — the bases share
    // topology, so any mix lands on either body. Weights come from the three
    // balance sliders. `parents`/`weights` are the derived flat form the
    // factory consumes.
    this.tree = {
      gff: null, gmf: null, gfm: null, gmm: null,
      w: { gff: 1, gmf: 1, gfm: 1, gmm: 1 },   // direct per-ancestor weights
    };
    this._heritageRig = null;
    this._outfitNodes = [];
    this._preHideGeometry = new Map();

    this.recipes = {};        // base -> FaceRecipe
    this.shadeManifest = {};  // base -> shades.json

    this.root = null;         // the previewed character
    this.hairNode = null;
    this.hairBlend = null;
    this.hairEntry = null;
    this._open = false;
    this._pending = new Set();     // slider names changed since the last frame
    this._pendingAll = false;
    this._raf = null;
    this._resolve = null;

    this._buildStudio();
  }

  // =====================================================================
  // studio
  // =====================================================================

  _buildStudio() {
    this.scene = new THREE.Scene();
    this.scene.background = this._backdrop();

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

    // Orbit state. Azimuth is measured off the character's facing (+Z), so the
    // opening shot is a true three-quarter.
    this.orbit = { az: THREE.MathUtils.degToRad(34), el: THREE.MathUtils.degToRad(6), dist: 0.95 };
    this.target = new THREE.Vector3(0, 1.55, 0);
    this._limits = { min: 0.32, max: 2.4 };

    const key = new THREE.DirectionalLight(0xfff2e0, 3.1);
    key.position.set(0.75, 0.85, 1.15);
    const fill = new THREE.DirectionalLight(0xa8c0e4, 1.15);
    fill.position.set(-1.1, 0.15, 0.75);
    const rim = new THREE.DirectionalLight(0xffd9a8, 2.4);
    rim.position.set(-0.45, 0.7, -1.2);
    const kicker = new THREE.DirectionalLight(0xbfd4ff, 0.7);
    kicker.position.set(0.9, -0.35, -0.5);
    const amb = new THREE.HemisphereLight(0x4d5b6e, 0x201a14, 0.75);

    this.lights = [key, fill, rim, kicker, amb];
    for (const l of this.lights) this.scene.add(l);
  }

  /** A plain studio sweep, generated rather than shipped as an asset. */
  _backdrop() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 96, 8, 128, 128, 190);
    grad.addColorStop(0, '#2b3038');
    grad.addColorStop(0.55, '#171a20');
    grad.addColorStop(1, '#080a0d');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // =====================================================================
  // lifecycle
  // =====================================================================

  /** Resolves with the finished build on Confirm, or null if cancelled. */
  async open() {
    if (this._open) throw new Error('Creator is already open');
    this._open = true;

    this._injectStyle();
    this._buildDom();
    this._status('reading the ledger…');

    const recipe = await this._recipe(this.build.base);
    this.build.sliders = recipe.neutral();

    await this._loadBase(this.build.base);
    this._buildSliderUi();
    this._status(null);

    // The game loop, if one is running, would draw its own scene straight over
    // ours. Silence it for the duration rather than reaching into main.js.
    this._hadOwnRender = Object.prototype.hasOwnProperty.call(this.stage, 'render');
    this._prevRender = this.stage.render;
    this.stage.render = () => {};
    this._prevExposure = this.renderer.toneMappingExposure;

    // The game's HUD is separate DOM and would otherwise show through the
    // creator's transparent left half. Hidden by style only, and put back on
    // close — nothing about the HUD's own state is disturbed.
    this._hidden = ['#ui-root', '#boot'].map((sel) => document.querySelector(sel)).filter(Boolean)
      .map((el) => ({ el, display: el.style.display }));
    for (const h of this._hidden) h.el.style.display = 'none';

    this._onResize = () => this._resize();
    addEventListener('resize', this._onResize);
    this._resize();

    this._loop();

    return new Promise((resolve) => { this._resolve = resolve; });
  }

  close() {
    if (!this._open) return;
    this._open = false;

    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    removeEventListener('resize', this._onResize);
    removeEventListener('keydown', this._onKey);

    if (this._hadOwnRender) this.stage.render = this._prevRender;
    else delete this.stage.render;
    this.renderer.toneMappingExposure = this._prevExposure;
    this.camera.clearViewOffset();
    for (const h of this._hidden ?? []) h.el.style.display = h.display;
    this._hidden = null;

    this._disposeRoot();
    this.dom?.remove();
    this.styleEl?.remove();
    this.dom = null;

    // Resolve rather than hang if something closed us without a decision.
    this._resolve?.(null);
    this._resolve = null;
  }

  _finish() {
    const out = {
      base: this.build.base,
      name: this.build.name.trim() || 'Traveller',
      heritage: this.build.heritage
        ? { parents: [...this.build.heritage.parents], weights: [...this.build.heritage.weights] }
        : null,
      skin: this.build.skin,
      skinExplicit: this.build.skinExplicit,
      hair: this.build.hair,
      hairColour: this.build.hairColour,
      outfit: this.build.outfit,
      sliders: { ...this.build.sliders },
    };
    const resolve = this._resolve;
    this._resolve = null;
    this.close();
    resolve?.(out);
  }

  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());

    // One rebuild per frame no matter how many input events arrived.
    if (this._pendingAll || this._pending.size) {
      const changed = this._pendingAll ? null : [...this._pending];
      this._pending.clear();
      this._pendingAll = false;
      this._rebuild(changed);
    }

    this._placeCamera();
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;

    // Centre the head in the strip left of the sidebar rather than in the canvas.
    // Done as a lens shift, so the three-quarter angle stays exactly as posed —
    // panning the camera instead would swing the view round the face.
    const sidebar = w > 900 ? 372 : 300;
    this.camera.setViewOffset(w, h, sidebar / 2, 0, w, h);

    this.camera.updateProjectionMatrix();
  }

  _placeCamera() {
    const { az, el, dist } = this.orbit;
    this.camera.position.set(
      this.target.x + dist * Math.cos(el) * Math.sin(az),
      this.target.y + dist * Math.sin(el),
      this.target.z + dist * Math.cos(el) * Math.cos(az),
    );
    this.camera.lookAt(this.target);
  }

  // =====================================================================
  // model
  // =====================================================================

  async _recipe(base) {
    if (!this.recipes[base]) this.recipes[base] = await FaceRecipe.load(base);
    return this.recipes[base];
  }

  async _shades(base) {
    if (!this.shadeManifest[base]) {
      this.shadeManifest[base] = await fetch(`${import.meta.env.BASE_URL}assets/skin/${base}/shades.json`)
        .then((r) => r.json())
        .catch(() => ({ shades: SKIN_SHADES.map((n) => ({ name: n, hex: '#7a5a48' })) }));
    }
    return this.shadeManifest[base];
  }

  _disposeRoot() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // Only geometry/materials we cloned for this preview; the shared originals
      // in the asset cache are left alone.
      if (o.userData.__ccOwnedGeom || o.userData.__faceRecipeOwned) o.geometry.dispose();
      if (o.userData.__ccOwnedMat) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose();
      }
    });
    this.root = null;
    this.hairNode = null;
    this.hairBlend = null;
    this.hairEntry = null;
    this.headMesh = null;
    this.bodyMesh = null;
    this._outfitNodes = [];
    this._preHideGeometry = new Map();
    this._heritageRig = null;
  }

  async _loadBase(base) {
    this._disposeRoot();

    const { root } = await assets.character(`_base_${base}`);
    this.root = root;

    // SkeletonUtils.clone shares materials with the cached GLTF, so tinting or
    // re-mapping them here would bleed into every other instance of this file.
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      o.userData.__ccOwnedMat = true;
    });

    applyCharacterMaterials(root);

    // Heritage: textures go on once (the 4-slot blend materials carry a live
    // weight Vector4); geometry becomes one dense offset layer PER ancestor,
    // mixed in realtime by the tree sliders — through the FaceRecipe as an
    // underlay for the meshes it owns, directly for the rest (the body).
    // Ancestors may come from either cast: the bases share topology, so a
    // mars grandfather's deltas land on a venus body and vice versa.
    this._heritageRig = null;
    this._syncHeritage();
    const her = this.build.heritage;
    if (her) {
      const f = await import('./CharacterFactory.js');
      const slots = [0, 1, 2, 3].filter((i) => her.parents[i]);
      const names = slots.map((i) => her.parents[i]);
      const initW = slots.map((i) => her.weights[i]);
      const applied = await f.applyHeritage(root, names,
        initW.some((w) => w > 0) ? initW : names.map(() => 1),
        { geometry: false, base });

      const recipes = await Promise.all(names.map((n) => f.loadRecipe(n)));
      const fr = this.recipes[base];
      const layers = [];
      const manualMeshes = new Map();
      for (const recipe of recipes) {
        const layer = {};
        for (const [rawName, g] of Object.entries(recipe.geometry?.meshes ?? {})) {
          if (!g.movedCount) continue;
          const canon = rawName.replace(/_(venus|mars)$/, '');
          const local = /^GEO-/.test(canon) ? `${canon}_${base}` : canon;
          const mesh = this._findMeshByName(root, local) ?? this._findMesh(root, g.vertexCount);
          if (!mesh) continue;
          const dense = f.denseOffsets(mesh, g, recipe.geometry.uvTolerance);
          if (!dense) continue;
          layer[local] = dense;
          if (!fr?.byMesh?.has(local)) manualMeshes.set(local, mesh);
        }
        layers.push(layer);
      }

      const manual = [];
      for (const [name, mesh] of manualMeshes) {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.__ccOwnedGeom = true;
        const pos = mesh.geometry.getAttribute('position');
        const pristine = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          pristine[i * 3] = pos.getX(i);
          pristine[i * 3 + 1] = pos.getY(i);
          pristine[i * 3 + 2] = pos.getZ(i);
        }
        manual.push({ name, mesh, pristine });
      }
      this._heritageRig = {
        layers, manual, slots,
        texIdx: applied.texIdx,               // which rig entries feed textures
        texApplied: applied.texturesApplied,  // false: all-male tree on venus
      };
    }

    // Studio lighting only — self-shadowing at this focal length just stipples
    // the cheeks.
    root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    this.headMesh = this._findMesh(root, 6162);
    this.bodyMesh = this._findMesh(root, 9338);

    this.scene.add(root);

    if (!this._heritageRig?.texApplied || this.build.skinExplicit) await this._applySkin(this.build.skin);
    await this._applyHair(this.build.hair);
    if (this.outfitSeg) {
      await this._buildOutfitButtons();   // availability differs per base
      await this._applyOutfit(this.build.outfit);
    }
    if (this._heritageRig) await this._applyTreeWeights();

    // Re-seat the framing on the new skull — venus and mars are different sizes.
    const box = this._craniumBox(this.headMesh, 0.0);
    if (box) {
      const c = new THREE.Vector3();
      box.getCenter(c);
      this.target.set(0, c.y + (box.max.y - box.min.y) * 0.06, 0);
      this.orbit.dist = Math.max(0.55, (box.max.y - box.min.y) * 2.35);
      this._limits = { min: this.orbit.dist * 0.42, max: this.orbit.dist * 2.6 };
    }

    this._pendingAll = true;   // stamp the current slider values onto the new base
  }

  _findMesh(root, verts) {
    let hit = null;
    root.traverse((o) => {
      if (!hit && o.isMesh && o.geometry?.getAttribute('position')?.count === verts) hit = o;
    });
    return hit;
  }

  _findMeshByName(root, name) {
    let hit = null;
    root.traverse((o) => { if (!hit && o.isMesh && o.name === name) hit = o; });
    return hit;
  }

  // ------------------------------------------------------------------ skin

  async _applySkin(shade) {
    this.build.skin = shade;
    const base = this.build.base;
    const dir = `${import.meta.env.BASE_URL}assets/skin/${base}`;
    const manifest = await this._shades(base);
    const entry = manifest.shades?.find((s) => s.name === shade);

    // With heritage skin on, complexion is a TONE control — it tints the
    // inherited maps rather than throwing them away for a generic texture.
    // The tint is the swatch RELATIVE to the manifest's own middle shade, so
    // the scale is self-calibrating: the middle swatch is identity, lighter
    // ones brighten, darker ones darken — and it is softened so the darkest
    // swatch deepens the skin instead of painting the face black (the exact
    // failure the site's hair-shader doc warns about).
    if (this._heritageRig?.texApplied) {
      const tint = skinToneTint(entry?.hex, manifest);
      for (const mesh of [this.headMesh, this.bodyMesh]) {
        if (!mesh) continue;
        for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
          m.color.copy(tint);
        }
      }
      return;
    }

    const head = entry?.head ?? `${shade}_head.jpg`;
    const body = entry?.body ?? `${shade}_body.jpg`;

    // assets.texture() already applies flipY=false and SRGB, which is what these
    // glTF-authored UVs need.
    if (this.headMesh) this._setMap(this.headMesh, assets.texture(`${dir}/${head}`));
    if (this.bodyMesh) this._setMap(this.bodyMesh, assets.texture(`${dir}/${body}`));
  }

  _setMap(mesh, tex) {
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      // A heritage material mixes two maps in the shader; overriding with a
      // plain shade has to strip that or the new map still gets crossfaded.
      delete m.onBeforeCompile;
      delete m.customProgramCacheKey;
      m.map = tex;
      m.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ hair

  /**
   * Dense head offsets of the current sculpt — what the hair conform replays
   * against. The FaceRecipe's displacement already contains both layers: the
   * heritage underlay and the sliders on top of it.
   */
  _headDisplacement() {
    const recipe = this.recipes[this.build.base];
    if (!recipe || !this.root) return null;
    return recipe.displacement(this.root, `GEO-head_${this.build.base}`);
  }

  /**
   * The bounding box of the skull dome — vertices in the top `frac` of the head.
   * Hair is fitted against this rather than the whole head box so that jaw and
   * chin sliders, which move the bottom of the head a long way, do not drag the
   * hairline around with them.
   */
  _craniumBox(headMesh, frac = 0.55) {
    const attr = headMesh?.geometry?.getAttribute('position');
    if (!attr) return null;

    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < attr.count; i++) {
      const y = attr.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cut = minY + (maxY - minY) * frac;

    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < attr.count; i++) {
      if (attr.getY(i) < cut) continue;
      box.expandByPoint(v.set(attr.getX(i), attr.getY(i), attr.getZ(i)));
    }
    return box.isEmpty() ? null : box;
  }

  async _applyHair(style) {
    this.build.hair = style ?? null;

    if (this.hairNode) {
      this.hairNode.removeFromParent();
      this.hairNode.geometry.dispose();
      this.hairNode.material.dispose();
      // The blend pass shares the core's geometry, so only its material is ours.
      this.hairBlend?.material.dispose();
      this.hairBlend = null;
      this.hairNode = null;
      this.hairEntry = null;
    }
    if (!this.build.hair || !this.root) {
      // Taking the hair off has to lift the darkening with it, or the character
      // keeps a shadow of a style they are no longer wearing.
      clearScalpMask(this.headMesh);
      return;
    }

    // The seated per-base asset, conformed to the current sculpt — the exact
    // path the NPCs take, so what the player sees here is what spawns in-game.
    const { conformedHair, HAIRLESS_OUTFITS } = await import('./CharacterFactory.js');
    const hair = await conformedHair(
      this.build.hair, this.build.base, this.build.hairColour, this._headDisplacement());
    if (!this._open || this.build.hair !== style || !hair) return;   // switched while loading
    hair.mesh.visible = !HAIRLESS_OUTFITS.has(this.build.outfit);

    hair.mesh.traverse((o) => { o.castShadow = false; });
    hair.mesh.userData.__ccOwnedGeom = true;
    hair.mesh.userData.__ccOwnedMat = true;
    hair.mesh.children[0].userData.__ccOwnedMat = true;

    this.root.add(hair.mesh);
    this.hairNode = hair.mesh;
    this.hairBlend = hair.mesh.children[0];
    this.hairEntry = hair.entry;

    // The scalp under this style, darkened in head UV space so no skin reads
    // through the sparse cards.
    applyScalpMask(this.headMesh, hair.entry, this.build.hairColour);
  }

  // ---------------------------------------------------------------- heritage

  async _buildHeritageUi() {
    const { RECIPES_BY_BASE } = await import('./CharacterFactory.js');
    const males = RECIPES_BY_BASE.mars, females = RECIPES_BY_BASE.venus;

    // One-time styling: themed selects and gold sliders instead of the
    // browser-blue defaults.
    if (!this._heritageCss) {
      this._heritageCss = true;
      this.styleEl.textContent += `
.cc select { background: rgba(0,0,0,0.45); color: var(--ink); border: 1px solid var(--edge);
  font-family: var(--font); font-size: 0.82rem; padding: 0.35rem 0.4rem; outline: none; width: 100%; }
.cc select:focus, .cc select:hover { border-color: var(--gold); }
.cc input[type=range] { accent-color: var(--gold); }
.cc-slot { display: grid; grid-template-columns: minmax(0,1fr) 88px 46px; gap: 8px;
  align-items: center; margin-bottom: 7px; }
.cc-slot b { font-size: 0.74rem; color: var(--gold); text-align: right; font-weight: 400;
  font-variant-numeric: tabular-nums; }
.cc-slot .shapeonly { grid-column: 1 / -1; margin-top: -5px; font-size: 0.64rem;
  color: var(--ink-dim); letter-spacing: 0.1em; }`;
    }

    this.heritageHost.textContent = '';
    this.treeSelects = {};
    this._slotEls = {};

    // Four ancestors, each with its own weight — every slider always has a
    // visible effect, unlike the old father/mother hierarchy where one master
    // slider silently gated the other three to nothing.
    const SLOTS = [
      { key: 'gff', tag: '♂', list: males },
      { key: 'gmf', tag: '♀', list: females },
      { key: 'gfm', tag: '♂', list: males },
      { key: 'gmm', tag: '♀', list: females },
    ];
    for (const s of SLOTS) {
      const row = this._el('div', 'cc-slot', this.heritageHost);

      const sel = document.createElement('select');
      for (const name of [null, ...s.list]) {
        const o = document.createElement('option');
        o.value = name ?? ''; o.textContent = name ? `${s.tag} ${name}` : `${s.tag} —`;
        sel.appendChild(o);
      }
      sel.value = this.tree[s.key] ?? '';
      sel.onchange = () => {
        this.tree[s.key] = sel.value || null;
        this.build.skinExplicit = false;
        this._syncHeritage();
        this._reloadPreview();
      };
      row.appendChild(sel);
      this.treeSelects[s.key] = sel;

      const w = document.createElement('input');
      w.type = 'range'; w.min = 0.02; w.max = 1; w.step = 'any';
      w.value = this.tree.w[s.key] ?? 1;
      w.oninput = () => { this.tree.w[s.key] = parseFloat(w.value); this._applyTreeWeights(); };
      row.appendChild(w);

      const pct = this._el('b', null, row, '—');
      const note = this._el('div', 'shapeonly', row, 'shape only — skin follows the female lines');
      note.style.display = 'none';
      this._slotEls[s.key] = { row, sel, w, pct, note, tag: s.tag };
    }

    const lab = this._el('div', 'cc-note', this.heritageHost);
    lab.style.cssText = 'font-size:0.7rem;color:var(--ink-dim);letter-spacing:0.06em;margin:2px 0 4px';
    this.heritageVal = lab;
    this._syncHeritage();
  }

  /** Tree state -> the flat parents/weights the factory consumes. */
  _syncHeritage() {
    const t = this.tree;
    const order = ['gff', 'gmf', 'gfm', 'gmm'];
    const parents = order.map((k) => t[k]);
    const weights = order.map((k) => (t[k] ? (t.w[k] ?? 1) : 0));
    this.build.heritage = parents.some(Boolean) && weights.some((w) => w > 0)
      ? { parents, weights }
      : null;

    // Per-row effective share, and the venus-only "no male skin" note.
    const sum = weights.reduce((s, w) => s + w, 0) || 1;
    order.forEach((k, i) => {
      const el = this._slotEls?.[k];
      if (!el) return;
      el.pct.textContent = parents[i] ? `${Math.round((weights[i] / sum) * 100)}%` : '—';
      el.w.style.visibility = parents[i] ? 'visible' : 'hidden';
      el.note.style.display =
        parents[i] && el.tag === '♂' && this.build.base === 'venus' ? '' : 'none';
    });
    if (this.heritageVal) this.heritageVal.textContent = this._heritageLabel();
  }

  _heritageLabel() {
    const h = this.build.heritage;
    if (!h) return '—';
    const sum = h.weights.reduce((s, w) => s + w, 0) || 1;
    return h.parents
      .map((p, i) => (p && h.weights[i] > 0 ? `${Math.round((h.weights[i] / sum) * 100)}% ${p}` : null))
      .filter(Boolean).join(' · ');
  }

  /** Live path for the three balance sliders: lerp layers, nudge the uniform. */
  async _applyTreeWeights() {
    this._syncHeritage();
    const rig = this._heritageRig;
    if (!rig || !this.build.heritage || !this.root) return;

    // Weights for the rig's active (non-null) ancestors, in rig order.
    const h = this.build.heritage;
    const ws = rig.slots.map((slot) => h.weights[slot] ?? 0);
    const sum = ws.reduce((s, w) => s + w, 0) || 1;
    const nw = ws.map((w) => w / sum);

    const recipe = this.recipes[this.build.base];
    const mix = (name) => {
      let out = null;
      rig.layers.forEach((layer, i) => {
        const d = layer[name];
        if (!d || !nw[i]) return;
        if (!out) out = new Float32Array(d.length);
        for (let k = 0; k < d.length; k++) out[k] += d[k] * nw[i];
      });
      return out;
    };

    const meshNames = new Set(rig.layers.flatMap((l) => Object.keys(l)));
    const underlay = {};
    for (const name of meshNames) {
      const dense = mix(name);
      if (!dense) continue;
      if (recipe?.byMesh?.has(name)) { underlay[name] = dense; continue; }
      const m = rig.manual.find((x) => x.name === name);
      if (!m) continue;
      const pos = m.mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i,
          m.pristine[i * 3] + dense[i * 3],
          m.pristine[i * 3 + 1] + dense[i * 3 + 1],
          m.pristine[i * 3 + 2] + dense[i * 3 + 2]);
      }
      pos.needsUpdate = true;
    }
    recipe?.setUnderlay(this.root, underlay);

    // Texture weights renormalise inside the eligible subset (no male maps on
    // a venus body) — the material slots were built in that same order.
    const { setBlendWeights } = await import('./CharacterFactory.js');
    setBlendWeights(this.root, rig.texIdx.map((i) => nw[i]));

    this._pendingAll = true;   // sliders + underlay + hair conform, next frame
  }

  /** Rebuild the preview root (ancestor changes re-stamp everything on it). */
  async _reloadPreview() {
    this._status('blending…');
    await this._loadBase(this.build.base);
    this._status(null);
  }

  // ------------------------------------------------------------------ attire

  async _buildOutfitButtons() {
    const { outfitsFor } = await import('./CharacterFactory.js');
    const names = outfitsFor(this.build.base);
    if (this.build.outfit && !names.includes(this.build.outfit)) this.build.outfit = names[0] ?? null;
    this.outfitSeg.textContent = '';
    this.outfitBtns = new Map();
    for (const name of [null, ...names]) {
      const btn = this._el('button', name === this.build.outfit ? 'on' : '', this.outfitSeg,
        name ? humanise(name) : 'None');
      btn.style.flex = '1 0 30%';
      btn.onclick = () => this._pickOutfit(name);
      this.outfitBtns.set(name, btn);
    }
  }

  _pickOutfit(name) {
    for (const [n, b] of this.outfitBtns ?? []) b.classList.toggle('on', n === name);
    this._applyOutfit(name);
  }

  /**
   * Dress the preview. Worn outfits are real skinned meshes rebound to the
   * base's rig, with the covered body triangles culled — and restored again
   * when the outfit comes off, which the in-game build never needs but a
   * try-things-on preview constantly does. Hooded outfits hide the hair
   * (HAIRLESS_OUTFITS) exactly as they will in-game.
   */
  async _applyOutfit(name) {
    this.build.outfit = name ?? null;

    for (const n of this._outfitNodes) n.removeFromParent();
    this._outfitNodes = [];
    for (const [mesh, geo] of this._preHideGeometry) mesh.geometry = geo;
    this._preHideGeometry = new Map();

    const factory = await import('./CharacterFactory.js');
    if (this.hairNode) this.hairNode.visible = !factory.HAIRLESS_OUTFITS.has(this.build.outfit);
    if (!this.build.outfit || !this.root) return;

    const worn = await factory.wearOutfit(this.root, this.build.outfit, this.build.base);
    if (!worn) return;
    if (!this._open || this.build.outfit !== name) {   // switched while loading
      for (const n of worn.nodes) n.removeFromParent();
      for (const [mesh, geo] of worn.preHide) mesh.geometry = geo;
      return;
    }
    for (const n of worn.nodes) { n.castShadow = false; n.receiveShadow = false; }
    this._outfitNodes = worn.nodes;
    this._preHideGeometry = worn.preHide;
  }

  /** Re-conform the worn hair to the sculpted skull (live, during slider drags). */
  async _fitHair() {
    if (!this.hairNode || !this.hairEntry?.bind) return;
    const disp = this._headDisplacement();
    if (!disp) return;
    const { replayHair } = await import('./CharacterFactory.js');
    replayHair(this.hairEntry, this.hairEntry.bind, disp, this.hairNode.geometry);
  }

  _setHairColour(hex) {
    this.build.hairColour = hex;
    // Both hair passes and the scalp underneath. The scalp is tinted by the hair
    // colour rather than a fixed shade, so it has to follow the picker — a dark
    // scalp under flaxen hair is exactly the artefact the mask exists to avoid.
    if (this.hairNode) this.hairNode.material.color.set(hex);
    if (this.hairBlend) this.hairBlend.material.color.set(hex);
    setScalpColour(this.headMesh, hex);
  }

  // ------------------------------------------------------------- sculpting

  _rebuild(changed) {
    const recipe = this.recipes[this.build.base];
    if (!recipe || !this.root) return;
    recipe.apply(this.root, this.build.sliders, changed);
    this._fitHair();
  }

  _queue(name) {
    if (name) this._pending.add(name); else this._pendingAll = true;
  }

  // =====================================================================
  // interface
  // =====================================================================

  _injectStyle() {
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = `
.cc { position: fixed; inset: 0; z-index: 200; font-family: var(--font); color: var(--ink);
      pointer-events: none; }
.cc-grab { position: absolute; inset: 0; pointer-events: auto; cursor: grab; z-index: 1; }
.cc-grab.drag { cursor: grabbing; }

.cc-vignette { position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 220px rgba(0,0,0,0.85); }

.cc-title { position: absolute; top: 3vh; left: 3.4vw; z-index: 2; pointer-events: none;
  max-width: calc(100vw - 372px - 7vw); }
.cc-title h2 { font-weight: 400; letter-spacing: 0.28em; color: var(--gold);
  font-size: clamp(0.72rem, 1.7vw, 1.05rem); text-transform: uppercase; }
.cc-title p { margin-top: 0.5rem; font-size: 0.76rem; letter-spacing: 0.14em;
  color: var(--ink-dim); text-transform: lowercase; }

.cc-side { position: absolute; top: 0; right: 0; bottom: 0; width: 372px; z-index: 2;
  pointer-events: auto; background: var(--panel); border-left: 1px solid var(--edge);
  backdrop-filter: blur(6px); display: flex; flex-direction: column; }
.cc-scroll { flex: 1; overflow-y: auto; padding: 1.6rem 1.4rem 1rem; }
.cc-scroll::-webkit-scrollbar { width: 7px; }
.cc-scroll::-webkit-scrollbar-thumb { background: rgba(201,163,78,0.3); }
.cc-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }

.cc-h { font-size: 0.7rem; letter-spacing: 0.26em; text-transform: uppercase;
  color: var(--gold); border-bottom: 1px solid var(--edge); padding-bottom: 0.45rem;
  margin: 1.5rem 0 0.85rem; }
.cc-h:first-child { margin-top: 0; }

.cc-seg { display: flex; gap: 6px; }
.cc-seg button { flex: 1; background: rgba(255,255,255,0.03); color: var(--ink-dim);
  border: 1px solid rgba(255,255,255,0.1); padding: 0.5rem 0.3rem; font-family: var(--font);
  font-size: 0.82rem; letter-spacing: 0.1em; cursor: pointer; transition: all 0.14s ease; }
.cc-seg button:hover { color: var(--ink); background: rgba(201,163,78,0.09); }
.cc-seg button.on { color: #100e0b; background: var(--gold); border-color: var(--gold); }

.cc-swatches { display: flex; gap: 8px; }
.cc-sw { width: 100%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.16);
  cursor: pointer; transition: all 0.14s ease; position: relative; }
.cc-sw:hover { transform: translateY(-2px); }
.cc-sw.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.cc-sw.on::after { content: ''; position: absolute; inset: 3px; border: 1px solid rgba(0,0,0,0.4); }
.cc-swrow { display: grid; grid-template-columns: repeat(9, 1fr); gap: 5px; }

.cc-field { display: flex; align-items: center; gap: 0.7rem; }
.cc-field input[type=text] { flex: 1; background: rgba(0,0,0,0.4); border: 1px solid var(--edge);
  color: var(--ink); font-family: var(--font); font-size: 0.95rem; padding: 0.5rem 0.7rem;
  letter-spacing: 0.06em; outline: none; }
.cc-field input[type=text]:focus { border-color: var(--gold); }
.cc-field input[type=color] { width: 38px; height: 32px; padding: 0; border: 1px solid var(--edge);
  background: none; cursor: pointer; }

details.cc-grp { border-bottom: 1px solid rgba(255,255,255,0.06); }
details.cc-grp > summary { list-style: none; cursor: pointer; padding: 0.62rem 0.1rem;
  font-size: 0.84rem; letter-spacing: 0.14em; color: var(--ink-dim);
  display: flex; justify-content: space-between; align-items: center; }
details.cc-grp > summary::-webkit-details-marker { display: none; }
details.cc-grp > summary:hover { color: var(--ink); }
details.cc-grp[open] > summary { color: var(--gold); }
details.cc-grp > summary .n { font-size: 0.68rem; opacity: 0.55; letter-spacing: 0.08em; }
.cc-grpbody { padding: 0.2rem 0 0.9rem; }

.cc-s { margin-bottom: 0.62rem; }
.cc-s .lab { display: flex; justify-content: space-between; font-size: 0.74rem;
  color: var(--ink-dim); letter-spacing: 0.05em; margin-bottom: 0.2rem; }
.cc-s .lab b { color: var(--ink); font-weight: 400; font-variant-numeric: tabular-nums; }
.cc-s.act .lab b { color: var(--gold); }
.cc-s input[type=range] { width: 100%; -webkit-appearance: none; appearance: none;
  height: 2px; background: rgba(255,255,255,0.14); outline: none; cursor: ew-resize; }
.cc-s input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
  width: 11px; height: 11px; border-radius: 50%; background: var(--gold);
  border: 1px solid rgba(0,0,0,0.5); cursor: ew-resize; }
.cc-s input[type=range]::-moz-range-thumb { width: 11px; height: 11px; border-radius: 50%;
  background: var(--gold); border: 1px solid rgba(0,0,0,0.5); cursor: ew-resize; }

.cc-foot { border-top: 1px solid var(--edge); padding: 1rem 1.4rem 1.2rem;
  background: rgba(0,0,0,0.35); }
.cc-btns { display: flex; gap: 8px; margin-top: 0.85rem; }
.cc-btn { flex: 1; background: rgba(255,255,255,0.04); color: var(--ink-dim);
  border: 1px solid rgba(255,255,255,0.12); padding: 0.6rem 0.4rem; font-family: var(--font);
  font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer;
  transition: all 0.14s ease; }
.cc-btn:hover { color: var(--ink); background: rgba(201,163,78,0.1); border-color: var(--edge); }
.cc-btn.go { color: #100e0b; background: var(--gold); border-color: var(--gold); font-weight: 600; }
.cc-btn.go:hover { background: #ddb960; }

.cc-hint { position: absolute; bottom: 1.3rem; left: 3.4vw; z-index: 2; pointer-events: none;
  font-size: 0.72rem; color: var(--ink-dim); letter-spacing: 0.1em; line-height: 1.8; }
.cc-status { position: absolute; top: 50%; left: 0; right: 372px; text-align: center;
  font-size: 0.8rem; letter-spacing: 0.2em; color: var(--ink-dim); z-index: 2;
  pointer-events: none; text-transform: lowercase; }

@media (max-width: 900px) {
  .cc-side { width: 300px; }
  .cc-status { right: 300px; }
  .cc-title { max-width: calc(100vw - 300px - 7vw); }
  .cc-hint { display: none; }
}
`;
    document.head.appendChild(this.styleEl);
  }

  _el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  _status(msg) {
    if (!this.statusEl) return;
    this.statusEl.textContent = msg ?? '';
    this.statusEl.style.display = msg ? '' : 'none';
  }

  _buildDom() {
    const dom = this._el('div', 'cc');
    this.dom = dom;

    const grab = this._el('div', 'cc-grab', dom);
    this._el('div', 'cc-vignette', dom);
    this._wireOrbit(grab);

    const title = this._el('div', 'cc-title', dom);
    this._el('h2', null, title, 'Forge a Traveller');
    this._el('p', null, title, 'the shape of a life not yet lived');

    this.statusEl = this._el('div', 'cc-status', dom);
    this._status(null);

    const hint = this._el('div', 'cc-hint', dom);
    hint.innerHTML = 'drag to turn &nbsp;·&nbsp; wheel to draw near<br>double-click a slider to settle it';

    const side = this._el('aside', 'cc-side', dom);
    const scroll = this._el('div', 'cc-scroll', side);
    this.scrollEl = scroll;

    // ---- lineage -----------------------------------------------------
    this._el('div', 'cc-h', scroll, 'Lineage');
    const seg = this._el('div', 'cc-seg', scroll);
    this.baseBtns = {};
    for (const b of BASES) {
      const btn = this._el('button', b === this.build.base ? 'on' : '', seg, cap(b));
      btn.onclick = () => this._pickBase(b);
      this.baseBtns[b] = btn;
    }

    // ---- heritage ----------------------------------------------------
    // A little family tree: pick up to four grandparents from the named cast
    // and the balance sliders decide whose blood shows. Sliders sculpt on top.
    this._el('div', 'cc-h', scroll, 'Heritage');
    this.heritageHost = this._el('div', null, scroll);
    this._buildHeritageUi();

    // ---- complexion --------------------------------------------------
    this._el('div', 'cc-h', scroll, 'Complexion');
    this.skinRow = this._el('div', 'cc-swatches', scroll);
    this._buildSkinSwatches();

    // ---- hair --------------------------------------------------------
    this._el('div', 'cc-h', scroll, 'Hair');
    const hseg = this._el('div', 'cc-seg', scroll);
    this.hairBtns = new Map();
    for (const style of HAIR_STYLES) {
      const label = style === null ? 'None' : humanise(style);
      const btn = this._el('button', style === this.build.hair ? 'on' : '', hseg, label);
      btn.onclick = () => this._pickHair(style);
      this.hairBtns.set(style, btn);
    }

    const hcWrap = this._el('div', null, scroll);
    hcWrap.style.marginTop = '0.7rem';
    this.hairRow = this._el('div', 'cc-swrow', hcWrap);
    this.hairSwatches = new Map();
    for (const [name, hex] of HAIR_COLOURS) {
      const sw = this._el('div', 'cc-sw', this.hairRow);
      sw.style.background = '#' + hex.toString(16).padStart(6, '0');
      sw.title = name;
      sw.onclick = () => this._pickHairColour(hex);
      this.hairSwatches.set(hex, sw);
    }
    const hcField = this._el('div', 'cc-field', hcWrap);
    hcField.style.marginTop = '0.6rem';
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.value = '#' + this.build.hairColour.toString(16).padStart(6, '0');
    custom.oninput = () => this._pickHairColour(parseInt(custom.value.slice(1), 16));
    this.hairCustom = custom;
    hcField.appendChild(custom);
    const hcLabel = this._el('span', null, hcField, 'a shade of your own');
    hcLabel.style.cssText = 'font-size:0.76rem;color:var(--ink-dim);letter-spacing:0.08em';
    this._syncHairColour();

    // ---- attire ------------------------------------------------------
    this._el('div', 'cc-h', scroll, 'Attire');
    this.outfitSeg = this._el('div', 'cc-seg', scroll);
    this.outfitSeg.style.flexWrap = 'wrap';
    this._buildOutfitButtons();

    // ---- features ----------------------------------------------------
    this._el('div', 'cc-h', scroll, 'Features');
    this.sliderHost = this._el('div', null, scroll);

    // ---- footer ------------------------------------------------------
    const foot = this._el('div', 'cc-foot', side);
    const nameField = this._el('div', 'cc-field', foot);
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'name your traveller';
    nameInput.maxLength = 24;
    nameInput.value = this.build.name;
    nameInput.oninput = () => { this.build.name = nameInput.value; };
    this.nameInput = nameInput;
    nameField.appendChild(nameInput);

    const btns = this._el('div', 'cc-btns', foot);
    this._el('button', 'cc-btn', btns, 'Randomise').onclick = () => this._randomise();
    this._el('button', 'cc-btn', btns, 'Reset').onclick = () => this._reset();
    this._el('button', 'cc-btn go', btns, 'Confirm').onclick = () => this._finish();

    this._onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    };
    addEventListener('keydown', this._onKey);

    document.body.appendChild(dom);
  }

  async _buildSkinSwatches() {
    const manifest = await this._shades(this.build.base);
    this.skinRow.textContent = '';
    this.skinSwatches = new Map();
    for (const name of SKIN_SHADES) {
      const entry = manifest.shades?.find((s) => s.name === name);
      const sw = this._el('div', 'cc-sw' + (name === this.build.skin ? ' on' : ''), this.skinRow);
      sw.style.background = entry?.hex ?? '#7a5a48';
      sw.title = cap(name);
      sw.onclick = () => this._pickSkin(name);
      this.skinSwatches.set(name, sw);
    }
  }

  _buildSliderUi() {
    const recipe = this.recipes[this.build.base];
    this.sliderHost.textContent = '';
    this.sliderEls = new Map();

    let first = true;
    for (const group of recipe.groups) {
      const det = this._el('details', 'cc-grp', this.sliderHost);
      if (first) { det.open = true; first = false; }
      const sum = this._el('summary', null, det);
      this._el('span', null, sum, group.name);
      this._el('span', 'n', sum, String(group.sliders.length));
      const body = this._el('div', 'cc-grpbody', det);

      for (const name of group.sliders) {
        const [lo, hi] = recipe.range(name);
        const row = this._el('div', 'cc-s', body);
        const lab = this._el('div', 'lab', row);
        this._el('span', null, lab, humanise(name));
        const val = this._el('b', null, lab, '0.00');

        const input = document.createElement('input');
        input.type = 'range';
        input.min = lo; input.max = hi; input.step = 0.01;
        input.value = this.build.sliders[name] ?? 0;
        input.title = recipe.region(name);
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          this.build.sliders[name] = v;
          this._paintSlider(name, v);
          this._queue(name);
        });
        // A slider you have lost track of should be recoverable without hunting
        // for dead centre with the mouse.
        input.addEventListener('dblclick', () => {
          this.build.sliders[name] = 0;
          input.value = 0;
          this._paintSlider(name, 0);
          this._queue(name);
        });
        row.appendChild(input);

        this.sliderEls.set(name, { row, input, val });
        this._paintSlider(name, this.build.sliders[name] ?? 0);
      }
    }
  }

  _paintSlider(name, v) {
    const el = this.sliderEls?.get(name);
    if (!el) return;
    el.val.textContent = v.toFixed(2);
    el.row.classList.toggle('act', Math.abs(v) > 0.005);
  }

  _syncSliderUi() {
    if (!this.sliderEls) return;
    for (const [name, el] of this.sliderEls) {
      const v = this.build.sliders[name] ?? 0;
      el.input.value = v;
      this._paintSlider(name, v);
    }
  }

  _syncHairColour() {
    for (const [hex, sw] of this.hairSwatches) sw.classList.toggle('on', hex === this.build.hairColour);
    this.hairCustom.value = '#' + this.build.hairColour.toString(16).padStart(6, '0');
  }

  // ---------------------------------------------------------------- actions

  async _pickBase(base) {
    if (base === this.build.base || this._busy) return;
    this._busy = true;
    this.build.base = base;
    for (const [b, btn] of Object.entries(this.baseBtns)) btn.classList.toggle('on', b === base);
    this._status('changing lineage…');

    const recipe = await this._recipe(base);
    // Both bases carry the same 68 names, so the sculpt survives the swap.
    const kept = this.build.sliders;
    this.build.sliders = Object.fromEntries(recipe.sliderNames.map((n) => [n, kept[n] ?? 0]));

    // The heritage parents are per-base; _buildHeritageUi drops an invalid pick.
    await this._buildHeritageUi();
    await this._loadBase(base);
    this._buildSkinSwatches();
    this._buildSliderUi();
    this._status(null);
    this._busy = false;
  }

  async _pickSkin(name) {
    this.build.skinExplicit = true;   // the player's shade beats the heritage skin
    for (const [n, sw] of this.skinSwatches) sw.classList.toggle('on', n === name);
    await this._applySkin(name);
  }

  async _pickHair(style) {
    for (const [s, btn] of this.hairBtns) btn.classList.toggle('on', s === style);
    this._status(style ? 'combing…' : null);
    await this._applyHair(style);
    this._status(null);
  }

  _pickHairColour(hex) {
    this._setHairColour(hex);
    this._syncHairColour();
  }

  _randomise() {
    const recipe = this.recipes[this.build.base];
    this.build.sliders = recipe.random();
    this._syncSliderUi();
    this._queue(null);

    const shade = SKIN_SHADES[(Math.random() * SKIN_SHADES.length) | 0];
    this._pickSkin(shade);

    const style = HAIR_STYLES[(Math.random() * HAIR_STYLES.length) | 0];
    this._pickHair(style);
    this._pickHairColour(HAIR_COLOURS[(Math.random() * HAIR_COLOURS.length) | 0][1]);

    if (!this.build.name.trim()) {
      const n = NAME_PARTS[0][(Math.random() * NAME_PARTS[0].length) | 0]
              + NAME_PARTS[1][(Math.random() * NAME_PARTS[1].length) | 0];
      this.build.name = n;
      this.nameInput.value = n;
    }
  }

  _reset() {
    const recipe = this.recipes[this.build.base];
    this.build.sliders = recipe.neutral();
    this._syncSliderUi();
    this._queue(null);
  }

  // ----------------------------------------------------------------- orbit

  _wireOrbit(el) {
    let dragging = false, lx = 0, ly = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      // Capture is a nicety — it keeps the drag alive if the cursor leaves the
      // element. It throws if the pointer is already gone, which must not take
      // the rest of the handler down with it.
      try { el.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
      el.classList.add('drag');
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.orbit.az -= dx * 0.008;
      this.orbit.el = THREE.MathUtils.clamp(
        this.orbit.el + dy * 0.006,
        THREE.MathUtils.degToRad(-42), THREE.MathUtils.degToRad(52),
      );
    });
    const end = (e) => {
      dragging = false;
      el.classList.remove('drag');
      try {
        if (e.pointerId !== undefined && el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch { /* already released */ }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.dist = THREE.MathUtils.clamp(
        this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.09),
        this._limits.min, this._limits.max,
      );
    }, { passive: false });
  }
}
