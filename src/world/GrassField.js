import * as THREE from 'three';
import { GROUND_TINT_GLSL, rockinessAt, shingleAt } from './groundTint.glsl.js';

/**
 * Grass as geometry, not as a texture painted on the ground.
 *
 * Each clump is a *cross card*: two quads crossed at 60 degrees rather than one
 * billboard. A single billboard that rotates to face the camera shears visibly
 * when you strafe, and a whole field of them turning in unison is the giveaway
 * that grass is a sprite. Crossed quads have real thickness from every angle and
 * never move, so the field stays still while you walk through it.
 *
 * Everything is one InstancedMesh per card type, so the whole field is four draw
 * calls. Instances are placed once, in a ring that follows the camera: grass is
 * only worth drawing within ~55m, and beyond that the terrain's own colour has
 * to carry it. The ring is re-seeded as the player moves rather than rebuilt,
 * so there is no allocation during play.
 *
 * Wind is done in the vertex shader from the instance's world position, so
 * neighbouring clumps bend together in gusts rather than each fluttering on its
 * own clock.
 */

const CARD_TYPES = ['lush', 'meadow', 'dry', 'sparse'];

// Grass is expensive per pixel (alpha test, overdraw), so the field is a disc
// around the viewer rather than the whole 4km tile.
const RADIUS = 95;
const INSTANCES = 22000;
// Grass thins from here and is gone by the disc edge, so the boundary is a
// gradient rather than a wall. A short fade band was the whole problem: at 55m
// with the last 28% feathering, the transition happened over 15m and read as a
// hard line drawn across the ground.
const FADE_START = 0.42;      // fraction of the radius where thinning begins
// Re-seed once the camera has moved a useful fraction of the disc. Smaller and
// it churns constantly; larger and you outrun the edge and see it pop.
const RESEED_DISTANCE = 6;

const MIN_ELEV = 0.9;        // above the tideline
const MAX_SLOPE = 0.42;      // grass does not grow on a cliff face

// Metres, tip to root. Wind-exposed heath on this coast is short.
const HEIGHT_MIN = 0.45;
const HEIGHT_MAX = 0.95;

// How much stone the ground may show before grass is refused. Low, because a
// clump growing out of bare rock is more obviously wrong than a bald patch of
// ground is. Ordinary soil scores near zero on all three.
const MAX_ROCK = 0.22;
const MAX_SHINGLE = 0.30;
const MAX_ROAD = 0.12;

// One candidate clump per cell of world grid. Smaller means denser grass and a
// larger grid to walk each reseed.
const CELL_SIZE = 0.85;

/**
 * Stable hash of a grid cell, 0..1. The whole point of the grid is that a
 * clump's every property is a pure function of its cell, so this must depend on
 * nothing but the inputs.
 */
