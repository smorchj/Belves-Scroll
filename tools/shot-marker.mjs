import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.questMarkers, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(9000);
const out = await page.evaluate(() => {
  const g = window.__game, T = window.__THREE;
  g.journal.start('the-quiet-furrow');
  // jump to the 'talk to charles' stage so the beacon sits over a nearby NPC
  const q = g.journal.active.get('the-quiet-furrow'); if (q) q.stage = 2;
  const targets = g._questTargets();
  g.questMarkers.update(0.016, targets);
  if (!targets.length) return { err: 'no targets' };
  const t = targets[0];
  const cam = g.stage.camera;
  cam.position.set(t.x + 6, t.y + 3.4, t.z + 6);
  cam.lookAt(t.x, t.y + 2.2, t.z);
  cam.updateMatrixWorld();
  g.questMarkers.update(0.016, g._questTargets());
  g.stage.render();
  return { url: g.stage.renderer.domElement.toDataURL('image/png'), obj: `${targets.length} target(s)` };
});
if (out.err) console.log(out.err);
else { writeFileSync('tools/quest-marker.png', Buffer.from(out.url.split(',')[1], 'base64')); console.log('marker shot:', out.obj, '-> quest-marker.png'); }
await browser.close();
