import * as THREE from 'three';
import { assets } from '../core/Assets.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { faceLibrary } from './FaceLibrary.js';
import { Lipsync } from './Lipsync.js';
import { BONES } from './Rig.js';
import { PROPS } from '../data/catalog.js';

/**
 * A humanoid in the world: model, procedural animation, speech, equipment and
 * the vital stats combat cares about.
 *
 * Faces are expensive, so morph targets are attached only while a character is
 * actually conversing (see FaceLibrary) — a village of thirty idle NPCs pays
 * nothing for expressions nobody is looking at.
 */
/**
 * The named cast, built from the recipe pipeline (2 shared bases + per-character
 * recipe + seated hair + outfit layer) instead of per-character GLBs.
 * Key is the lowercase model name npcs.js uses.
 */
const RECIPE_CAST = {
  maple:   { recipe: 'Maple',   outfit: 'Merchant Dress' },
  willow:  { recipe: 'Willow',  outfit: 'Merchant Dress' },
  ember:   { recipe: 'Ember',   outfit: 'Dragon Armor' },
  kari:    { recipe: 'Kari',    outfit: 'Merchant Dress' },
  mildrid: { recipe: 'Mildrid', outfit: 'Merchant Dress' },
  snader:  { recipe: 'Snader',  outfit: 'Dragon Armor' },
  haggar:  { recipe: 'Haggar',  outfit: 'Feral Hide Armor' },
  travis:  { recipe: 'Travis',  outfit: 'Dragon Armor' },
  cedar:   { recipe: 'Cedar',   outfit: 'Ruby Armor' },
  pobart:  { recipe: 'Pobart',  outfit: 'Ruby Armor' },
  charles: { recipe: 'Charles', outfit: 'Peasant farmer' },
  makal:   { recipe: 'Makal',   outfit: 'Assassin Armor' },
  adala:   { recipe: 'Adala',   outfit: 'Merchant Dress' },
  roger:   { recipe: 'Roger',   outfit: 'Peasant farmer' },
  cander:  { recipe: 'Cander',  outfit: 'Ruby Armor' },
  'woodland-druid':  { recipe: 'Woodland Druid',  outfit: 'Fantasy Woodland Armor' },
  'woodland-huldra': { recipe: 'Woodland Huldra', outfit: 'Woodland Dress' },
};

export class Character {
  constructor(root, def = {}) {
    this.root = root;
    this.def = def;
    this.id = def.id ?? 'unknown';
    this.name = def.name ?? 'Traveller';
    this.faction = def.faction ?? 'neutral';

    this.animator = new CharacterAnimator(root, { expressive: def.expressive ?? 1.0 });
    this.lipsync = new Lipsync(this.animator);
    this.hasFace = false;

    const stats = def.stats ?? {};
    this.maxHp = stats.hp ?? 100;
    this.hp = this.maxHp;
    this.damage = stats.damage ?? 8;
    this.defence = stats.defence ?? 0;
    this.dead = false;

    this.gold = def.gold ?? 0;
    this.inventory = (def.inventory ?? []).map((e) => ({ ...e }));
    this.equipped = { mainhand: null, offhand: null };
    this.disposition = def.disposition ?? 0;

    this.velocity = new THREE.Vector3();
    this.speed = 0;
    this._attachPoints = {};
  }

  /**
   * Build the player from a character-creator result:
   * `{ base, name, skin, hair, hairColour, sliders }` — the same shared-base
   * recipe pipeline the NPCs use (prepared base + identity sliders + seated,
   * conformed hair). No donor bodies, no grafting.
   */
  static async fromBuild(build, def = {}) {
    const { buildFromCreator } = await import('./CharacterFactory.js');
    const root = await buildFromCreator(build);
    const c = new Character(root, { ...def, name: build?.name ?? def.name });
    c._cacheAttachPoints();
    return c;
  }

