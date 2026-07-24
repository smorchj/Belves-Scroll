import * as THREE from 'three';

/**
 * Hair with a per-skull fit built in.
 *
 * The site fits each style to whichever base it is applied to, and the two fits
 * of one style share topology exactly — so `tools/build-hair.mjs` ships the
 * venus fit as the base geometry and the venus→mars difference as a morph
 * target. Setting the influence to 0 gives the feminine skull fit, 1 the
 * masculine one, and values between work for a head sculpted somewhere in the
 * middle. The two fits differ by up to 8cm, which is more than enough to clip
 * through a scalp if you graft one onto the wrong skull.
 *
 * Geometry is baked into head-bone-local space, so the mesh parents straight
 * onto the Head bone with no correction transform.
 */
export class HairLibrary {
  constructor() {
    this.ready = false;
    this.styles = {};
    this._loading = null;
  }

  get available() { return Object.keys(this.styles); }

  async load(base = `${import.meta.env.BASE_URL}assets/hair`) {
    if (this.ready) return this;
    if (this._loading) return this._loading;

    this._loading = (async () => {
      const [manifest, buffer] = await Promise.all([
        fetch(`${base}/hair.json`).then((r) => r.json()),
        fetch(`${base}/hair.bin`).then((r) => r.arrayBuffer()),
      ]);

      for (const [style, e] of Object.entries(manifest.styles)) {
        const view = (spec, Type) => (spec ? new Type(buffer, spec.offset, spec.length) : null);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(view(e.positions, Float32Array), 3));
        if (e.normals) geo.setAttribute('normal', new THREE.BufferAttribute(view(e.normals, Float32Array), 3));
        if (e.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(view(e.uvs, Float32Array), 2));
        if (e.indices) geo.setIndex(new THREE.BufferAttribute(view(e.indices, Uint32Array), 1));

        geo.morphAttributes.position = [new THREE.BufferAttribute(view(e.marsDelta, Float32Array), 3)];
        geo.morphTargetsRelative = true;
        if (!e.normals) geo.computeVertexNormals();
        geo.computeBoundingSphere();

        // The COVERAGE atlas, not a colour map.
        //
        // mh_materials.json says  and :
        // the red channel is per-pixel strand coverage and the texture baked into
        // the GLB is to be ignored. Binding that baked map as a colour map — which
        // is what this did — gives hair that is already one fixed colour, so the
        // player's colour choice barely showed.
        // Awaited, not fire-and-forget.
        //
        // TextureLoader().load() returns immediately with an empty texture, and
        // three binds a white 1x1 placeholder until the image arrives. For the
        // scalp mask that means "masked everywhere" for the first frames — the
        // whole face multiplied by hair colour, which rendered as blackface. A
        // mask must never be live before its pixels are.
        const loadTex = (file, opts = {}) => new Promise((resolve) => {
          new THREE.TextureLoader().load(`${base}/${file}`, (t) => {
            t.colorSpace = THREE.NoColorSpace;    // both are data, not colour
            t.flipY = false;
            Object.assign(t, opts);
            resolve(t);
          }, undefined, () => resolve(null));
        });

        const [coverage, scalpMask] = await Promise.all([
          e.coverage ? loadTex(e.coverage, { anisotropy: 8 }) : null,
          e.scalpMask ? loadTex(e.scalpMask) : null,
        ]);

        this.styles[style] = {
          geometry: geo, count: e.count, maxDelta: e.maxDelta,
          headWorld: e.headWorld,
          coverage,
          scalpMask,
          scalpDarken: e.scalpDarken ?? 0.55,
          alphaCutoff: e.alphaCutoff ?? 0.5,
          blendOpacity: e.blendOpacity ?? 0.3,
          roughness: e.roughness ?? 0.5,
          roughnessFloor: e.roughnessFloor ?? 0.62,
          blendRoughness: e.blendRoughness ?? 0.84,
        };
      }

      this.ready = true;
      return this;
    })();

