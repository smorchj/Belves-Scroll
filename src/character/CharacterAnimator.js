import * as THREE from 'three';
import { Rig, Face, BONES } from './Rig.js';

/**
 * Every motion a humanoid makes in this game, authored in code.
 *
 * The characters export rigged but with no animation clips at all, so there is
 * nothing to blend — each frame is built from a bind pose and a clock. Layers
 * stack additively in character space and resolve through Rig.apply():
 *
 *   base       arms down out of the A-pose
 *   locomotion walk/run cycle, counter-swinging arms, hip sway and bob
 *   idle       breathing and weight shift when standing still
 *   gesture    conversational head/spine/arm motion while speaking
 *   combat     attack swings, blocks, stagger
 *   lookAt     head and neck tracking, applied last so it wins
 *
 * Numbers here are measured with Rig.probe() rather than guessed — see the
 * comments on the constants.
 */

const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();
const _target = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const _rq2 = new THREE.Quaternion();
const _RIDENT = new THREE.Quaternion();

// Measured with Rig.probe() rather than guessed. The bind pose holds the hands
// out at [-0.504, 1.006, 0.16]; swinging the arm down about the forward axis
// walks the hand inward along an arc:
//   0.42 -> x -0.295   0.55 -> x -0.23 (beside the thigh)
//   0.60 -> x -0.197   1.00 -> x +0.02 (crossed the centreline, clipping)
// 0.55 sits the hands naturally beside the thighs with margin before contact.
const ARM_REST = 0.55;
const HIP_SWING = 0.5;      // radians per side at full stride

export class CharacterAnimator {
  constructor(root, opts = {}) {
    this.root = root;
    this.rig = new Rig(root);
    this.face = new Face(root);

    // Per-character offsets so a crowd never ticks in unison.
    this.seed = Math.random() * 1000;
    this.expressive = opts.expressive ?? 1.0;   // gesture gain, 0.7-1.8

    this.time = 0;
    this.walkPhase = 0;
    this.speed = 0;              // smoothed movement speed, m/s
    this.grounded = true;

    this.speaking = false;
    this.gesture = 0;            // eases gesture layer in/out
    this.mood = 0;               // -1 hostile .. 1 pleased
    this.lookTarget = null;      // THREE.Vector3 or null

    this.blinkTimer = 1 + Math.random() * 4;
    this.blinkProgress = -1;

    // Combat state
    this.action = null;          // { type, t, duration }
    this._lookYaw = 0;
    this._lookPitch = 0;
    this._jaw = 0;
    this._viseme = null;

    // The hand-authored run cycle (pose tool): 'Running' is the full-stride
    // frame, 'Running_caMid' the passing position a touch before midpoint.
    // Their sagittal mirrors complete the other half, giving four keys around
    // the cycle. The procedural gait crossfades OUT as this takes over.
    this._runKeys = null;
    this._runBones = null;
    this._runF = 0;
    this._runHoldsOn = false;
    import('./Poses.js').then(({ loadPoses, poseHolds }) => loadPoses().then((p) => {
      if (!p.Running || !p.Running_caMid) return;
      const mirror = (pose) => {
        const out = {};
        for (const [n, q] of Object.entries(pose)) {
          const m = n.endsWith('L') ? n.slice(0, -1) + 'R' : (n.endsWith('R') ? n.slice(0, -1) + 'L' : n);
          out[m] = new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
        }
        return out;
      };
      const k0 = poseHolds(p.Running), k1 = poseHolds(p.Running_caMid);
      this._runKeys = [k0, k1, mirror(k0), mirror(k1)];
      this._runBones = new Set(this._runKeys.flatMap((k) => Object.keys(k)));
    })).catch(() => {});
  }

  /** Trigger a one-shot action; returns false if one is already playing. */
  play(type, duration = 0.6) {
    if (this.action && this.action.t < this.action.duration * 0.7) return false;
    this.action = { type, t: 0, duration };
    return true;
  }

  get busy() { return !!this.action; }

  update(dt, moveSpeed = 0) {
    this.time += dt;
    // Ease speed so direction changes don't snap the legs.
    this.speed = THREE.MathUtils.damp(this.speed, moveSpeed, 8, dt);

    const t = this.time + this.seed;
    const rig = this.rig;
    const { right, up, forward } = rig.frame;

    this._base(rig, right, up, forward);
    this._locomotion(rig, dt, right, up, forward);
    this._idle(rig, t, right, up, forward);

    this.gesture = THREE.MathUtils.damp(this.gesture, this.speaking ? 1 : 0, 6, dt);
    if (this.gesture > 0.01) this._gestures(rig, t, right, up, forward);

    if (this.action) this._combat(rig, dt, right, up, forward);
    if (this.lookTarget) this._lookAt(rig, dt, right, up, forward);

    this._runCycle(rig, dt);
    rig.apply();
    this._faceUpdate(dt);
  }

