/** Drive the stave-church regen (preview already submitted) through refine and
 *  download to assets-src/meshy-new/stave-church.glb. */
import fs from 'fs';
const KEY = process.env.MESHY_KEY;
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const previewId = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (id) => (await fetch(`${API}/${id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
async function post(body) {
  const r = await fetch(API, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function wait(id, label) {
  for (;;) {
    const s = await get(id);
    if (s.status === 'SUCCEEDED') return s;
    if (s.status === 'FAILED') throw new Error(`${label} failed: ${s.task_error?.message}`);
    process.stdout.write(`\r${label} ${s.status} ${s.progress ?? 0}%   `);
    await sleep(6000);
  }
}
await wait(previewId, 'preview');
console.log('\npreview done, refining...');
const { result: refineId } = await post({ mode: 'refine', preview_task_id: previewId, enable_pbr: true });
const done = await wait(refineId, 'refine');
const url = done.model_urls?.glb;
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.writeFileSync('assets-src/meshy-new/stave-church.glb', buf);
console.log('\nsaved stave-church.glb', (buf.length / 1048576).toFixed(1) + 'MB');
