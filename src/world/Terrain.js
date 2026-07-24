import * as THREE from 'three';

/**
 * The real Herøy landform, from Kartverket's national elevation model.
 *
 * 4096m of the Helgeland coast at 4m sampling: the village shelf, the strait,
 * the 289m massif and the open sea south. Height is sampled from the DTM with
 * bilinear filtering, so the same call grounds the player, places buildings and
 * builds the mesh — there is no second collision representation to drift.
 *
 * Ground materials are splatted by height, slope and a noise mask, and every
 * texture is sampled at two scales at once so the 2048px tile never reads as a
 * grid from a distance.
 */

export class Terrain {
  constructor(manifest, heights, textures) {
    this.meta = manifest;
    this.size = manifest.sizeMetres;
    this.samples = manifest.samples;
    this.minY = manifest.minElevation;
    this.scale = manifest.scale;
    this.data = heights;                 // Uint16, row-major, south-to-north
    this.half = this.size / 2;
    this.step = this.size / (this.samples - 1);
    this.seaLevel = 0.0;

    this.mesh = this._build(textures);
  }

  static async load(base = `${import.meta.env.BASE_URL}assets/terrain`) {
    const [manifest, buf] = await Promise.all([
      fetch(`${base}/heroy.json`).then((r) => r.json()),
      fetch(`${base}/heroy.r16`).then((r) => r.arrayBuffer()),
    ]);

    const load = (name) => new Promise((resolve) => {
      new THREE.TextureLoader().load(`${base}/${name}.webp`, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 16;
        resolve(t);
      });
    });

    const names = ['heath', 'ground', 'shingle', 'cobble'];
    const maps = await Promise.all(names.map(load));
    const normals = await Promise.all(names.map((n) => load(`${n}_n`)));
    for (const m of maps) m.colorSpace = THREE.SRGBColorSpace;
    for (const n of normals) n.colorSpace = THREE.NoColorSpace;

    const textures = {};
    names.forEach((n, i) => { textures[n] = maps[i]; textures[`${n}_n`] = normals[i]; });

    // Real mud, for tilled soil, the trampled well-ground and the wet tideline.
    const [mud, mudN] = await Promise.all([load('mud'), load('mud_n')]);
    mud.colorSpace = THREE.SRGBColorSpace;
    mudN.colorSpace = THREE.NoColorSpace;
    textures.mud = mud; textures.mud_n = mudN;

