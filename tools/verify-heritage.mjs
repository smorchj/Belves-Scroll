/**
 * Headless SwiftShader test of the family-tree heritage: four cross-base
 * grandparents on a venus body, three live balance sliders, sliders on top,
 * and the confirmed build carrying the 4-way blend into the game.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('PAGE: ' + String(e).slice(0, 160)));

const grab = async (name) => {
  const d = await page.evaluate(() => {
    const cc = window.__creator;
    cc.renderer.render(cc.scene, cc.camera);
    return document.querySelector('canvas').toDataURL('image/png');
  });
  writeFileSync(`tools/tree-${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
  console.log(`frame -> tools/tree-${name}.png`);
};
const pick = async (key, name) => {
  await page.evaluate(([k, n]) => {
    const sel = window.__creator.treeSelects[k];
    sel.value = n;
    sel.dispatchEvent(new Event('change'));
  }, [key, name]);
  await page.waitForTimeout(9000);
};

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('text=FORGE A TRAVELLER', { timeout: 60000 });
await page.waitForTimeout(12000);
await page.evaluate(() => { window.__creator.orbit.dist *= 0.55; });
await grab('neutral');

// Four grandparents, both casts, on the venus body.
await pick('gff', 'Charles');
await pick('gmf', 'Maple');
await pick('gfm', 'Snader');
await pick('gmm', 'Kari');
console.log('heritage:', await page.evaluate(() => JSON.stringify(window.__creator.build.heritage)));
await grab('four-way');

// Drive all three balance sliders live — no reloads on this path.
const t0 = Date.now();
await page.evaluate(async () => {
  const cc = window.__creator;
  for (let i = 0; i <= 10; i++) {
    cc.tree.side = i / 10;
    cc.tree.fBal = 1 - i / 10;
    cc.tree.mBal = i / 10;
    await cc._applyTreeWeights();
    await new Promise((r) => requestAnimationFrame(r));
  }
  cc.tree.side = 0.7; cc.tree.fBal = 0.3; cc.tree.mBal = 0.6;
  await cc._applyTreeWeights();
});
console.log('33 live weight updates in', Date.now() - t0, 'ms (no reloads)');
await page.waitForTimeout(1500);
console.log('label:', await page.evaluate(() => window.__creator._heritageLabel()));
await grab('rebalanced');

// Father's side only (mother slots emptied) — 2-ancestor edge.
await pick('gfm', '');
await pick('gmm', '');
console.log('two-ancestor heritage:', await page.evaluate(() => JSON.stringify(window.__creator.build.heritage)));
await grab('father-side');

// Confirm into the game.
await page.click('button:has-text("Confirm")');
try {
  await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 240000, polling: 3000 });
  const check = await page.evaluate(() => {
    let blendMats = 0;
    window.__game.player.char.root.traverse((o) => {
      if (o.isMesh && o.material?.customProgramCacheKey?.() === 'recipe-texblend4') blendMats++;
    });
    return { blendMats };
  });
  console.log('in-game player blended materials:', JSON.stringify(check));
} catch { console.log('did NOT boot'); }
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