    return this._loading;
  }

  /**
   * A hair mesh fitted to `base` ('venus' | 'mars', or a 0..1 blend), ready to
   * be added to a Head bone.
   */
  create(style, base = 'venus', colour = 0x2e2119) {
    const entry = this.styles[style];
    if (!entry) return null;

    const fit = typeof base === 'number' ? base : (base === 'mars' ? 1 : 0);

    const material = hairCoreMaterial(entry, colour);

    // Geometry is shared across every character wearing this style; three.js
    // keeps morph influences per-mesh, so each one can carry its own skull fit.
    const mesh = new THREE.Mesh(entry.geometry, material);
    mesh.name = `hair_${style}`;
    mesh.morphTargetInfluences = [THREE.MathUtils.clamp(fit, 0, 1)];
    mesh.morphTargetDictionary = { marsFit: 0 };
    mesh.castShadow = true;
    // Bounds are computed in head-local space, and the mesh rides a bone.
    mesh.frustumCulled = false;

    // The second pass. The export ships the cards twice — `hair` and
    // `hair__blend` — same geometry, same texture, but the blend copy at alpha
    // 0.3. Rendering only the first gives strands with a hard cutout edge; the
    // blend pass lays a soft translucent fringe over it, which is what stops the
    // silhouette looking stamped out and fills the gaps between cards.
    //
    // It must not write depth, or it would occlude the strands behind it, and it
    // draws after the core so the blend has something to sit on.
    const blend = new THREE.Mesh(entry.geometry, hairBlendMaterial(entry, colour));
    blend.name = `hair_${style}__blend`;
    blend.morphTargetInfluences = [THREE.MathUtils.clamp(fit, 0, 1)];
    blend.morphTargetDictionary = { marsFit: 0 };
    blend.castShadow = false;
    blend.frustumCulled = false;
    blend.renderOrder = 2;
    mesh.add(blend);

    return mesh;
  }

  /**
   * The same hair with the skull fit baked in and no morph attributes, placed in
   * *model* space (origin at the feet) rather than head-bone-local.
   *
   * The character creator runs on a base mesh that has no Head bone to parent
   * to, so it positions hair in model space and scales it against the skull. The
   * head-bone matrix recorded at build time is what converts between the two.
   */
  bakedGeometry(style, base = 'venus') {
    const entry = this.styles[style];
    if (!entry) return null;

    const src = entry.geometry;
    const pos = src.getAttribute('position');
    const nrm = src.getAttribute('normal');
    const delta = src.morphAttributes.position[0];
    const fit = typeof base === 'number' ? base : (base === 'mars' ? 1 : 0);

    const m = new THREE.Matrix4().fromArray(
      fit >= 0.5 ? entry.headWorld.mars : entry.headWorld.venus);
    const normalMat = new THREE.Matrix3().getNormalMatrix(m);

    const n = pos.count;
    const outPos = new Float32Array(n * 3);
    const outNrm = nrm ? new Float32Array(n * 3) : null;
    const v = new THREE.Vector3();

    for (let i = 0; i < n; i++) {
      v.set(
        pos.getX(i) + delta.getX(i) * fit,
        pos.getY(i) + delta.getY(i) * fit,
        pos.getZ(i) + delta.getZ(i) * fit,
      ).applyMatrix4(m);
      outPos[i * 3] = v.x; outPos[i * 3 + 1] = v.y; outPos[i * 3 + 2] = v.z;
      if (nrm) {
        v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(normalMat).normalize();
        outNrm[i * 3] = v.x; outNrm[i * 3 + 1] = v.y; outNrm[i * 3 + 2] = v.z;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3));
    if (outNrm) geo.setAttribute('normal', new THREE.BufferAttribute(outNrm, 3));
    // UVs must come across too. Without them there is nothing for the strand
    // texture to sample, and the cards render as solid painted slabs — which is
    // exactly how the creator's hair looked.
    const uv = src.getAttribute('uv');
    if (uv) geo.setAttribute('uv', uv.clone());
    if (src.index) geo.setIndex(src.index.clone());
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  /** Re-fit an existing hair mesh, e.g. when the creator swaps lineage. */
  setFit(mesh, base) {
    if (!mesh?.morphTargetInfluences) return;
    const fit = typeof base === 'number' ? base : (base === 'mars' ? 1 : 0);
    mesh.morphTargetInfluences[0] = THREE.MathUtils.clamp(fit, 0, 1);
  }
}

