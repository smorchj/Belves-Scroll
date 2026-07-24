import { item } from '../game/Inventory.js';

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/**
 * All screen furniture: HUD, interaction prompt, dialogue, inventory, journal,
 * loot and toasts.
 *
 * The UI owns a `blocking` flag — while a panel is open the player controller
 * stops reading movement, so opening the inventory doesn't walk you off a cliff.
 */
export class UI {
  constructor(root = document.getElementById('ui-root')) {
    this.root = root;
    this.blocking = false;
    this.onDialogueChoice = null;
    this._selected = 0;

    this._buildHud();
    this._buildPrompt();
    this._buildDialogue();
    this._buildPanels();
    this._buildToasts();
  }

  // ------------------------------------------------------------------ hud

  _buildHud() {
    this.hud = el('div', 'hud', `
      <div class="bar hp"><i style="width:100%"></i></div>
      <div class="bar stam"><i style="width:100%"></i></div>
      <div class="bar xp"><i style="width:0%"></i></div>
      <div class="hud-meta"><span class="lvl">Level 1</span><span class="loc"></span></div>`);
    this.root.appendChild(this.hud);

    this.clock = el('div', 'clock', '');
    this.root.appendChild(this.clock);

    this.reticle = el('div', 'reticle');
    this.root.appendChild(this.reticle);

    this.damage = el('div', 'damage');
    this.root.appendChild(this.damage);

    this.hint = el('div', 'hint',
      'WASD move · Shift run · Space jump<br>LMB attack · Shift+LMB power attack · RMB block<br>E interact · I inventory · J journal · Esc close');
    this.root.appendChild(this.hint);
  }

  setVitals({ hp, maxHp, stamina = 1, xp = 0, xpNext = 1, level = 1 }) {
    this.hud.querySelector('.hp i').style.width = `${Math.max(0, hp / maxHp) * 100}%`;
    this.hud.querySelector('.stam i').style.width = `${stamina * 100}%`;
    this.hud.querySelector('.xp i').style.width = `${(xp / xpNext) * 100}%`;
    this.hud.querySelector('.lvl').textContent = `Level ${level}`;
  }

  setLocation(name) { this.hud.querySelector('.loc').textContent = name ?? ''; }

  setClock(hour, dayName) {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    this.clock.innerHTML = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      + (dayName ? `<br><span style="opacity:.6">${dayName}</span>` : '');
  }

  flashDamage() {
    this.damage.classList.add('hit');
    setTimeout(() => this.damage.classList.remove('hit'), 220);
  }

  // --------------------------------------------------------------- prompt

