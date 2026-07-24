/** Boot headless, measure JS heap after full spawn, close-up the shrunk
 *  legacy characters to prove their faces survived the texture re-encode. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 180000, polling: 2000 });
await page.waitForTimeout(15000);   // let late spawns + caches settle

const stats = await page.evaluate(() => {
  const g = window.__game;
  const m = performance.memory;
  return {
    heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null,
    heapLimitMB: m ? Math.round(m.jsHeapSizeLimit / 1048576) : null,
    textures: g.stage.renderer.info.memory.textures,
    geometries: g.stage.renderer.info.memory.geometries,
    contextLost: g.stage.renderer.getContext().isContextLost(),
  };
});
console.log('after spawn:', JSON.stringify(stats));

for (const id of ['miriam', 'makal']) {
  const shot = await page.evaluate((npcId) => {
    const g = window.__game;
    const npc = g.npcs.find((n) => n.def?.id === npcId);
    if (!npc?.char) return null;
    const head = new window.__THREE.Vector3();
    npc.char.headPosition(head);
    const fwd = npc.char.root.getWorldDirection(new window.__THREE.Vector3()).normalize();
    g.stage.camera.position.copy(head).addScaledVector(fwd, 1.1);
    g.stage.camera.position.y = head.y + 0.03;
    g.stage.camera.lookAt(head);
    g.stage.render();
    return g.stage.renderer.domElement.toDataURL('image/png');
  }, id);
  if (!shot) { console.log(`closeup ${id}: not found`); continue; }
  writeFileSync(`tools/legacy-${id}.png`, Buffer.from(shot.split(',')[1], 'base64'));
  console.log(`closeup -> tools/legacy-${id}.png`);
}
await browser.close();
