import * as THREE from 'three';
import { Stage } from '../render/Renderer.js';
import { Terrain } from '../world/Terrain.js';
import { World } from '../world/World.js';
import { Input } from '../core/Input.js';
import { Player } from './Player.js';
import { NPC } from './NPC.js';
import { Creature } from './Creature.js';
import { Character } from '../character/Character.js';
import { Inventory, Lootable, item } from './Inventory.js';
import { Journal } from './Quests.js';
import { DialogueRunner } from './Dialogue.js';
import { UI } from '../ui/UI.js';
import { NPCS, CREATURE_SPAWNS } from '../data/npcs.js';
import { InteriorSet, INTERIORS } from '../world/Interior.js';
import { updateLODs } from '../core/Assets.js';
import { QuestMarkers } from './QuestMarkers.js';

const INTERACT_RANGE = 3.4;
const ATTACK_RANGE = 2.6;
const DOOR_RANGE = 3.2;
// The doorway is always +Z in room-local space, so leaving is a fixed test.
// Interior drops the player at d/2 - 1.4, which is *inside* this band: without
// arming, you land on the doorstep already being offered the way back out, and
// one press of E bounces you into the street. The exit arms once the player has
// stepped clear of it.
const EXIT_BAND = 2.2;
const EXIT_ARM = 3.0;
const DAY_NAMES = ['Frostmoot', 'Emberday', 'Sowing', 'Highsun', 'Reaping', 'Duskwane', 'Stillnight'];

export class Game {
  constructor(canvas, onStatus) {
    this.canvas = canvas;
    this.onStatus = onStatus ?? (() => {});
    this.npcs = [];
    this.creatures = [];
    this.lootables = [];
    this.attackCooldown = 0;
    this.stamina = 1;
    this.xp = 0;
    this.level = 1;
    this._slowTick = 0;
    this._lastPoi = null;
    this._visited = new Set();
    this._tmp = new THREE.Vector3();
    this._playerHead = new THREE.Vector3();

    this.interior = null;        // the room the player is standing in, or null
    this.doorways = [];
    this._transition = false;    // a door fade is in flight; ignore further input
    this._day = 0;
    this._lastClock = 0;
    this._prevPos = new THREE.Vector3();
  }

  get xpNext() { return this.level * 250; }

