/** Peder as a mars source + Bunad as wearable + the beardless-texture exemption. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 620, height: 820 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 180)));
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__game?.stage, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(6000);

const res = await page.evaluate(async () => {
  const T = window.__THREE;
  const F = await import('/src/character/CharacterFactory.js');

  // 1. Registry wiring
  const marsSources = F.RECIPES_BY_BASE.mars;
  const marsOutfits = F.outfitsFor('mars');
  const venusOutfits = F.outfitsFor('venus');

  // 2. Build Peder wearing the Bunad
  const root = await F.buildFromRecipe({ recipe: 'Peder', outfit: 'Bunad' });
  let meshes = 0, outfitMeshes = 0, textured = 0;
  const BASE_COUNTS = [9338, 6162, 626, 480, 7669, 266, 102];
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const n = o.geometry.getAttribute('position').count;
    if (!BASE_COUNTS.includes(n) && !/hair|CardsMesh/i.test(o.name)) outfitMeshes++;
    if (o.material?.map) textured++;
  });
  const box = new T.Box3().setFromObject(root);

  // 3. The beard rule: Peder's texture must now be allowed onto a venus body,
  //    while a bearded mars recipe must still be refused.
  const venusRoot = await F.buildFromRecipe({ recipe: 'Maple' });
  const withPeder = await F.applyHeritage(venusRoot, ['Maple', 'Peder'], [0.5, 0.5], { base: 'venus', geometry: false });
  const venusRoot2 = await F.buildFromRecipe({ recipe: 'Maple' });
  const withHaggar = await F.applyHeritage(venusRoot2, ['Maple', 'Haggar'], [0.5, 0.5], { base: 'venus', geometry: false });

  return {
    pederInMars: marsSources.includes('Peder'),
    bunadOnMars: marsOutfits.includes('Bunad'),
    bunadNotOnVenus: !venusOutfits.includes('Bunad'),
    meshes, outfitMeshes, textured,
    height: +(box.max.y - box.min.y).toFixed(2),
    pederTexIdx: withPeder.texIdx,        // expect [0,1] — Peder allowed
    haggarTexIdx: withHaggar.texIdx,      // expect [0]   — bearded mars refused
  };
});
console.log(JSON.stringify(res, null, 1));

// Death -> respawn must leave the hero upright again.
const revive = await page.evaluate(async () => {
  const g = window.__game, hero = g.hero;
  hero.die();
  for (let i = 0; i < 60; i++) hero.update(0.033);
  const downPitch = +hero.root.rotation.x.toFixed(2);
  await g._respawn();
  for (let i = 0; i < 10; i++) hero.update(0.033);
  return {
    downPitch,
    upPitch: +hero.root.rotation.x.toFixed(2),
    roll: +hero.root.rotation.z.toFixed(2),
    dead: hero.dead, hp: hero.hp,
    deathTimer: hero.animator._deathT,
  };
});
console.log('respawn:', JSON.stringify(revive));

// Portrait of Peder in the bunad
const shot = await page.evaluate(async () => {
  const T = window.__THREE;
  const F = await import('/src/character/CharacterFactory.js');
  const g = window.__game;
  const root = await F.buildFromRecipe({ recipe: 'Peder', outfit: 'Bunad' });
  const p = g.hero.root.position.clone(); p.x += 3;
  root.position.copy(p); root.rotation.y = Math.PI;
  g.stage.scene.add(root); root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root);
  const c = box.getCenter(new T.Vector3()); const h = box.max.y - box.min.y;
  const cam = g.stage.camera;
  cam.position.set(c.x, c.y + h * 0.12, c.z + h * 1.25);
  cam.lookAt(c.x, c.y, c.z); cam.updateMatrixWorld();
  g.stage.render();
  return g.stage.renderer.domElement.toDataURL('image/png');
});
writeFileSync('tools/peder-bunad.png', Buffer.from(shot.split(',')[1], 'base64'));
console.log('-> tools/peder-bunad.png');
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
await browser.close();
