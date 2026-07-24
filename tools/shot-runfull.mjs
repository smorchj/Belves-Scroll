/** Side-on frames of the authored run at full-stride and passing phases. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__game?.hero?.animator?._runKeys, null, { timeout: 180000, polling: 2000 });

const shots = await page.evaluate(() => {
  const g = window.__game;
  const an = g.hero.animator;
  const rig = an.rig;
  const T = window.__THREE;

  // Spin up to full runF first.
  for (let i = 0; i < 80; i++) an.update(0.033, 4.2);

  const capture = (targetPhase) => {
    // Step until the cycle phase lands near the target.
    for (let i = 0; i < 400; i++) {
      an.update(0.008, 4.2);
      const phase = ((an.walkPhase / (Math.PI * 2)) % 1 + 1) % 1;
      if (Math.abs(phase - targetPhase) < 0.012) break;
    }
    const p = rig.bones.get('Hips').getWorldPosition(new T.Vector3());
    const fwd = new T.Vector3();
    g.hero.root.getWorldDirection(fwd);
    // Side-on: camera along the axis perpendicular to facing.
    const side = new T.Vector3(-fwd.z, 0, fwd.x).normalize();
    g.stage.camera.position.copy(p).addScaledVector(side, 3.1);
    g.stage.camera.position.y = p.y + 0.35;
    g.stage.camera.lookAt(p);
    g.stage.render();
    return g.stage.renderer.domElement.toDataURL('image/png');
  };

  return { full: capture(0.0), pass: capture(0.21) };
});

writeFileSync('tools/run-fullstride.png', Buffer.from(shots.full.split(',')[1], 'base64'));
writeFileSync('tools/run-passing.png', Buffer.from(shots.pass.split(',')[1], 'base64'));
console.log('wrote tools/run-fullstride.png + tools/run-passing.png');
await browser.close();
