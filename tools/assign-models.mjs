// Spread the 19 exported characters across the 24 NPCs.
//
// The complaint this fixes: two NPCs standing together looked identical. With
// only 12 models for 24 NPCs that was inevitable, and the pairs happened to be
// co-located — `makal` and `desk-adept` both live in the chapterhouse, so the
// player met the same face twice in one room.
//
// 19 models still cannot cover 24 NPCs, so ~5 repeats are unavoidable. The rule
// that actually matters is therefore not "no repeats" but **no repeat you can
// see at once**: two NPCs may share a model only if they live and work in
// different places. That is asserted here rather than eyeballed.
//
//   node tools/assign-models.mjs           report
//   node tools/assign-models.mjs --write   rewrite npcs.js
import fs from 'node:fs';
import { NPCS } from '../src/data/npcs.js';

const write = process.argv.includes('--write');

/**
 * Preferred model per NPC, chosen so the outfit suits the role — a Ruby Order
 * sergeant wears Ruby Armour, a farmhand wears a farmer's clothes. Only the
 * generic NPCs are reassigned; the twelve named characters keep their own face.
 */
const ASSIGN = {
  // Named characters are fixed — their model IS the character.
  charles: 'charles', mildrid: 'mildrid', maple: 'maple',
  'lilly-raider': 'lilly-raider', haggar: 'haggar', ember: 'ember',
  snader: 'snader', cedar: 'cedar', miriam: 'miriam', makal: 'makal',
  'woodland-druid': 'woodland-druid', 'woodland-huldra': 'woodland-huldra',

  // Generic NPCs, matched to the newly exported cast by outfit and role.
  'bram-thatcher': 'marvin',        // Peasant farmer — a second farmhand
  'goodwife-ren': 'willow',         // Merchant Dress — the herbalist
  'pedlar-esk': 'slyder',           // dark travelling leathers suit a road pedlar
  'sergeant-ould': 'aksel',         // Ruby Armour, and he is Ruby Order
  'ruby-lancer': 'travis',          // Dragon Armour — heavy line soldier
  'vigil-scout': 'sage',            // Dragon Armour, venus
  'vigil-ranger': 'police-man',     // the only remaining uniformed model
  'outpost-raider': 'haggar',       // bandits should read as feral hide
  'bracken-cutthroat': 'lilly-raider',
  'desk-adept': 'miriam',           // Assassin Armour, matching the Quiet Desk
  'grove-warden': 'woodland-huldra',
  'tusk-outrider': 'charles',       // rough peasant clothes on a hunter
};

const byId = new Map(NPCS.map((n) => [n.id, n]));

/** Everywhere an NPC can be seen: home, work, and every stop on their schedule. */
const placesOf = (n) => new Set([n.home, n.work, ...(n.schedule ?? []).map((s) => s.poi)].filter(Boolean));

const NAMED = new Set(['charles', 'mildrid', 'maple', 'lilly-raider', 'haggar', 'ember',
  'snader', 'cedar', 'miriam', 'makal', 'woodland-druid', 'woodland-huldra']);

const ALL_MODELS = [...new Set(Object.values(ASSIGN))];

/**
 * Assign models, then repair any pair that would be visible together.
 *
 * Hand-assigning by role produced four co-located pairs — including two Quiet
 * Desk agents with the same face in the same chapterhouse. Rather than shuffle
 * by eye, take the preferred assignment and then, for each clash, move the
 * *generic* NPC to the least-used model that has no location in common with it.
 * Named characters are never moved: their model is their identity.
 */