  async boot(build) {
    const { onStatus } = this;

    onStatus('opening the eye…', 0.03);
    // The character creator stands up a Stage before the world exists so it has
    // something to render into; reuse it rather than creating a second
    // WebGLRenderer against the same canvas.
    this.stage = this.stage ?? new Stage(this.canvas);
    this.input = new Input(this.canvas);
    this.ui = new UI();

    // Real Kartverket elevation, fetched. `new Terrain()` cannot work: the
    // constructor takes (manifest, heights, textures) and load() is the only
    // thing that has them.
    onStatus('sounding the coast…', 0.06);
    this.terrain = await Terrain.load();
    // Interior reads its floor and wall textures off the stage when they exist,
    // which saves it a second fetch of the same four files.
    this.stage.terrain = this.terrain;
    this.stage.scene.add(this.terrain.mesh);
    this.stage.scene.add(this.terrain.buildWater());

    onStatus('setting the barrows and the beacon…', 0.12);
    this.world = new World(this.stage, this.terrain);
    await this.world.build((p) => {
      // World builds landmarks, then the town, then the woods that have to avoid
      // both; the label tracks which one is running.
      const label = p < 0.25 ? 'setting the barrows and the beacon…'
                  : p < 0.70 ? 'raising Havnstad…'
                  : p < 0.75 ? 'naming the places…'
                  : 'planting the woods…';
      onStatus(label, 0.12 + p * 0.40);
    });

    onStatus('waking the traveller…', 0.55);
    this.inventory = new Inventory();
    this.inventory.add('gold', 40);
    // Bare fists against armoured bandits round down to 1 damage a swing, which
    // reads as the game being broken rather than as a challenge. Note these are
    // item ids from items.js — `sword-iron` is the *model* key in the catalog.
    this.inventory.add('iron-sword', 1);
    this.inventory.add('healing-draught', 2);
    this.inventory.add('travel-bread', 2);

    const heroDef = {
      id: 'player',
      name: build?.name ?? 'Traveller',
      stats: { hp: 120, damage: 9, defence: 2 },
    };
    const hero = build?.sliders
      ? await Character.fromBuild(build, heroDef)
      : await Character.spawn(build?.model ?? 'charles', heroDef);
    this.stage.scene.add(hero.root);
    this.hero = hero;

    // Put the starting blade in the player's hand, not just their pack.
    const starter = item('iron-sword');
    if (starter) {
      this.inventory.equip('mainhand', 'iron-sword');
      await hero.equip('mainhand', starter);
    }

    this.player = new Player(hero, this.terrain, this.stage.camera);
    this.player.spawnAt(...this._startPoint());
    this._prevPos.copy(this.player.position);

    onStatus('populating the shore…', 0.62);
    await this._spawnNPCs();

    onStatus('waking older things…', 0.80);
    await this._spawnCreatures();
    await this._spawnAnimals();

    onStatus('opening the doors…', 0.88);
    this._initInteriors();
    this._initContainers();

    onStatus('binding the scrolls…', 0.94);
    await this._initQuests();
    this.questMarkers = new QuestMarkers(this.stage.scene);

    this._bindInput();

    // The cast is built — drop the parsed recipe JSONs and decoded-texture
    // promises. They held the JS heap over a gigabyte, which is what got the
    // tab killed on machines with less headroom.
    const { releaseRecipeCaches } = await import('../character/CharacterFactory.js');
    releaseRecipeCaches();

    // Warm the realtime TTS in the background (24MB model, Cache API) so the
    // first unvoiced dialogue line doesn't stall on model load.
    import('../voice/VoiceSynth.js').then((m) => m.prewarm()).catch(() => {});

    onStatus('ready', 1);
    return this;
  }

  /**
   * Where the player wakes: the quay at Havnstad.
   *
   * The town is a working waterfront and the quay is what the whole ribbon faces,
   * so arriving there puts the piers, the boathouses and the church on the hill
   * in the first frame. Nudged a few metres inland, because the quay anchor sits
   * on the kerb and findFlat is happy to hand back the strait.
   */
  /**
   * Start beside the market well — the one point the schedules guarantee is
   * peopled at 08:30 (Mildrid, Maple and Esk all work the market from early
   * morning). The centroid of the buildings was tried before this and landed
   * the player in the empty gap BETWEEN the house clusters, which read as an
   * abandoned world; the well is where the town actually stands still.
   */
  _startPoint() {
    const candidates = [
      this.world.anchor('market'),                       // the well itself
      this.world.poi('greenhollow-market')?.position,    // the market POI
    ].filter(Boolean);

    for (const c of candidates) {
      const spot = this.terrain.findFlat(c.x + 5, c.z + 3, 14, 0.14);
      if (spot && !this.terrain.isWater(spot.x, spot.z)) {
        const clear = this.world.resolveCollision?.(
          new THREE.Vector3(spot.x, spot.y, spot.z), 1.2) ?? spot;
        return [clear.x, clear.z];
      }
    }

    // No market anchor at all: fall back to the building centroid.
    const houses = this.world.settlement?.plan?.buildings ?? [];
    if (houses.length) {
      let sx = 0, sz = 0;
      for (const b of houses) { sx += b.x; sz += b.z; }
      const spot = this.terrain.findFlat(sx / houses.length, sz / houses.length, 26, 0.14);
      if (spot) return [spot.x, spot.z];
    }
    return [0, 0];
  }