/**
 * Pass one: the solid core.
 *
 * Alpha-tested rather than blended, so it writes depth and sorts correctly
 * against itself — blended hair cards with no per-card sorting produce far worse
 * artefacts than a hard cutout does.
 */
export function hairCoreMaterial(entry, colour) {
  const mat = new THREE.MeshStandardMaterial({
    transparent: false,
    side: THREE.DoubleSide,
    roughness: entry.roughnessFloor ?? 0.62,
    metalness: 0.0,
    // The colour is entirely the material's — the atlas carries no colour at all.
    color: new THREE.Color(colour),
    alphaTest: entry.coverage ? entry.alphaCutoff : 0,
  });
  bindCoverage(mat, entry.coverage);
  // Alpha-to-coverage is what the shader guide asks for: overlapping cards with
  // plain blending sort badly and halo. alphaTest stays set as the fallback for
  // contexts without MSAA.
  mat.alphaToCoverage = true;
  return mat;
}

/**
 * Drive alpha from the atlas's RED channel.
 *
 * The atlas is a strand coverage mask, not a colour map — `alpha_channel: "r"` in
 * mh_materials.json — so it cannot simply be bound as `map`. Sampling it as a
 * colour map instead was why hair came out one fixed shade regardless of what the
 * player picked: the baked colour was already in the texture.
 */
/**
 * Alpha from the texture, colour from the material.
 *
 * Measured, because two plausible-sounding readings are both wrong:
 *
 *   Quiff.png  red: mean 0.4, max 7      alpha: mean 34.3, range 0-255
 *
 * The RED channel is black, so driving the alpha cut from red discards almost
 * the whole card — and it eats the roots first, because roots are darkest. That
 * was the "bottom half of the cards missing" artefact.
 *
 * The RGB is also black, so binding it as an ordinary colour map multiplies the
 * hair to nothing — the flat black slabs from the first attempt.
 *
 * Coverage lives in the texture's ALPHA. So the map stays bound (which is also
 * what makes three declare the UV varying), but only its alpha is taken; the
 * colour is entirely the material's, which is what makes the colour picker work.
 */
function bindCoverage(mat, coverage) {
  if (!coverage) return;

  mat.map = coverage;
  mat.userData.coverage = coverage;

  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
         diffuseColor.a *= texture2D( map, vMapUv ).a;
       #endif`,
    );
  };
  // hair-shader.md warns that material.clone() silently drops onBeforeCompile,
  // so hair materials are built fresh rather than cloned. The cache key keeps
  // three from handing this program to an ordinary textured material.
  mat.customProgramCacheKey = () => 'hair-alpha-from-map';
}

/**
 * Pass two: the soft fringe.
 *
 * Everything the alpha test threw away — the half-covered texels along every
 * strand — comes back here at low opacity. Depth writing is off so it cannot
 * occlude the cards behind it, and the alpha test is dropped to a token value so
 * the pass keeps the soft edges rather than cutting them again.
 */
export function hairBlendMaterial(entry, colour) {
  const mat = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: entry.blendOpacity ?? 0.3,
    alphaTest: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: entry.blendRoughness ?? 0.84,
    metalness: 0.0,
    color: new THREE.Color(colour),
  });
  bindCoverage(mat, entry.coverage);
  return mat;
}

