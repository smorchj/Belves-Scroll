import * as THREE from 'three';
import { Stage } from './render/Renderer.js';
import { INTERIORS, Interior } from './world/Interior.js';

/**
 * Standalone interior inspector.
 *
 * Loads each interior into a bare Stage with an orbit camera, runs the geometry
 * audit and prints it. No terrain, no world, no player — so a broken room shows
 * up here rather than three minutes into a play session.
 */

const canvas = document.getElementById('c');
const stage = new Stage(canvas);
stage.timeScale = 0;
stage.time = 14 / 24;

// The preview renders the interior scene directly, which is the two-scene path
// Stage will eventually take. Teach this instance the two methods it needs.
stage.setActiveScene = function (scene) {
  this.active = scene;
  this.sun.castShadow = scene === this.scene;
};
stage.active = stage.scene;
stage.render = () => stage.renderer.render(stage.active ?? stage.scene, stage.camera);

const ids = Object.keys(INTERIORS);
const rooms = new Map();
let current = null;
let wire = false;

const reportEl = document.getElementById('report');
const statsEl = document.getElementById('stats');

// --- console capture, so an error inside a build is visible on the page ---
const errors = [];
const realError = console.error.bind(console);
const realWarn = console.warn.bind(console);
console.error = (...a) => { errors.push(['error', a.join(' ')]); realError(...a); };
console.warn = (...a) => { errors.push(['warn', a.join(' ')]); realWarn(...a); };
addEventListener('error', (e) => errors.push(['error', e.message]));

async function show(id) {
  let room = rooms.get(id);
  if (!room) {
    room = new Interior(INTERIORS[id], stage);
    await room.build();
    rooms.set(id, room);
  }
  current = room;
  stage.setActiveScene(room.scene);
  frameCamera(room);
  render(room);
  for (const b of document.querySelectorAll('#rooms button')) b.classList.toggle('on', b.dataset.id === id);
}

function render(room) {
  const issues = room.validate();
  const errs = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  const lights = room.points.filter((l) => l.intensity > 0).length;
  statsEl.innerHTML = `<b>${room.name}</b> — ${room.inner.w}×${room.inner.d}×${room.inner.h}m · `
    + `${room.props.length} props · ${lights}/6 point lights · ${room.colliders.length} colliders`;

  const rows = [];
  if (!issues.length) rows.push('<div class="ok">geometry audit clean — nothing floats, nothing through a wall</div>');
  for (const i of issues) rows.push(`<div class="${i.level}">${i.level}: ${i.model} — ${i.detail}</div>`);
  for (const [lvl, msg] of errors) rows.push(`<div class="${lvl}">console ${lvl}: ${msg}</div>`);
  rows.push(`<div style="opacity:.6">${errs.length} errors · ${warns.length} warnings</div>`);
  reportEl.innerHTML = rows.join('');
}

// --- orbit ---
const target = new THREE.Vector3();
let dist = 12, yaw = 0.0, pitch = 0.35;

function frameCamera(room) {
  target.set(0, room.inner.h * 0.40, 0);
  dist = Math.max(room.inner.w, room.inner.d) * 0.6;
  yaw = 0.0;
  pitch = 0.16;
}

/**
 * The orbit is a real orbit, so at any useful radius it leaves the shell and
 * shows the outside of a wall. Clamp it back into the box — an axis clamp is
 * fine here because there is no character for the view to swing around.
 */
function confineCamera(room, pos) {
  const m = 0.45;
  pos.x = THREE.MathUtils.clamp(pos.x, -room.inner.w / 2 + m, room.inner.w / 2 - m);
  pos.z = THREE.MathUtils.clamp(pos.z, -room.inner.d / 2 + m, room.inner.d / 2 - m);
  pos.y = THREE.MathUtils.clamp(pos.y, 0.35, room.inner.h - 0.35);
}

let dragging = false, px = 0, py = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - px) * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - py) * 0.005, -0.6, 1.4);
  px = e.clientX; py = e.clientY;
});
addEventListener('wheel', (e) => {
  dist = THREE.MathUtils.clamp(dist * (1 + Math.sign(e.deltaY) * 0.1), 0.8, 60);
}, { passive: true });

// --- controls ---
const roomsEl = document.getElementById('rooms');
for (const id of ids) {
  const b = document.createElement('button');
  b.textContent = INTERIORS[id].name;
  b.dataset.id = id;
  b.style.marginRight = '4px';
  b.addEventListener('click', () => show(id));
  roomsEl.appendChild(b);
}

const hourEl = document.getElementById('hour');
const hourV = document.getElementById('hourv');
hourEl.addEventListener('input', () => {
  stage.time = hourEl.value / 24;
  const h = Math.floor(hourEl.value), m = Math.round((hourEl.value % 1) * 60);
  hourV.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

document.getElementById('wire').addEventListener('click', (e) => {
  wire = !wire;
  e.target.classList.toggle('on', wire);
  for (const room of rooms.values()) {
    room.root.traverse((o) => { if (o.isMesh && o.material) o.material.wireframe = wire; });
  }
});

/**
 * Exercise the real transition against a stub player, so the placement maths is
 * checked without booting the whole game.
 */
document.getElementById('enter').addEventListener('click', async () => {
  const room = current;
  if (!room) return;
  const root = new THREE.Object3D();
  root.position.set(120, 8, -40);
  const player = {
    char: { root }, camera: stage.camera, terrain: { height: () => 8, size: 4096 },
    yaw: 2.1, pitch: 0.22, distance: 4.2, targetDistance: 4.2,
    get position() { return root.position; },
    spawnAt(x, z) { root.position.set(x, 8, z); },
  };
  const anchor = { x: 120, z: -34, y: 8, yaw: 0.6 };

  await room.enter(player, { anchor, holdMs: 120, fadeMs: 200 });
  const inPose = `${root.position.x.toFixed(2)}, ${root.position.z.toFixed(2)} yaw ${player.yaw.toFixed(2)} dist ${player.distance.toFixed(2)}`;
  await new Promise((r) => setTimeout(r, 900));
  await room.leave(player, { holdMs: 120, fadeMs: 200 });
  const outPose = `${root.position.x.toFixed(2)}, ${root.position.z.toFixed(2)} yaw ${player.yaw.toFixed(2)}`;

  // Back to inspecting.
  stage.setActiveScene(room.scene);
  reportEl.innerHTML = `<div class="ok">entered at ${inPose}</div>`
    + `<div class="ok">exited at ${outPose} (anchor 120, -34 yaw 0.60)</div>`
    + `<div style="opacity:.6">player.terrain restored: ${player.terrain?.size === 4096}</div>`
    + reportEl.innerHTML;
});

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  const cp = Math.cos(pitch);
  stage.camera.position.set(
    target.x + Math.sin(yaw) * cp * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * cp * dist,
  );
  if (current) confineCamera(current, stage.camera.position);
  stage.camera.lookAt(target);

  stage.update(dt, target);
  current?.update(dt, stage);
  stage.render();
}

await show(ids[0]);
frame();

window.__i = { stage, rooms, show, INTERIORS };
