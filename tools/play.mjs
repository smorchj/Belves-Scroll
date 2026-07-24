/** Open the game in a fresh Chrome window on the real GPU and leave it open. */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5199/';
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--start-maximized'],
}).catch(() => chromium.launch({ headless: false, args: ['--start-maximized'] }));

const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('game window open — close the browser window to end');
// Keep the process alive until the window is closed by the user.
await new Promise((resolve) => browser.on('disconnected', resolve));
