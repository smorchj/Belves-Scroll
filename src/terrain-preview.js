import * as THREE from 'three';
import { Stage } from './render/Renderer.js';
import { Terrain } from './world/Terrain.js';
import { GrassField } from './world/GrassField.js';

// Vantage points chosen from the DTM survey, so each view shows a real feature.
const VIEWS = [
  { name: 'town',    at: [-260, 40, 300],   look: [-60, 10, 120] },
  { name: 'quay',    at: [-120, 12, 180],   look: [40, 6, 40] },
  { name: 'massif',  at: [900, 340, -500],  look: [400, 120, -100] },
  { name: 'sea',     at: [-600, 90, -900],  look: [200, 40, 200] },
  { name: 'overview',at: [0, 1500, 1900],   look: [0, 0, 0] },
];

const canvas = document.getElementById('c');
const stage = new Stage(canvas);
const statsEl = document.getElementById('stats');

const terrain = await Terrain.load();
stage.scene.add(terrain.mesh);
const water = terrain.buildWater();
stage.scene.add(water);

const grass = await GrassField.load(terrain);
stage.scene.add(grass.group);
grass.reseed(new THREE.Vector3(...VIEWS[0].look));

let min = Infinity, max = -Infinity, sea = 0;
for (let i = 0; i < terrain.data.length; i++) {
  const h = terrain.data[i] * terrain.scale + terrain.minY;
  if (h < min) min = h;
  if (h > max) max = h;
  if (h <= 0.3) sea++;
}
statsEl.textContent = `${terrain.samples}² @ ${terrain.meta.metresPerSample}m · `
  + `${min.toFixed(0)}–${max.toFixed(0)}m · sea ${(sea / terrain.data.length * 100).toFixed(0)}%`;

// --- orbit ---
let view = 0;
const target = new THREE.Vector3(...VIEWS[0].look);
let dist = 420, yaw = 0.7, pitch = 0.42;

function applyView(i) {
  const v = VIEWS[i];
  target.set(...v.look);
  const eye = new THREE.Vector3(...v.at);
  const d = eye.clone().sub(target);
  dist = d.length();
  yaw = Math.atan2(d.x, d.z);
  pitch = Math.asin(THREE.MathUtils.clamp(d.y / dist, -1, 1));
}
applyView(0);

let dragging = false, px = 0, py = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; px = e.clientX; py = e.clientY; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - px) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch + (e.clientY - py) * 0.004, -0.2, 1.4);
  px = e.clientX; py = e.clientY;
});
addEventListener('wheel', (e) => {
  dist = THREE.MathUtils.clamp(dist * (1 + Math.sign(e.deltaY) * 0.12), 30, 4000);
}, { passive: true });

const hourEl = document.getElementById('hour');
const hourV = document.getElementById('hourv');
hourEl.addEventListener('input', () => {
  stage.time = hourEl.value / 24;
  const h = Math.floor(hourEl.value), m = Math.round((hourEl.value % 1) * 60);
  hourV.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});
stage.time = 10 / 24;
stage.timeScale = 0;

const viewEl = document.getElementById('view');
viewEl.addEventListener('input', () => {
  view = +viewEl.value;
  document.getElementById('viewv').textContent = VIEWS[view].name;
  applyView(view);
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
  stage.camera.lookAt(target);

  terrain.updateWater(dt, stage.sunPosition, stage.sun.color);
  grass.update(dt, stage.camera.position);
  stage.update(dt, target);
  stage.render();
}
frame();

window.__t = { stage, terrain, grass, applyView, VIEWS };
