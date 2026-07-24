import * as THREE from 'three';
import { assets } from './core/Assets.js';
import { PROPS } from './data/catalog.js';

/**
 * Identification harness: renders one prop at true catalog scale next to a 1.7m
 * human stand-in and posts the framed PNG to the export receiver.
 *
 * This exists because assets have repeatedly been mis-identified from their
 * filenames — Meshy names are truncated prompts and lie. The only trustworthy
 * evidence about what an asset *is* is a picture of it at the size the catalog
 * claims, with something human-sized beside it for comparison.
 */

const W = 1100;
const H = 820;
// Port 8787 is the character export receiver and it writes into
// assets-src/characters/. Overridable so a survey run cannot litter a directory
// the user is actively exporting into.
const RECEIVER = `http://localhost:${window.__shotPort ?? 8787}/upload`;
const FIGURE_HEIGHT = 1.7;
const FIGURE_GAP = 1.2;      // clear metres between the figure and the prop's box

const gl = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
gl.setPixelRatio(1);
gl.setSize(W, H);
gl.outputColorSpace = THREE.SRGBColorSpace;
gl.toneMapping = THREE.ACESFilmicToneMapping;
gl.toneMappingExposure = 1.1;

// The posted PNG is the composite, so the caption travels with the image.
const out = document.createElement('canvas');
out.width = W; out.height = H;
const ctx = out.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3038);
const camera = new THREE.PerspectiveCamera(38, W / H, 0.02, 4000);

// Key from the camera's side so form reads, fill from behind-left to lift the
// silhouette off the background, ambient just enough to keep crevices legible.
const key = new THREE.DirectionalLight(0xfff2e2, 2.6);
const fill = new THREE.DirectionalLight(0xc8d8ff, 0.9);
scene.add(key, fill, new THREE.HemisphereLight(0xa8c0d8, 0x40444a, 0.85));

const stage = new THREE.Group();   // holds the prop; emptied between shots
scene.add(stage);

let grid = null;

function buildFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd94f3d, roughness: 0.75, metalness: 0 });

  const bodyR = 0.17, headR = 0.115;
  const bodyTop = 1.4;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyTop - bodyR * 2, 6, 18), mat);
  body.position.y = bodyTop / 2;

  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 24, 16), mat);
  head.position.y = FIGURE_HEIGHT - headR;

  g.add(body, head);
  return g;
}

const figure = buildFigure();
scene.add(figure);

function clearStage() {
  for (const child of [...stage.children]) {
    stage.remove(child);
    child.traverse(o => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m?.dispose();
    });
  }
}

/** Ground grid sized to the shot, one line per metre. */
function buildGrid(extent) {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const size = Math.max(4, Math.ceil(extent * 1.3));
  grid = new THREE.GridHelper(size, size, 0x7d8894, 0x4a525c);
  grid.position.y = 0.001;   // z-fight guard against anything sitting flat on zero
  scene.add(grid);
}

async function stageProp(name) {
  const entry = PROPS[name];
  if (!entry) throw new Error(`no catalog entry for "${name}"`);

  const gltf = await assets.load(`/assets/props/${name}.glb`);
  const node = gltf.scene.clone(true);
  node.scale.setScalar(entry.scale);
  node.updateMatrixWorld(true);

  // Meshy centres geometry in its normalised cube, so an untouched placement is
  // half buried and off-axis. Measure after scaling, then seat it on y=0.
  const box = new THREE.Box3().setFromObject(node);
  const centre = box.getCenter(new THREE.Vector3());
  node.position.set(-centre.x, -box.min.y, -centre.z);
  node.updateMatrixWorld(true);

  clearStage();
  stage.add(node);
  stage.updateMatrixWorld(true);

  const world = new THREE.Box3().setFromObject(node);
  const size = world.getSize(new THREE.Vector3());

  // Figure stands clear of the prop's box on the -X side, away from the camera's
  // azimuth so it is never occluded by the prop.
  figure.position.set(world.min.x - FIGURE_GAP - 0.17, 0, world.max.z * 0.5);

  return { entry, size, world };
}

