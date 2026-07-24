import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.world && window.__game?.stage, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(12000);

const shots = await page.evaluate(() => {
  const g = window.__game, T = window.__THREE;
  let church = null; g.stage.scene.traverse((o) => { if (o.name === 'heroy-kyrkje') church = o; });
  const c = church ? church.getWorldPosition(new T.Vector3()) : g.hero.root.position.clone();
  const cam = g.stage.camera;
  const take = () => { cam.updateMatrixWorld(); g.stage.render(); return g.stage.renderer.domElement.toDataURL('image/png'); };
  const out = {};
  cam.position.set(c.x + 50, c.y + 95, c.z + 110); cam.lookAt(c.x, c.y, c.z - 25); out.aerial = take();
  cam.position.set(c.x + 15, c.y + 9, c.z + 17); cam.lookAt(c.x, c.y + 6, c.z); out.church = take();
  // market/well area is ~t300; drop the camera near the hero and look around
  const h = g.hero.root.position;
  cam.position.set(h.x + 12, h.y + 7, h.z + 12); cam.lookAt(h.x, h.y + 1, h.z); out.ground = take();
  return out;
});
for (const [k, v] of Object.entries(shots)) {
  writeFileSync(`tools/village-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
  console.log('shot', k);
}
await browser.close();