  /**
   * Bind the three built interiors to the doors Settlement measured on the
   * seaward face of each building.
   *
   * Settlement keys a door by the building id it belongs to, which is the same
   * string INTERIORS is keyed by — `kvitsalen`, `fork-and-net`, `apotekaren`.
   * A door whose room does not exist is dropped rather than prompted for.
   */
  _initInteriors() {
    this.interiors = new InteriorSet(this.stage, this.world);
    // A door binds to its own named room if one exists (kvitsalen, the inn…);
    // otherwise to the shared room its `interior` field names — which is how
    // every dwelling and farm shares the one 'domicile' build.
    const keyFor = (d) => (INTERIORS[d.id] ? d.id : (INTERIORS[d.interior] ? d.interior : null));
    this.doorways = this.world.doors
      .filter((d) => keyFor(d))
      .map((d) => ({ ...d, key: keyFor(d), name: INTERIORS[keyFor(d)].name }));

    for (const d of this.world.doors) {
      if (!keyFor(d)) console.warn(`door '${d.id}' has no interior — not enterable`);
    }
  }

  async _spawnNPCs() {
    // Load in parallel — each is an independent fetch, and doing them one at a
    // time turns a 3-second boot into thirty.
    const results = await Promise.allSettled(
      NPCS.map((def) => NPC.spawn(def, this.world, this.terrain)),
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') { console.warn('npc failed', r.reason); continue; }
      const npc = r.value;
      this.stage.scene.add(npc.char.root);

      // Give fighters their weapon so corpses can actually be looted for it.
      const weaponId = (npc.def.inventory ?? []).find((e) => item(e.item)?.slot === 'mainhand')?.item;
      if (weaponId) {
        const def = item(weaponId);
        if (def?.model) await npc.char.equip('mainhand', def);
      }
      this.npcs.push(npc);
    }
  }

  async _spawnCreatures() {
    const spawns = CREATURE_SPAWNS ?? [];

    const results = await Promise.allSettled(spawns.map(async (s) => {
      // Place them out in their region, away from the settlements.
      const poi = [...this.world.pois.values()].find((p) => p.region === s.region)
        ?? [...this.world.pois.values()][0];
      const a = Math.random() * Math.PI * 2;
      const r = (poi.radius ?? 30) + 25 + Math.random() * 45;
      const pos = new THREE.Vector3(
        poi.position.x + Math.cos(a) * r, 0, poi.position.z + Math.sin(a) * r);
      return Creature.spawn(s, this.terrain, this.world, pos);
    }));

    for (const r of results) {
      if (r.status !== 'fulfilled') { console.warn('creature failed', r.reason); continue; }
      this.stage.scene.add(r.value.root);
      this.creatures.push(r.value);
    }
  }

  /**
   * The town's animals: a couple of dogs on the waterfront, pigs in the
   * farmyards. Ambience, not systems — they wander, and that is the job.
   */
  async _spawnAnimals() {
    const { Animal } = await import('./Animal.js');
    this.animals = [];
    const want = [];

    const market = this.world.poi('greenhollow-market')?.position;
    if (market) {
      want.push(['dog', market.x + 8, market.z + 4, 45]);
      want.push(['dog', market.x - 14, market.z - 6, 45]);
    }
    const fields = this.world.settlement.plan?.fields ?? [];
    fields.slice(0, 4).forEach((f, i) => {
      const c = f.cells[Math.floor(f.cells.length / 2)];
      want.push([i % 2 === 0 ? 'animal-a' : 'animal-b', c.x + 6, c.z + 6, 26]);
    });

    const results = await Promise.allSettled(want.map(([sp, x, z, r]) =>
      Animal.spawn(sp, this.terrain, this.world, x, z, r)));
    for (const r of results) {
      if (r.status !== 'fulfilled') { console.warn('animal failed', r.reason); continue; }
      this.stage.scene.add(r.value.root);
      this.animals.push(r.value);
    }
  }

