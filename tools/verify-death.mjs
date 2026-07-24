/** Death → fall → grave, plus the authored run cycle now that the passing pose
 *  is named Running_Mid. Sim-stepped directly so SwiftShader's framerate can't
 *  starve the timers. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'] });
const page = await browser.newPage({ viewport: { width: 760, height: 620 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
page.on('console', (m) => { if (/no authored run cycle/.test(m.text())) errs.push(m.text()); });
await page.goto('http://localhost:5199/?skip=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__game?.npcs?.length > 0, null, { timeout: 220000, polling: 2000 });
await page.waitForTimeout(8000);

// --- run cycle: are the authored keys loaded and does the mid key differ?
const run = await page.evaluate(() => {
  const an = window.__game.hero.animator;
  if (!an._runKeys) return { keys: 0 };
  const bone = 'UpperLegR';
  const q = (k) => an._runKeys[k][bone] ? an._runKeys[k][bone].x.toFixed(3) : 'n/a';
  return { keys: an._runKeys.length, contact: q(0), passing: q(1), mirrorContact: q(2), bones: an._runBones.size };
});
console.log('run cycle:', JSON.stringify(run));

// --- death: kill an NPC and watch it topple, then bury it.
const death = await page.evaluate(async () => {
  const g = window.__game, T = window.__THREE;
  const npc = g.npcs.find((n) => !n.char.dead);
  const ch = npc.char, root = ch.root;
  const headY = () => { const b = new T.Box3().setFromObject(root); return +(b.max.y - b.min.y).toFixed(2); };
  const standingH = headY();
  ch.die();
  const trace = [];
  let shotFallen = null;
  // step the character + grave logic on a fixed clock
  for (let i = 0; i < 60; i++) { ch.update(0.033); }
  const fallenH = headY();                      // lying down => much shorter bbox height
  const pitch = +root.rotation.x.toFixed(2);
  {
    const p = root.position.clone();
    const cam = g.stage.camera;
    cam.position.set(p.x + 3.2, p.y + 1.8, p.z + 3.2); cam.lookAt(p.x, p.y + 0.2, p.z); cam.updateMatrixWorld();
    g.stage.render(); shotFallen = g.stage.renderer.domElement.toDataURL('image/png');
  }
  // now run the grave clock
  for (let i = 0; i < 500 && npc._grave !== 'done'; i++) { ch.update(0.05); g._updateGraves(0.05); }
  // _raiseGrave loads the headstone GLB asynchronously — poll rather than
  // guessing a fixed wait, or a cold asset cache reports a false failure.
  for (let i = 0; i < 120 && npc._grave !== 'done'; i++) await new Promise((r) => setTimeout(r, 100));
  let grave = null;
  g.stage.scene.traverse((o) => { if (o.name === `grave-${npc.id}`) grave = o; });
  let shotGrave = null;
  if (grave) {
    const p = grave.getWorldPosition(new T.Vector3());
    const cam = g.stage.camera;
    cam.position.set(p.x + 2.4, p.y + 1.5, p.z + 2.4); cam.lookAt(p.x, p.y + 0.5, p.z); cam.updateMatrixWorld();
    g.stage.render(); shotGrave = g.stage.renderer.domElement.toDataURL('image/png');
  }
  return {
    npc: npc.def?.name, standingH, fallenH, pitch,
    graveState: npc._grave, graveFound: !!grave, bodyHidden: !root.visible,
    lootOnGrave: g.lootables.some((l) => l.source === ch),
    shotFallen, shotGrave,
  };
});
console.log('death:', JSON.stringify({ ...death, shotFallen: undefined, shotGrave: undefined }));
if (death.shotFallen) writeFileSync('tools/death-fallen.png', Buffer.from(death.shotFallen.split(',')[1], 'base64'));
if (death.shotGrave) writeFileSync('tools/death-grave.png', Buffer.from(death.shotGrave.split(',')[1], 'base64'));
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
await browser.close();
