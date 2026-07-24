import * as THREE from 'three';

/**
 * Bone driver for creategamecharacters.ai humanoids.
 *
 * The characters ship rigged but with zero animation clips, so every pose in the
 * game is authored here in code. The one rule that makes that tractable: never
 * rotate a bone about a world axis or its own arbitrary local axis. Instead we
 * cache the bind pose, express every rotation as a delta in a stable *character*
 * frame (derived from the shoulders, so it survives the character being turned
 * or parented anywhere), and convert into bone-local space on the way out:
 *
 *     localQuat = inverse(parentBindWorldQuat) · delta · bindWorldQuat
 *
 * Callers accumulate deltas with add() during a frame, then apply() writes them
 * all at once. Bones with no delta this frame are restored to their cached bind
 * quaternion — without that restore, poses drift and accumulate over time.
 */

// The export's skeleton. Twist bones exist for skinning only and are never driven.
export const BONES = {
  hips: 'Hips',
  spine: ['Spine_01', 'Spine_02', 'Spine_03', 'Spine_04', 'Spine_05'],
  neck: ['Neck_01', 'Neck_02'],
  head: 'Head',
  clavicleL: 'ClavicleL', clavicleR: 'ClavicleR',
  upperArmL: 'UpperArmL', upperArmR: 'UpperArmR',
  lowerArmL: 'LowerArmL', lowerArmR: 'LowerArmR',
  handL: 'HandL', handR: 'HandR',
  upperLegL: 'UpperLegL', upperLegR: 'UpperLegR',
  lowerLegL: 'LowerLegL', lowerLegR: 'LowerLegR',
  footL: 'FootL', footR: 'FootR',
  ballL: 'BallL', ballR: 'BallR',
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Rig {
  constructor(root) {
    this.root = root;
    this.bones = new Map();
    this.bind = new Map();     // name -> { local, world, parentWorld, position }
    this.deltas = new Map();   // name -> accumulated character-space quaternion
    this.holds = new Map();    // name -> persistent bone-LOCAL quaternion offset
    this.suppress = new Map(); // name -> 0..1: damp procedural deltas on posed bones

    root.updateWorldMatrix(true, true);

    root.traverse((o) => {
      if (!o.isBone) return;
      this.bones.set(o.name, o);
    });

    // Everything is cached in the root's local space, not world space. The
    // character gets moved around the terrain constantly, and mixing a live
    // world position against a bind-time world origin silently bakes the spawn
    // translation into every measurement.
    const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert();

    for (const [name, bone] of this.bones) {
      bone.updateWorldMatrix(true, false);
      const world = new THREE.Quaternion();
      bone.getWorldQuaternion(world);
      const parentWorld = new THREE.Quaternion();
      if (bone.parent) bone.parent.getWorldQuaternion(parentWorld);
      this.bind.set(name, {
        local: bone.quaternion.clone(),
        position: bone.position.clone(),
        world,
        parentWorld,
        localPos: new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(toLocal),
      });
    }

    this.frame = this._deriveFrame();
  }

  has(name) { return this.bones.has(name); }
  bone(name) { return this.bones.get(name); }

  /**
   * The character's anatomical axes, in the space the rig lives in. Taken from
   * the shoulders rather than assumed to be world +X/+Y/+Z: a mirrored or rotated
   * export would otherwise silently swap the character's left and right.
   */
  _deriveFrame() {
    const l = this.bind.get(BONES.upperArmL)?.localPos;
    const r = this.bind.get(BONES.upperArmR)?.localPos;
    const hips = this.bind.get(BONES.hips)?.localPos;
    const head = this.bind.get(BONES.head)?.localPos;

    const right = (l && r) ? _v.copy(r).sub(l).normalize().clone()
                           : new THREE.Vector3(-1, 0, 0);
    const up = (hips && head) ? _v2.copy(head).sub(hips).normalize().clone()
                              : new THREE.Vector3(0, 1, 0);

    // These exports face +Z, which puts the character's right at -X. With a
    // right-handed basis that means forward = up x right; the other order gives
    // -Z and silently mirrors every left/right motion in the game.
    const forward = new THREE.Vector3().crossVectors(up, right).normalize();
    // Re-orthogonalise: the shoulder line and the spine are not exactly square.
    up.crossVectors(right, forward).normalize();
    return { right, up, forward };
  }

  /** Queue a rotation of `angle` radians about a character-space `axis`. */
  add(name, axis, angle) {
    // A bone a pose currently owns takes only a fraction of the procedural
    // motion — the walk's arm swing must not fight an authored sword stance.
    const damp = this.suppress.get(name);
    if (damp) angle *= 1 - damp;
    if (!angle) return;
    const bone = this.bones.get(name);
    if (!bone) return;
    _q.setFromAxisAngle(axis, angle);
    const cur = this.deltas.get(name);
    if (cur) cur.premultiply(_q);
    else this.deltas.set(name, _q.clone());
  }

  /** Queue a raw character-space quaternion delta. */
  addQuat(name, quat) {
    const bone = this.bones.get(name);
    if (!bone) return;
    const cur = this.deltas.get(name);
    if (cur) cur.premultiply(quat);
    else this.deltas.set(name, quat.clone());
  }

  /**
   * A persistent bone-LOCAL rotation, re-applied every frame on top of the
   * animated pose. Used for grips: the fingers carry no animation, so a one-off
   * curl would be wiped by the next apply() (every undriven bone snaps back to
   * bind). Pass null to clear. `q` is a delta in the bone's own rest-local
   * frame — right for fingers, whose flexion axis is computed from geometry.
   */
  setHold(name, q) {
    if (q) this.holds.set(name, q.clone());
    else this.holds.delete(name);
  }
  clearHolds(prefix) {
    for (const name of [...this.holds.keys()]) {
      if (!prefix || name.startsWith(prefix)) this.holds.delete(name);
    }
  }

  /** Resolve every queued delta into bone-local space and clear the queue. */
  apply() {
    for (const [name, bone] of this.bones) {
      const bind = this.bind.get(name);
      const delta = this.deltas.get(name);
      if (!delta) {
        // No delta this frame: snap back to bind or the pose drifts over time.
        bone.quaternion.copy(bind.local);
      } else {
        // localQuat = inverse(parentBindWorld) · delta · bindWorld
        _q.copy(bind.parentWorld).invert().multiply(delta).multiply(bind.world);
        bone.quaternion.copy(_q);
      }
      // A persistent local hold rides on top of whatever the pose resolved to.
      const hold = this.holds.get(name);
      if (hold) bone.quaternion.multiply(hold);
    }
    this.deltas.clear();
  }

  /**
   * Close a hand into a grip around a held object, using the real finger bones
   * (Th/Ix/Md/Rg/Pk, three joints each) the export ships. The flexion axis is
   * not assumed — it is measured from the knuckle line (index base → pinky
   * base) at the current pose, so it stays correct whichever way the export
   * oriented the finger joints. Each joint gets a persistent local hold; the
   * grip therefore survives the animator resetting undriven bones every frame.
   *
   * `side` is 'R' or 'L'. `strength` 0..1 scales the curl (1 = firm fist).
   */
  gripFingers(side = 'R', strength = 1) {
    const FINGERS = ['Ix', 'Md', 'Rg', 'Pk'];
    const has = (n) => this.bones.has(n + side);
    if (!has('Ix0') || !has('Pk0') || !has('Md2')) return false;

    this.root.updateWorldMatrix(true, true);
    const wp = (n) => new THREE.Vector3().setFromMatrixPosition(this.bones.get(n + side).matrixWorld);

    // Flexion axis = the knuckle line. Curling every finger about it closes
    // them in parallel, which is what a fist does — rotating each joint toward
    // the palm centre independently would splay into a claw.
    const knuckle = wp('Pk0').sub(wp('Ix0')).normalize();
    const md0 = wp('Md0'), md2 = wp('Md2'), hand = wp('Hand');
    const fingerDir = md2.clone().sub(md0).normalize();

    // Sign: pick the rotation that brings the fingertip TOWARD the wrist (a
    // closing fist), not away from it.
    const test = (s) => {
      const v = md2.clone().sub(md0).applyQuaternion(
        _q.setFromAxisAngle(knuckle, s * 1.0));
      return md0.clone().add(v).distanceTo(hand);
    };
    const sign = test(1) < test(-1) ? 1 : -1;

    // A firm but not clenched curl: knuckle bends most, tip least, so the pads
    // wrap the grip rather than folding into the palm.
    const perJoint = [0.62, 1.05, 0.75].map((a) => a * strength);

    for (const f of FINGERS) {
      for (let j = 0; j < 3; j++) {
        const bone = this.bones.get(`${f}${j}${side}`);
        if (!bone) continue;
        bone.updateWorldMatrix(true, false);
        const worldQ = new THREE.Quaternion();
        bone.getWorldQuaternion(worldQ);
        const localAxis = knuckle.clone().applyQuaternion(worldQ.clone().invert()).normalize();
        this.setHold(bone.name, _q.setFromAxisAngle(localAxis, sign * perJoint[j]));
      }
    }

    // The thumb opposes: it wraps ACROSS the grip to meet the fingers. Its
    // flexion axis is roughly perpendicular to both the thumb's own length and
    // the palm normal, and it curls the other way about the knuckle line.
    const palmNormal = fingerDir.clone().cross(knuckle).normalize();
    const th0 = wp('Th0'), th2 = wp('Th2');
    const thumbDir = th2.clone().sub(th0).normalize();
    const thumbAxis = thumbDir.clone().cross(palmNormal).normalize();
    const thumbSign = (() => {
      const v = th2.clone().sub(th0).applyQuaternion(_q.setFromAxisAngle(thumbAxis, 1.0));
      return th0.clone().add(v).distanceTo(md2) < th2.distanceTo(md2) ? 1 : -1;
    })();
    const thumbJoint = [0.5, 0.65, 0.55].map((a) => a * strength);
    for (let j = 0; j < 3; j++) {
      const bone = this.bones.get(`Th${j}${side}`);
      if (!bone) continue;
      bone.updateWorldMatrix(true, false);
      const worldQ = new THREE.Quaternion();
      bone.getWorldQuaternion(worldQ);
      const localAxis = thumbAxis.clone().applyQuaternion(worldQ.clone().invert()).normalize();
      this.setHold(bone.name, _q.setFromAxisAngle(localAxis, thumbSign * thumbJoint[j]));
    }
    return true;
  }

  /** Open the hand again — drop every finger hold on that side. */
  releaseFingers(side = 'R') {
    for (const f of ['Th', 'Ix', 'Md', 'Rg', 'Pk']) {
      for (let j = 0; j < 3; j++) this.setHold(`${f}${j}${side}`, null);
    }
  }

  /**
   * Freeze the rig in a given pose and read a bone's position back in character
   * space. Poses are tuned against measurements from this rather than guessed —
   * see the numbers in CharacterAnimator.
   */
  probe(boneName) {
    this.root.updateWorldMatrix(true, true);
    const bone = this.bones.get(boneName);
    if (!bone) return null;
    // Into root-local space (origin at the character's feet), then onto the
    // anatomical axes — so a hand at rest reads ~[+-0.52, 1.01, 0.07].
    _m.copy(this.root.matrixWorld).invert();
    _v.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_m);
    return new THREE.Vector3(
      _v.dot(this.frame.right),
      _v.dot(this.frame.up),
      _v.dot(this.frame.forward),
    );
  }
}