  static async spawn(modelName, def = {}) {
    // Blended villagers: unique face bred from two named recipes.
    if (def.blend) {
      const { buildBlend } = await import('./CharacterFactory.js');
      const root = await buildBlend({ ...def.blend, outfit: def.outfit });
      const c = new Character(root, def);
      c._cacheAttachPoints();
      return c;
    }

    // Recipe-built cast: shared bases + small per-character recipes.
    const cast = RECIPE_CAST[modelName];
    if (cast || def.recipeSpec) {
      const { buildFromRecipe } = await import('./CharacterFactory.js');
      const root = await buildFromRecipe(def.recipeSpec ?? cast);
      const c = new Character(root, def);
      c._cacheAttachPoints();
      return c;
    }

    // No legacy GLB path: every character in the game is made by the blending
    // system — a recipe on a shared base, or a blend of recipes. A model name
    // that reaches this point is a data error, not a request for an old file.
    throw new Error(
      `[Character] "${modelName}" is neither a recipe (RECIPE_CAST) nor a blend `
      + `(def.blend). Legacy GLB characters were removed — give the NPC a `
      + `recipe or a blend in npcs.js.`);
  }

  _cacheAttachPoints() {
    this.root.traverse((o) => {
      if (!o.isBone) return;
      if (o.name === BONES.handR) this._attachPoints.mainhand = o;
      if (o.name === BONES.handL) this._attachPoints.offhand = o;
      if (o.name === BONES.head) this._attachPoints.head = o;
    });
  }

  get position() { return this.root.position; }

  /** Head height in world space — what other characters look at. */
  headPosition(out = new THREE.Vector3()) {
    const head = this._attachPoints.head;
    if (head) return out.setFromMatrixPosition(head.matrixWorld);
    return out.copy(this.root.position).setY(this.root.position.y + 1.6);
  }

  // ------------------------------------------------------------- equipment