/**
 * Darken the scalp under a hairstyle, in head UV space.
 *
 * Hair cards are sparse and bare scalp reads straight through them, which is what
 * makes a styled head look patchy. Each style ships a mask marking where its
 * scalp sits; the head's base colour is multiplied by `hairColour x darken`
 * wherever the mask is set.
 *
 * Multiplying rather than painting a fixed colour is the point: it stays correct
 * when the player changes skin tone OR hair colour, which in a creator are both
 * live. One mask serves both bases — venus and mars share head UVs.
 */
export function applyScalpMask(headMesh, entry, colour) {
  // Refuse a mask whose pixels have not arrived. A texture with no image binds
  // as white, and white means "scalp everywhere" — the entire face darkened to
  // the hair colour. Better no scalp shading than a black face.
  if (!headMesh || !entry?.scalpMask?.image?.width) return false;
  const mats = Array.isArray(headMesh.material) ? headMesh.material : [headMesh.material];

  for (const m of mats) {
    // Already masked: retune the live uniforms, never rebuild the hook chain.
    if (m.userData.scalp) {
      m.userData.scalp.colour.set(colour);
      m.userData.scalp.darken = entry.scalpDarken ?? 0.55;
      if (m.userData.scalpUniforms) {
        m.userData.scalpUniforms.uScalpMask.value = entry.scalpMask;
        m.userData.scalpUniforms.uScalpDarken.value = m.userData.scalp.darken;
      }
      continue;
    }

    m.userData.scalp = { mask: entry.scalpMask, colour: new THREE.Color(colour),
                         darken: entry.scalpDarken ?? 0.55 };

    // CHAIN the existing hook, never replace it — the heritage head arrives
    // with its 4-way texture blend living in onBeforeCompile, and clobbering
    // that froze the skin the moment hair went on. The scalp injects at
    // <color_fragment>, which survives the blend's own <map_fragment> rewrite.
    const prevHook = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.userData.__preScalp = { prevHook, prevKey };

    m.onBeforeCompile = (shader) => {
      prevHook?.(shader);
      shader.uniforms.uScalpMask = { value: m.userData.scalp.mask };
      shader.uniforms.uScalpTint = { value: m.userData.scalp.colour };
      shader.uniforms.uScalpDarken = { value: m.userData.scalp.darken };
      m.userData.scalpUniforms = shader.uniforms;

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uScalpMask;
          uniform vec3 uScalpTint;
          uniform float uScalpDarken;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float scalp = texture2D(uScalpMask, vMapUv).r;
          diffuseColor.rgb = mix(diffuseColor.rgb,
                                 diffuseColor.rgb * uScalpTint * uScalpDarken, scalp);
        `);
    };
    m.customProgramCacheKey = () => `${prevKey?.() ?? ''}|scalp`;
    m.needsUpdate = true;
  }
  return true;
}

/** Recolour an already-masked head without recompiling its shader. */
export function setScalpColour(headMesh, colour) {
  if (!headMesh) return;
  const mats = Array.isArray(headMesh.material) ? headMesh.material : [headMesh.material];
  for (const m of mats) m.userData.scalp?.colour.set(colour);
}

/** Remove the scalp darkening when a style is taken off — and RESTORE the
 *  hook that was underneath it (the heritage texture blend), rather than
 *  wiping every shader customisation off the head. */
export function clearScalpMask(headMesh) {
  if (!headMesh) return;
  const mats = Array.isArray(headMesh.material) ? headMesh.material : [headMesh.material];
  for (const m of mats) {
    if (!m.userData.scalp) continue;
    const pre = m.userData.__preScalp;
    delete m.userData.scalp;
    delete m.userData.scalpUniforms;
    delete m.userData.__preScalp;
    m.onBeforeCompile = pre?.prevHook ?? (() => {});
    if (pre?.prevKey) m.customProgramCacheKey = () => pre.prevKey();
    else m.customProgramCacheKey = () => '';
    m.needsUpdate = true;
  }
}

export const hairLibrary = new HairLibrary();
