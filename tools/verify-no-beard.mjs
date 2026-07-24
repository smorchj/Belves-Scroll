/**
 * The one-way texture rule: male maps never land on a venus body (geometry
 * still does); mars takes any map. Three scenarios, screenshots + material
 * introspection.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const grab = async (name) => {
  const d = await page.evaluate(() => {
    const cc = window.__creator;
    cc.renderer.render(cc.scene, cc.camera);
    return document.querySelector('canvas').toDataURL('image/png');
  });
  writeFileSync(`tools/beard-${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
  console.log(`frame -> tools/beard-${name}.png`);
};
const pick = async (key, name) => {
  await page.evaluate(([k, n]) => {
    const sel = window.__creator.treeSelects[k];
    sel.value = n; sel.dispatchEvent(new Event('change'));
  }, [key, name]);
  await page.waitForTimeout(9000);
};
const headInfo = () => page.evaluate(() => {
  const cc = window.__creator;
  const m = cc.headMesh.material;
  return {
    texBlend: !!m.userData.__texBlend,
    weights: m.userData.blendWeights ? m.userData.blendWeights.toArray().map((x) => +x.toFixed(2)) : null,
    rigTexIdx: cc._heritageRig?.texIdx ?? null,
    texApplied: cc._heritageRig?.texApplied ?? null,
    heritage: cc.build.heritage,
  };
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('text=FORGE A TRAVELLER', { timeout: 60000 });
await page.waitForTimeout(12000);
await page.evaluate(() => { window.__creator.orbit.dist *= 0.5; });

// 1: venus, Charles (male) + Mildrid (female), father-weighted 75/25.
await pick('gff', 'Charles');
await pick('gmf', 'Mildrid');
await page.evaluate(async () => {
  const cc = window.__creator;
  cc.tree.fBal = 0.25;   // 75% grandfather
  await cc._applyTreeWeights();
});
await page.waitForTimeout(1500);
console.log('1) venus Charles75/Mildrid25:', JSON.stringify(await headInfo()));
await grab('venus-male-heavy');

// 2: venus, males only (Charles + Snader) — no female texture exists.
await pick('gmf', '');
await pick('gfm', 'Snader');
console.log('2) venus all-male:', JSON.stringify(await headInfo()));
await grab('venus-all-male');

// 3: mars body with a venus grandmother — her map IS allowed.
await page.click('button:has-text("Mars")');
await page.waitForTimeout(10000);
await pick('gmf', 'Kari');
console.log('3) mars w/ female tex:', JSON.stringify(await headInfo()));
await grab('mars-mixed');

console.log('errors:', errors.length ? errors.slice(0, 8) : 'none');
await browser.close();
