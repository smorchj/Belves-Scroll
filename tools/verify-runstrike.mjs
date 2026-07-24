/**
 * Verify the authored run cycle (Running + Running_caMid + mirrors) and the
 * one-hand strike/follow-through sequence, headless under SwiftShader.
 *
 * All simulation stepping happens inside single synchronous evaluate() calls
 * so the page's own (SwiftShader-slow) rAF loop can never interleave a
 * speed=0 frame into the middle of a sample run.
 *
 *   node tools/verify-runstrike.mjs [url]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5199/?skip=1';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--disable-gpu-watchdog', '--js-flags=--max-old-space-size=4096'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

console.log('loading', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__game?.hero?.animator, null, { timeout: 180000, polling: 2000 });

// The run keys load async from poses.json — wait until the animator has them.
await page.waitForFunction(() => !!window.__game.hero.animator._runKeys, null, { timeout: 30000, polling: 500 });

// ---------------------------------------------------------------- run cycle
const run = await page.evaluate(() => {
  const g = window.__game;
  const an = g.hero.animator;
  const rig = an.rig;
  const angle = (q) => q ? 2 * Math.acos(Math.min(1, Math.abs(q.w))) : 0;

  const samples = [];
  let shot = null;
  for (let i = 0; i < 160; i++) {
    an.update(0.033, 4.2);
    if (i % 8 === 0) {
      const phase = ((an.walkPhase / (Math.PI * 2)) % 1 + 1) % 1;
      const legR = rig.holds.get('UpperLegR');
      const legL = rig.holds.get('UpperLegL');
      const armR = rig.holds.get('UpperArmR');
      samples.push({
        i, runF: +an._runF.toFixed(3), phase: +phase.toFixed(3),
        legR: +angle(legR).toFixed(3), legRx: legR ? +legR.x.toFixed(3) : 0,
        legL: +angle(legL).toFixed(3), armR: +angle(armR).toFixed(3),
      });
    }
    // Mid-stride frame for the eyeball test.
    if (i === 120) {
      const hips = rig.bones.get('Hips');
      const p = hips.getWorldPosition(new window.__THREE.Vector3());
      g.stage.camera.position.set(p.x + 2.6, p.y + 0.5, p.z + 1.4);
      g.stage.camera.lookAt(p);
      g.stage.render();
      shot = g.stage.renderer.domElement.toDataURL('image/png');
    }
  }

  // Forward-lean check: head ahead of hips along the facing direction.
  const head = rig.bones.get('Head').getWorldPosition(new window.__THREE.Vector3());
  const hip = rig.bones.get('Hips').getWorldPosition(new window.__THREE.Vector3());
  const fwd = new window.__THREE.Vector3();
  g.hero.root.getWorldDirection(fwd);
  const lean = head.sub(hip).dot(fwd);

  // Wind down to a stop — the holds must clear.
  for (let i = 0; i < 90; i++) an.update(0.033, 0);
  const cleared = !rig.holds.get('UpperLegR') && !rig.holds.get('UpperLegL');

  return { samples, lean: +lean.toFixed(3), cleared, shot };
});

console.log('\nRUN CYCLE  (speed 4.2, phase = fraction of stride cycle)');
for (const s of run.samples) {
  console.log(` step ${String(s.i).padStart(3)}  runF=${s.runF}  phase=${s.phase}  legR=${s.legR} (x ${s.legRx})  legL=${s.legL}  armR=${s.armR}`);
}
console.log(` forward lean (head ahead of hips): ${run.lean} m`);
console.log(` holds cleared at stop: ${run.cleared}`);
if (run.shot) {
  writeFileSync('tools/run-midstride.png', Buffer.from(run.shot.split(',')[1], 'base64'));
  console.log(' frame -> tools/run-midstride.png');
}

// ------------------------------------------------------- one-hand strike
const strike = await page.evaluate(async () => {
  const g = window.__game;
  const hero = g.hero;
  if (!hero.equipped.mainhand || hero.equipped.mainhand.twoHanded) {
    const { ITEMS_BY_ID } = await import('/src/data/items.js');
    await hero.equip('mainhand', ITEMS_BY_ID['iron-sword']);
  }
  return {
    style: hero._combat?.style,
    poses: hero._combat ? Object.entries(hero._combat.poses).map(([k, v]) => `${k}:${v ? 'ok' : 'MISSING'}`) : null,
  };
});
console.log('\nSTRIKE  combat style:', strike.style, ' poses:', strike.poses?.join(' '));

for (const kind of ['attack', 'attackHeavy']) {
  const res = await page.evaluate((kind) => {
    const g = window.__game;
    const hero = g.hero;
    const rig = hero.animator.rig;
    const angle = (q) => q ? 2 * Math.acos(Math.min(1, Math.abs(q.w))) : 0;

    // Finish any previous swing first.
    for (let i = 0; i < 200 && hero.poseDriver.busy; i++) { hero.poseDriver.update(0.02); hero.animator.update(0.02, 0); }

    const ok = hero.attack(kind);
    const curve = [];
    const shots = {};
    let step = 0;
    while (hero.poseDriver.busy && step < 400) {
      hero.poseDriver.update(0.02);
      hero.animator.update(0.02, 0);
      step++;
      if (step % 3 === 0) curve.push(+angle(rig.holds.get('UpperArmR')).toFixed(3));
      // Capture the frame right as the strike phase ends (~peak extension).
      const remaining = hero.poseDriver.seq?.length ?? 0;
      if (kind === 'attack' && remaining === 2 && !shots.strike) {
        const p = rig.bones.get('Hips').getWorldPosition(new window.__THREE.Vector3());
        g.stage.camera.position.set(p.x + 2.4, p.y + 0.45, p.z - 1.6);
        g.stage.camera.lookAt(p);
        g.stage.render();
        shots.strike = g.stage.renderer.domElement.toDataURL('image/png');
      }
    }
    return { ok, steps: step, curve, shots };
  }, kind);

  console.log(` ${kind}: played=${res.ok} steps=${res.steps} (${(res.steps * 0.02).toFixed(2)}s)`);
  console.log(`   UpperArmR angle curve: ${res.curve.filter((_, i) => i % 2 === 0).join(' → ')}`);
  if (res.shots.strike) {
    writeFileSync('tools/strike-onehand.png', Buffer.from(res.shots.strike.split(',')[1], 'base64'));
    console.log('   frame -> tools/strike-onehand.png');
  }
}

await browser.close();