/** Three-quarter view, slightly above eye level, pulled back until everything fits. */
function frame(world) {
  const shot = world.clone().expandByPoint(new THREE.Vector3(figure.position.x - 0.2, 0, figure.position.z));
  shot.expandByPoint(new THREE.Vector3(figure.position.x + 0.2, FIGURE_HEIGHT, figure.position.z));

  const centre = shot.getCenter(new THREE.Vector3());
  const extent = shot.getSize(new THREE.Vector3()).length();

  // Elevation stays shallow so height is judged against the figure, not flattened
  // by a top-down angle.
  const elev = THREE.MathUtils.degToRad(16);
  const azim = THREE.MathUtils.degToRad(34);
  const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));

  // Fitting the bounding *sphere* wastes most of the frame on anything that is
  // wider than it is tall, which is most of this catalog. Project the eight box
  // corners onto the camera's own axes and fit those instead.
  const fwd = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);

  let maxX = 0, maxY = 0, nearest = 0;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? shot.max.x : shot.min.x, i & 2 ? shot.max.y : shot.min.y, i & 4 ? shot.max.z : shot.min.z).sub(centre);
    maxX = Math.max(maxX, Math.abs(c.dot(right)));
    maxY = Math.max(maxY, Math.abs(c.dot(up)));
    nearest = Math.max(nearest, -c.dot(fwd));
  }
  const dist = (Math.max(maxX / Math.tan(hFov / 2), maxY / Math.tan(vFov / 2)) + nearest) * 1.06;

  camera.position.copy(centre).addScaledVector(dir, dist);
  camera.near = Math.max(0.02, dist * 0.01);
  camera.far = dist * 8;
  camera.updateProjectionMatrix();
  camera.lookAt(centre);

  key.position.copy(centre).add(new THREE.Vector3(dir.x * 2 + 1, 2.2, dir.z * 2 + 1).multiplyScalar(extent));
  key.target.position.copy(centre); key.target.updateMatrixWorld(true);
  fill.position.copy(centre).add(new THREE.Vector3(-dir.x, 0.8, -dir.z).multiplyScalar(extent * 2));
  fill.target.position.copy(centre); fill.target.updateMatrixWorld(true);

  buildGrid(Math.max(shot.getSize(new THREE.Vector3()).x, shot.getSize(new THREE.Vector3()).z));
}

function caption(name, entry, size) {
  ctx.drawImage(gl.domElement, 0, 0);

  const lines = [
    name,
    `catalog metres: ${entry.metres}   (scale ${entry.scale})`,
    `rendered: ${size.x.toFixed(2)} W x ${size.y.toFixed(2)} H x ${size.z.toFixed(2)} D m`,
    `tags: ${entry.tags.join(', ')}`,
    `figure is 1.70 m, grid is 1 m`,
  ];

  ctx.font = '15px ui-monospace, Consolas, monospace';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24;
  ctx.fillStyle = 'rgba(12,14,18,0.78)';
  ctx.fillRect(12, 12, w, lines.length * 21 + 16);
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? '#ffd58a' : '#dfe6ee';
    ctx.font = `${i === 0 ? 'bold 17px' : '15px'} ui-monospace, Consolas, monospace`;
    ctx.fillText(l, 24, 22 + i * 21);
  });
}

async function shoot(name) {
  const { entry, size, world } = await stageProp(name);
  frame(world);

  // Rendered synchronously rather than on rAF: a background tab throttles frames
  // to nothing and shootAll() would stall forever.
  gl.render(scene, camera);
  caption(name, entry, size);

  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  const res = await fetch(`${RECEIVER}?name=${encodeURIComponent(name)}.png`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`receiver returned ${res.status} for ${name}`);
  await res.text();

  return { name, metres: entry.metres, rendered: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)] };
}

async function shootAll(names = Object.keys(PROPS)) {
  const done = [];
  for (const n of names) {
    try { done.push(await shoot(n)); }
    catch (err) { done.push({ name: n, error: String(err.message || err) }); }
  }
  return done;
}

window.__shots = { list: () => Object.keys(PROPS), shoot, shootAll };

// The composite is what gets posted, so that is what the page shows too.
document.body.appendChild(out);
document.getElementById('status').textContent =
  `ready — ${Object.keys(PROPS).length} props. window.__shots.shoot('<name>')`;
