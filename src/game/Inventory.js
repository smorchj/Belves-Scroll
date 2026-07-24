import { ITEMS } from '../data/items.js';

// items.js may export a keyed object or an array; normalise to a lookup once.
const LOOKUP = Array.isArray(ITEMS)
  ? Object.fromEntries(ITEMS.map((i) => [i.id, i]))
  : ITEMS;

export function item(id) { return LOOKUP[id] ?? null; }

/** Player inventory: stacks, equipment, gold and carry weight. */
export class Inventory {
  constructor(capacity = 120) {
    this.slots = new Map();     // id -> qty
    this.gold = 0;
    this.capacity = capacity;
    this.equipped = { mainhand: null, offhand: null, head: null, body: null };
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  add(id, qty = 1) {
    if (id === 'gold') { this.gold += qty; this._emit(); return true; }
    this.slots.set(id, (this.slots.get(id) ?? 0) + qty);
    this._emit();
    return true;
  }

  remove(id, qty = 1) {
    if (id === 'gold') {
      if (this.gold < qty) return false;
      this.gold -= qty; this._emit(); return true;
    }
    const have = this.slots.get(id) ?? 0;
    if (have < qty) return false;
    if (have === qty) this.slots.delete(id); else this.slots.set(id, have - qty);
    this._emit();
    return true;
  }

  has(id, qty = 1) {
    return id === 'gold' ? this.gold >= qty : (this.slots.get(id) ?? 0) >= qty;
  }

  count(id) { return id === 'gold' ? this.gold : (this.slots.get(id) ?? 0); }

  get weight() {
    let w = 0;
    for (const [id, qty] of this.slots) w += (item(id)?.weight ?? 0) * qty;
    return w;
  }

  get overloaded() { return this.weight > this.capacity; }

  list() {
    return [...this.slots.entries()]
      .map(([id, qty]) => ({ id, qty, def: item(id) }))
      .filter((e) => e.def)
      .sort((a, b) => (a.def.type ?? '').localeCompare(b.def.type ?? '')
                   || a.def.name.localeCompare(b.def.name));
  }

  equip(slot, id) {
    const def = item(id);
    if (!def) return false;
    if (this.equipped[slot]) this.add(this.equipped[slot]);
    this.equipped[slot] = id;
    this.remove(id, 1);
    this._emit();
    return true;
  }

  unequip(slot) {
    const id = this.equipped[slot];
    if (!id) return;
    this.add(id);
    this.equipped[slot] = null;
    this._emit();
  }

  equippedDef(slot) { return this.equipped[slot] ? item(this.equipped[slot]) : null; }
}

/**
 * A lootable corpse or container. Bodies persist so the player can come back,
 * and are cleaned up once emptied.
 */
export class Lootable {
  constructor(source, contents, position) {
    this.source = source;         // Character or container id
    this.contents = contents.filter((c) => c.qty > 0);
    this.position = position;
    this.looted = false;
  }

  get empty() { return this.contents.length === 0; }

  takeAll(inventory) {
    const taken = [];
    for (const c of this.contents) {
      inventory.add(c.item, c.qty);
      taken.push(c);
    }
    this.contents = [];
    this.looted = true;
    return taken;
  }

  take(id, inventory) {
    const idx = this.contents.findIndex((c) => c.item === id);
    if (idx === -1) return false;
    const c = this.contents[idx];
    inventory.add(c.item, c.qty);
    this.contents.splice(idx, 1);
    return true;
  }
}
