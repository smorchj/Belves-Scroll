/** Close-ups of a Peasant-farmer-wearing character, standing and mid-stride —
 *  skinning only shows itself under deformation. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 620, height: 800 } });
page.on('pageerror', (e) => console.log('[err]', String(e).slice(0, 160)));
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(8000);

const out = await page.evaluate(async () => {
  const g = window.__game, T = window.__THREE;
  const npc = g.npcs.find((n) => n.def?.id === 'charles');
  if (!npc?.char) return { err: 'charles not found' };
  const root = npc.char.root;
  // Confirm the outfit mesh is actually present and skinned.
  let outfitMeshes = 0, skinned = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.geometry.getAttribute('position').count;
    if (![9338, 6162, 626, 480, 7669, 266, 102].includes(n)) outfitMeshes++;
    if (o.isSkinnedMesh) skinned++;
  });

  const frame = (label, speed) => {
    // Drive the animator so the rig deforms, then frame the body.
    for (let i = 0; i < 40; i++) npc.char.animator.update(0.033, speed);
    root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root);
    const c = box.getCenter(new T.Vector3());
    const h = box.max.y - box.min.y;
    const cam = g.stage.camera;
    cam.position.set(c.x + h * 1.15, c.y + h * 0.12, c.z + h * 1.15);
    cam.lookAt(c.x, c.y, c.z);
    cam.updateMatrixWorld();
    g.stage.render();
    return g.stage.renderer.domElement.toDataURL('image/png');
  };

  return { outfitMeshes, skinned, stand: frame('stand', 0), run: frame('run', 4.4) };
});

if (out.err) console.log(out.err);
else {
  writeFileSync('tools/peasant-stand.png', Buffer.from(out.stand.split(',')[1], 'base64'));
  writeFileSync('tools/peasant-run.png', Buffer.from(out.run.split(',')[1], 'base64'));
  console.log(`outfit meshes: ${out.outfitMeshes} | skinned meshes: ${out.skinned} -> peasant-stand.png, peasant-run.png`);
}
await browser.close();
