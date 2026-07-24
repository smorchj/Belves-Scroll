import * as THREE from 'three';

/**
 * Floating waypoint beacons over the current objective of every active quest.
 *
 * The markers are constant-size, always-on-top sprites (depthTest off, no size
 * attenuation) so they read as HUD waypoints that guide the player to the next
 * step rather than as world geometry that hides behind a hill. Positions are
 * resolved each frame because talk/kill targets move.
 */

function beaconTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const gold = '#ffd968', edge = '#b8860b';

  // Soft glow.
  const glow = ctx.createRadialGradient(cx, cx * 0.85, 2, cx, cx * 0.85, cx);
  glow.addColorStop(0, 'rgba(255,220,110,0.55)');
  glow.addColorStop(1, 'rgba(255,220,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Diamond.
  const r = size * 0.26, cyD = size * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx, cyD - r); ctx.lineTo(cx + r * 0.7, cyD);
  ctx.lineTo(cx, cyD + r); ctx.lineTo(cx - r * 0.7, cyD);
  ctx.closePath();
  ctx.fillStyle = gold; ctx.fill();
  ctx.lineWidth = size * 0.03; ctx.strokeStyle = edge; ctx.stroke();

  // Downward pointer beneath it.
  const py = cyD + r + size * 0.05;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, py); ctx.lineTo(cx + r * 0.42, py);
  ctx.lineTo(cx, py + size * 0.16); ctx.closePath();
  ctx.fillStyle = gold; ctx.fill(); ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class QuestMarkers {
  constructor(scene) {
    this.scene = scene;
    this.tex = beaconTexture();
    this.group = new THREE.Group();
    this.group.name = 'quest-markers';
    scene.add(this.group);
    this.pool = [];
    this.t = 0;
  }

  _sprite() {
    const mat = new THREE.SpriteMaterial({
      map: this.tex, transparent: true, depthTest: false, depthWrite: false,
      sizeAttenuation: false, opacity: 0.95,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.09, 0.09, 1);        // constant screen size — a clear waypoint
    s.renderOrder = 999;
    this.group.add(s);
    this.pool.push(s);
    return s;
  }

  /** `targets`: array of {x, y, z} world points to mark. */
  update(dt, targets) {
    this.t += dt;
    while (this.pool.length < targets.length) this._sprite();
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      const t = targets[i];
      if (t) {
        const bob = Math.sin(this.t * 2.2 + i * 1.3) * 0.12;
        s.position.set(t.x, (t.y ?? 0) + 2.7 + bob, t.z);
        s.visible = true;
      } else {
        s.visible = false;
      }
    }
  }
}
