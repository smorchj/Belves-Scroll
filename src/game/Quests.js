/**
 * Quest journal and objective tracking.
 *
 * Quests advance stage by stage; each stage has one objective the world reports
 * progress against. The journal listens to game events rather than polling, so
 * adding a new objective type only means teaching `notify` one more verb.
 */
export class Journal {
  constructor(quests, inventory) {
    this.defs = new Map();
    for (const q of quests) this.defs.set(q.id, q);

    this.active = new Map();     // id -> { stage, progress, def }
    this.completed = new Set();
    this.failed = new Set();
    this.inventory = inventory;
    this.listeners = new Set();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }

  isActive(id) { return this.active.has(id); }
  isComplete(id) { return this.completed.has(id); }

  start(id) {
    if (this.active.has(id) || this.completed.has(id)) return false;
    const def = this.defs.get(id);
    if (!def) { console.warn(`unknown quest: ${id}`); return false; }

    this.active.set(id, { def, stage: 0, progress: 0 });
    this._emit('quest-started', { quest: def });
    this._checkStage(id);        // a stage may already be satisfied on pickup
    return true;
  }

  stageOf(id) {
    const q = this.active.get(id);
    return q ? q.def.stages[q.stage] : null;
  }

  /**
   * Report something that happened. `type` is 'talk' | 'kill' | 'collect' |
   * 'reach'; `target` is the id involved.
   */
  notify(type, target, amount = 1) {
    for (const [id, q] of this.active) {
      const stage = q.def.stages[q.stage];
      const obj = stage?.objective;
      if (!obj || obj.type !== type) continue;
      if (obj.target && obj.target !== target) continue;

      q.progress += amount;
      this._emit('objective-progress', { quest: q.def, stage, progress: q.progress });
      this._checkStage(id);
    }
  }

  /** Collect objectives are satisfied by inventory contents, not by events. */
  _checkStage(id) {
    const q = this.active.get(id);
    if (!q) return;
    const stage = q.def.stages[q.stage];
    const obj = stage?.objective;
    if (!obj) { this._advance(id); return; }

    const need = obj.count ?? 1;
    const have = obj.type === 'collect'
      ? this.inventory.count(obj.target)
      : q.progress;

    if (have >= need) this._advance(id);
  }

  _advance(id) {
    const q = this.active.get(id);
    if (!q) return;
    const finished = q.def.stages[q.stage];
    this._emit('stage-complete', { quest: q.def, stage: finished });

    q.stage++;
    q.progress = 0;

    if (q.stage >= q.def.stages.length) { this.complete(id); return; }
    this._emit('stage-started', { quest: q.def, stage: q.def.stages[q.stage] });
    this._checkStage(id);
  }

  complete(id) {
    const q = this.active.get(id);
    if (!q) return;
    this.active.delete(id);
    this.completed.add(id);

    const r = q.def.rewards ?? {};
    if (r.gold) this.inventory.add('gold', r.gold);
    for (const it of r.items ?? []) this.inventory.add(it, 1);

    this._emit('quest-complete', { quest: q.def, rewards: r });
    if (q.def.next) this.start(q.def.next);
  }

  fail(id) {
    if (!this.active.has(id)) return;
    const q = this.active.get(id);
    this.active.delete(id);
    this.failed.add(id);
    this._emit('quest-failed', { quest: q.def });
  }

  /** Journal entries for the UI. */
  entries() {
    const out = [];
    for (const q of this.active.values()) {
      out.push({
        id: q.def.id,
        name: q.def.name,
        summary: q.def.summary,
        stage: q.def.stages[q.stage],
        stageIndex: q.stage,
        stageCount: q.def.stages.length,
        progress: q.progress,
        state: 'active',
      });
    }
    for (const id of this.completed) {
      const def = this.defs.get(id);
      if (def) out.push({ id, name: def.name, summary: def.summary, state: 'complete' });
    }
    return out;
  }
}