    return new Terrain(manifest, new Uint16Array(buf), textures);
  }

  // ------------------------------------------------------------ sampling

  /** World (x, z) -> metres above sea level, bilinear. */
  height(x, z) {
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    const n = this.samples;

    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    if (x0 < 0 || z0 < 0 || x0 >= n - 1 || z0 >= n - 1) {
      // Outside the tile: clamp to the edge rather than dropping to zero, so the
      // world doesn't end in a cliff.
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

  normal(x, z, out = new THREE.Vector3()) {
    const e = this.step;
    const l = this.height(x - e, z), r = this.height(x + e, z);
    const d = this.height(x, z - e), u = this.height(x, z + e);
    return out.set(l - r, 2 * e, d - u).normalize();
  }

  /** 0 = flat, 1 = vertical. */
  slope(x, z) { return 1 - this.normal(x, z).y; }

  isWater(x, z) { return this.height(x, z) <= this.seaLevel + 0.15; }

  /**
   * Somewhere buildable near (x, z): dry land, gentle, above the tide. Returns
   * null when there is nothing suitable, so callers can fail loudly rather than
   * placing a house in the sea.
   */
  findFlat(x, z, radius = 60, maxSlope = 0.16) {
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 96; i++) {
      const a = i * 2.39996;                       // golden angle, even coverage
      const r = Math.sqrt(i / 96) * radius;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = this.height(px, pz);
      if (h < 1.2) continue;
      const s = this.slope(px, pz);
      if (s > maxSlope) continue;
      const score = s * 12 + r / radius;
      if (score < bestScore) { bestScore = score; best = { x: px, z: pz, y: h }; }
    }
    return best;
  }

  // --------------------------------------------------------------- build

  _build(tex) {
    const n = this.samples;
    // One vertex per DTM sample keeps every real feature; 1024² is a million
    // verts, which a desktop GPU handles fine as a single static mesh.
    const geo = new THREE.PlaneGeometry(this.size, this.size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        pos.setY(i, this.data[i] * this.scale + this.minY);
      }
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0.0,
      map: tex.heath,
      normalMap: tex.heath_n,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uHeath = { value: tex.heath };
      shader.uniforms.uGround = { value: tex.ground };
      shader.uniforms.uShingle = { value: tex.shingle };
      shader.uniforms.uCobble = { value: tex.cobble };
      // Roads are painted into this surface rather than laid on top of it.
      // Defaults keep the branch inert until Settlement supplies a mask.
      shader.uniforms.uRoadMask = { value: null };
      shader.uniforms.uRoadOrigin = { value: new THREE.Vector2(0, 0) };
      shader.uniforms.uRoadSize = { value: 0 };
      this._roadUniforms = shader.uniforms;
      if (this._roadMask) this.setRoadMask(this._roadMask);

      shader.uniforms.uHeathN = { value: tex.heath_n };
      shader.uniforms.uGroundN = { value: tex.ground_n };
      shader.uniforms.uShingleN = { value: tex.shingle_n };
      shader.uniforms.uCobbleN = { value: tex.cobble_n };
      shader.uniforms.uMud = { value: tex.mud };
      shader.uniforms.uMudN = { value: tex.mud_n };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWorldPos;
          varying vec3 vTerrainNormal;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerrainNormal = normalize(mat3(modelMatrix) * objectNormal);`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uHeath, uGround, uShingle, uCobble, uMud;
          uniform sampler2D uHeathN, uGroundN, uShingleN, uCobbleN, uMudN;
          uniform sampler2D uRoadMask;
          uniform vec2 uRoadOrigin;
          uniform float uRoadSize;
          varying vec3 vWorldPos;
          varying vec3 vTerrainNormal;

          // Town coverage mask: roads in the red channel, tilled soil in the
          // green — both painted into the terrain surface itself.
          vec2 maskAt(vec2 p){
            if (uRoadSize <= 0.0) return vec2(0.0);
            vec2 uv = (p - uRoadOrigin) / uRoadSize;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
            return texture2D(uRoadMask, uv).rg;
          }
          float roadAt(vec2 p){ return maskAt(p).x; }

          // Cheap value noise for breaking up the material boundaries.
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
          }

          vec2 hash22(vec2 p){
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return fract(sin(p) * 43758.5453);
          }

          // Stochastic tiling on a triangular grid.
          //
          // Sampling a tile straight gives a visible grid at any distance, and
          // blending two scales does not fix it — both stay axis-aligned and
          // phase-locked, so the repeat is still there. Instead the plane is cut
          // into triangular cells, each cell samples the texture at its own
          // random offset, and the three nearest are blended barycentrically.
          // The repeat is then randomised across the surface and never lines up.
          //
          // Offsetting UVs per cell breaks the implicit derivatives, so the
          // gradients are taken once from the unshifted UV and passed explicitly;
          // otherwise every cell boundary picks the wrong mip and shows as a seam.
          vec3 hexTile(sampler2D t, vec2 uv){
            vec2 dx = dFdx(uv), dy = dFdy(uv);

            const mat2 toSkew = mat2(1.0, 0.0, -0.57735027, 1.15470054);
            vec2 skewed = toSkew * uv * 3.464;
            vec2 base = floor(skewed);
            vec3 f = vec3(fract(skewed), 0.0);
            f.z = 1.0 - f.x - f.y;

            vec3 w; vec2 c1, c2, c3;
            if (f.z > 0.0) {
              w = vec3(f.z, f.y, f.x);
              c1 = base; c2 = base + vec2(0.0, 1.0); c3 = base + vec2(1.0, 0.0);
            } else {
              w = vec3(-f.z, 1.0 - f.y, 1.0 - f.x);
              c1 = base + vec2(1.0, 1.0); c2 = base + vec2(1.0, 0.0); c3 = base + vec2(0.0, 1.0);
            }

            vec3 t1 = textureGrad(t, uv + hash22(c1), dx, dy).rgb;
            vec3 t2 = textureGrad(t, uv + hash22(c2), dx, dy).rgb;
            vec3 t3 = textureGrad(t, uv + hash22(c3), dx, dy).rgb;

            // Cubed weights narrow the transition zone. A linear blend overlaps
            // three copies of the texture over a wide band and reads as mush.
            w = w * w * w;
            w /= (w.x + w.y + w.z);
            return t1 * w.x + t2 * w.y + t3 * w.z;
          }`)
        .replace('#include <map_fragment>', `
          vec2 uv = vWorldPos.xz * 0.45;         // one tile per ~2.2m of ground
          float height = vWorldPos.y;
          float flatness = vTerrainNormal.y;          // 1 flat, 0 vertical

          // Splat weights. This coast is not a lawn — glacially scoured bedrock
          // breaks through the heath constantly, so rock is driven by a noise
          // field as well as by slope, and the boundaries are noise-jittered so
          // they never read as contour lines.
          float rockNoise = noise(vWorldPos.xz * 0.018) * 0.6
                          + noise(vWorldPos.xz * 0.061) * 0.4;
          float jitter = (rockNoise - 0.5) * 0.22;

          float wShingle = smoothstep(3.2, 0.1, height + jitter * 6.0);
          float wCobble  = clamp(
                             smoothstep(0.88, 0.70, flatness)                 // steep ground
                           + smoothstep(0.62, 0.80, rockNoise) * 0.75         // outcrop
                           + smoothstep(130.0, 230.0, height) * 0.9           // bare summit
                           , 0.0, 1.0);
          float wGround  = smoothstep(0.45, 0.85, noise(vWorldPos.xz * 0.009 + 5.1))
                         * smoothstep(1.5, 7.0, height)
                         * smoothstep(0.74, 0.90, flatness)
                         * (1.0 - wCobble);

          vec3 col = hexTile(uHeath, uv);

          // A single green over four kilometres reads as astroturf. Real coastal
          // heath is a patchwork: sour dark green in the hollows where water sits,
          // olive on the exposed shoulders, rust and straw where heather and dead
          // grass take over. Three noise fields at different scales, so the
          // variation reads at walking distance and from the ridge.
          // Summed sines rather than value noise. At these frequencies the
          // world coordinates land inside only a handful of noise lattice
          // cells, and fract(sin()) hashing clusters badly there — measured
          // output warmth varied by sd 0.01, i.e. one flat green. Sines give a
          // guaranteed even spread over the whole 0..1 range.
          // Periods are chosen against the *view*, not the map: a 4800m band is
          // invisible when you can only see 1000m of ground, which is why the
          // first attempt measured as one flat green. These run 120-600m so the
          // patchwork reads both on foot and from the ridge.
          vec2 P = vWorldPos.xz;
          float macro = 0.5
                      + 0.30 * sin(P.x * 0.0104 + P.y * 0.0073)          // ~600m
                      + 0.20 * sin(P.x * 0.0061 - P.y * 0.0094 + 2.1);   // ~670m
          float meso  = 0.5
                      + 0.28 * sin(P.x * 0.0271 - P.y * 0.0193 + 1.7)    // ~230m
                      + 0.22 * sin(P.x * 0.0157 + P.y * 0.0348 + 4.3);   // ~180m
          float micro = 0.5
                      + 0.5 * sin(P.x * 0.058 + P.y * 0.041 + 0.9);      // ~90m

          const vec3 LUSH   = vec3(0.62, 0.80, 0.45);   // damp hollows
          const vec3 OLIVE  = vec3(0.86, 0.84, 0.55);   // exposed shoulders
          const vec3 STRAW  = vec3(1.02, 0.92, 0.62);   // wind-burnt, dead grass
          const vec3 HEATHER= vec3(0.80, 0.62, 0.58);   // rust of old heather

          // Drainage, not elevation, is what actually varies the colour here —
          // most of this island sits under 30m, so keying off height alone left
          // the whole map on one green. Noise leads; height and slope only push
          // it drier.
          float dry = clamp(
                        (macro - 0.42) * 1.9                        // broad bands
                      + (meso - 0.5) * 1.5                          // patches
                      + smoothstep(8.0, 70.0, height) * 0.45        // higher = drier
                      + smoothstep(0.99, 0.86, flatness) * 0.40     // steeper = drier
                      , 0.0, 1.0);

          vec3 tint = mix(LUSH, OLIVE, smoothstep(0.0, 0.50, dry));
          tint = mix(tint, STRAW, smoothstep(0.38, 0.88, dry));
          // Heather sits on its own field so the rust patches don't simply track
          // the dry gradient — in reality it colonises regardless.
          tint = mix(tint, HEATHER,
                     smoothstep(0.35, 0.80, 0.5 + 0.5 * sin(P.x * 0.0118 - P.y * 0.0084 + 5.2)) * 0.6);
          // Fine mottling keeps neighbouring patches from reading as flat fields.
          tint *= 0.92 + micro * 0.16;

          col *= tint;
          col = mix(col, hexTile(uGround, uv), clamp(wGround, 0.0, 1.0));
          col = mix(col, hexTile(uCobble, uv * 0.55), wCobble);
          col = mix(col, hexTile(uShingle, uv * 1.2), wShingle);

          // Wet, dark stone right at the tideline.
          col *= mix(1.0, 0.55, smoothstep(1.2, -0.2, height));

          // Roads and tilled soil, painted last so they override the natural
          // splat — the surface IS the terrain, so nothing floats or z-fights.
          vec2 town = maskAt(vWorldPos.xz);
          if (town.x > 0.001) {
            vec3 paving = hexTile(uCobble, uv * 1.9) * 0.88;
            // Wheel-worn down the crown, grass surviving at the verges.
            float centre = smoothstep(0.35, 0.95, town.x);
            paving *= 0.92 + centre * 0.16;
            col = mix(col, paving, smoothstep(0.06, 0.7, town.x));
          }
          if (town.y > 0.001) {
            // Turned earth and trampled ground: real mud, with furrows running
            // across the plot (perpendicular to the street grain — SITE bearing
            // 223, rows every 2.2m). The furrow shading fades where the mask
            // feathers out.
            vec3 tilled = hexTile(uMud, uv * 0.8);
            float furrow = 0.82 + 0.18 * sin(dot(vWorldPos.xz, vec2(-0.731, 0.682)) * 2.856);
            tilled *= mix(1.0, furrow, smoothstep(0.3, 0.9, town.y));
            col = mix(col, tilled, smoothstep(0.08, 0.75, town.y));
          }

          diffuseColor.rgb *= col;
        `)
        // The blended normal has to follow the same weights or the lighting
        // disagrees with the colour.
        .replace('#include <normal_fragment_maps>', `
          vec2 nuv = vWorldPos.xz * 0.45;
          float nFlat = vTerrainNormal.y;
          float nH = vWorldPos.y;
          float nRock = noise(vWorldPos.xz * 0.018) * 0.6
                      + noise(vWorldPos.xz * 0.061) * 0.4;
          float nShingle = smoothstep(3.2, 0.1, nH);
          float nCobble = clamp(smoothstep(0.88, 0.70, nFlat)
                        + smoothstep(0.62, 0.80, nRock) * 0.75
                        + smoothstep(130.0, 230.0, nH) * 0.9, 0.0, 1.0);

          // These have to go through the same stochastic tiling as the colour.
          // Left as a plain sample the normal map repeats on a fixed 2.2m grid,
          // and the regular pattern of bumps reads as a quilt of dots across
          // every hillside — far more visible than a repeat in the albedo.
          vec3 nTex = hexTile(uHeathN, nuv);
          nTex = mix(nTex, hexTile(uCobbleN, nuv * 0.55), nCobble);
          nTex = mix(nTex, hexTile(uShingleN, nuv * 1.2), nShingle);
          // Mud relief on tilled soil / trampled ground (mask green channel).
          float nMud = maskAt(vWorldPos.xz).y;
          nTex = mix(nTex, hexTile(uMudN, nuv * 0.8), smoothstep(0.08, 0.75, nMud));

          vec3 mapN = nTex * 2.0 - 1.0;
          // Fade the detail normal out with distance. Beyond ~90m the bump is
          // smaller than a pixel and only produces shimmer as the camera moves —
          // that is the striping that shows across mid-distance hillsides.
          float nd = length(vWorldPos - cameraPosition);
          mapN.xy *= 0.6 * (1.0 - smoothstep(60.0, 190.0, nd));
          normal = normalize(tbn * mapN);
        `);

      mat.userData.shader = shader;
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;      // a million-vert shadow caster is not worth it
    mesh.name = 'terrain';
    return mesh;
  }

  /**
   * The sea.
   *
   * Depth is read straight from the terrain heightmap rather than from a depth
   * prepass — the sea floor is already known on the CPU, so uploading it as a
   * texture gives an exact water depth per fragment for the cost of one sample.
   * That single value drives everything: the colour gradient, the shoreline
   * fade, the foam band and how far the waves are allowed to build.
   *
   * The shoreline fade is also what fixes the jagged coast. The terrain is a 4m
   * grid, so the land/water intersection is a staircase; fading the water out
   * over the last ~1.5m of depth hides that edge entirely instead of drawing a
   * hard line along it.
   */
  buildWater() {
    // Enough tessellation for the Gerstner displacement to actually show.
    const geo = new THREE.PlaneGeometry(this.size, this.size, 320, 320);
    geo.rotateX(-Math.PI / 2);

    // Sea floor as a float texture, in metres.
    const n = this.samples;
    const heights = new Float32Array(n * n);
    for (let i = 0; i < heights.length; i++) {
      heights[i] = this.data[i] * this.scale + this.minY;
    }
    const heightTex = new THREE.DataTexture(heights, n, n, THREE.RedFormat, THREE.FloatType);
    heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
    heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
    heightTex.needsUpdate = true;

    const uniforms = {
      uTime: { value: 0 },
      uHeight: { value: heightTex },
      uMapSize: { value: this.size },
      uShallow: { value: new THREE.Color(0x3f9490) },
      uDeep: { value: new THREE.Color(0x10344c) },
      uFoam: { value: new THREE.Color(0xdce8ee) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.5) },
      uSunColor: { value: new THREE.Color(0xffffff) },
    };

    const mat = new THREE.ShaderMaterial({
      // three injects fogColor/fogDensity only if the fog uniforms are present.
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
      transparent: true,
      depthWrite: false,          // never occlude what is under the surface
      side: THREE.FrontSide,
      fog: true,
      lights: false,
      vertexShader: `
        uniform float uTime, uMapSize;
        uniform sampler2D uHeight;
        varying vec3 vWorld;
        varying float vDepth;
        varying vec3 vNormalW;
        #ifdef USE_FOG
          varying float vFogDepth;
        #endif

        float floorAt(vec2 xz){
          vec2 uv = xz / uMapSize + 0.5;
          return texture2D(uHeight, uv).r;
        }

        // One Gerstner wave: circular particle motion, so crests sharpen and
        // troughs flatten the way real swell does. A plain sine looks like jelly.
        vec3 gerstner(vec2 pos, vec2 dir, float steep, float len, float speed, float t){
          float k = 6.28318 / len;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(dir);
          float f = k * (dot(d, pos) - c * speed * t);
          float a = steep / k;
          return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
        }

        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float bed = floorAt(wp.xz);
          // Water surface is at y=0, so depth is simply how far the bed is below.
          float depth = max(0.0, -bed);
          vDepth = depth;

          // Waves shoal: they die out in the shallows rather than clipping
          // through the beach.
          float shoal = smoothstep(0.0, 6.0, depth);

          vec3 o = vec3(0.0);
          o += gerstner(wp.xz, vec2( 1.0,  0.35), 0.28, 34.0, 1.0, uTime);
          o += gerstner(wp.xz, vec2( 0.7, -0.80), 0.20, 19.0, 1.3, uTime);
          o += gerstner(wp.xz, vec2(-0.4,  1.00), 0.14, 11.0, 1.7, uTime);
          o *= shoal;

          wp.xyz += o;
          vWorld = wp.xyz;

          // Normal from finite differences of the same wave sum.
          float e = 1.2;
          vec3 ox = vec3(0.0), oz = vec3(0.0);
          ox += gerstner(wp.xz + vec2(e,0.0), vec2( 1.0,  0.35), 0.28, 34.0, 1.0, uTime);
          ox += gerstner(wp.xz + vec2(e,0.0), vec2( 0.7, -0.80), 0.20, 19.0, 1.3, uTime);
          ox += gerstner(wp.xz + vec2(e,0.0), vec2(-0.4,  1.00), 0.14, 11.0, 1.7, uTime);
          oz += gerstner(wp.xz + vec2(0.0,e), vec2( 1.0,  0.35), 0.28, 34.0, 1.0, uTime);
          oz += gerstner(wp.xz + vec2(0.0,e), vec2( 0.7, -0.80), 0.20, 19.0, 1.3, uTime);
          oz += gerstner(wp.xz + vec2(0.0,e), vec2(-0.4,  1.00), 0.14, 11.0, 1.7, uTime);
          vec3 tx = normalize(vec3(e, (ox.y - o.y) * shoal, 0.0));
          vec3 tz = normalize(vec3(0.0, (oz.y - o.y) * shoal, e));
          vNormalW = normalize(cross(tz, tx));

          vec4 mvPosition = viewMatrix * wp;
          #ifdef USE_FOG
            vFogDepth = -mvPosition.z;
          #endif
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uShallow, uDeep, uFoam, uSunDir, uSunColor;
        varying vec3 vWorld;
        varying float vDepth;
        varying vec3 vNormalW;

        #include <fog_pars_fragment>

        void main(){
          vec3 V = normalize(cameraPosition - vWorld);

          // Fine ripple detail on top of the Gerstner normal — two moving sine
          // fields, cheap enough to be free, and what makes the surface sparkle
          // instead of reading as smooth plastic between the big waves.
          vec3 N = normalize(vNormalW);
          float r1 = sin(vWorld.x * 0.9 + vWorld.z * 0.6 + uTime * 1.9);
          float r2 = sin(vWorld.x * 0.5 - vWorld.z * 1.1 - uTime * 1.4);
          N = normalize(N + vec3(r1 * 0.045, 0.0, r2 * 0.045));

          // Depth gradient. Most of the read of "this is water" comes from this.
          float d = clamp(vDepth / 24.0, 0.0, 1.0);
          vec3 col = mix(uShallow, uDeep, sqrt(d));

          // Fresnel: glancing angles go to sky, straight down sees into the water.
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 sky = mix(vec3(0.42, 0.55, 0.68), vec3(0.72, 0.82, 0.92), 0.5);
          col = mix(col, sky, fres * 0.8);

          // Specular glint off the sun.
          vec3 H = normalize(normalize(uSunDir) + V);
          col += uSunColor * pow(max(dot(N, H), 0.0), 180.0) * 0.8;

          // Foam where the water runs out onto the shore, plus a moving band so
          // the line is not static. Wobbling the threshold with the wave height
          // stops the foam from tracing the terrain's 4m grid.
          float wobble = sin(vWorld.x * 0.6 + uTime * 1.7)
                       * cos(vWorld.z * 0.5 - uTime * 1.3) * 0.35;
          float foam = smoothstep(1.7 + wobble, 0.15, vDepth);
          col = mix(col, uFoam, foam * 0.75);

          // Transparency carries the "this is the sea, not a floor" read: the
          // shallows show the textured seabed through the surface and the deep
          // sound closes over. Looking straight down stays clearer than the
          // glancing view (fresnel), and the last metre fades out entirely to
          // hide the 4m-grid staircase at the shoreline.
          float alpha = mix(0.34, 0.9, smoothstep(0.4, 11.0, vDepth));
          alpha = mix(alpha, 0.96, fres * 0.7);
          alpha *= smoothstep(0.0, 0.9, vDepth);
          alpha = max(alpha, foam * 0.75);

          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }
      `,
    });

    // merge() deep-clones, so re-point at the material's actual uniforms.
    const live = mat.uniforms;
    const water = new THREE.Mesh(geo, mat);
    water.position.y = this.seaLevel;
    water.name = 'sea';
    water.renderOrder = 1;        // after the terrain, so blending reads correctly
    water.frustumCulled = false;
    water.userData.uniforms = live;
    this.waterUniforms = live;
    return water;
  }

  /**
   * Flatten level building pads into the heightfield in ONE weighted batch.
   *
   * Sequential stamping was tried first and produced floating houses: a later
   * pad's feather, centred lower on the slope, re-cut the ground under a
   * house that had already been grounded. Batching from the ORIGINAL heights
   * — every pad target is decided before any pad writes — makes the result
   * order-independent, and overlapping pads blend by influence instead of the
   * last one winning.
   *
   * Each pad: hard level inside `r`, feathered to ~1.8r. Writes the CPU field
   * (height(), NPC grounding, grass); call commitPads() afterwards to push
   * the changes into the render mesh.
   */
  flattenPads(pads) {
    if (!pads?.length) return;
    const n = this.samples;
    const wSum = new Float32Array(n * n);
    const ySum = new Float32Array(n * n);
    const sMax = new Float32Array(n * n);
    const toIdx = (w) => (w + this.half) / this.step;

    for (const p of pads) {
      const feather = p.r * 1.8;
      const i0 = Math.max(0, Math.floor(toIdx(p.x - feather)));
      const i1 = Math.min(n - 1, Math.ceil(toIdx(p.x + feather)));
      const j0 = Math.max(0, Math.floor(toIdx(p.z - feather)));
      const j1 = Math.min(n - 1, Math.ceil(toIdx(p.z + feather)));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const wx = i * this.step - this.half;
          const wz = j * this.step - this.half;
          const d = Math.hypot(wx - p.x, wz - p.z);
          if (d > feather) continue;
          let t = 1;
          if (d > p.r) {
            const f = (d - p.r) / (feather - p.r);
            t = 1 - f * f * (3 - 2 * f);
          }
          const idx = j * n + i;
          wSum[idx] += t;
          ySum[idx] += t * p.y;
          if (t > sMax[idx]) sMax[idx] = t;
        }
      }
    }

    for (let idx = 0; idx < n * n; idx++) {
      if (wSum[idx] <= 0) continue;
      const target = ySum[idx] / wSum[idx];
      const cur = this.data[idx] * this.scale + this.minY;
      const out = target * sMax[idx] + cur * (1 - sMax[idx]);
      this.data[idx] = Math.round((out - this.minY) / this.scale);
    }
    this._padsDirty = true;
  }

  /** Single-pad convenience (the well); safe because it never overlaps housing. */
  flattenPad(x, z, radius, y) { this.flattenPads([{ x, z, r: radius, y }]); }

  /** Push stamped pads into the render mesh, once, after the last flattenPad. */
  commitPads() {
    if (!this._padsDirty || !this.mesh) return;
    const n = this.samples;
    const pos = this.mesh.geometry.attributes.position;
    for (let i = 0; i < n * n; i++) pos.setY(i, this.data[i] * this.scale + this.minY);
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this._padsDirty = false;
  }

  /**
   * Hand the terrain the town's road mask so it paints them into its own
   * surface. Safe to call before the shader has compiled — the uniforms are
   * captured in onBeforeCompile and this re-applies on the next call.
   */
  setRoadMask(mask) {
    this._roadMask = mask;
    const u = this._roadUniforms;
    if (!u || !mask) return;
    u.uRoadMask.value = mask.texture;
    u.uRoadOrigin.value.set(mask.originX, mask.originZ);
    u.uRoadSize.value = mask.size;
  }

  /** Advance the swell. Call once a frame. */
  updateWater(dt, sunDir, sunColor) {
    if (!this.waterUniforms) return;
    this.waterUniforms.uTime.value += dt;
    if (sunDir) this.waterUniforms.uSunDir.value.copy(sunDir);
    if (sunColor) this.waterUniforms.uSunColor.value.copy(sunColor);
  }
}
