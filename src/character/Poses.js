import * as THREE from 'three';

/**
 * Poses authored in the standalone pose tool (pose-tool.html), loaded from
 * /assets/poses.json. Each pose stores per-bone LOCAL deltas from rest plus an
 * optional sword transform relative to its hand bone — so a pose is both a grip
 * (finger deltas → Rig.setHold, sword transform → the held mesh) and, for the
 * body bones, an animation keyframe.
 */

let _posesPromise = null;

export function loadPoses() {
  if (!_posesPromise) {
    _posesPromise = fetch(`${import.meta.env.BASE_URL}assets/poses.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return _posesPromise;
}

/** Which finger-bone deltas the pose carries, as Quaternions keyed by name. */
export function fingerHolds(pose) {
  const out = {};
  for (const [name, q] of Object.entries(pose?.bones ?? {})) {
    if (/^(Th|Ix|Md|Rg|Pk)[0-2][LR]$/.test(name)) out[name] = new THREE.Quaternion(...q);
  }
  return out;
}

/** EVERY bone delta the pose carries, as Quaternions keyed by name. */
export function poseHolds(pose) {
  const out = {};
  for (const [name, q] of Object.entries(pose?.bones ?? {})) {
    out[name] = new THREE.Quaternion(...q);
  }
  return out;
}