  /**
   * Put a weapon in a hand. Meshy props arrive normalised to a ~2-unit cube and
   * with arbitrary orientation, so the catalog scale plus a per-slot correction
   * is applied here rather than trusting the file.
   */
  async equip(slot, itemDef) {
    this.unequip(slot);
    if (!itemDef?.model) { this.equipped[slot] = itemDef ?? null; return; }

    const bone = this._attachPoints[slot];
    if (!bone) return;

    const { root } = await assets.prop(itemDef.model);
    const holder = new THREE.Group();
    holder.add(root);

    // Meshy normalises every prop to a ~2-unit cube, so an unscaled sword is a
    // two-metre slab with a hilt the size of the character's head. Scale to the
    // catalog's real length, measured rather than assumed.
    const cat = PROPS[itemDef.model];
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const longest = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    const scale = (cat?.metres && longest > 1e-4) ? cat.metres / longest : (cat?.scale ?? 0.5);
    const side = slot === 'mainhand' ? 'R' : 'L';

    // Hand-authored poses from the pose tool drive everything: the stance
    // (grip + arms), the sword transform, and the attack windup/strike
    // sequences. Two-handed weapons take the Twohand set when it exists.
    const { loadPoses, poseHolds } = await import('./Poses.js');
    const poses = await loadPoses();
    const twoHand = !!itemDef.twoHanded && !!poses['Sword_Twohand'];
    const grip = (itemDef.grip && poses[itemDef.grip])
      ?? (twoHand ? poses['Sword_Twohand'] : null)
      ?? poses['Sword_onehand_A-pose'] ?? poses['sword-grip']
      ?? Object.values(poses)[0] ?? null;
    const swordPose = grip?.sword && grip.sword.hand === side ? grip.sword : null;

    if (swordPose) {
      root.scale.setScalar(swordPose.scale);
      root.quaternion.fromArray(swordPose.quaternion);
      root.position.fromArray(swordPose.position);
    } else {
      root.scale.setScalar(scale);
      root.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const scaled = new THREE.Box3().setFromObject(root);
      const len = scaled.max.y - scaled.min.y;
      const gp = new THREE.Vector3(
        (scaled.min.x + scaled.max.x) / 2,
        scaled.min.y + len * 0.14,
        (scaled.min.z + scaled.max.z) / 2);
      const euler = new THREE.Euler(-1.95, 0, side === 'R' ? 0.18 : -0.18);
      root.rotation.copy(euler);
      root.position.copy(gp.applyEuler(euler).negate());
    }

    bone.add(holder);
    holder.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });

    // The pose driver owns every pose-touched bone from here: the stance is
    // the baseline (fingers + any authored arm pose), and the attack poses are
    // registered so their bones get suppression and holds. No procedural
    // auto-curl anywhere — only what was authored plays.
    if (this.animator?.rig && grip) {
      const mod = await import('./PoseDriver.js');
      this._poseDriverExports = mod;                    // attack() is sync; keep the module at hand
      this.poseDriver = this.poseDriver ?? new mod.PoseDriver(this.animator.rig);
      const set = twoHand
        ? { windup: poses['Sword_Twohand_AttackWindup'], powerWindup: poses['Sword_Twohand_PowerAttackWindup'], strike: poses['Sword_Twohand_Strike'] }
        : { windup: poses['Sword_Onehand_windup'], powerWindup: poses['Sword_Onehand_Powerwindup'],
            strike: poses['SqordOneHand_Strike'], follow: poses['SqordOneHand_FollowThrough'] };
      this._combat = {
        style: twoHand ? 'two' : 'one',
        poses: Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v ? poseHolds(v) : null])),
      };
      this.poseDriver.setStyle(poseHolds(grip), Object.values(this._combat.poses));
    }

    this.equipped[slot] = itemDef;
    this._equippedNodes = this._equippedNodes ?? {};
    this._equippedNodes[slot] = holder;
  }

  unequip(slot) {
    const node = this._equippedNodes?.[slot];
    if (node) { node.removeFromParent(); delete this._equippedNodes[slot]; }
    if (slot === 'mainhand') { this.poseDriver?.clearStyle(); this._combat = null; }
    this.equipped[slot] = null;
  }

  get weaponDamage() {
    return this.damage + (this.equipped.mainhand?.damage ?? 0);
  }

  // ----------------------------------------------------------------- face

  /** Attach the shared morph library — call when entering conversation. */
  async enableFace() {
    if (this.hasFace) return;
    await faceLibrary.load();
    faceLibrary.attach(this.root);
    this.animator.face = new (this.animator.face.constructor)(this.root);
    this.hasFace = true;
  }

  disableFace() {
    // Never pull the morphs out from under a line that is still being spoken —
    // detaching mid-utterance empties the influence arrays the animator is
    // actively writing to.
    if (!this.hasFace || this.animator.speaking) return;
    faceLibrary.detach(this.root);
    // Rebind the Face to the now-morphless meshes. Without this the old Face
    // keeps writing influences into an emptied morphTargetInfluences array,
    // which leaves the head mesh with influences but no morph attributes — the
    // renderer then drops it and the head vanishes after a conversation.
    this.animator.face = new (this.animator.face.constructor)(this.root);
    this.hasFace = false;
  }

  /** Speak a line: drives synthesis, lipsync, gesture and mood together. */
  async say(text, opts = {}) {
    await this.enableFace();
    const voice = this.def.voice ?? {};
    let rate = opts.rate ?? voice.rate ?? 1;

    // Pre-generated KittenTTS clip for this exact line, if the voice bank has
    // one — real recorded audio beats browser synthesis every time. The
    // lipsync timeline is re-timed to the clip's true length so the mouth
    // finishes with the voice.
    let clip = null;
    if (!opts.silent && this.def?.id) {
      try {
        const { voiceClip } = await import('./VoiceBank.js');
        // Cap the wait: a first-ever realtime synth on a cold model can take
        // seconds, and the line must not freeze the conversation. The synth
        // keeps running in the worker and lands in cache for the next time.
        clip = await Promise.race([
          voiceClip(this.def.id, text),
          new Promise((r) => setTimeout(() => r(null), 6000)),
        ]);
      } catch {}
    }
    if (clip?.dur > 0.1) {
      this.lipsync.prepare(text, 1);
      rate = this.lipsync.duration / clip.dur;
    }

    if (opts.mood !== undefined) this.animator.mood = opts.mood;
    this.lipsync.prepare(text, rate);
    this.lipsync.start();
    this.animator.speaking = true;

    await new Promise((resolve) => {
      let finished = false;
      const timers = [];
      let audio = null;
      const done = () => {
        if (finished) return;
        finished = true;
        for (const t of timers) clearTimeout(t);
        if (audio) { try { audio.pause(); } catch {} audio = null; }
        this._skip = null;
        this.animator.speaking = false;
        this.lipsync.stop();
        resolve();
      };
      // Let the player cut a line short — see DialogueRunner.skip().
      this._skip = () => done();

      if (clip) {
        audio = new Audio(clip.url);
        audio.volume = opts.volume ?? 0.9;
        audio.onended = done;
        // A clip that fails to load or play still paces the line correctly —
        // the lipsync clock is already the clip's length.
        audio.onerror = () => timers.push(setTimeout(done, clip.dur * 1000));
        audio.play().catch(() => timers.push(setTimeout(done, clip.dur * 1000)));
        timers.push(setTimeout(done, (clip.dur + 2) * 1000));   // backstop
        return;
      }

      // No pre-generated clip: read the line silently on the lipsync clock.
      // Browser speech synthesis is deliberately NOT a fallback — its robotic
      // voice is worse than silence.
      timers.push(setTimeout(done, this.lipsync.duration * 1000));
    });
  }

  // --------------------------------------------------------------- combat

  attack(kind = 'attack') {
    if (this.dead) return false;
    // Authored swings first: windup → loaded hold → overshooting release →
    // soft recovery, straight from the pose tool. Procedural is the fallback
    // for anything without poses (fists, creatures' borrowed rigs).
    if (this._combat && this.poseDriver) {
      if (this.poseDriver.busy) return false;
      const { attackSequence } = this._poseDriverExports ?? {};
      if (attackSequence) {
        const seq = attackSequence(this._combat.poses, this._combat.style, kind);
        if (seq) return this.poseDriver.play(seq);
      }
    }
    return this.animator.play(kind, kind === 'attackHeavy' ? 0.95 : 0.62);
  }

  block(on = true) {
    if (on) this.animator.play('block', 0.4);
  }

  takeDamage(amount, from = null) {
    if (this.dead) return 0;
    const dealt = Math.max(1, Math.round(amount - this.defence));
    this.hp -= dealt;
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    else this.animator.play('hit', 0.4);
    this.lastAttacker = from;
    return dealt;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.animator.action = null;
    this.animator.play('death', 1.1);
    this.animator.speaking = false;
    this.disableFace();
  }

  /** Everything a corpse yields — weapons come off the body too. */
  lootTable() {
    const out = this.inventory.map((e) => ({ ...e }));
    for (const slot of ['mainhand', 'offhand']) {
      const it = this.equipped[slot];
      if (it) out.push({ item: it.id, qty: 1 });
    }
    if (this.gold > 0) out.push({ item: 'gold', qty: this.gold });
    return out;
  }

  update(dt) {
    // The pose driver writes its holds BEFORE the animator resolves the frame,
    // so the blended pose rides this frame's motion rather than last frame's.
    this.poseDriver?.update(dt);
    this.animator.update(dt, this.dead ? 0 : this.speed);
    if (this.hasFace) this.lipsync.update(dt);
  }
}