  // ---------------------------------------------------------------- layers

  /**
   * The authored run cycle, written as rig holds on top of the (crossfaded-
   * out) procedural gait. Keys sit at phase 0 (full stride), ~0.21 (the
   * passing pose, authored "a little before midpoint"), 0.5 and 0.71 (their
   * mirrors); smoothstep between neighbours so no key ever pops.
   */
  _runCycle(rig, dt) {
    if (!this._runKeys) return;
    const target = this.speed > 0.05 ? Math.min(1, Math.max(0, (this.speed - 2.6) / 1.6)) : 0;
    this._runF = THREE.MathUtils.damp(this._runF, target, 8, dt);

    if (this._runF <= 0.01) {
      if (this._runHoldsOn) {
        for (const n of this._runBones) {
          if (!(rig.suppress.get(n) > 0)) rig.setHold(n, null);
        }
        this._runHoldsOn = false;
      }
      return;
    }

    const PH = [0, 0.21, 0.5, 0.71];
    const phase = ((this.walkPhase / (Math.PI * 2)) % 1 + 1) % 1;
    let i = 3;
    for (let k = 0; k < 4; k++) if (phase >= PH[k]) i = k;
    const next = (i + 1) % 4;
    const span = i === 3 ? 1 - PH[3] : PH[next] - PH[i];
    const t = Math.min(1, (phase - PH[i]) / span);
    const e = t * t * (3 - 2 * t);

    const a = this._runKeys[i], b = this._runKeys[next];
    for (const n of this._runBones) {
      // A bone the combat poses own right now (a stance's arms, a swing) is
      // theirs — the legs and torso keep running underneath.
      if (rig.suppress.get(n) > 0) continue;
      _rq.copy(a[n] ?? _RIDENT).slerp(b[n] ?? _RIDENT, e);
      _rq2.identity().slerp(_rq, this._runF);
      rig.setHold(n, _rq2);
    }
    this._runHoldsOn = true;
  }

  /** A-pose arms swing down to rest. Mirrored about the forward axis. */
  _base(rig, right, up, forward) {
    rig.add(BONES.upperArmL, forward, -ARM_REST);
    rig.add(BONES.upperArmR, forward, ARM_REST);
    // A touch of elbow so the arms aren't rigid planks.
    rig.add(BONES.lowerArmL, right, 0.12);
    rig.add(BONES.lowerArmR, right, 0.12);
  }