/**
 * Drives ARKit blend shapes by name across every mesh that has them — the shapes
 * are split over the face, teeth and lash meshes, so a single expression has to
 * be written to whichever meshes actually carry it.
 */
export class Face {
  constructor(root) {
    this.targets = new Map(); // morph name -> [{ mesh, index }]
    root.traverse((o) => {
      if (!o.isMesh || !o.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(o.morphTargetDictionary)) {
        if (!this.targets.has(name)) this.targets.set(name, []);
        this.targets.get(name).push({ mesh: o, index });
      }
    });
    // The eyeballs are separate meshes, so gaze is done by rotating them rather
    // than with the (pruned) eyeLook* shapes.
    this.eyes = [];
    root.traverse((o) => {
      if (o.isMesh && /^eye(L|R)$/i.test(o.name)) this.eyes.push(o);
    });
    for (const e of this.eyes) e.userData.restQuat = e.quaternion.clone();
  }

  has(name) { return this.targets.has(name); }

  set(name, value) {
    const list = this.targets.get(name);
    if (!list) return;
    const v = value < 0 ? 0 : value > 1 ? 1 : value;
    // Guard against a detached mesh: writing past the end of an emptied
    // influence array creates a sparse array with no matching morph attributes,
    // which makes the renderer drop the mesh. Only write real slots.
    for (const { mesh, index } of list) {
      if (index < (mesh.morphTargetInfluences?.length ?? 0)) mesh.morphTargetInfluences[index] = v;
    }
  }

  get(name) {
    const list = this.targets.get(name);
    if (!list) return 0;
    // The influence array is emptied when a face is detached, so a stale Face
    // handle can outlive its morphs — read defensively rather than returning
    // undefined into arithmetic.
    return list[0].mesh.morphTargetInfluences?.[list[0].index] ?? 0;
  }

  /** Nudge toward a value so expressions ease instead of popping. */
  approach(name, target, alpha) {
    this.set(name, THREE.MathUtils.lerp(this.get(name), target, alpha));
  }

  clear() {
    for (const list of this.targets.values()) {
      for (const { mesh, index } of list) mesh.morphTargetInfluences[index] = 0;
    }
  }

  /** yaw/pitch in radians, applied to both eyeballs. */
  gaze(yaw, pitch) {
    _q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    for (const e of this.eyes) e.quaternion.copy(e.userData.restQuat).multiply(_q);
  }
}
