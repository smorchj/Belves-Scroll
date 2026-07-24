/**
 * Headless SwiftShader test of the rebuilt creator: open, pick hair, sculpt
 * sliders (hair must conform), confirm, and land in-game as the built player.
 * Captures frames at each step.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)); });
page.on('pageerror', (e) => errors.push('PAGE: ' + String(e).slice(0, 180)));

const grab = async (name) => {
  const d = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    // toDataURL between frames reads a cleared buffer — render synchronously first.
    const cc = window.__creator;
    if (cc?._open) cc.renderer.render(cc.scene, cc.camera);
    else window.__game?.stage?.render?.();
    return c.toDataURL('image/png');
  });
  if (d) writeFileSync(`tools/cc-${name}.png`, Buffer.from(d.split(',')[1], 'base64'));
  console.log(`frame -> tools/cc-${name}.png`);
};

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('text=FORGE A TRAVELLER', { timeout: 60000 });
await page.waitForTimeout(12000);
await grab('neutral');

// Wear a hair style.
await page.click('button:has-text("Mid Length Shag")');
await page.waitForTimeout(6000);
await grab('hair');

// Sculpt: push head/jaw sliders hard so a bad hair conform is obvious.
const moved = await page.evaluate(() => {
  const cc = window.__creator;
  const recipe = cc.recipes[cc.build.base];
  const hit = recipe.sliderNames.filter((n) => /^(headWidth|headScale|jaw|chin|cheek)/.test(n)).slice(0, 8);
  for (const n of hit) cc.build.sliders[n] = /chin|jaw/.test(n) ? -0.9 : 0.9;
  cc._queue(null);
  return hit;
});
console.log('sculpted sliders:', moved);
await page.waitForTimeout(4000);
await grab('sculpted');

// Mars + Assassin Armor: the hairless rule must hide the hair in the preview.
await page.click('button:has-text("Mars")');
await page.waitForTimeout(8000);
await page.click('button:has-text("Mid Length Shag")');
await page.waitForTimeout(5000);
await page.click('button:has-text("Assassin Armor")');
await page.waitForTimeout(5000);
const hairless = await page.evaluate(() => ({
  outfit: window.__creator.build.outfit,
  hairVisible: window.__creator.hairNode?.visible ?? null,
  outfitMeshes: window.__creator._outfitNodes.length,
}));
console.log('assassin check:', JSON.stringify(hairless));
await grab('mars-assassin');

// Back to venus + dress for the final confirm.
await page.click('button:has-text("Venus")');
await page.waitForTimeout(8000);
await page.click('button:has-text("Mid Length Shag")');
await page.waitForTimeout(5000);
await grab('venus-dressed');

// Confirm and enter the game.
await page.click('button:has-text("Confirm")');
try {
  await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 240000, polling: 3000 });
  console.log('game booted with created player');
  await page.waitForTimeout(5000);
  const player = await page.evaluate(() => {
    const g = window.__game;
    g.stage.render();
    let meshes = 0, hair = false, wet = false;
    g.player?.char?.root?.traverse?.((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (/^hair_/.test(o.name)) hair = true;
      if (/wetlayer/i.test(o.name)) wet = true;
    });
    return { meshes, hair, tearlinePresent: wet, keys: Object.keys(g.player ?? {}).slice(0, 8) };
  });
  console.log('player:', JSON.stringify(player));
  await grab('ingame');
} catch (e) {
  console.log('did NOT boot:', await page.evaluate(() => document.body.innerText.slice(0, 250)));
}
console.log('errors:', errors.length ? errors.slice(0, 12) : 'none');
await browser.close();
