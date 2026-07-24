/** Peble / Kristine / Hans as blend sources: each builds, each is offered by the
 *  creator on the right base, Hans's beardless map reaches venus, and the two
 *  missing hair styles degrade to bald instead of failing the build. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 640, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 240000, polling: 2000 });
await page.waitForTimeout(6000);

const report = await page.evaluate(async () => {
  const T = window.__THREE;
  const F = await import('/src/character/CharacterFactory.js');
  const out = { offered: { venus: [], mars: [] }, built: {}, texRules: {} };
  for (const b of ['venus', 'mars']) {
    out.offered[b] = F.RECIPES_BY_BASE[b].filter((n) => ['Peble', 'Kristine', 'Hans'].includes(n));
  }

  // Build each one standalone and measure it.
  for (const name of ['Peble', 'Kristine', 'Hans']) {
    try {
      const recipe = await F.loadRecipe(name);
      const root = await F.buildFromRecipe({ recipe: name });
      let meshes = 0, textured = 0, hair = 0;
      root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        if (o.material?.map) textured++;
        if (/^hair_|CardsMesh/.test(o.name)) hair++;
      });
      const box = new T.Box3().setFromObject(root);
      out.built[name] = {
        base: recipe.baseMesh, meshes, textured, hair,
        height: +(box.max.y - box.min.y).toFixed(2),
      };
    } catch (e) { out.built[name] = { error: String(e).slice(0, 120) }; }
  }

  // The one-way texture rule, exercised the way the creator does: blend a
  // venus parent with a mars one onto a venus body. texIdx lists which parents
  // were allowed to contribute a skin map — beardless Hans should appear,
  // bearded Haggar should not.
  for (const [label, mars] of [['hans', 'Hans'], ['haggar', 'Haggar']]) {
    try {
      const body = await F.buildFromRecipe({ recipe: 'Maple' });
      const res = await F.applyHeritage(body, ['Maple', mars], [0.5, 0.5], { base: 'venus' });
      out.texRules[label] = res?.texIdx ?? null;
    } catch (e) { out.texRules[label] = 'ERR ' + String(e).slice(0, 80); }
  }
  return out;
});

console.log(JSON.stringify(report, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 6) : 'none');

// Portrait of each new face for the eyeball test.
for (const name of ['Peble', 'Kristine', 'Hans']) {
  const shot = await page.evaluate(async (n) => {
    const g = window.__game, T = window.__THREE;
    const F = await import('/src/character/CharacterFactory.js');
    const root = await F.buildFromRecipe({ recipe: n });
    const p = g.hero.root.position;
    root.position.set(p.x + 3, p.y, p.z + 3);
    root.rotation.y = Math.PI * 0.85;
    g.stage.scene.add(root);
    root.updateMatrixWorld(true);
    let head = null;
    root.traverse((o) => { if (o.isMesh && /GEO-head/.test(o.name)) head = o; });
    const box = new T.Box3().setFromObject(root);
    const top = box.max.y;
    const c = new T.Vector3(root.position.x, top - 0.14, root.position.z);
    const cam = g.stage.camera;
    cam.position.set(c.x + 0.62, c.y + 0.04, c.z + 0.62);
    cam.lookAt(c); cam.updateMatrixWorld();
    g.stage.render();
    const url = g.stage.renderer.domElement.toDataURL('image/png');
    root.removeFromParent();
    return url;
  }, name);
  writeFileSync(`tools/base-${name}.png`, Buffer.from(shot.split(',')[1], 'base64'));
  console.log('portrait ->', `tools/base-${name}.png`);
}
await browser.close();
