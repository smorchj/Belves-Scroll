import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Renderer, atmosphere and the day/night cycle.
 *
 * Physical lighting with ACES tone mapping — the characters carry PBR skin and
 * metal, and both look wrong under a flat ambient rig. The sun drives shadows,
 * a hemisphere fill keeps shadowed faces from going black, and the sky's own
 * colours feed the fog so the horizon dissolves instead of ending in a hard line.
 */

const DAY_LENGTH = 20 * 60;   // seconds of real time per in-game day

/**
 * Create the renderer with fallbacks. `high-performance` demands the discrete
 * GPU — after a driver reset (TDR) that request can keep failing while the
 * browser happily hands out contexts on default/integrated paths. A canvas
 * remembers its first failed getContext, so attributes are probed on throwaway
 * canvases and only the winning set touches the real one.
 */
function createRenderer(canvas) {
  // After a context loss the page reloads itself once in low-spec mode:
  // no MSAA, native GPU choice, capped pixel ratio, no shadows — the smallest
  // footprint that still plays. The flag lives in sessionStorage so a healthy
  // next visit starts at full quality again.
  const lowSpec = sessionStorage.getItem('belve-lowspec') === '1';
  const attempts = lowSpec ? [
    { antialias: false, stencil: false },
  ] : [
    { antialias: true, powerPreference: 'high-performance', stencil: false },
    { antialias: true, stencil: false },   // browser's choice of GPU
    { antialias: false, stencil: false },  // last resort: no MSAA (hair uses its alphaTest fallback)
  ];
  for (const opts of attempts) {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2', opts) || probe.getContext('webgl', opts))) continue;
    if (opts.powerPreference !== 'high-performance') {
      console.warn('[Stage] high-performance GPU context unavailable — fell back to', JSON.stringify(opts));
    }
    return new THREE.WebGLRenderer({ canvas, ...opts });
  }
  throw new Error(
    'WebGL unavailable in this browser right now — the GPU driver likely needs '
    + 'a machine restart after a reset.');
}

export class Stage {
  constructor(canvas) {
    this.renderer = createRenderer(canvas);
    this.lowSpec = sessionStorage.getItem('belve-lowspec') === '1';
    this.renderer.setPixelRatio(this.lowSpec ? 1 : Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowSpec;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 3000);

    // The character exports are authored for image-based lighting — per the
    // site's shader docs, skin reads flat and the eyes' 0.18-roughness gleam
    // does not exist without scene.environment. One PMREM, generated once.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;   // fill, not the main light — the sun is
    pmrem.dispose();

    this._buildSky();
    this._buildLights();

    this.time = 8.5 / 24;        // start mid-morning
    this.timeScale = 1;

    addEventListener('resize', () => this.resize());
    this.resize();

    // A driver reset (context lost) leaves every material broken and the
    // console screaming shader errors. Stop rendering, say so once, and offer
    // the only real remedy — a reload — instead of hammering a dead context.
    this.contextLost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.error('[Stage] WebGL context lost — GPU driver reset.');
      // One automatic retry in low-spec mode; if THAT also dies, stay halted
      // rather than reload-looping a broken driver.
      if (!this.lowSpec) {
        sessionStorage.setItem('belve-lowspec', '1');
        setTimeout(() => location.reload(), 800);
      }
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      console.warn('[Stage] WebGL context restored.');
    });
  }

  _buildSky() {
    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 2.0;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);

    this.sunPosition = new THREE.Vector3();
    this.scene.fog = new THREE.FogExp2(0x9fb4c7, 0.0016);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sun.castShadow = true;
    // A tight ortho box around the player keeps shadow texels small; the box
    // follows the camera in update(). 28m is enough to cover everything the
    // player can see in close detail — a wider box spreads the same 2048 texels
    // thinner and produces acne on the characters.
    const d = 28;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    // Skinned characters need a generous normal bias; they self-shadow badly at
    // grazing sun angles otherwise.
    this.sun.shadow.normalBias = 0.08;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Sky and ground bounce. Outdoors this is strong — without it, anything
    // backlit crushes to a black silhouette, which is what a weak fill looks
    // like the moment the player turns to face the sun.
    this.hemi = new THREE.HemisphereLight(0xa8c8ff, 0x6b5c48, 0.9);
    this.scene.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x8fa6d8, 0.0);
    this.scene.add(this.moon);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 0..1 through the day. 0.25 = dawn, 0.5 = noon, 0.75 = dusk. */
  get hour() { return this.time * 24; }

  update(dt, focus) {
    this.time = (this.time + (dt / DAY_LENGTH) * this.timeScale) % 1;

    // Sun arc, tilted so it doesn't pass straight overhead.
    const theta = (this.time - 0.25) * Math.PI * 2;
    const elevation = Math.sin(theta);
    this.sunPosition.set(
      Math.cos(theta) * 0.4,
      elevation,
      Math.sin(theta) * 0.9,
    ).normalize();

    this.sky.material.uniforms.sunPosition.value.copy(this.sunPosition);

    const day = THREE.MathUtils.clamp(elevation * 3.2, 0, 1);
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elevation) * 4, 0, 1);

    this.sun.position.copy(this.sunPosition).multiplyScalar(120);
    this.sun.intensity = day * 3.2;
    // Warm and redden as it approaches the horizon.
    this.sun.color.setRGB(1, 0.98 - dusk * 0.28, 0.94 - dusk * 0.52);

    this.moon.position.copy(this.sunPosition).multiplyScalar(-120);
    this.moon.intensity = (1 - day) * 0.35;

    this.hemi.intensity = 0.25 + day * 0.95;
    this.hemi.color.setRGB(0.55 + day * 0.12, 0.68 + day * 0.1, 1.0);
    this.renderer.toneMappingExposure = 0.55 + day * 0.55;

    // Fog tracks the sky so distant terrain matches the horizon.
    const fogDay = new THREE.Color(0x9fb4c7);
    const fogNight = new THREE.Color(0x0d1420);
    const fogDusk = new THREE.Color(0xc98b62);
    this.scene.fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.55);
    this.scene.fog.density = 0.0011 + (1 - day) * 0.0012;

    // Keep the shadow box on the player, or shadows vanish as you walk away.
    if (focus) {
      this.sun.target.position.copy(focus);
      this.sun.position.copy(focus).add(this.sunPosition.clone().multiplyScalar(120));
      this.sun.target.updateMatrixWorld();
    }
  }

  render() { if (!this.contextLost) this.renderer.render(this.scene, this.camera); }
}
