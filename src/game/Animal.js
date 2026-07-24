import * as THREE from 'three';
import { assets } from '../core/Assets.js';

/**
 * Peaceful wildlife — the dog on the quay, the pigs in the farmyards.
 *
 * These are Meshy quadrupeds with one baked walking clip. Life comes from the
 * loop: amble to a spot near home, stop, stand a while, amble on. The clip's
 * playback speed follows the actual ground speed so the feet neither skate
 * nor run on the spot.
 */

const SPECIES = {
  dog:        { file: 'dog',      metres: 0.95, speed: 1.7, name: 'Dog' },
  'animal-a': { file: 'animal-a', metres: 1.25, speed: 0.85, name: 'Pig' },
  'animal-b': { file: 'animal-b', metres: 1.15, speed: 0.85, name: 'Pig' },
};

export class Animal {
  constructor(root, spec, terrain, world, x, z, homeR) {
    this.root = root;
    this.spec = spec;
    this.terrain = terrain;
    this.world = world;

    this.anchor = new THREE.Vector3(x, 0, z);
    this.homeR = homeR;
    this.target = new THREE.Vector3(x, 0, z);
    this.state = 'idle';
    this.timer = 1 + Math.random() * 4;
    this.speed = 0;

    this.mixer = new THREE.AnimationMixer(root);
    this._walkDuration = 1;
    this._prev = new THREE.Vector3(x, 0, z);
  }

  static async spawn(species, terrain, world, x, z, homeR = 36) {
    const spec = SPECIES[species];
    if (!spec) throw new Error(`unknown animal '${species}'`);
    const { root, animations } = await assets.instance(`${import.meta.env.BASE_URL}assets/creatures/${spec.file}.glb`);

    // Meshy normalises to a ~2-unit cube; scale so the body length is real.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const long = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    if (long > 1e-4) root.scale.setScalar(spec.metres / long);

    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });

    const a = new Animal(root, spec, terrain, world, x, z, homeR);
    if (animations?.length) {
      const clip = animations[0];
      a._walkDuration = clip.duration;
      const action = a.mixer.clipAction(clip);
      action.play();
    }
    a._ground(x, z);
    root.rotation.y = Math.random() * Math.PI * 2;
    return a;
  }

  _ground(x, z) {
    // Rest the body on the ground, not the origin — the Meshy cube centres it.
    this.root.position.set(x, this.terrain.height(x, z), z);
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.root);
    if (Number.isFinite(box.min.y)) this.root.position.y += this.root.position.y - box.min.y;
  }

  _pickTarget() {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * this.homeR;
      const x = this.anchor.x + Math.cos(a) * r;
      const z = this.anchor.z + Math.sin(a) * r;
      if (this.terrain.isWater(x, z) || this.terrain.slope(x, z) > 0.3) continue;
      this.target.set(x, 0, z);
      return true;
    }
    return false;
  }

  update(dt) {
    this.timer -= dt;

    if (this.state === 'idle') {
      this.speed = Math.max(0, this.speed - dt * 2.5);
      if (this.timer <= 0 && this._pickTarget()) {
        this.state = 'walk';
        this.timer = 20;                     // give up on unreachable spots
      }
    } else {
      const p = this.root.position;
      const dx = this.target.x - p.x, dz = this.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.2 || this.timer <= 0) {
        this.state = 'idle';
        this.timer = 2 + Math.random() * 7;
      } else {
        const want = Math.atan2(dx, dz);
        let turn = want - this.root.rotation.y;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        this.root.rotation.y += THREE.MathUtils.clamp(turn, -2.4 * dt, 2.4 * dt);
        this.speed = Math.min(this.spec.speed, this.speed + dt * 2);

        p.x += Math.sin(this.root.rotation.y) * this.speed * dt;
        p.z += Math.cos(this.root.rotation.y) * this.speed * dt;
        this.world.resolveCollision(p, 0.4);
        this.world.clampToLand(p, this._prev);
        this._ground(p.x, p.z);
        this._prev.set(p.x, 0, p.z);
      }
    }

    // Feet follow the actual pace: full clip speed at full amble, a lazy
    // shuffle as it settles, frozen when standing.
    this.mixer.timeScale = THREE.MathUtils.clamp(this.speed / this.spec.speed, 0, 1) * 1.15;
    this.mixer.update(dt);
  }
}