function hash2(x, y, salt) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class GrassField {
  constructor(terrain, opts = {}) {
    this.terrain = terrain;
    this.radius = opts.radius ?? RADIUS;
    this.count = opts.count ?? INSTANCES;
    this.exclusions = opts.exclusions ?? [];
    // Optional (x, z) -> 0..1 road coverage, supplied by Settlement. Sampling the
    // same mask the terrain paints with is the only way to be sure grass and
    // carriageway agree; a list of circles along the centreline is an
    // approximation and leaves tufts on the verge crown.
    this.roadAt = opts.roadAt ?? null;

    this.group = new THREE.Group();
    this.group.name = 'grass';

    this._meshes = [];
    this._uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1, 0.35) },
      uFadeStart: { value: this.radius * FADE_START },
      uFadeEnd: { value: this.radius },
    };
    this._lastSeed = new THREE.Vector3(Infinity, 0, Infinity);
    this._tmp = new THREE.Object3D();
    this._ready = false;
  }

  static async load(terrain, opts = {}) {
    const field = new GrassField(terrain, opts);
    await field._build();
    return field;
  }

  async _build() {
    const loader = new THREE.TextureLoader();
    const load = (name) => new Promise((resolve) => {
      loader.load(`${import.meta.env.BASE_URL}assets/grass/${name}.png`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        // Grass cards are alpha-tested, and mip chains on a tested alpha thin the
        // blades away to nothing at distance. Keeping the base level sharp costs
        // some aliasing but keeps the field from turning bald as you back away.
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.anisotropy = 8;
        resolve(t);
      });
    });

    const manifest = await fetch(`${import.meta.env.BASE_URL}assets/grass/grass.json`).then((r) => r.json()).catch(() => null);
    const byName = new Map((manifest?.cards ?? []).map((c) => [c.name, c]));

    // Share the instance budget by inverse coverage: the sparse card is mostly
    // empty, so more of them are needed to read as the same density of ground
    // cover, and each costs less to draw.
    const weights = CARD_TYPES.map((n) => 1 / Math.max(0.08, byName.get(n)?.coverage ?? 0.25));
    const total = weights.reduce((a, b) => a + b, 0);

    for (let i = 0; i < CARD_TYPES.length; i++) {
      const name = CARD_TYPES[i];
      const tex = await load(name);
      const card = byName.get(name);
      const aspect = card?.aspect ?? 1.8;

      const n = Math.round(this.count * (weights[i] / total));
      const mesh = new THREE.InstancedMesh(
        crossCardGeometry(aspect), grassMaterial(tex, this._uniforms), n);
      mesh.name = `grass-${name}`;
      mesh.castShadow = false;      // 14k alpha-tested shadow casters is not worth it
      // Neither casting nor receiving. Alpha-tested cards sample the shadow map
      // per blade, and at this density that reads as a crawling black speckle
      // rather than shade. The root-to-tip gradient in the shader does the job
      // of seating the clump instead.
      mesh.receiveShadow = false;
      // Instances are placed in world space, so the mesh's own bounds are
      // meaningless and culling it as a unit would blink the whole field out.
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      this._meshes.push({ mesh, name, slot: i, placed: 0 });
      this.group.add(mesh);
    }

    this._ready = true;
    return this;
  }

  /**
   * Scatter the disc around `centre`. Called on a move threshold, not per frame.
   *
   * Placement is rejection-sampled against the same rules the rest of the world
   * uses — dry land, gentle ground, outside settlement footprints — so grass does
   * not grow through a floor or out of the sea.
   */
  reseed(centre) {
    if (!this._ready) return;
    const t = this.terrain;
    const o = this._tmp;

    // Walk a fixed world-space grid, not random points.
    //
    // Random scatter re-rolled every clump's position on each reseed, so walking
    // far enough to trigger one made the entire field visibly rearrange itself.
    // Anchoring to a grid whose cells are defined in world coordinates means a
    // clump's position, size, rotation and card are a pure function of WHERE it
    // is — reseeding recomputes the identical arrangement, and moving simply
    // reveals new cells at the leading edge while the grass already on screen
    // stays exactly where it was.
    const cell = CELL_SIZE;
    const cx0 = Math.floor((centre.x - this.radius) / cell);
    const cx1 = Math.ceil((centre.x + this.radius) / cell);
    const cz0 = Math.floor((centre.z - this.radius) / cell);
    const cz1 = Math.ceil((centre.z + this.radius) / cell);

    for (const entry of this._meshes) {
      const { mesh, slot } = entry;
      let placed = 0;
      const budget = mesh.count;

      for (let cz = cz0; cz <= cz1 && placed < budget; cz++) {
        for (let cx = cx0; cx <= cx1 && placed < budget; cx++) {
          // Every value below is derived from the cell index, so it is stable
          // for as long as the world exists.
          const h1 = hash2(cx, cz, 0x1);
          // Each cell belongs to exactly one card type, chosen by hash — this is
          // what keeps the four meshes from each walking the whole grid.
          if (Math.floor(h1 * CARD_TYPES.length) !== slot) continue;

          const h2 = hash2(cx, cz, 0x2);
          const h3 = hash2(cx, cz, 0x3);
          const h4 = hash2(cx, cz, 0x4);
          const h5 = hash2(cx, cz, 0x5);

          const x = (cx + h2) * cell;
          const z = (cz + h3) * cell;

          const r = Math.hypot(x - centre.x, z - centre.z);
          if (r > this.radius) continue;

          // Thin the DENSITY with distance, not just the size. Shrinking clumps
          // alone keeps the same number of them and the field stays visibly
          // populated right up to the edge; dropping instances is what makes it
          // actually get sparser as it recedes. Keyed off the cell hash so a
          // clump does not flicker in and out as the player walks.
          const rn = r / this.radius;
          if (rn > FADE_START) {
            const keep = 1 - (rn - FADE_START) / (1 - FADE_START);
            if (h4 > keep * keep) continue;
          }

          const y = t.height(x, z);
          if (y < MIN_ELEV) continue;
          if (t.slope(x, z) > MAX_SLOPE) continue;
          if (this._excluded(x, z)) continue;

          // Refuse ground the terrain shader has already painted as stone. Slope
          // alone does not catch this: the rock splat is driven by a noise field
          // as well, so flat bedrock outcrops read as perfectly plantable by
          // slope and grass grew straight out of them. Shingle is checked
          // separately because it keys off the waterline, not the rock noise.
          if (rockinessAt(t, x, z) > MAX_ROCK) continue;
          if (shingleAt(t, x, z) > MAX_SHINGLE) continue;

          // The road is stone too, and is painted from a mask the terrain owns.
          if (this.roadAt && this.roadAt(x, z) > MAX_ROAD) continue;

          o.position.set(x, y - 0.04, z);        // bed the roots slightly in
          o.rotation.set(0, h5 * Math.PI * 2, 0);

          // Clump height in metres. Exposed coastal heath at 66N is ankle-to-
          // shin, not the waist-high meadow a unit-height card gives by default;
          // the first pass stood 1m tall and read as a cornfield.
          const s = HEIGHT_MIN + hash2(cx, cz, 0x6) * (HEIGHT_MAX - HEIGHT_MIN);
          o.scale.set(s * (0.9 + hash2(cx, cz, 0x7) * 0.35),
                      s * (0.85 + hash2(cx, cz, 0x8) * 0.4), s);
          o.updateMatrix();
          mesh.setMatrixAt(placed++, o.matrix);
        }
      }

      // Any instance that could not find ground is parked at zero scale rather
      // than left at the identity matrix, where it would sit as a card at the
      // world origin.
      if (placed < budget) {
        o.position.set(0, -10000, 0);
        o.scale.setScalar(0);
        o.updateMatrix();
        for (let i = placed; i < budget; i++) mesh.setMatrixAt(i, o.matrix);
      }

      entry.placed = placed;
      mesh.instanceMatrix.needsUpdate = true;
    }

    this._lastSeed.copy(centre);
  }

  _excluded(x, z) {
    for (const e of this.exclusions) {
      const dx = x - e.x, dz = z - e.z;
      if (dx * dx + dz * dz < e.r * e.r) return true;
    }
    return false;
  }

  /** Advance the wind, and move the disc if the viewer has walked far enough. */
  update(dt, viewer) {
    if (!this._ready) return;
    this._uniforms.uTime.value += dt;

    if (viewer && this._lastSeed.distanceTo(viewer) > RESEED_DISTANCE) {
      this.reseed(viewer);
    }
  }

  get instanceCount() {
    return this._meshes.reduce((a, e) => a + e.placed, 0);
  }

  dispose() {
    for (const { mesh } of this._meshes) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose();
      mesh.material.dispose();
    }
    this._meshes.length = 0;
    this.group.clear();
  }
}

