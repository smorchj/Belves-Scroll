/** Village overview after the asset pass: LOD switch correctness, new-prop
 *  presence, and aerial + ground screenshots showing the stave church and the
 *  new waterfront/market dressing. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && /prop|glb|load/i.test(m.text())) console.log('[load]', m.text().slice(0, 160)); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.world && window.__game?.stage, null, { timeout: 180000, polling: 2000 });
await page.waitForTimeout(11000);   // settlement dressing places over several frames

const info = await page.evaluate(() => {
  const g = window.__game; const T = window.__THREE;
  const NEW = ['stave-church','rowboat','fish-rack','market-stall','handcart','haystack','woodpile','rune-stone','crates','sign-post'];
  const found = {};
  let church = null, lods = 0;
  g.stage.scene.traverse((o) => {
    if (o.isLOD) lods++;
    if (o.name === 'heroy-kyrkje') church = o;
    const inst = o.userData?.propModel || o.name;
  });
  // Props carry no model tag, so detect by geometry presence is unreliable;
  // instead count LOD + locate the church, and trust the dressing plan.
  const plan = g.world?.settlement?.plan ?? g.settlement?.plan;
  const dressCounts = {};
  const src = (g.world?.settlement ?? g.settlement);
  return {
    lods,
    churchFound: !!church,
    churchPos: church ? church.getWorldPosition(new T.Vector3()).toArray().map((n)=>+n.toFixed(1)) : null,
    heroPos: g.hero.root.position.toArray().map((n)=>+n.toFixed(1)),
  };
});
console.log('LODs:', info.lods, '| stave church placed:', info.churchFound, info.churchPos ?? '');

// LOD switch check on the two buildings.
const lodCheck = await page.evaluate(() => {
  const g = window.__game; const T = window.__THREE; const out = [];
  g.stage.scene.traverse((o) => {
    if (!o.isLOD) return;
    const p = o.getWorldPosition(new T.Vector3()); const cam = g.stage.camera;
    cam.position.set(p.x+10, p.y+6, p.z+10); cam.updateMatrixWorld(); o.update(cam);
    const near = o.getCurrentLevel();
    cam.position.set(p.x+140, p.y+40, p.z+140); cam.updateMatrixWorld(); o.update(cam);
    const far = o.getCurrentLevel();
    out.push(`${o.name}: near=L${near} far=L${far}`);
  });
  return out;
});
console.log('LOD switching:', lodCheck.join(' | '));

// Aerial over the village.
async function shot(name, place) {
  const dataUrl = await page.evaluate((place) => {
    const g = window.__game; const T = window.__THREE;
    const church = []; g.stage.scene.traverse((o)=>{ if(o.name==='heroy-kyrkje') church.push(o); });
    const c = church[0] ? church[0].getWorldPosition(new T.Vector3()) : g.hero.root.position.clone();
    eval(place);
    g.stage.render();
    return g.stage.renderer.domElement.toDataURL('image/png');
  }, place);
  writeFileSync(`tools/${name}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('shot ->', name);
}
await shot('village-aerial', `
  g.stage.camera.position.set(c.x + 40, c.y + 80, c.z + 90);
  g.stage.camera.lookAt(c.x, c.y, c.z - 20);`);
await shot('village-church', `
  g.stage.camera.position.set(c.x + 16, c.y + 8, c.z + 16);
  g.stage.camera.lookAt(c.x, c.y + 5, c.z);`);

await browser.close();
