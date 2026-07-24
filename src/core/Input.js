/** Keyboard + pointer-lock mouse input. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // edge-triggered, cleared each frame
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = new Set();
    this.clicked = new Set();
    this.locked = false;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      // Space scrolls the page and ruins jumping otherwise.
      if (['Space', 'Tab', 'F1'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.buttons.add(e.button);
      this.clicked.add(e.button);
      if (!this.locked) canvas.requestPointerLock();
    });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));

    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });

    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  mouseDown(b) { return this.buttons.has(b); }
  mouseHit(b) { return this.clicked.has(b); }

  /** Movement intent in local space: x = strafe, z = forward. */
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW')) z += 1;
    if (this.down('KeyS')) z -= 1;
    if (this.down('KeyA')) x -= 1;
    if (this.down('KeyD')) x += 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  endFrame() {
    this.pressed.clear();
    this.clicked.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }

  release() { if (this.locked) document.exitPointerLock(); }
}