/**
 * Two quads crossed at 60 degrees, standing on y=0.
 *
 * Three planes would read better still but costs 50% more fill on an asset that
 * is already the heaviest per-pixel thing in the scene. Two is the usual
 * compromise and holds up as long as the cards are not viewed from directly
 * above.
 */
function crossCardGeometry(aspect) {
  const h = 1;
  const w = h * aspect * 0.55;
  const quads = [];

  for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const x = w * 0.5;
    // Normals point mostly UP, not out along the quad's facing.
    //
    // A card's true normal is horizontal, which lights it like a vertical wall:
    // it catches almost nothing from an overhead sun and the whole field renders
    // near-black. Foliage cards are always given an up-biased normal so a clump
    // shades like the piece of ground it is standing on, which is what the eye
    // expects from grass. The small horizontal component keeps some directional
    // variation between the crossed quads.
    const n = new THREE.Vector3(-s * 0.25, 1, c * 0.25).normalize();
    quads.push({
      p: [
        [-x * c, 0, -x * s], [x * c, 0, x * s],
        [x * c, h, x * s], [-x * c, h, -x * s],
      ],
      n: [n.x, n.y, n.z],
    });
  }

  const pos = [], uv = [], nrm = [], idx = [];
  quads.forEach((q, qi) => {
    const base = qi * 4;
    for (const p of q.p) pos.push(...p);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nrm.push(...q.n);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Alpha-tested, double-sided, lit — and bent by wind in the vertex stage.
 *
 * alphaTest rather than transparency: blended grass needs back-to-front sorting
 * that instancing cannot give, and the sorting errors read far worse than the
 * hard alpha edge does.
 */
function grassMaterial(map, uniforms) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    transparent: false,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uFadeStart = uniforms.uFadeStart;
    shader.uniforms.uFadeEnd = uniforms.uFadeEnd;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform vec2 uWind;
        varying vec3 vGrassWorld;
        varying float vBladeHeight;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // Sway scales with height up the card so the roots stay planted and only
        // the tips move. position.y is 0..1 by construction.
        float bendAmount = transformed.y * transformed.y;

        // Phase from the instance's world position, so a gust travels across the
        // field as a wave instead of every clump twitching independently.
        #ifdef USE_INSTANCING
          vec3 instPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 instPos = vec3(0.0);
        #endif
        float phase = dot(instPos.xz, normalize(uWind)) * 0.14;

        float gust = sin(uTime * 1.1 - phase) * 0.5 + 0.5;
        float flutter = sin(uTime * 5.3 - phase * 2.7) * 0.35
                      + sin(uTime * 8.9 - phase * 4.1) * 0.15;

        float sway = (gust * 0.55 + 0.25) * bendAmount;
        transformed.xz += normalize(uWind) * sway * 0.34;
        transformed.xz += normalize(uWind) * flutter * bendAmount * 0.09;
        // Bending should shorten the blade, not stretch it.
        transformed.y -= sway * sway * 0.16;

        vBladeHeight = position.y;      // 0 at the root, 1 at the tip

        // World position is computed HERE, not in <worldpos_vertex>. That chunk
        // is only emitted when the material uses an envmap or receives shadows —
        // and this one does neither, so the assignment silently disappeared and
        // the varying went to the fragment stage unwritten. Undefined varyings
        // are whatever happens to be in the register, which is what produced the
        // scattered black specks in the distance.
        #ifdef USE_INSTANCING
          vGrassWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vGrassWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uFadeStart;
        uniform float uFadeEnd;
        varying vec3 vGrassWorld;
        varying float vBladeHeight;
        ${GROUND_TINT_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // Tint toward the ground's own colour, so the photographed grass stops
        // reading as a different plant from the terrain it stands in. Kept as a
        // partial blend rather than a straight multiply: multiplying stacked the
        // tint on top of the card's own colour and drove whole clumps black.
        vec3 gTint = groundTint(vGrassWorld, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * gTint, 0.75);

        // Root-to-tip shading, floored well above zero. This is ambient occlusion
        // into the sward, not a light switch.
        diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.5, vBladeHeight);

        // Dither out with distance rather than ending at a hard ring. Screen-door
        // alpha keeps this in the alpha-tested pass — real transparency here would
        // need per-instance sorting, which instancing cannot provide.
        float fadeDist = distance(vGrassWorld, cameraPosition);
        float keep = 1.0 - smoothstep(uFadeStart, uFadeEnd, fadeDist);
        if (keep < 0.999) {
          float threshold = fract(sin(dot(floor(gl_FragCoord.xy * 0.5),
                                          vec2(12.9898, 78.233))) * 43758.545);
          if (keep < threshold) discard;
        }
      `)
      // Force the shading normal upward on BOTH faces.
      //
      // The cards carry up-facing normals so they light like the ground they
      // grow from, but the material is double-sided, and three flips the normal
      // on back faces — so a clump seen from behind had its normal pointing at
      // the ground, received no sun, and rendered solid black. Which clumps went
      // black depended on their random Y rotation, which is why it looked like
      // scattered corruption rather than a lighting bug.
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(vec3(normal.x * 0.35, abs(normal.y) + 0.55, normal.z * 0.35));
      `);
  };

  return mat;
}