  async _initQuests() {
    let QUESTS = [], DIALOGUE = {};
    try {
      // @vite-ignore keeps the dev server from hard-failing its static import
      // analysis while the content files are still being authored.
      const mod = await import(/* @vite-ignore */ '/src/data/quests.js');
      QUESTS = mod.QUESTS ?? [];
      DIALOGUE = mod.DIALOGUE ?? {};
    } catch (err) {
      console.warn('quests unavailable', err);
    }

    this.journal = new Journal(QUESTS, this.inventory);
    this.dialogue = new DialogueRunner({
      dialogue: DIALOGUE, ui: this.ui, journal: this.journal, inventory: this.inventory,
    });

    this.journal.on((type, payload) => {
      if (type === 'quest-complete') {
        const r = payload.rewards ?? {};
        this.ui.toast('Quest complete', `${payload.quest.name}${r.gold ? ` — ${r.gold} gold` : ''}`);
        if (r.xp) this.gainXp(r.xp);
      } else if (type === 'stage-complete' && payload.stage) {
        this.ui.toast('Objective', payload.stage.text);
      }
    });

    // Deliberately no auto-started quest. The opening quest is offered by
    // Charles a few paces from the spawn point, and handing it over before the
    // player has met him makes his whole introduction read as redundant.
    const opener = QUESTS.find((q) => q.level === 1 && !QUESTS.some((o) => o.next === q.id));
    if (opener) {
      const giver = NPCS.find((n) => n.id === opener.giver);
      setTimeout(() => this.ui.toast('Havnstad',
        `Someone on the quay is looking for help${giver ? ` — ask after ${giver.name.split(' ')[0]}` : ''}.`, 8000), 1800);
    }
  }

  _bindInput() {
    addEventListener('keydown', (e) => {
      const ui = this.ui;

      if (this.dialogue?.running) {
        // While a line is still being spoken there are no options on screen, so
        // Space/Enter skips ahead instead of selecting.
        const speaking = this.dialogue.npc?.char?.animator.speaking;
        if (speaking && (e.code === 'Space' || e.code === 'Enter')) {
          this.dialogue.skip();
          e.preventDefault();
          return;
        }
        const pick = ui.dialogueKey(e.code);
        if (pick !== null) { ui.onDialogueChoice?.(pick); e.preventDefault(); }
        if (e.code === 'Escape') this.dialogue.end();
        return;
      }

      switch (e.code) {
        case 'KeyI': ui.showInventory(this.inventory); break;
        case 'KeyJ': ui.showJournal(this.journal); break;
        case 'Escape': ui.closePanels(); break;
        case 'KeyE': this._interact(); break;
      }
    });
  }

  // ------------------------------------------------------------- interiors

  /** The door the player is close enough to use, or null. */
  _nearestDoor() {
    if (this.interior || this._transition) return null;
    const p = this.player.position;
    let best = null, bestD = DOOR_RANGE;
    for (const d of this.doorways) {
      const dist = Math.hypot(p.x - d.x, p.z - d.z);
      if (dist < bestD) { bestD = dist; best = { door: d, d: dist }; }
    }
    return best;
  }

  /** Standing in the doorway of the room, which is always +Z in room space. */
  _atExit() {
    const room = this.interior;
    if (!room || this._transition) return false;
    const p = this.player.position;
    const half = room.inner.d / 2;
    if (p.z < half - EXIT_ARM) this._exitArmed = true;
    return this._exitArmed && p.z > half - EXIT_BAND && Math.abs(p.x) < 1.4;
  }

  async _enterInterior(door) {
    if (this._transition) return;
    this._transition = true;
    this.ui.hidePrompt();
    try {
      const room = this.interiors.get(door.key);
      this._exitArmed = false;
      room.npcs = this._occupantsOf(room);
      for (const npc of room.npcs) this._stow(npc);
      // The door record carries the yaw of the face it sits on, which is what
      // Interior uses to build the pose the player returns to on the way out.
      await room.enter(this.player, { anchor: door, ui: this.ui });
      this.interior = room;
      this._prevPos.copy(this.player.position);
      this.ui.setLocation(room.name);
    } catch (err) {
      console.error('entering interior failed', err);
      this.interior = null;
    } finally {
      this._transition = false;
    }
  }

