/** Confirm buildings load as THREE.LOD, switch levels by camera distance, and
 *  render the high-detail guild hall up close. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.world && window.__game?.stage, null, { timeout: 180000, polling: 2000 });
await page.waitForTimeout(9000);   // let the settlement finish placing buildings

const report = await page.evaluate(() => {
  const g = window.__game;
  const T = window.__THREE;
  const lods = [];
  g.stage.scene.traverse((o) => { if (o.isLOD) lods.push(o); });

  const detail = lods.map((lod) => {
    const p = lod.getWorldPosition(new T.Vector3());
    const cam = g.stage.camera;
    // near test — matrixWorld must be refreshed after moving the camera
    cam.position.set(p.x + 8, p.y + 4, p.z + 8); cam.updateMatrixWorld();
    lod.update(cam);
    const near = lod.getCurrentLevel();
    // far test
    cam.position.set(p.x + 120, p.y + 40, p.z + 120); cam.updateMatrixWorld();
    lod.update(cam);
    const far = lod.getCurrentLevel();
    const tris = lod.levels.map((l) => {
      let t = 0; l.object.traverse((m) => { if (m.isMesh) t += (m.geometry.index?.count ?? 0) / 3; });
      return Math.round(t);
    });
    return { name: lod.name, levels: lod.levels.length, tris, nearLevel: near, farLevel: far };
  });

  // Frame the guild hall up close for the eyeball test.
  let shot = null;
  const gh = lods.find((l) => l.name === 'lod-guild-hall') ?? lods[0];
  if (gh) {
    const p = gh.getWorldPosition(new T.Vector3());
    const box = new T.Box3().setFromObject(gh);
    const h = box.max.y - box.min.y;
    g.stage.camera.position.set(p.x + h * 0.9, p.y + h * 0.5, p.z + h * 0.9);
    g.stage.camera.lookAt(p.x, p.y + h * 0.35, p.z);
    gh.update(g.stage.camera);
    g.stage.render();
    shot = g.stage.renderer.domElement.toDataURL('image/png');
  }
  return { count: lods.length, detail, shot };
});

console.log('LOD buildings:', report.count);
for (const d of report.detail) {
  console.log(` ${d.name}: ${d.levels} levels, tris=[${d.tris}], near->L${d.nearLevel}, far->L${d.farLevel}`);
}
if (report.shot) {
  writeFileSync('tools/lod-guildhall.png', Buffer.from(report.shot.split(',')[1], 'base64'));
  console.log('frame -> tools/lod-guildhall.png');
}
await browser.close();
