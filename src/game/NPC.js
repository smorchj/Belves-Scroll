import * as THREE from 'three';
import { Character } from '../character/Character.js';

/**
 * An inhabitant with a life of its own.
 *
 * Every NPC runs a 24-hour schedule of places to be and things to do there, so
 * the world moves whether or not the player is watching: farmers walk out at
 * dawn, drink in the evening, and sleep at night. On top of that sits a
 * reactive layer — noticing the player, fleeing, or fighting — which suspends
 * the schedule and resumes it once the disturbance passes.
 */

const ARRIVE = 2.5;          // metres, close enough to count as "there"
const NOTICE = 14;           // metres, starts tracking the player with its eyes
const GREET = 4.5;           // metres, close enough to say something
const AGGRO = 18;            // metres, hostiles engage
const ATTACK_RANGE = 2.3;

let _wanderSeed = 0;

export class NPC {
  constructor(character, def, world, terrain) {
    this.char = character;
    this.def = def;
    this.world = world;
    this.terrain = terrain;

    this.id = def.id;
    this.name = def.name;
    this.hostile = def.faction === 'bandit' || def.disposition <= -0.6;

    this.state = 'idle';
    this.target = new THREE.Vector3();
    this.hasTarget = false;
    this.activity = 'idle';
    this.currentPoi = null;

    this.attackCooldown = 0;
    this.greetCooldown = 0;
    this.wanderTimer = Math.random() * 6;
    this.homeAnchor = new THREE.Vector3();
    this.seed = _wanderSeed++;

    this._tmp = new THREE.Vector3();
    this._toPlayer = new THREE.Vector3();
  }

  static async spawn(def, world, terrain) {
    const char = await Character.spawn(def.model, def);
    const npc = new NPC(char, def, world, terrain);

    // Start wherever the schedule says they should be right now.
    const poi = world.poi(def.home) ?? world.poi(def.work) ?? [...world.pois.values()][0];
    const p = poi?.position ?? new THREE.Vector3();
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.min(10, (poi?.radius ?? 12) * 0.5);
    const x = p.x + Math.cos(angle) * r;
    const z = p.z + Math.sin(angle) * r;
    npc.setPosition(x, z);
    npc.homeAnchor.copy(char.root.position);
    npc.currentPoi = poi ?? null;
    return npc;
  }

  setPosition(x, z) {
    const y = this.terrain.height(x, z);
    this.char.root.position.set(x, y, z);
    this.char.root.userData.groundY = y;
  }

  get position() { return this.char.root.position; }

  /** What the schedule says this NPC should be doing at `hour`. */
  scheduledEntry(hour) {
    const s = this.def.schedule;
    if (!s?.length) return null;
    let current = s[s.length - 1];    // before the first entry, the last one still applies
    for (const e of s) {
      if (hour >= e.at) current = e; else break;
    }
    return current;
  }

  goTo(pos) {
    this.target.copy(pos);
    this.hasTarget = true;
    this.state = 'travel';
  }

  update(dt, ctx) {
    const char = this.char;
    if (char.dead) { char.update(dt); return; }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.greetCooldown = Math.max(0, this.greetCooldown - dt);

    const player = ctx.player;
    this._toPlayer.copy(player.position).sub(this.position);
    const distToPlayer = this._toPlayer.length();

    // --- reactive layer, overrides the schedule ---
    if (this.state !== 'talk') {
      if (this.hostile && distToPlayer < AGGRO && !player.char.dead) {
        this.state = 'fight';
      } else if (this.state === 'fight' && distToPlayer > AGGRO * 1.6) {
        this.state = 'idle';
        this.hasTarget = false;
      }
    }

    switch (this.state) {
      case 'fight': this._fight(dt, ctx, distToPlayer); break;
      case 'talk': this._talk(dt, ctx); break;
      case 'travel': this._travel(dt); break;
      case 'flee': this._flee(dt, ctx); break;
      default: this._atPost(dt, ctx); break;
    }

    // Look at the player when they're close, otherwise look where they're going.
    if (distToPlayer < NOTICE && !char.dead) {
      char.animator.lookTarget = ctx.playerHead;
    } else {
      char.animator.lookTarget = null;
    }

    this._applyGround(dt);
    char.update(dt);
  }