  _locomotion(rig, dt, right, up, forward) {
    const s = this.speed;
    if (s < 0.05) return;

    const running = s > 3.0;
    // Stride frequency rises with speed but not linearly, or fast movement
    // looks like a cartoon scramble.
    const freq = running ? 1.35 * Math.sqrt(s) : 1.15 * Math.sqrt(s);
    this.walkPhase += dt * freq * Math.PI * 2;

    const p = this.walkPhase;
    const amp = Math.min(1, s / (running ? 5.5 : 2.2));
    const lean = running ? 0.16 : 0.05;

    // The hand-authored run cycle (_runCycle) takes over as speed rises —
    // everything sinusoidal below fades out against it so the two never fight.
    const runF = this._runKeys ? this._runF : 0;
    const proc = 1 - runF;

    // Legs: hips swing fore/aft, knees only ever flex one way.
    for (const side of [1, -1]) {
      const ph = p + (side > 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * HIP_SWING * amp * proc;
      const upperLeg = side > 0 ? BONES.upperLegL : BONES.upperLegR;
      const lowerLeg = side > 0 ? BONES.lowerLegL : BONES.lowerLegR;
      const foot = side > 0 ? BONES.footL : BONES.footR;

      rig.add(upperLeg, right, swing);
      // Knee flexes as the leg passes under the body to clear the ground.
      const flex = Math.max(0, -Math.sin(ph - 0.6)) * (running ? 1.85 : 0.9) * amp * proc;
      rig.add(lowerLeg, right, -flex);
      // Ankle counter-rotates so the foot plants flat instead of pointing.
      rig.add(foot, right, (-swing * 0.45) + flex * 0.35);
    }

    // Arms counter-swing against the legs.
    for (const side of [1, -1]) {
      const ph = p + (side > 0 ? Math.PI : 0);
      const swing = Math.sin(ph) * 0.45 * amp * proc;
      const upperArm = side > 0 ? BONES.upperArmL : BONES.upperArmR;
      const lowerArm = side > 0 ? BONES.lowerArmL : BONES.lowerArmR;
      rig.add(upperArm, right, swing);
      rig.add(lowerArm, right, (Math.max(0, swing) * 0.6 + 0.15) * proc);
    }

    // Hips sway and counter-rotate; the spine resists so the torso stays
    // level. These are about the up/forward axes — the authored cycle is
    // almost purely sagittal, so a trace of them survives into the run as the
    // lateral life the keys don't carry.
    const sway = proc + 0.35 * runF;
    rig.add(BONES.hips, up, Math.sin(p) * 0.09 * amp * sway);
    rig.add(BONES.hips, forward, Math.sin(p * 2) * 0.04 * amp * sway);
    rig.add(BONES.spine[2], up, -Math.sin(p) * 0.07 * amp * sway);
    rig.add(BONES.spine[1], right, lean * amp * proc);

    // Vertical bob, twice per stride. Applied to the root, not a bone.
    const bob = Math.sin(p * 2) * (running ? 0.055 : 0.022) * amp;
    this.root.position.y = (this.root.userData.groundY ?? 0) + bob;
  }

  /** Breathing and weight shift. Frequencies are deliberately not harmonics. */
  _idle(rig, t, right, up, forward) {
    const still = 1 - Math.min(1, this.speed / 1.2);
    if (still < 0.01) return;

    const breath = Math.sin(t * 1.1) * 0.03 * still;
    rig.add(BONES.spine[3], right, breath);
    rig.add(BONES.spine[4], right, breath * 0.6);
    rig.add(BONES.clavicleL, forward, -breath * 0.5);
    rig.add(BONES.clavicleR, forward, breath * 0.5);

    // Slow weight shift between the feet.
    const shift = Math.sin(t * 0.37) * 0.05 * still;
    rig.add(BONES.hips, forward, shift);
    rig.add(BONES.spine[1], forward, -shift * 0.6);

    // Arms sway very slightly out of phase with the breath.
    rig.add(BONES.upperArmL, forward, -Math.sin(t * 0.83) * 0.035 * still);
    rig.add(BONES.upperArmR, forward, Math.sin(t * 0.79) * 0.035 * still);
    rig.add(BONES.head, up, Math.sin(t * 0.29) * 0.06 * still);
  }

  /**
   * Conversational motion. Overlapping non-harmonic frequencies keep it from
   * reading as a loop, and shared emphasis peaks make the hands agree with the
   * voice rather than drifting against it.
   */
  _gestures(rig, t, right, up, forward) {
    const g = this.gesture * this.expressive;
    const emphasis = Math.max(0, Math.sin(t * 2.1) * Math.sin(t * 0.7));

    rig.add(BONES.head, right, Math.sin(t * 3.3) * 0.055 * g + emphasis * 0.06 * g);
    rig.add(BONES.head, up, Math.sin(t * 2.1 + 1.3) * 0.09 * g);
    rig.add(BONES.neck[1], right, Math.sin(t * 3.3 + 0.4) * 0.03 * g);
    rig.add(BONES.spine[3], up, Math.sin(t * 1.3) * 0.05 * g);
    rig.add(BONES.spine[2], right, -emphasis * 0.05 * g);

    // The dominant arm gesticulates; the other stays mostly quiet.
    rig.add(BONES.upperArmR, forward, -emphasis * 0.42 * g);
    rig.add(BONES.upperArmR, right, Math.sin(t * 2.7) * 0.16 * g);
    rig.add(BONES.lowerArmR, right, 0.35 * g + emphasis * 0.55 * g);
    rig.add(BONES.handR, up, Math.sin(t * 9.3) * 0.14 * g);

    rig.add(BONES.upperArmL, forward, emphasis * 0.16 * g);
    rig.add(BONES.lowerArmL, right, 0.18 * g);

    // Occasional shrug on the strongest beats.
    if (emphasis > 0.72) {
      const sh = (emphasis - 0.72) * 3 * g;
      rig.add(BONES.clavicleL, forward, sh * 0.16);
      rig.add(BONES.clavicleR, forward, -sh * 0.16);
    }
  }

  _combat(rig, dt, right, up, forward) {
    const a = this.action;
    a.t += dt;
    const k = Math.min(1, a.t / a.duration);
    if (a.t >= a.duration) this.action = null;

    // Wind up quickly, strike, recover slowly.
    const strike = k < 0.35 ? -Math.sin((k / 0.35) * Math.PI * 0.5) * 0.6
                            : Math.sin(((k - 0.35) / 0.65) * Math.PI) * 1.0;

    switch (a.type) {
      case 'attack': {
        rig.add(BONES.spine[2], up, -strike * 0.5);
        rig.add(BONES.spine[3], up, -strike * 0.3);
        rig.add(BONES.upperArmR, right, -0.4 - strike * 1.5);
        rig.add(BONES.upperArmR, forward, -0.5);
        rig.add(BONES.lowerArmR, right, 0.9 - strike * 0.6);
        rig.add(BONES.handR, right, strike * 0.3);
        rig.add(BONES.upperArmL, forward, 0.2);
        break;
      }
      case 'attackHeavy': {
        rig.add(BONES.spine[2], up, -strike * 0.75);
        rig.add(BONES.spine[1], right, strike * 0.25);
        rig.add(BONES.upperArmR, right, -0.9 - strike * 2.0);
        rig.add(BONES.upperArmR, forward, -0.35);
        rig.add(BONES.lowerArmR, right, 1.3 - strike * 1.1);
        rig.add(BONES.upperArmL, right, -0.5 - strike * 1.2);
        rig.add(BONES.lowerArmL, right, 0.9);
        break;
      }
      case 'block': {
        const hold = Math.min(1, k * 4);
        rig.add(BONES.upperArmL, forward, hold * 0.9);
        rig.add(BONES.upperArmL, right, -hold * 0.7);
        rig.add(BONES.lowerArmL, right, hold * 1.5);
        rig.add(BONES.spine[2], up, hold * 0.25);
        break;
      }
      case 'hit': {
        const recoil = Math.sin(k * Math.PI) * (1 - k * 0.4);
        rig.add(BONES.spine[2], right, -recoil * 0.35);
        rig.add(BONES.spine[3], right, -recoil * 0.25);
        rig.add(BONES.head, right, -recoil * 0.3);
        rig.add(BONES.upperArmL, forward, recoil * 0.3);
        rig.add(BONES.upperArmR, forward, -recoil * 0.3);
        break;
      }
      case 'death': {
        const f = Math.min(1, k * 1.2);
        const e = f * f;
        rig.add(BONES.spine[1], right, e * 1.1);
        rig.add(BONES.spine[2], right, e * 0.8);
        rig.add(BONES.head, right, e * 0.5);
        rig.add(BONES.upperLegL, right, -e * 0.9);
        rig.add(BONES.upperLegR, right, -e * 0.7);
        rig.add(BONES.lowerLegL, right, -e * 1.2);
        rig.add(BONES.lowerLegR, right, -e * 1.0);
        if (k >= 1) this.action = { type: 'death', t: 0, duration: Infinity };
        break;
      }
    }
  }

  /**
   * Track a world-space point, split across neck and head so the character
   * doesn't crane from the skull alone. Clamped hard — an unclamped look-at
   * snaps necks around when the target passes behind.
   */
  _lookAt(rig, dt, right, up, forward) {
    _target.copy(this.lookTarget);
    this.root.worldToLocal(_v.copy(_target));

    const head = rig.bind.get(BONES.head);
    if (!head) return;
    _v.sub(head.localPos);   // _v is already root-local, matching localPos

    const x = _v.dot(right), y = _v.dot(up), z = _v.dot(forward);
    const yaw = Math.atan2(x, Math.max(0.001, z));
    const pitch = Math.atan2(y, Math.hypot(x, z));

    const clampedYaw = THREE.MathUtils.clamp(yaw, -1.1, 1.1);
    const clampedPitch = THREE.MathUtils.clamp(pitch, -0.5, 0.6);

    this._lookYaw = THREE.MathUtils.damp(this._lookYaw, clampedYaw, 6, dt);
    this._lookPitch = THREE.MathUtils.damp(this._lookPitch, clampedPitch, 6, dt);

    rig.add(BONES.neck[0], up, this._lookYaw * 0.35);
    rig.add(BONES.neck[1], up, this._lookYaw * 0.25);
    rig.add(BONES.head, up, this._lookYaw * 0.4);
    rig.add(BONES.neck[1], right, this._lookPitch * 0.3);
    rig.add(BONES.head, right, this._lookPitch * 0.7);

    // Eyes lead the head slightly, which is what makes gaze read as alive.
    this.face.gaze(
      THREE.MathUtils.clamp(clampedYaw - this._lookYaw * 0.75, -0.5, 0.5),
      THREE.MathUtils.clamp(-(clampedPitch - this._lookPitch * 0.75), -0.3, 0.3),
    );
  }

  // ------------------------------------------------------------------ face

  _faceUpdate(dt) {
    const face = this.face;
    if (!face.targets.size) return;   // morphs not attached (not in conversation)

    this._blink(dt, face);
    this._moodExpression(dt, face);
    this._speech(dt, face);
  }

  _blink(dt, face) {
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt;
      const k = this.blinkProgress / 0.16;
      if (k >= 1) {
        this.blinkProgress = -1;
        face.set('eyeBlinkLeft', 0);
        face.set('eyeBlinkRight', 0);
      } else {
        const v = Math.sin(k * Math.PI);
        face.set('eyeBlinkLeft', v);
        face.set('eyeBlinkRight', v);
      }
      return;
    }
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkProgress = 0;
      this.blinkTimer = 1 + Math.random() * 4.5;
    }
  }

  /** Mood drives the resting expression; speaking amplifies it for emphasis. */
  _moodExpression(dt, face) {
    const m = this.mood * (this.speaking ? 1.15 : 1.0);
    const a = 1 - Math.exp(-6 * dt);
    const pleased = Math.max(0, m);
    const hostile = Math.max(0, -m);

    face.approach('mouthSmileLeft', pleased * 0.65, a);
    face.approach('mouthSmileRight', pleased * 0.6, a);   // asymmetric on purpose
    face.approach('cheekSquintLeft', pleased * 0.4, a);
    face.approach('cheekSquintRight', pleased * 0.38, a);
    face.approach('browInnerUp', pleased * 0.25, a);

    face.approach('mouthFrownLeft', hostile * 0.55, a);
    face.approach('mouthFrownRight', hostile * 0.6, a);
    face.approach('browDownLeft', hostile * 0.7, a);
    face.approach('browDownRight', hostile * 0.72, a);
    face.approach('eyeSquintLeft', hostile * 0.45, a);
    face.approach('eyeSquintRight', hostile * 0.45, a);
    face.approach('noseSneerLeft', Math.max(0, hostile - 0.55) * 0.9, a);
    face.approach('noseSneerRight', Math.max(0, hostile - 0.5) * 0.9, a);
  }

  /**
   * Mouth shapes while talking. The viseme is set externally by Lipsync (driven
   * off the real utterance), and this blends toward it; with no viseme the jaw
   * falls back to a generic flap so speech still reads if timing data is absent.
   */
  _speech(dt, face) {
    const a = 1 - Math.exp(-22 * dt);

    if (!this.speaking) {
      for (const n of ['jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthShrugUpper',
                       'mouthStretchLeft', 'mouthStretchRight', 'mouthPressLeft',
                       'mouthPressRight', 'mouthRollLower', 'mouthUpperUpLeft',
                       'mouthUpperUpRight', 'mouthLowerDownLeft', 'mouthLowerDownRight']) {
        face.approach(n, 0, 1 - Math.exp(-10 * dt));
      }
      return;
    }

    const t = this.time + this.seed;
    if (this._viseme) {
      for (const [name, value] of Object.entries(this._viseme)) face.approach(name, value, a);
    } else {
      const flap = (Math.sin(t * 17) * 0.5 + 0.5) * (Math.sin(t * 11.3) * 0.35 + 0.65);
      face.approach('jawOpen', flap * 0.32, a);
    }

    // Brows and eyes ride the same emphasis cadence as the hands.
    const emphasis = Math.max(0, Math.sin(t * 2.1) * Math.sin(t * 0.7));
    const slow = 1 - Math.exp(-8 * dt);
    face.approach('browOuterUpLeft', emphasis * 0.35 * this.expressive, slow);
    face.approach('browOuterUpRight', emphasis * 0.33 * this.expressive, slow);
    face.approach('eyeWideLeft', emphasis * 0.18, slow);
    face.approach('eyeWideRight', emphasis * 0.18, slow);
  }

  /** Called by Lipsync each frame with a blend of ARKit shapes, or null. */
  setViseme(shapes) { this._viseme = shapes; }
}
