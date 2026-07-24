/**
 * Boot the game in a FRESH headed Chrome process on the real GPU (no
 * SwiftShader). Proves whether game + driver are healthy independently of the
 * user's long-running Chrome instance.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
}).catch(() => chromium.launch({ headless: false }));

const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('PAGE: ' + String(e).slice(0, 160)));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return { webgl2: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { webgl2: true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
});
console.log('GPU:', JSON.stringify(gpu));

try {
  await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 120000, polling: 2000 });
  console.log('game booted, npcs:', await page.evaluate(() => window.__game.npcs.length));
  await page.waitForTimeout(4000);
  const health = await page.evaluate(() => {
    const gl = window.__game.stage.renderer.getContext();
    return { contextLost: gl.isContextLost(), fps: Math.round(window.__game.fps) };
  });
  console.log('health:', JSON.stringify(health));
  const shot = await page.screenshot({ timeout: 30000 }).catch(() => null);
  if (shot) { writeFileSync('tools/realgpu.png', shot); console.log('shot -> tools/realgpu.png'); }
} catch {
  console.log('did NOT boot:', await page.evaluate(() => document.body.innerText.slice(0, 200)));
}
console.log('errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