  async _leaveInterior() {
    const room = this.interior;
    if (!room || this._transition) return;
    this._transition = true;
    this.ui.hidePrompt();
    try {
      await room.leave(this.player, { ui: this.ui });
      for (const npc of room.npcs) this._unstow(npc);
      room.npcs = [];
      this.interior = null;
      this._prevPos.copy(this.player.position);
    } catch (err) {
      console.error('leaving interior failed', err);
    } finally {
      this._transition = false;
    }
  }

  _occupantsOf(room) {
    const want = room.def.occupants ?? [];
    return this.npcs.filter((n) => want.includes(n.id) && !n.char.dead);
  }

  /**
   * Move an occupant into the room with the player.
   *
   * Their exterior pose is kept so the schedule picks up where it left off. The
   * home anchor has to move too — it is in world metres, and left alone the
   * wander behaviour walks them at a wall four kilometres away for as long as
   * the player stays inside.
   */
  _stow(npc) {
    npc._outside = { pos: npc.position.clone(), yaw: npc.char.root.rotation.y, home: npc.homeAnchor.clone() };
    const a = npc.seed * 2.39996;
    npc.char.root.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3 - 1.2);
    npc.char.root.rotation.y = Math.PI;
    npc.char.root.userData.groundY = 0;
    npc.homeAnchor.set(0, 0, -1);
    npc.currentPoi = null;
    npc.hasTarget = false;
    npc.state = 'idle';
  }

  _unstow(npc) {
    const saved = npc._outside;
    if (!saved) return;
    npc.char.root.position.copy(saved.pos);
    npc.char.root.rotation.y = saved.yaw;
    npc.char.root.userData.groundY = saved.pos.y;
    npc.homeAnchor.copy(saved.home);
    npc.currentPoi = null;
    npc.hasTarget = false;
    npc.state = 'idle';
    npc._outside = null;
  }

  gainXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.hero.maxHp += 12;
      this.hero.hp = this.hero.maxHp;
      this.hero.damage += 2;
      this.ui.toast('Level up', `You are now level ${this.level}.`);
    }
  }

  /**
   * Hang a Lootable on every placed chest and fish-rack. Contents are rolled
   * once at load: chests carry coin plus a consumable (sometimes something
   * better); racks carry dried fish.
   */
  _initContainers() {
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const COMMON = ['healing-draught', 'stamina-tonic', 'travel-bread', 'ashroot-salve', 'grove-oil', 'mire-brandy'];
    const RARE = ['greater-healing-draught', 'amber-ring', 'signal-oil', 'dried-fish'];
    for (const c of this.world.containers?.() ?? []) {
      const contents = [];
      if (c.kind === 'fish') {
        contents.push({ item: 'dried-fish', qty: 2 + (Math.random() * 3 | 0) });
      } else {
        contents.push({ item: 'gold-crown', qty: 1 + (Math.random() * 3 | 0) });
        contents.push({ item: pick(COMMON), qty: 1 });
        if (Math.random() < 0.3) contents.push({ item: pick(RARE), qty: 1 });
      }
      const pos = new THREE.Vector3(c.x, (c.y ?? 0) + 0.4, c.z);
      this.lootables.push(new Lootable(c.model, contents, pos));
    }
  }

  /**
   * World points to beacon for the current objective of each active quest.
   * talk → the NPC, reach → the POI/anchor, kill → the live target (or its
   * spawn anchor), collect → the quest-giver to hand it back to.
   */
  _questTargets() {
    const j = this.journal;
    if (!j?.active) return [];
    const out = [];
    for (const [, q] of j.active) {
      const obj = q.def.stages[q.stage]?.objective;
      if (!obj) continue;
      let pos = null;
      if (obj.type === 'talk') {
        pos = this.npcs.find((n) => n.id === obj.target && !n.char.dead)?.position ?? null;
      } else if (obj.type === 'reach') {
        pos = this.world.anchor(obj.target) ?? this.world.poi(obj.target)?.position ?? null;
      } else if (obj.type === 'kill') {
        pos = this.creatures.find((c) => !c.dead && (c.type === obj.target || c.def?.id === obj.target))?.position
            ?? this.world.anchor(obj.target) ?? null;
      } else {   // collect and anything else: point back to the giver
        pos = this.npcs.find((n) => n.id === q.def.giver && !n.char.dead)?.position ?? null;
      }
      if (pos) out.push({ x: pos.x, y: pos.y ?? this.terrain.height(pos.x, pos.z), z: pos.z });
    }
    return out;
  }

  /** Nearest interactable: a living NPC to talk to, or a corpse to loot. */
  _focus() {
    const p = this.player.position;
    let best = null, bestD = INTERACT_RANGE;

    for (const npc of this.npcs) {
      const d = npc.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = { kind: npc.char.dead ? 'loot' : 'talk', npc, d }; }
    }
    for (const c of this.creatures) {
      if (!c.dead) continue;                      // only a slain creature is lootable
      const d = c.position.distanceTo(p);
      if (d < bestD + 2) { bestD = d; best = { kind: 'creature-loot', creature: c, d }; }
    }
    for (const l of this.lootables) {
      if (l.empty) continue;
      const d = l.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = { kind: 'container', lootable: l, d }; }
    }
    return best;
  }

  _interact() {
    if (this._transition) return;

    // Indoors the door wins only when actually stood in it; otherwise the
    // innkeeper two paces away is what E is for.
    if (this.interior && this._atExit()) { this._leaveInterior(); return; }

    const f = this._focus();
    const door = this._nearestDoor();
    // Whoever is nearer wins, so an NPC loitering by the inn door does not lock
    // the player out of it and the door does not swallow a conversation.
    if (door && (!f || door.d < f.d)) { this._enterInterior(door.door); return; }
    if (!f) return;

    if (f.kind === 'talk') {
      const topic = f.npc.def.dialogue;
      if (topic && this.dialogue.topics[topic]) {
        this.input.release();
        this.dialogue.start(f.npc, topic);
      } else {
        const line = f.npc.greeting();
        if (line) {
          this.ui.toast(f.npc.name, line, 3000);
          f.npc.char.enableFace().then(() => f.npc.char.say(line));
        }
      }
    } else if (f.kind === 'loot') {
      const npc = f.npc;
      if (!npc._lootable) {
        npc._lootable = new Lootable(npc.char, npc.char.lootTable(), npc.position.clone());
      }
      this.input.release();
      this.ui.showLoot(npc._lootable, this.inventory, () => {
        this.ui.toast('Looted', npc.char.name);
      });
    } else if (f.kind === 'creature-loot') {
      const c = f.creature;
      if (!c._lootable) c._lootable = new Lootable(c, c.lootTable(), c.position.clone());
      this.input.release();
      this.ui.showLoot(c._lootable, this.inventory, () => this.ui.toast('Looted', c.name));
    } else if (f.kind === 'container') {
      this.input.release();
      this.ui.showLoot(f.lootable, this.inventory);
    }
  }

  _playerAttack() {
    if (this.attackCooldown > 0 || this.ui.blocking) return;
    const heavy = this.input.down('ShiftLeft');
    if (!this.hero.attack(heavy ? 'attackHeavy' : 'attack')) return;

    this.attackCooldown = heavy ? 0.95 : 0.62;
    this.stamina = Math.max(0, this.stamina - (heavy ? 0.22 : 0.12));

    // Resolve the blow partway through the swing so it lands on contact.
    setTimeout(() => {
      const p = this.player.position;
      const facing = this._tmp.set(
        Math.sin(this.hero.root.rotation.y), 0, Math.cos(this.hero.root.rotation.y));

      for (const npc of this.npcs) {
        if (npc.char.dead) continue;
        const to = npc.position.clone().sub(p);
        const dist = to.length();
        if (dist > ATTACK_RANGE) continue;
        to.y = 0; to.normalize();
        // Only hit what's roughly in front.
        if (to.dot(facing) < 0.35) continue;

        const dmg = this.hero.weaponDamage * (heavy ? 1.8 : 1);
        const dealt = npc.onHit(dmg, this.hero);
        this.ui.toast(npc.name, `${dealt} damage`, 1400);

        if (npc.char.dead) {
          this.gainXp(24 + (npc.def.stats?.hp ?? 40));
          this.journal.notify('kill', npc.id);
          this.ui.toast('Slain', npc.name);
        }
      }

      for (const c of this.creatures) {
        if (c.dead) continue;
        const to = c.position.clone().sub(p);
        const dist = to.length();
        if (dist > ATTACK_RANGE + 1.4) continue;   // creatures are larger
        to.y = 0; to.normalize();
        if (to.dot(facing) < 0.35) continue;

        const dealt = c.takeDamage(this.hero.weaponDamage * (heavy ? 1.8 : 1), this.hero);
        this.ui.toast(c.name, `${dealt} damage`, 1400);
        if (c.dead) {
          this.gainXp(120 + (c.maxHp ?? 200));
          this.journal.notify('kill', c.id);
          this.ui.toast('Slain', c.name);
        }
      }
    }, heavy ? 380 : 230);
  }

  _onPlayerHit(amount, from) {
    if (this.hero.dead) return;
    const blocking = this.input.mouseDown(2);
    const dealt = this.hero.takeDamage(blocking ? amount * 0.25 : amount, from);
    this.ui.flashDamage();
    if (this.hero.dead) {
      this.ui.toast('You have fallen', 'The valley goes on without you.', 9000);
      setTimeout(() => this._respawn(), 4200);
    }
    return dealt;
  }

  async _respawn() {
    // Waking up indoors after dying on a mountain would leave the interior
    // holding the stage with nobody in it.
    if (this.interior) await this._leaveInterior();
    this.hero.dead = false;
    this.hero.hp = this.hero.maxHp;
    this.hero.animator.action = null;
    this.player.spawnAt(...this._startPoint());
    this._prevPos.copy(this.player.position);
    this.ui.toast('Recovered', 'You wake on the Havnstad quay, poorer and sorer.');
    this.inventory.gold = Math.floor(this.inventory.gold * 0.8);
  }

  update(dt) {
    const input = this.input;
    const ui = this.ui;

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stamina = Math.min(1, this.stamina + dt * 0.28);

    if (!ui.blocking && !this.dialogue?.running) {
      if (input.mouseHit(0)) this._playerAttack();
      if (input.mouseDown(2)) this.hero.block(true);
    }

    this.player.update(dt, input, ui);

    // Grass only exists outdoors, and its disc follows the player rather than
    // covering the tile, so it is driven from here rather than from World.
    if (!this.interior) this.world.updateGrass(dt, this.player.position);

    if (this.interior) {
      this.interior.confine(this.player);
    } else {
      this.world.resolveCollision(this.player.position);
      // Order matters: pushing out of a building can shove the player off the
      // quay, so the shoreline test has to run after collision, not before.
      this.world.clampToLand(this.player.position, this._prevPos);
      this._prevPos.copy(this.player.position);
    }
    this.hero.update(dt);
    this.hero.headPosition(this._playerHead);

    const ctx = {
      player: this.player,
      playerHead: this._playerHead,
      hour: this.stage.hour,
      onPlayerHit: (amt, from) => this._onPlayerHit(amt, from),
    };

    // Only tick NPCs near the player in full; distant ones move on a slower
    // clock so a valley of two dozen lives costs almost nothing.
    this._slowTick = (this._slowTick + 1) % 4;
    for (const npc of this.npcs) {
      const d = npc.position.distanceTo(this.player.position);
      if (d < 90) npc.update(dt, ctx);
      // Distant NPCs run at a quarter rate on a rotating slice, so a valley of
      // two dozen lives keeps moving without costing a full update each.
      else if (npc.seed % 4 === this._slowTick) npc.update(dt * 4, ctx);
    }

    for (const a of this.animals ?? []) {
      if (a.root.position.distanceTo(this.player.position) < 140) a.update(dt);
    }
    for (const c of this.creatures) {
      if (c.position.distanceTo(this.player.position) < 120) c.update(dt, ctx);
    }

    this.stage.update(dt, this.hero.root.position);

    // Buildings with a far-LOD variant pick their level from the camera here.
    updateLODs(this.stage.camera);

    // Waypoint beacons over each active quest's current objective.
    if (this.questMarkers && !this.interior) this.questMarkers.update(dt, this._questTargets());
    else this.questMarkers?.update(dt, []);

    // Conversation is first-person: step into the player's eyes and hold the
    // other speaker's gaze. The body is hidden while the camera is inside it,
    // and everything restores the moment the exchange ends.
    const talkingTo = this.dialogue?.running ? this.dialogue.npc : null;
    if (talkingTo?.char) {
      const eye = this._playerHead;
      const theirs = talkingTo.char.headPosition(this._tmp);
      this.stage.camera.position.set(eye.x, eye.y + 0.06, eye.z);
      this.stage.camera.lookAt(theirs.x, theirs.y, theirs.z);
      if (this.hero.root.visible) this.hero.root.visible = false;
    } else if (!this.hero.root.visible) {
      this.hero.root.visible = true;
    }

    if (this.interior) {
      // After stage.update, never before: the outdoor sun, hemisphere, fog and
      // exposure are rewritten every tick, so the room has to reassert itself.
      this.interior.update(dt, this.stage);
    } else {
      // Swell, sun glint and the foam band. Without this uTime never advances
      // and the strait is a mirror.
      this.terrain.updateWater(dt, this.stage.sunPosition, this.stage.sun.color);
    }

    // --- hud ---
    this.ui.setVitals({
      hp: this.hero.hp, maxHp: this.hero.maxHp,
      stamina: this.stamina, xp: this.xp, xpNext: this.xpNext, level: this.level,
    });
    // Stage publishes `time` as 0..1 through the day and no day count at all, so
    // the calendar is kept here by watching that wrap.
    if (this.stage.time < this._lastClock) this._day++;
    this._lastClock = this.stage.time;
    this.ui.setClock(this.stage.hour, DAY_NAMES[this._day % DAY_NAMES.length]);

    const here = this.interior ? null : this.world.nearest(this.player.position);
    this.ui.setLocation(this.interior ? this.interior.name : (here?.name ?? ''));

    // Arrival drives 'reach' objectives. Without this the main quest stalls on
    // its very first stage, which is to go and look at something.
    if (here && here.id !== this._lastPoi) {
      this._lastPoi = here.id;
      this.journal.notify('reach', here.id);
      if (!this._visited.has(here.id)) {
        this._visited.add(here.id);
        this.ui.toast('Discovered', here.name, 3200);
      }
    } else if (!here && !this.interior) {
      this._lastPoi = null;
    }

    // --- interaction prompt ---
    if (!ui.anyPanelOpen && !this._transition) {
      const f = this._focus();
      const door = this._nearestDoor();
      if (this.interior && this._atExit()) {
        ui.showPrompt('<b>E</b> — Step outside');
      } else if (door && (!f || door.d < f.d)) {
        ui.showPrompt(`<b>E</b> — Enter <b>${door.door.name}</b>`);
      } else if (f) {
        const verb = f.kind === 'talk' ? `Talk to <b>${f.npc.name}</b>`
                   : f.kind === 'loot' ? `Search <b>${f.npc.char.name}</b>`
                   : f.kind === 'container' ? (f.lootable.source === 'fish-rack' ? 'Take dried fish' : 'Search chest')
                   : 'Open';
        ui.showPrompt(`<b>E</b> — ${verb}`);
      } else ui.hidePrompt();
    } else ui.hidePrompt();

    input.endFrame();
  }

  render() { this.stage.render(); }
}
