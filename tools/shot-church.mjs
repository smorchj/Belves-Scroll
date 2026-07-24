import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 760, height: 840 } });
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.stage, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(9000);
const out = await page.evaluate(() => {
  const g = window.__game, T = window.__THREE;
  let ch = null; g.stage.scene.traverse((o) => { if (o.name === 'heroy-kyrkje') ch = o; });
  if (!ch) return { err: 'church not found' };
  const box = new T.Box3().setFromObject(ch);
  const c = box.getCenter(new T.Vector3()); const h = box.max.y - box.min.y;
  const cam = g.stage.camera;
  cam.position.set(c.x + h * 1.0, box.min.y + h * 0.75, c.z + h * 1.25);
  cam.lookAt(c.x, box.min.y + h * 0.45, c.z);
  cam.updateMatrixWorld(); g.stage.render();
  return { url: g.stage.renderer.domElement.toDataURL('image/png'), h: +h.toFixed(1) };
});
if (out.err) console.log(out.err);
else { writeFileSync('tools/church-inworld.png', Buffer.from(out.url.split(',')[1], 'base64')); console.log('church height:', out.h, 'm -> church-inworld.png'); }
await browser.close();
