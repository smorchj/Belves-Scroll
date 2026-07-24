/**
 * Boot the game headless under SwiftShader (pure software WebGL — never touches
 * the real GPU/driver) and audit the recipe cast: context health, per-NPC mesh,
 * hair and outfit state, plus a screenshot for the eyeball test.
 *
 *   node tools/verify-cast.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/?skip=1';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

console.log('loading', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 180000, polling: 2000 });
// Let a few frames render after spawn.
await page.waitForTimeout(8000);

const audit = await page.evaluate(() => {
  const g = window.__game;
  const gl = g.stage.renderer.getContext();
  const report = [];
  for (const npc of g.npcs) {
    const ch = npc.char;
    let meshes = 0, hair = false, outfit = 0, tex = 0;
    ch?.root?.traverse?.((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (/^hair_|CardsMesh/.test(o.name) && o.visible) hair = true;
      if (o.material?.map) tex++;
      const n = o.geometry.getAttribute('position').count;
      if (!/^hair_|CardsMesh/.test(o.name) && ![9338, 6162, 626, 480, 7669, 266, 102].includes(n)) outfit++;
    });
    report.push({ name: npc.def?.name, model: npc.def?.model, meshes, tex, hair, outfit });
  }
  return {
    contextLost: gl.isContextLost(),
    buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    npcs: report,
    memory: { geometries: g.stage.renderer.info.memory.geometries, textures: g.stage.renderer.info.memory.textures },
    programs: g.stage.renderer.info.programs?.length,
  };
});

console.log(JSON.stringify({ ...audit, npcs: undefined }, null, 1));
console.log('NPC audit:');
for (const n of audit.npcs) {
  console.log(` ${n.name} (${n.model}) meshes=${n.meshes} tex=${n.tex} outfit=${n.outfit} ${n.hair ? 'HAIR' : 'bald'}`);
}

// page.screenshot waits for the compositor, which never settles under
// SwiftShader — read the canvas back directly after a forced render instead.
const dataUrl = await page.evaluate(() => {
  const g = window.__game;
  g.stage.render();
  return g.stage.renderer.domElement.toDataURL('image/png');
});
const { writeFileSync } = await import('fs');
writeFileSync('tools/verify-cast.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('frame -> tools/verify-cast.png', dataUrl.length, 'chars');

// Face close-ups: park the camera 1.2m in front of each requested NPC's head.
const closeups = (process.env.CLOSEUP ?? '').split(',').filter(Boolean);
for (const id of closeups) {
  const shot = await page.evaluate((npcId) => {
    const g = window.__game;
    const npc = g.npcs.find((n) => n.def?.id === npcId);
    if (!npc) return null;
    const head = new (Object.getPrototypeOf(npc.char.position).constructor)();
    npc.char.headPosition(head);
    const fwd = npc.char.root.getWorldDirection(head.clone()).normalize();
    g.stage.camera.position.copy(head).addScaledVector(fwd, 1.2);
    g.stage.camera.position.y = head.y + 0.05;
    g.stage.camera.lookAt(head);
    g.stage.render();
    return g.stage.renderer.domElement.toDataURL('image/png');
  }, id);
  if (!shot) { console.log(`closeup ${id}: NPC not found`); continue; }
  writeFileSync(`tools/closeup-${id}.png`, Buffer.from(shot.split(',')[1], 'base64'));
  console.log(`closeup -> tools/closeup-${id}.png`);
}
await browser.close();
