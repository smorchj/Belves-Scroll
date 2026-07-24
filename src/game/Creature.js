import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { CREATURES } from '../data/catalog.js';

/**
 * Meshy creatures — the only assets in the project that ship with real
 * animation clips.
 *
 * They use a different rig from the humanoids (24-joint Mixamo-style, not the
 * 73-joint creategamecharacters skeleton), so none of the procedural animation
 * applies here; these are driven by an AnimationMixer instead. Both creatures
 * share an identical skeleton, which means their clips are interchangeable —
 * the Colossus ships with no idle and borrows the Wraith's.
 */

const clipCache = new Map();   // creature key -> Map<clipName, AnimationClip>

async function loadClips(key) {
  if (clipCache.has(key)) return clipCache.get(key);
  const { animations } = await assets.creature(key);
  const map = new Map();
  for (const clip of animations) map.set(clip.name, clip);
  clipCache.set(key, map);
  return map;
}

export class Creature {
  constructor(root, def, spawn, terrain, world) {
    this.root = root;
    this.def = def;             // catalog entry
    this.spawn = spawn;         // CREATURE_SPAWNS entry
    this.terrain = terrain;
    this.world = world;

    this.id = spawn.id;
    this.name = spawn.name;
    this.faction = spawn.faction ?? 'hostile';

    const stats = spawn.stats ?? {};
    this.maxHp = stats.hp ?? 200;
    this.hp = this.maxHp;
    this.damage = stats.damage ?? 20;
    this.defence = stats.defence ?? 8;
    this.dead = false;

    this.gold = spawn.gold ?? 0;
    this.inventory = (spawn.inventory ?? []).map((e) => ({ ...e }));

    this.state = 'idle';
    this.attackCooldown = 0;
    this.wanderTimer = Math.random() * 8;
    this.anchor = new THREE.Vector3();
    this.target = new THREE.Vector3();

    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.current = null;

    this._tmp = new THREE.Vector3();
  }

  static async spawn(spawnDef, terrain, world, position) {
    const def = CREATURES[spawnDef.model];
    if (!def) throw new Error(`unknown creature model: ${spawnDef.model}`);

    const { root } = await assets.creature(spawnDef.model);
    root.scale.setScalar(def.scale ?? 1);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });

    const c = new Creature(root, def, spawnDef, terrain, world);

    const clips = await loadClips(spawnDef.model);
    // Some creatures are missing clips they need; borrow from the other, whose
    // skeleton is bone-for-bone identical.
    let borrowed = null;
    if (def.borrowIdle) borrowed = await loadClips(def.borrowIdle);

    for (const [role, clipName] of Object.entries(def.clips ?? {})) {
      const clip = clips.get(clipName) ?? borrowed?.get(clipName);
      if (clip) c.actions.set(role, c.mixer.clipAction(clip));
    }
    if (!c.actions.has('idle') && borrowed) {
      const idleName = CREATURES[def.borrowIdle]?.clips?.idle;
      const clip = idleName && borrowed.get(idleName);
      if (clip) c.actions.set('idle', c.mixer.clipAction(clip));
    }

    // One-shot actions must not loop or the creature never leaves the swing.
    for (const role of ['attack', 'attackHeavy', 'slam', 'hit', 'kick', 'block']) {
      const a = c.actions.get(role);
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }

    const y = terrain.height(position.x, position.z);
    root.position.set(position.x, y, position.z);
    c.anchor.copy(root.position);
    c.play('idle');
    return c;
  }

  get position() { return this.root.position; }

  play(role, fade = 0.25) {
    const next = this.actions.get(role);
    if (!next || next === this.current) return false;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
    this.currentRole = role;
    return true;
  }

  playOnce(role) {
    const a = this.actions.get(role);
    if (!a) return false;
    a.reset().play();
    a.fadeIn(0.1);
    this.current?.fadeOut(0.15);
    this.current = a;
    this.currentRole = role;
    return true;
  }

  takeDamage(amount, from) {
    if (this.dead) return 0;
    const dealt = Math.max(1, Math.round(amount - this.defence));
    this.hp -= dealt;
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    else { this.playOnce('hit'); this.state = 'chase'; }
    return dealt;
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    for (const a of this.actions.values()) a.fadeOut(0.3);
    // No death clip in the set, so sink and tip the body instead.
    this._deathT = 0;
  }

  lootTable() {
    const out = this.inventory.map((e) => ({ ...e }));
    if (this.gold > 0) out.push({ item: 'gold', qty: this.gold });
    return out;
  }

  update(dt, ctx) {
    this.mixer.update(dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.dead) {
      this._deathT = Math.min(1, (this._deathT ?? 0) + dt * 0.8);
      const k = this._deathT;
      this.root.rotation.z = k * 1.4;
      this.root.position.y = this.terrain.height(this.position.x, this.position.z) - k * 0.35;
      return;
    }

    const player = ctx.player;
    const dist = this.position.distanceTo(player.position);
    const aggro = this.spawn.aggroRange ?? 26;

    if (dist < aggro && !player.char.dead) this.state = 'chase';
    else if (this.state === 'chase' && dist > aggro * 1.8) this.state = 'idle';

    switch (this.state) {
      case 'chase': this._chase(dt, ctx, dist); break;
      default: this._idle(dt); break;
    }

    this._ground(dt);
  }

  _idle(dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 6 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 14;
      this.target.set(this.anchor.x + Math.cos(a) * r, 0, this.anchor.z + Math.sin(a) * r);
      this.state = 'patrol';
      return;
    }
    this.play('idle');
  }

  _chase(dt, ctx, dist) {
    const reach = this.spawn.reach ?? 3.2;
    if (dist > reach) {
      this._tmp.copy(ctx.player.position).sub(this.position);
      this._tmp.y = 0;
      this._tmp.normalize();
      const speed = this.spawn.speed ?? 3.4;
      this.position.x += this._tmp.x * speed * dt;
      this.position.z += this._tmp.z * speed * dt;
      this._face(this._tmp, dt);
      this.play(speed > 2.6 ? 'run' : 'walk');
      return;
    }

    this._tmp.copy(ctx.player.position).sub(this.position);
    this._tmp.y = 0;
    this._tmp.normalize();
    this._face(this._tmp, dt);

    if (this.attackCooldown <= 0) {
      const roll = Math.random();
      const role = roll < 0.2 && this.actions.has('slam') ? 'slam'
                 : roll < 0.5 && this.actions.has('attackHeavy') ? 'attackHeavy' : 'attack';
      this.playOnce(role);
      const heavy = role !== 'attack';
      this.attackCooldown = heavy ? 3.2 : 2.0;

      setTimeout(() => {
        if (this.dead || ctx.player.char.dead) return;
        if (this.position.distanceTo(ctx.player.position) < reach * 1.4) {
          ctx.onPlayerHit?.(this.damage * (heavy ? 1.6 : 1), this);
        }
      }, heavy ? 700 : 450);
    } else if (!this.current || this.current.loop === THREE.LoopRepeat) {
      this.play('idle');
    }
  }

  _face(dir, dt) {
    const targetYaw = Math.atan2(dir.x, dir.z);
    const cur = this.root.rotation.y;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.root.rotation.y = cur + diff * Math.min(1, dt * 5);
  }

  _ground(dt) {
    const g = this.terrain.height(this.position.x, this.position.z);
    this.root.position.y = THREE.MathUtils.damp(this.root.position.y, g, 10, dt);
  }
}
