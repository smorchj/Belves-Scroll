/** Boot the PRODUCTION build served under the /Belves-Scroll/ subpath and
 *  confirm the game reaches "ready" with no failed asset requests — the check
 *  that the base-path rewrite actually holds end to end. */
import { chromium } from 'playwright';

const url = 'http://localhost:4173/Belves-Scroll/?skip=1';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const failed = [];
page.on('requestfailed', (r) => failed.push(r.url().replace('http://localhost:4173', '')));
page.on('response', (r) => { if (r.status() === 404) failed.push('404 ' + r.url().replace('http://localhost:4173', '')); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const ready = await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 220000, polling: 2000 })
  .then(() => true).catch(() => false);
await page.waitForTimeout(6000);

const stat = await page.evaluate(() => ({
  npcs: window.__game?.npcs?.length ?? 0,
  contextLost: window.__game?.stage?.renderer?.getContext?.().isContextLost?.() ?? null,
  markers: !!window.__game?.questMarkers,
}));
console.log('ready:', ready, '| npcs:', stat.npcs, '| contextLost:', stat.contextLost, '| markers:', stat.markers);
const assetFails = failed.filter((u) => /assets\//.test(u));
console.log('asset 404s / failures:', assetFails.length ? assetFails.slice(0, 12) : 'NONE');
await browser.close();