function solve() {
  const chosen = new Map(NPCS.map((n) => [n.id, ASSIGN[n.id] ?? n.model]));

  const conflicts = () => {
    const out = [];
    const byModel = new Map();
    for (const n of NPCS) {
      const m = chosen.get(n.id);
      if (!byModel.has(m)) byModel.set(m, []);
      byModel.get(m).push(n);
    }
    for (const [model, group] of byModel) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = placesOf(group[i]), b = placesOf(group[j]);
          const shared = [...a].filter((p) => b.has(p));
          if (shared.length) out.push({ model, a: group[i], b: group[j], shared });
        }
      }
    }
    return out;
  };

  for (let pass = 0; pass < 40; pass++) {
    const bad = conflicts();
    if (!bad.length) break;

    const { a, b } = bad[0];
    // Move whichever of the pair is generic; if both are, move the second.
    const move = NAMED.has(a.id) ? b : (NAMED.has(b.id) ? a : b);
    const keepPlaces = placesOf(move);

    const usage = new Map(ALL_MODELS.map((m) => [m, 0]));
    for (const n of NPCS) usage.set(chosen.get(n.id), (usage.get(chosen.get(n.id)) ?? 0) + 1);

    // Candidates that clash with nothing this NPC can be seen alongside,
    // cheapest (least used) first.
    const candidates = ALL_MODELS
      .filter((m) => m !== chosen.get(move.id))
      .filter((m) => NPCS.every((o) => o.id === move.id || chosen.get(o.id) !== m
        || ![...placesOf(o)].some((p) => keepPlaces.has(p))))
      .sort((x, y) => (usage.get(x) ?? 0) - (usage.get(y) ?? 0));

    if (!candidates.length) break;      // genuinely unsatisfiable; report it
    chosen.set(move.id, candidates[0]);
  }

  return chosen;
}

const solved = solve();
const rows = NPCS.map((n) => ({
  id: n.id, name: n.name, was: n.model, now: solved.get(n.id),
  home: n.home, work: n.work, region: n.region,
}));

// --- the constraint: a shared model must not be a shared location ---

const places = (r) => placesOf(byId.get(r.id));

const byModel = new Map();
for (const r of rows) {
  if (!byModel.has(r.now)) byModel.set(r.now, []);
  byModel.get(r.now).push(r);
}

const clashes = [];
for (const [model, group] of byModel) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = places(group[i]), b = places(group[j]);
      const shared = [...a].filter((p) => b.has(p));
      if (shared.length) {
        clashes.push({ model, a: group[i].id, b: group[j].id, at: shared.join(', ') });
      }
    }
  }
}

console.log('model assignment\n');
for (const r of rows) {
  const mark = r.was === r.now ? '   ' : ' ->';
  console.log(`  ${r.id.padEnd(19)} ${r.was.padEnd(16)}${mark} ${r.now}`);
}

const used = new Set(rows.map((r) => r.now));
const repeats = [...byModel.entries()].filter(([, g]) => g.length > 1);

console.log(`\n  ${rows.length} NPCs across ${used.size} distinct models`);
console.log(`  repeated models: ${repeats.length ? repeats.map(([m, g]) => `${m} x${g.length}`).join(', ') : 'none'}`);

if (clashes.length) {
  console.log(`\n  CO-LOCATED DUPLICATES (${clashes.length}) — the player would see these together:`);
  for (const c of clashes) console.log(`    ${c.model}: ${c.a} + ${c.b} both at ${c.at}`);
} else {
  console.log('  no two NPCs sharing a model share any location');
}

if (write && !clashes.length) {
  let src = fs.readFileSync('src/data/npcs.js', 'utf8');
  let n = 0;
  for (const r of rows) {
    if (r.was === r.now) continue;
    // Rewrite the model field only, on the entry with this id. The file uses
    // double quotes, so match either style rather than assuming.
    const q = `["']`;
    const re = new RegExp(`(id:\\s*${q}${r.id}${q}[\\s\\S]{0,400}?model:\\s*${q})[^"']+(${q})`);
    if (re.test(src)) { src = src.replace(re, `$1${r.now}$2`); n++; }
    else console.log(`    ! could not rewrite ${r.id}`);
  }
  fs.writeFileSync('src/data/npcs.js', src);
  console.log(`\n  rewrote ${n} model assignments in src/data/npcs.js`);
} else if (write) {
  console.log('\n  NOT written — resolve the co-located duplicates first');
}
