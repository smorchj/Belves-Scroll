/**
 * Meshy Text-to-3D batch driver: preview -> refine -> download, for a curated
 * set of village/coastal/wildland dressing assets. Resumable via a state file
 * (tools/meshy-state.json) so a rerun continues rather than regenerating.
 *
 *   MESHY_KEY=... node tools/meshy-gen.mjs
 *
 * Each asset carries a target_polycount sized to its real-world footprint —
 * the user's rule: sensible polycounts for the size of the mesh.
 */
import fs from 'fs';
import path from 'path';

const KEY = process.env.MESHY_KEY;
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const STATE = 'tools/meshy-state.json';
const OUT = 'assets-src/meshy-new';
fs.mkdirSync(OUT, { recursive: true });

// slug -> { prompt, poly, [previewId] }. The church preview was already
// submitted by hand; its id is seeded so we don't pay for it twice.
const ASSETS = {
  'stave-church':  { prompt: 'a weathered Norwegian stave church, dark tarred wooden walls, tiered shingled roofs, dragon head finials, small bell tower, stone base, medieval Norse architecture', poly: 40000, previewId: '019f9068-d28f-746d-b249-f969fbbae006' },
  'rowboat':       { prompt: 'a small clinker-built wooden Norse fishing rowboat, weathered planks, two wooden oars, empty hull', poly: 6000 },
  'fish-rack':     { prompt: 'a wooden Norwegian fish drying rack (hjell), tall timber frame with rows of hanging split cod fish drying', poly: 5000 },
  'market-stall':  { prompt: 'a medieval wooden market stall with a striped cloth awning, a plank counter, and baskets of produce', poly: 8000 },
  'handcart':      { prompt: 'a rustic wooden two-wheeled handcart, empty flatbed, weathered timber, medieval', poly: 5000 },
  'haystack':      { prompt: 'a round thatched haystack of dried golden hay on a low wooden base, farm prop', poly: 2500 },
  'woodpile':      { prompt: 'a neat stack of chopped firewood logs, split birch and pine, woodpile against nothing', poly: 4000 },
  'rune-stone':    { prompt: 'a carved Norse runestone, weathered grey granite standing stone with deep red painted runic carvings and a serpent motif', poly: 3000 },
  'crates':        { prompt: 'a stack of wooden cargo crates and one barrel, weathered planks, rope, medieval dock goods', poly: 4000 },
  'sign-post':     { prompt: 'a wooden hanging tavern signboard on a carved timber post, iron bracket, blank weathered sign', poly: 3000 },
};

const save = () => fs.writeFileSync(STATE, JSON.stringify(ASSETS, null, 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, body) {
  const res = await fetch(body ? API : `${API}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
async function get(id) {
  const res = await fetch(`${API}/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// 1. Submit any missing previews.
for (const [slug, a] of Object.entries(ASSETS)) {
  if (a.previewId) continue;
  const { result } = await api('POST', {
    mode: 'preview', prompt: a.prompt, art_style: 'realistic',
    should_remesh: true, target_polycount: a.poly, topology: 'triangle',
  });
  a.previewId = result;
  console.log('preview submitted', slug, result);
  save();
  await sleep(1500);
}

// 2. Poll previews; when one succeeds, kick its refine.
async function drive(phase, idKey, submitRefine) {
  const pending = () => Object.entries(ASSETS).filter(([, a]) => !a[`${phase}Done`]);
  while (pending().length) {
    for (const [slug, a] of pending()) {
      const id = a[idKey];
      if (!id) continue;
      let s;
      try { s = await get(id); } catch (e) { console.log(phase, slug, 'poll err', e.message); continue; }
      if (s.status === 'SUCCEEDED') {
        a[`${phase}Done`] = true;
        a[`${phase}Glb`] = s.model_urls?.glb ?? null;
        console.log(phase, 'DONE', slug);
        if (submitRefine) {
          try {
            const { result } = await api('POST', { mode: 'refine', preview_task_id: a.previewId, enable_pbr: true });
            a.refineId = result;
            console.log('refine submitted', slug, result);
          } catch (e) { console.log('refine submit err', slug, e.message); }
        }
        save();
      } else if (s.status === 'FAILED') {
        a[`${phase}Done`] = true; a[`${phase}Failed`] = true;
        console.log(phase, 'FAILED', slug, s.task_error?.message ?? '');
        save();
      } else {
        process.stdout.write(`\r${phase} ${slug} ${s.status} ${s.progress ?? 0}%   `);
      }
      await sleep(1200);
    }
    if (pending().length) await sleep(8000);
  }
}

console.log('\n--- driving previews ---');
await drive('preview', 'previewId', true);
console.log('\n--- driving refines ---');
await drive('refine', 'refineId', false);

// 3. Download refined GLBs.
console.log('\n--- downloading ---');
for (const [slug, a] of Object.entries(ASSETS)) {
  const url = a.refineGlb ?? a.previewGlb;
  if (!url) { console.log('no glb for', slug); continue; }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(path.join(OUT, `${slug}.glb`), buf);
  console.log('saved', slug, (buf.length / 1048576).toFixed(1) + 'MB');
}
console.log('done');
