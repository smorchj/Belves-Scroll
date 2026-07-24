import * as THREE from 'three';

/**
 * Plays hand-authored poses (pose-tool.html) as combat motion with real game
 * feel. A pose is a set of per-bone LOCAL deltas from rest; the driver blends
 * between them as persistent rig holds, riding on top of the procedural
 * animator (whose own arm motion is damped while a pose owns those bones).
 *
 * Feel comes from the phase shaping, never from a straight lerp:
 *
 *   windup   — ease-OUT into the anticipation (fast leave, settles loaded)
 *   hold     — a beat at full load, so the eye registers the threat
 *   release  — explosive from the first frame, overshooting PAST the target
 *              and springing back (easeOutBack) — the whip of a real cut
 *   recover  — long, soft sine settle back to the stance
 */

const IDENT = new THREE.Quaternion();
const _q = new THREE.Quaternion();

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
/** Explosive start, ~12% overshoot past the target, springs back to it. */
const easeOutBack = (t) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class PoseDriver {
  constructor(rig) {
    this.rig = rig;
    this.baseline = null;      // {name: Quaternion} — the resting stance/grip
    this.bones = new Set();    // union of bones the active style touches
    this._baselineBones = new Set();
    this.seq = null;           // remaining phases of the active swing
    this._from = null;
    this._t = 0;
  }

  get busy() { return !!this.seq; }

  /**
   * Adopt a wield style: the baseline pose (stance/grip) plus every attack
   * pose it can play, so suppression and holds cover the right bone set.
   */
  setStyle(baseline, attackPoses = []) {
    this.clearStyle();
    this.baseline = baseline ?? {};
    this._baselineBones = new Set(Object.keys(this.baseline));
    for (const p of [this.baseline, ...attackPoses.filter(Boolean)]) {
      for (const n of Object.keys(p)) this.bones.add(n);
    }
    this._setSuppression(false);
    this._writeStatic(this.baseline);
  }

  clearStyle() {
    for (const n of this.bones) {
      this.rig.setHold(n, null);
      this.rig.suppress.delete(n);
    }
    this.bones.clear();
    this._baselineBones.clear();
    this.baseline = null;
    this.seq = null;
  }

  /**
   * `phases`: [{ to, dur, ease } | { hold }] — each blend runs from wherever
   * the previous phase ended, so interruptions never snap.
   */
  play(phases) {
    if (this.seq || !this.baseline) return false;
    this.seq = phases.slice();
    this._from = this._snapshot();
    this._t = 0;
    this._setSuppression(true);
    return true;
  }

  update(dt) {
    if (!this.seq) return;
    const phase = this.seq[0];
    this._t += dt;

    if (phase.hold != null) {
      if (this._t >= phase.hold) { this.seq.shift(); this._t = 0; }
      return;
    }

    const t = Math.min(1, this._t / phase.dur);
    this._writeBlend(this._from, phase.to, (phase.ease ?? easeInOutSine)(t));

    if (t >= 1) {
      this._from = phase.to ?? {};
      this.seq.shift();
      this._t = 0;
      if (!this.seq.length) {
        this.seq = null;
        this._setSuppression(false);
        this._writeStatic(this.baseline);
      }
    }
  }

  // ------------------------------------------------------------------ internals

  /** During a swing the pose owns its bones outright; at rest the stance bones
   *  still lead but let a sliver of walk-sway through, and un-stanced bones
   *  (a one-hand idle's arms) go back to the animator entirely. */
  _setSuppression(fighting) {
    for (const n of this.bones) {
      if (/^(Th|Ix|Md|Rg|Pk)/.test(n)) continue;          // fingers have no procedural motion
      const rest = this._baselineBones.has(n) ? 0.85 : 0;
      this.rig.suppress.set(n, fighting ? 1 : rest);
    }
  }

  _snapshot() {
    const out = {};
    for (const n of this.bones) {
      const h = this.rig.holds.get(n);
      out[n] = h ? h.clone() : IDENT.clone();
    }
    return out;
  }

  _writeBlend(from, to, e) {
    for (const n of this.bones) {
      _q.copy(from[n] ?? IDENT).slerp(to?.[n] ?? this.baseline[n] ?? IDENT, e);
      this.rig.setHold(n, _q);
    }
  }

  _writeStatic(pose) {
    for (const n of this.bones) this.rig.setHold(n, pose?.[n] ?? null);
  }
}

/**
 * The swing timelines, tuned for feel. `p` maps pose names to hold-maps;
 * missing poses simply drop their phase, so a partial pose set still swings.
 */
export function attackSequence(p, style, kind) {
  const heavy = kind === 'attackHeavy';
  if (style === 'two') {
    const windup = heavy ? (p.powerWindup ?? p.windup) : p.windup;
    const strike = p.strike;
    if (!windup) return null;
    const seq = [
      { to: windup, dur: heavy ? 0.46 : 0.26, ease: easeOutCubic },
      { hold: heavy ? 0.16 : 0.07 },
    ];
    if (strike) {
      seq.push({ to: strike, dur: heavy ? 0.14 : 0.11, ease: easeOutBack });
      seq.push({ hold: 0.06 });
      seq.push({ to: null, dur: heavy ? 0.5 : 0.36, ease: easeInOutSine });   // null = baseline
    } else {
      seq.push({ to: null, dur: 0.16, ease: easeOutBack });
    }
    return seq;
  }

  // One hand, fully authored: windup loads, the strike lands with an
  // overshooting spring, the follow-through carries the blade past the body,
  // and a long sine settles back to the stance. Missing frames degrade to the
  // old windup-and-release swing.
  const windup = heavy ? (p.powerWindup ?? p.windup) : p.windup;
  if (!windup) return null;
  const seq = [
    { to: windup, dur: heavy ? 0.4 : 0.24, ease: easeOutCubic },
    { hold: heavy ? 0.14 : 0.06 },
  ];
  if (p.strike) {
    seq.push({ to: p.strike, dur: heavy ? 0.15 : 0.11, ease: easeOutBack });
    seq.push({ hold: 0.04 });
    if (p.follow) seq.push({ to: p.follow, dur: heavy ? 0.2 : 0.16, ease: easeOutCubic });
    seq.push({ to: null, dur: heavy ? 0.42 : 0.3, ease: easeInOutSine });
  } else {
    seq.push({ to: null, dur: heavy ? 0.17 : 0.13, ease: easeOutBack });
    seq.push({ to: null, dur: 0.22, ease: easeInOutSine });
  }
  return seq;
}
