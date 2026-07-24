/** Headless SwiftShader check of the character-creator screen (the non-skip path). */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(20000);

const state = await page.evaluate(() => ({
  text: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
  canvases: document.querySelectorAll('canvas').length,
}));
console.log(JSON.stringify(state, null, 1));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.some((e) => /base_|JSON|failed/i.test(e)) ? 1 : 0);