  _buildPrompt() {
    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);
  }

  showPrompt(text) {
    this.prompt.innerHTML = text;
    this.prompt.classList.add('show');
  }

  hidePrompt() { this.prompt.classList.remove('show'); }

  // ------------------------------------------------------------- dialogue

  _buildDialogue() {
    this.dialogue = el('div', 'dialogue', `
      <div class="who"></div>
      <div class="line"></div>
      <div class="options"></div>`);
    this.root.appendChild(this.dialogue);
  }

  openDialogue(speakerName) {
    this.dialogue.classList.add('open');
    this.dialogue.querySelector('.who').textContent = speakerName;
    this.dialogue.querySelector('.options').innerHTML = '';
    this.blocking = true;
  }

  setDialogueLine(text) {
    this.dialogue.querySelector('.line').textContent = text;
  }

  /** Render choices; resolves with the chosen option's index. */
  setDialogueOptions(options) {
    const box = this.dialogue.querySelector('.options');
    box.innerHTML = '';
    this._selected = 0;
    this._options = options;

    options.forEach((opt, i) => {
      const row = el('div', 'opt' + (i === 0 ? ' sel' : ''), `${i + 1}. ${opt.text}`);
      row.addEventListener('click', () => this.onDialogueChoice?.(i));
      row.addEventListener('mouseenter', () => this._select(i));
      box.appendChild(row);
    });
  }

  _select(i) {
    const rows = [...this.dialogue.querySelectorAll('.opt')];
    rows.forEach((r, k) => r.classList.toggle('sel', k === i));
    this._selected = i;
  }

  /** Keyboard navigation for the option list. */
  dialogueKey(code) {
    if (!this._options?.length) return null;
    if (code === 'ArrowDown') { this._select((this._selected + 1) % this._options.length); return null; }
    if (code === 'ArrowUp') { this._select((this._selected - 1 + this._options.length) % this._options.length); return null; }
    if (code === 'Enter' || code === 'Space') return this._selected;
    const n = /^Digit([1-9])$/.exec(code);
    if (n) { const i = +n[1] - 1; if (i < this._options.length) return i; }
    return null;
  }

  closeDialogue() {
    this.dialogue.classList.remove('open');
    this._options = null;
    this.blocking = false;
  }

  // --------------------------------------------------------------- panels

  _buildPanels() {
    this.inventory = el('div', 'panel', `<h2>Inventory</h2><div class="cols"><div class="inv-list"></div><div class="inv-detail"></div></div>`);
    this.journal = el('div', 'panel', `<h2>Journal</h2><div class="cols"><div class="q-list"></div><div class="q-detail"></div></div>`);
    this.loot = el('div', 'panel', `<h2>Remains</h2><div class="cols"><div class="loot-list"></div><div class="loot-actions"></div></div>`);
    this.root.append(this.inventory, this.journal, this.loot);
  }

  _togglePanel(panel, open) {
    const wasOpen = panel.classList.contains('open');
    const next = open ?? !wasOpen;
    // Only one panel at a time.
    for (const p of [this.inventory, this.journal, this.loot]) p.classList.remove('open');
    if (next) panel.classList.add('open');
    this.blocking = next;
    return next;
  }

  showInventory(inv, open) {
    const on = this._togglePanel(this.inventory, open);
    if (!on) return false;

    const list = this.inventory.querySelector('.inv-list');
    const detail = this.inventory.querySelector('.inv-detail');
    list.innerHTML = '';

    const eq = Object.entries(inv.equipped).filter(([, v]) => v);
    const header = el('div', '', `<div style="color:var(--gold);letter-spacing:.2em;font-size:.75rem;margin:.4rem 0 .6rem">EQUIPPED</div>`);
    list.appendChild(header);
    if (!eq.length) list.appendChild(el('div', 'row', '<span style="opacity:.5">nothing equipped</span>'));
    for (const [slot, id] of eq) {
      const d = item(id);
      const row = el('div', `row ${d?.rarity ?? ''}`, `<span>${d?.name ?? id} <span style="opacity:.5">(${slot})</span></span><span class="qty">unequip</span>`);
      row.addEventListener('click', () => { inv.unequip(slot); this.showInventory(inv, true); });
      list.appendChild(row);
    }

    list.appendChild(el('div', '', `<div style="color:var(--gold);letter-spacing:.2em;font-size:.75rem;margin:1.2rem 0 .6rem">CARRIED — ${Math.round(inv.weight)} / ${inv.capacity}</div>`));
    list.appendChild(el('div', 'row', `<span>Gold</span><span class="qty">${inv.gold}</span>`));

    for (const { id, qty, def } of inv.list()) {
      const row = el('div', `row ${def.rarity ?? ''}`, `<span>${def.name}</span><span class="qty">${qty}</span>`);
      row.addEventListener('mouseenter', () => {
        detail.innerHTML = `<div style="padding:.6rem"><div style="color:var(--gold);font-size:1.05rem">${def.name}</div>
          <div style="opacity:.6;font-size:.8rem;margin:.3rem 0 .8rem">${def.type}${def.slot ? ' · ' + def.slot : ''} · ${def.rarity ?? 'common'}</div>
          <div style="line-height:1.6">${def.desc ?? ''}</div>
          <div style="margin-top:.9rem;opacity:.75;font-size:.86rem">
            ${def.damage ? `Damage ${def.damage}<br>` : ''}${def.defence ? `Defence ${def.defence}<br>` : ''}
            Value ${def.value ?? 0} · Weight ${def.weight ?? 0}</div>
          ${def.slot ? '<div style="margin-top:1rem;color:var(--gold);cursor:pointer" class="do-equip">Equip</div>' : ''}
          </div>`;
        detail.querySelector('.do-equip')?.addEventListener('click', () => {
          inv.equip(def.slot, id);
          this.showInventory(inv, true);
        });
      });
      list.appendChild(row);
    }
    return true;
  }

  showJournal(journal, open) {
    const on = this._togglePanel(this.journal, open);
    if (!on) return false;

    const list = this.journal.querySelector('.q-list');
    const detail = this.journal.querySelector('.q-detail');
    list.innerHTML = '';
    const entries = journal.entries();

    if (!entries.length) list.appendChild(el('div', 'row', '<span style="opacity:.5">No quests yet. Talk to someone.</span>'));

    for (const e of entries) {
      const row = el('div', 'row', `<span>${e.name}</span><span class="qty">${e.state === 'complete' ? 'done' : `${e.stageIndex + 1}/${e.stageCount}`}</span>`);
      if (e.state === 'complete') row.style.opacity = 0.45;
      const show = () => {
        detail.innerHTML = `<div style="padding:.6rem">
          <div style="color:var(--gold);font-size:1.05rem">${e.name}</div>
          <div style="opacity:.7;margin:.6rem 0 1rem;line-height:1.6">${e.summary ?? ''}</div>
          ${e.stage ? `<div style="border-left:2px solid var(--gold);padding-left:.8rem;line-height:1.6">${e.stage.text}</div>` : '<div style="opacity:.5">Completed.</div>'}
        </div>`;
      };
      row.addEventListener('mouseenter', show);
      list.appendChild(row);
      if (e === entries[0]) show();
    }
    return true;
  }

  showLoot(lootable, inv, onDone) {
    const on = this._togglePanel(this.loot, true);
    if (!on) return;
    this.loot.querySelector('h2').textContent = lootable.source?.name
      ? `${lootable.source.name} — remains` : 'Remains';

    const list = this.loot.querySelector('.loot-list');
    const actions = this.loot.querySelector('.loot-actions');
    const render = () => {
      list.innerHTML = '';
      if (!lootable.contents.length) {
        list.appendChild(el('div', 'row', '<span style="opacity:.5">empty</span>'));
      }
      for (const c of lootable.contents) {
        const d = item(c.item);
        const row = el('div', `row ${d?.rarity ?? ''}`,
          `<span>${c.item === 'gold' ? 'Gold' : (d?.name ?? c.item)}</span><span class="qty">${c.qty}</span>`);
        row.addEventListener('click', () => { lootable.take(c.item, inv); render(); });
        list.appendChild(row);
      }
    };
    render();

    actions.innerHTML = `<div style="padding:.6rem">
      <div class="row" style="color:var(--gold)"><span>Take everything</span></div>
      <div class="row take-close"><span>Close</span></div></div>`;
    actions.querySelectorAll('.row')[0].addEventListener('click', () => {
      lootable.takeAll(inv); render(); onDone?.();
    });
    actions.querySelector('.take-close').addEventListener('click', () => this.closePanels());
  }

  closePanels() {
    for (const p of [this.inventory, this.journal, this.loot]) p.classList.remove('open');
    this.blocking = false;
  }

  get anyPanelOpen() {
    return [this.inventory, this.journal, this.loot].some((p) => p.classList.contains('open'))
      || this.dialogue.classList.contains('open');
  }

  // --------------------------------------------------------------- toasts

  _buildToasts() {
    this.toasts = el('div', 'toast-wrap');
    this.root.appendChild(this.toasts);
  }

  toast(title, body, ttl = 4200) {
    const t = el('div', 'toast', `<div class="t">${title}</div>${body ? `<div>${body}</div>` : ''}`);
    this.toasts.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .5s ease';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 520);
    }, ttl);
  }
}