  /** Schedule-driven behaviour when not reacting to anything. */
  _atPost(dt, ctx) {
    const entry = this.scheduledEntry(ctx.hour);
    if (entry) {
      const poi = this.world.poi(entry.poi);
      if (poi && poi !== this.currentPoi) {
        this.currentPoi = poi;
        this.activity = entry.activity;
        // Head for a spot near the POI rather than its exact centre, so a group
        // sharing a destination doesn't stack into one body.
        const a = (this.seed * 2.39996) % (Math.PI * 2);
        const r = Math.min(9, poi.radius * 0.45);
        this._tmp.set(poi.position.x + Math.cos(a) * r, 0, poi.position.z + Math.sin(a) * r);
        this._tmp.y = this.terrain.height(this._tmp.x, this._tmp.z);
        this.goTo(this._tmp);
        return;
      }
      this.activity = entry.activity;
    }

    if (this.activity === 'sleep') {
      this.char.speed = 0;
      this.char.animator.expressive = 0.2;
      return;
    }

    // Drift around the post so nobody stands perfectly still all day.
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 4 + Math.random() * 9;
      const base = this.currentPoi?.position ?? this.homeAnchor;
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * Math.min(11, (this.currentPoi?.radius ?? 10) * 0.5);
      const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r;
      if (this.terrain.slope(x, z) < 0.3) {
        this._tmp.set(x, this.terrain.height(x, z), z);
        this.goTo(this._tmp);
      }
    }
    this.char.speed = 0;
  }

  _travel(dt) {
    const pos = this.position;
    this._tmp.copy(this.target).sub(pos);
    this._tmp.y = 0;
    const dist = this._tmp.length();

    if (dist < ARRIVE) {
      this.hasTarget = false;
      this.state = 'idle';
      this.char.speed = 0;
      return;
    }

    const speed = this.state === 'fight' ? 4.2 : 1.5;
    this._tmp.normalize();
    pos.x += this._tmp.x * speed * dt;
    pos.z += this._tmp.z * speed * dt;
    this.world.resolveCollision(pos);
    this._face(this._tmp, dt);
    this.char.speed = speed;
  }

  _fight(dt, ctx, dist) {
    const char = this.char;
    if (dist > ATTACK_RANGE) {
      this.target.copy(ctx.player.position);
      this._travel(dt);
      this.state = 'fight';
      return;
    }

    // In range: face the player and swing on cooldown.
    this._tmp.copy(ctx.player.position).sub(this.position);
    this._tmp.y = 0;
    this._tmp.normalize();
    this._face(this._tmp, dt);
    char.speed = 0;

    if (this.attackCooldown <= 0 && !char.animator.busy) {
      const heavy = Math.random() < 0.28;
      char.attack(heavy ? 'attackHeavy' : 'attack');
      this.attackCooldown = heavy ? 2.4 : 1.5;
      // Land the blow partway through the swing, not on the keypress.
      setTimeout(() => {
        if (char.dead || ctx.player.char.dead) return;
        const d = ctx.player.position.distanceTo(this.position);
        if (d < ATTACK_RANGE * 1.35) {
          ctx.onPlayerHit?.(char.weaponDamage * (heavy ? 1.7 : 1), this);
        }
      }, heavy ? 420 : 260);
    }
  }

  _flee(dt, ctx) {
    this._tmp.copy(this.position).sub(ctx.player.position);
    this._tmp.y = 0;
    if (this._tmp.lengthSq() < 1e-4) this._tmp.set(1, 0, 0);
    this._tmp.normalize();
    const pos = this.position;
    pos.x += this._tmp.x * 4.4 * dt;
    pos.z += this._tmp.z * 4.4 * dt;
    this.world.resolveCollision(pos);
    this._face(this._tmp, dt);
    this.char.speed = 4.4;

    if (this.position.distanceTo(ctx.player.position) > 42) this.state = 'idle';
  }

  _talk(dt, ctx) {
    this.char.speed = 0;
    this._tmp.copy(ctx.player.position).sub(this.position);
    this._tmp.y = 0;
    if (this._tmp.lengthSq() > 1e-4) { this._tmp.normalize(); this._face(this._tmp, dt * 2); }
  }

  _face(dir, dt) {
    const targetYaw = Math.atan2(dir.x, dir.z);
    const cur = this.char.root.rotation.y;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.char.root.rotation.y = cur + diff * Math.min(1, dt * 8);
  }

  _applyGround(dt) {
    const pos = this.position;
    const g = this.terrain.height(pos.x, pos.z);
    const root = this.char.root;
    root.userData.groundY = THREE.MathUtils.damp(root.userData.groundY ?? g, g, 12, dt);
    pos.y = root.userData.groundY;
  }

  /** Called when the player strikes this NPC. */
  onHit(amount, attacker) {
    const dealt = this.char.takeDamage(amount, attacker);
    if (this.char.dead) return dealt;

    // Fighters fight back; everyone else runs and stays scared.
    if (this.hostile || this.def.stats?.damage >= 8) this.state = 'fight';
    else this.state = 'flee';
    this.char.disposition = -1;
    return dealt;
  }

  greeting() {
    const lines = this.def.greeting ?? this.def.barks;
    if (!lines?.length) return null;
    return lines[Math.floor(Math.random() * lines.length)];
  }
}
