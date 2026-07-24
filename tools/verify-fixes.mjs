/** Boot check for the fix pass: no errors, containers registered, quest markers
 *  resolve a target once a quest is active, and the church now towers. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.world && window.__game?.questMarkers, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(10000);

const report = await page.evaluate(() => {
  const g = window.__game, T = window.__THREE;
  // Containers
  const containers = g.world.containers();
  const lootables = g.lootables.length;
  // Quest markers: accept the first quest and resolve its target
  let targets0 = g._questTargets().length;
  const started = g.journal.start('the-quiet-furrow');
  const activeCount = g.journal.active.size;
  const obj = g.journal.stageOf?.('the-quiet-furrow')?.objective;
  const poiHit = obj ? !!(g.world.anchor(obj.target) ?? g.world.poi(obj.target)?.position) : null;
  const accepted = `start=${started} active=${activeCount} obj=${obj?.type}:${obj?.target} poiHit=${poiHit}`;
  const targets = g._questTargets();
  g.questMarkers.update(0.016, targets);
  let visible = 0; g.questMarkers.group.traverse((o) => { if (o.isSprite && o.visible) visible++; });
  // Church
  let ch = null; g.stage.scene.traverse((o) => { if (o.name === 'heroy-kyrkje') ch = o; });
  let churchH = null;
  if (ch) { const b = new T.Box3().setFromObject(ch); churchH = +(b.max.y - b.min.y).toFixed(1); }
  return {
    containers: containers.length,
    containerKinds: [...new Set(containers.map((c) => c.kind))],
    lootables,
    targetsBefore: targets0, accepted, targetsAfter: targets.length, markerSprites: visible,
    churchH,
  };
});
console.log(JSON.stringify(report, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');

// Church silhouette at new scale.
const shot = await page.evaluate(() => {
  const g = window.__game, T = window.__THREE;
  let ch = null; g.stage.scene.traverse((o) => { if (o.name === 'heroy-kyrkje') ch = o; });
  if (!ch) return null;
  const b = new T.Box3().setFromObject(ch); const c = b.getCenter(new T.Vector3()); const h = b.max.y - b.min.y;
  const cam = g.stage.camera;
  cam.position.set(c.x + h * 1.1, b.min.y + h * 0.6, c.z + h * 1.35);
  cam.lookAt(c.x, b.min.y + h * 0.45, c.z); cam.updateMatrixWorld();
  g.stage.render();
  return g.stage.renderer.domElement.toDataURL('image/png');
});
if (shot) { writeFileSync('tools/church-scaled.png', Buffer.from(shot.split(',')[1], 'base64')); console.log('-> tools/church-scaled.png'); }
await browser.close();
