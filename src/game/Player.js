import * as THREE from 'three';

/**
 * Third-person player controller.
 *
 * Movement is camera-relative with the body turning to face travel; the camera
 * orbits on pointer-lock mouse look and pulls in when terrain would clip it.
 */

const GRAVITY = -22;
const WALK = 2.4;
const RUN = 5.6;
const JUMP = 7.2;

export class Player {
  constructor(character, terrain, camera) {
    this.char = character;
    this.terrain = terrain;
    this.camera = camera;

    this.yaw = 0;
    this.pitch = 0.22;
    this.distance = 4.2;
    this.targetDistance = 4.2;

    this.velocityY = 0;
    this.grounded = true;
    this.sprinting = false;

    this.xp = 0;
    this.level = 1;
    this.gold = 40;

    this._move = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._desired = new THREE.Vector3();
  }

  get position() { return this.char.root.position; }

  spawnAt(x, z) {
    const y = this.terrain.height(x, z);
    this.char.root.position.set(x, y, z);
    this.char.root.userData.groundY = y;
  }

  update(dt, input, ui) {
    const char = this.char;
    if (char.dead) { this._updateCamera(dt); return; }

    // --- look ---
    if (input.locked) {
      this.yaw -= input.mouse.dx * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouse.dy * 0.0019, -0.5, 1.15);
    }
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + input.mouse.wheel * 0.6, 1.6, 9);

    // --- movement ---
    const axis = ui?.blocking ? { x: 0, z: 0 } : input.moveAxis();
    this.sprinting = input.down('ShiftLeft') && axis.z > 0;
    const speed = this.sprinting ? RUN : WALK;

    // Camera-relative: forward is where the camera looks, flattened.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this._move.set(
      axis.x * cos - axis.z * sin,
      0,
      -axis.x * sin - axis.z * cos,
    );

    const moving = this._move.lengthSq() > 0.0001;
    const pos = char.root.position;

    if (moving && !char.animator.busy) {
      pos.x += this._move.x * speed * dt;
      pos.z += this._move.z * speed * dt;

      // Face travel direction, eased so turns aren't instant snaps.
      const targetYaw = Math.atan2(this._move.x, this._move.z);
      const cur = char.root.rotation.y;
      let diff = targetYaw - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      char.root.rotation.y = cur + diff * Math.min(1, dt * 12);
    }

    // Keep inside the valley.
    const limit = this.terrain.size / 2 - 12;
    pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
    pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);

    // --- vertical ---
    const ground = this.terrain.height(pos.x, pos.z);
    if (this.grounded && input.hit('Space') && !char.animator.busy) {
      this.velocityY = JUMP;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velocityY += GRAVITY * dt;
      char.root.userData.groundY = (char.root.userData.groundY ?? ground) + this.velocityY * dt;
      if (char.root.userData.groundY <= ground) {
        char.root.userData.groundY = ground;
        this.velocityY = 0;
        this.grounded = true;
      }
    } else {
      // Ease onto the surface so slopes don't jitter the body.
      char.root.userData.groundY = THREE.MathUtils.damp(
        char.root.userData.groundY ?? ground, ground, 14, dt);
    }
    pos.y = char.root.userData.groundY;

    char.speed = moving && !char.animator.busy ? speed : 0;
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    this.distance = THREE.MathUtils.damp(this.distance, this.targetDistance, 8, dt);

    const pos = this.char.root.position;
    this._camTarget.set(pos.x, pos.y + 1.55, pos.z);

    const cp = Math.cos(this.pitch);
    this._desired.set(
      this._camTarget.x + Math.sin(this.yaw) * cp * this.distance,
      this._camTarget.y + Math.sin(this.pitch) * this.distance + 0.35,
      this._camTarget.z + Math.cos(this.yaw) * cp * this.distance,
    );

    // Don't let the camera sink into the hillside behind the player.
    const floor = this.terrain.height(this._desired.x, this._desired.z) + 0.6;
    if (this._desired.y < floor) this._desired.y = floor;

    this.camera.position.lerp(this._desired, 1 - Math.exp(-14 * dt));
    this.camera.lookAt(this._camTarget);
  }
}
