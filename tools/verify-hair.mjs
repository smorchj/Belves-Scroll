/** The two newly-pulled hairstyles: each loads on both bases, conforms to a
 *  sculpted skull, and Peble / Hans now build wearing their own hair. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 620, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 240000, polling: 2000 });
await page.waitForTimeout(6000);

const report = await page.evaluate(async () => {
  const F = await import('/src/character/CharacterFactory.js');
  const { HAIR_STYLES } = await import('/src/data/catalog.js');
  const out = { offered: HAIR_STYLES.filter(Boolean), loaded: {}, built: {} };

  // Raw load on both bases.
  for (const style of ['LowBraid', 'LongerBob']) {
    out.loaded[style] = {};
    for (const base of ['venus', 'mars']) {
      try {
        const e = await F.loadHair(style, base);
        out.loaded[style][base] = {
          verts: e.geo?.getAttribute('position')?.count ?? 0,
          coverage: !!e.coverage?.image?.width,
          scalpMask: !!e.scalpMask?.image?.width,
        };
      } catch (err) { out.loaded[style][base] = 'ERR ' + String(err).slice(0, 70); }
    }
  }

  // The two characters that asked for them.
  for (const name of ['Peble', 'Hans']) {
    const root = await F.buildFromRecipe({ recipe: name });
    let hair = 0, hairVerts = 0;
    root.traverse((o) => {
      if (o.isMesh && /^hair_/.test(o.name)) { hair++; hairVerts += o.geometry.getAttribute('position').count; }
    });
    out.built[name] = { hairMeshes: hair, hairVerts };
  }
  return out;
});
console.log(JSON.stringify(report, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');

for (const name of ['Peble', 'Hans']) {
  const shot = await page.evaluate(async (n) => {
    const g = window.__game, T = window.__THREE;
    const F = await import('/src/character/CharacterFactory.js');
    const root = await F.buildFromRecipe({ recipe: n });
    const p = g.hero.root.position;
    root.position.set(p.x + 3, p.y, p.z + 3);
    root.rotation.y = 0;                       // model faces +Z
    g.stage.scene.add(root);
    root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root);
    const c = new T.Vector3(root.position.x, box.max.y - 0.16, root.position.z);
    const cam = g.stage.camera;
    cam.position.set(c.x + 0.12, c.y + 0.02, c.z + 0.72);   // straight in front
    cam.lookAt(c); cam.updateMatrixWorld();
    g.stage.render();
    const url = g.stage.renderer.domElement.toDataURL('image/png');
    root.removeFromParent();
    return url;
  }, name);
  writeFileSync(`tools/hair-${name}.png`, Buffer.from(shot.split(',')[1], 'base64'));
  console.log('portrait ->', `tools/hair-${name}.png`);
}
await browser.close();
