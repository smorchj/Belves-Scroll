/** Headless: complete the creator with defaults and start the game — the flow the user runs. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => errors.push('PAGE: ' + String(e).slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(15000);

// Find the button that finishes the creator.
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll('button, .btn, [role=button]')].map((b) => b.textContent.trim()).filter(Boolean));
console.log('buttons:', buttons.slice(0, 20));

const started = await page.evaluate(() => {
  const all = [...document.querySelectorAll('button, .btn, [role=button]')];
  const b = all.find((x) => /confirm|begin|start|walk|forge|enter|done|set out/i.test(x.textContent));
  if (b) { b.click(); return b.textContent.trim(); }
  return null;
});
console.log('clicked:', started);

// Wait for the world to spawn.
try {
  await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 240000, polling: 3000 });
  console.log('game booted, npcs:', await page.evaluate(() => window.__game.npcs.length));
} catch {
  console.log('game did NOT boot. body:', await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n/g, ' | ')));
}

const shot = await page.evaluate(() => {
  const g = window.__game;
  if (!g?.stage) return null;
  g.stage.render();
  return g.stage.renderer.domElement.toDataURL('image/png');
});
if (shot) writeFileSync('tools/creator-start.png', Buffer.from(shot.split(',')[1], 'base64'));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
