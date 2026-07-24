import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { assets } from './core/Assets.js';
import { buildFromRecipe } from './character/CharacterFactory.js';
import { Rig } from './character/Rig.js';
import { PROPS } from './data/catalog.js';

/**
 * Full-body joint-posing tool. Build a rigged character, optionally hand it a
 * sword, and pose EVERY joint (torso, both arms, both hands with fingers, both
 * legs) with 3D gizmos — then save named poses. A pose stores each posed
 * bone's LOCAL delta from the rest pose, so it doubles as a grip (feed the
 * finger deltas to Rig.setHold) and as an animation keyframe (set
 * bone.quaternion = bind · delta on the whole skeleton). The sword records
 * which hand it is in and its transform relative to that hand.
 */

const CAST = { venus: ['Maple', 'Willow', 'Ember', 'Kari', 'Mildrid'],
               mars: ['Snader', 'Haggar', 'Travis', 'Cedar', 'Pobart', 'Charles'] };

// Posable bones by region. Twist bones are skinning helpers — never posed.
const REGIONS = {
  Torso: ['Hips', 'Spine_01', 'Spine_02', 'Spine_03', 'Spine_04', 'Spine_05', 'Neck_01', 'Neck_02', 'Head'],
  'Arm L': ['ClavicleL', 'UpperArmL', 'LowerArmL', 'HandL'],
  'Arm R': ['ClavicleR', 'UpperArmR', 'LowerArmR', 'HandR'],
  'Hand L': fingers('L'),
  'Hand R': fingers('R'),
  'Leg L': ['HipL', 'UpperLegL', 'LowerLegL', 'FootL', 'BallL'],
  'Leg R': ['HipR', 'UpperLegR', 'LowerLegR', 'FootR', 'BallR'],
};
function fingers(side) {
  const out = [];
  for (const f of ['Th', 'Ix', 'Md', 'Rg', 'Pk']) for (let j = 0; j < 3; j++) out.push(`${f}${j}${side}`);
  return out;
}
const REGION_OF = {};
for (const [reg, names] of Object.entries(REGIONS)) for (const n of names) REGION_OF[n] = reg;
const POSABLE = Object.values(REGIONS).flat();
const REGION_COLOUR = {
  Torso: 0xc98a3e, 'Arm L': 0x3a8ac9, 'Arm R': 0x3ac98a, 'Hand L': 0x9a6ad0,
  'Hand R': 0x4bb36a, 'Leg L': 0xc94b6a, 'Leg R': 0xc9b34b,
};
const pair = (n) => n.endsWith('R') ? n.slice(0, -1) + 'L' : (n.endsWith('L') ? n.slice(0, -1) + 'R' : null);

const view = document.getElementById('view');
const statusEl = document.getElementById('status');
const status = (t) => { statusEl.textContent = t; };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);
const grid = new THREE.GridHelper(4, 16, 0x2c333d, 0x232830);
scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(1.4, 1.5, 2.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(1, 2, 1.5); scene.add(key);
scene.add(new THREE.HemisphereLight(0x8899bb, 0x222018, 0.6));

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.0, 0);
orbit.update();

const gizmo = new TransformControls(camera, renderer.domElement);
gizmo.setSize(0.7);
gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; });
scene.add(gizmo.getHelper());

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- character

let root = null, rig = null, sword = null, swordHand = null;   // 'R' | 'L' | null
const bones = new Map();          // name -> bone
const bindLocal = new Map();      // name -> rest local quaternion
const handles = new Map();        // name -> sphere
const visibleRegions = new Set(Object.keys(REGIONS));
let selected = null;              // bone name, or '__sword__'

async function buildCharacter(base, name) {
  if (root) scene.remove(root);
  for (const h of handles.values()) scene.remove(h);
  handles.clear(); bones.clear(); bindLocal.clear();
  gizmo.detach(); selected = null; sword = null; swordHand = null;

  status(`building ${name}…`);
  root = await buildFromRecipe({ recipe: name, outfit: base === 'venus' ? 'Merchant Dress' : 'Dragon Armor' });
  root.position.set(0, 0, 0);
  scene.add(root);
  root.updateWorldMatrix(true, true);

  rig = new Rig(root);
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  for (const n of POSABLE) {
    const b = bones.get(n);
    if (b) bindLocal.set(n, b.quaternion.clone());
  }

  buildHandles();
  updateSel();
  status(`${name} ready — pick a region, click a joint`);
}

function buildHandles() {
  for (const n of POSABLE) {
    const b = bones.get(n);
    if (!b) continue;
    const reg = REGION_OF[n];
    const finger = reg.startsWith('Hand');
    const r = finger ? 0.007 : (reg === 'Torso' ? 0.02 : 0.015);
    const mat = new THREE.MeshBasicMaterial({ color: REGION_COLOUR[reg], depthTest: false, transparent: true, opacity: 0.9 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), mat);
    s.renderOrder = 999;
    s.userData.bone = n;
    scene.add(s);
    handles.set(n, s);
  }
  refreshHandleVisibility();
}

function refreshHandleVisibility() {
  for (const [n, h] of handles) h.visible = visibleRegions.has(REGION_OF[n]);
}

// ---------------------------------------------------------------- sword

async function setSwordHand(hand) {
  if (sword) { sword.removeFromParent(); sword = null; }
  swordHand = hand;
  updateSwordButtons();
  if (!hand) return;
  const handBone = bones.get('Hand' + hand);
  if (!handBone) return;

  // The sword mesh is attached DIRECTLY to the hand bone — its own
  // position/quaternion/scale IS the grip transform, so the gizmo edits it and
  // the pose captures it 1:1 (no wrapper whose identity transform hides the
  // real one). Model space is normalised the same way Character.equip does.
  const { root: sr } = await assets.prop('sword-iron');
  const cat = PROPS['sword-iron'];
  sr.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sr);
  const longest = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const scale = (cat?.metres && longest > 1e-4) ? cat.metres / longest : (cat?.scale ?? 0.5);
  sr.scale.setScalar(scale);
  sr.rotation.set(0, 0, 0);
  sr.updateMatrixWorld(true);
  const sb = new THREE.Box3().setFromObject(sr);
  const len = sb.max.y - sb.min.y;
  const grip = new THREE.Vector3((sb.min.x + sb.max.x) / 2, sb.min.y + len * 0.14, (sb.min.z + sb.max.z) / 2);
  sr.name = 'sword';
  handBone.add(sr);
  sword = sr;

  // Sensible starting orientation: blade pointing straight UP out of the fist
  // in world space (so it reads as "held", not lying across the hand). Solve
  // the hand-local rotation that maps the blade's local +Y onto world +Y, then
  // slide the grip point into the palm. The user gizmos from there.
  handBone.updateWorldMatrix(true, true);
  const handWorldQ = new THREE.Quaternion();
  handBone.getWorldQuaternion(handWorldQ);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const localUp = worldUp.clone().applyQuaternion(handWorldQ.clone().invert());   // world up in hand space
  sr.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localUp);
  sr.position.copy(grip.clone().applyQuaternion(sr.quaternion).negate());

  status(`sword in ${hand} hand — gizmo it into the grip`);
}

// ---------------------------------------------------------------- selection

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;

renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 4 || gizmo.dragging) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  const vis = [...handles.values()].filter((h) => h.visible);
  const hits = raycaster.intersectObjects(vis, false);
  if (hits.length) { select(hits[0].object.userData.bone); return; }
  if (sword) {
    const sh = raycaster.intersectObject(sword, true);
    if (sh.length) { select('__sword__'); return; }
  }
});

function select(what) {
  selected = what;
  for (const [n, h] of handles) {
    h.material.color.set(n === what ? 0xffffff : REGION_COLOUR[REGION_OF[n]]);
    h.scale.setScalar(n === what ? 1.6 : 1);
  }
  gizmo.attach(what === '__sword__' ? sword : bones.get(what));
  updateSel();
}

function updateSel() {
  const el = document.getElementById('sel');
  el.textContent = selected === '__sword__' ? '⚔ sword' : (selected ? `● ${selected}  (${REGION_OF[selected]})` : '— nothing selected —');
  for (const btn of document.querySelectorAll('#bones button')) btn.classList.toggle('on', btn.dataset.bone === selected);
}

// Mirror paired-bone edits to the other side live.
gizmo.addEventListener('objectChange', () => {
  if (!document.getElementById('mirror').checked) return;
  if (!selected || selected === '__sword__') return;
  const otherName = pair(selected);
  const other = otherName && bones.get(otherName);
  const src = bones.get(selected);
  if (other && src) other.quaternion.set(src.quaternion.x, -src.quaternion.y, -src.quaternion.z, src.quaternion.w);
});

// ---------------------------------------------------------------- poses

const KEY = 'belve-poses-v1';
const loadStore = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saveStore = (o) => localStorage.setItem(KEY, JSON.stringify(o));

function capturePose() {
  const out = { bones: {}, sword: null };
  for (const n of POSABLE) {
    const b = bones.get(n), bind = bindLocal.get(n);
    if (!b || !bind) continue;
    const hold = bind.clone().invert().multiply(b.quaternion);
    // Skip bones left at rest — keeps a pose file to only what was actually moved.
    if (Math.abs(hold.x) + Math.abs(hold.y) + Math.abs(hold.z) < 1e-4) continue;
    out.bones[n] = [hold.x, hold.y, hold.z, hold.w].map((v) => +v.toFixed(5));
  }
  // Find the sword by walking the scene graph, not a variable that could drift
  // out of sync — whichever hand bone actually carries it wins.
  let swMesh = null, swHand = null;
  for (const h of ['R', 'L']) {
    const hb = bones.get('Hand' + h);
    const found = hb?.children.find((c) => c.name === 'sword');
    if (found) { swMesh = found; swHand = h; break; }
  }
  if (swMesh) {
    // The sword's transform is relative to its hand bone — exactly what
    // Character.equip needs: attach the mesh to Hand<hand> and apply these.
    out.sword = {
      hand: swHand,
      position: swMesh.position.toArray().map((v) => +v.toFixed(5)),
      quaternion: swMesh.quaternion.toArray().map((v) => +v.toFixed(5)),
      scale: +swMesh.scale.x.toFixed(5),
    };
  }
  return out;
}

async function applyPose(pose) {
  for (const n of POSABLE) {
    const b = bones.get(n), bind = bindLocal.get(n);
    if (b && bind) b.quaternion.copy(bind);
  }
  for (const [n, q] of Object.entries(pose.bones || {})) {
    const b = bones.get(n), bind = bindLocal.get(n);
    if (b && bind) b.quaternion.copy(bind).multiply(new THREE.Quaternion(...q));
  }
  if (pose.sword) {
    await setSwordHand(pose.sword.hand || 'R');     // legacy files saved no hand
    if (sword && pose.sword.position) {
      sword.position.fromArray(pose.sword.position);
      sword.quaternion.fromArray(pose.sword.quaternion);
      sword.scale.setScalar(pose.sword.scale ?? sword.scale.x);
    }
  } else { await setSwordHand(null); }
}

function renderPoseList() {
  const host = document.getElementById('poses');
  const store = loadStore();
  host.innerHTML = '';
  for (const name of Object.keys(store)) {
    const row = document.createElement('div'); row.className = 'pose';
    const s = document.createElement('span'); s.textContent = name; row.appendChild(s);
    const load = document.createElement('button'); load.textContent = 'Load';
    load.onclick = () => { applyPose(store[name]); status(`loaded ${name}`); };
    const del = document.createElement('button'); del.textContent = '✕';
    del.onclick = () => { const st = loadStore(); delete st[name]; saveStore(st); renderPoseList(); };
    row.appendChild(load); row.appendChild(del);
    host.appendChild(row);
  }
}

// Load an external poses.json the user exported (merges into the store).
document.getElementById('import').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { try {
    const incoming = JSON.parse(r.result);
    saveStore({ ...loadStore(), ...incoming });
    renderPoseList(); status(`imported ${Object.keys(incoming).length} pose(s)`);
  } catch { status('bad JSON'); } };
  r.readAsText(file);
};

document.getElementById('save').onclick = () => {
  const name = document.getElementById('poseName').value.trim();
  if (!name) { status('name the pose first'); return; }
  const store = loadStore();
  const pose = store[name] = capturePose();
  saveStore(store); renderPoseList();
  const sw = pose.sword
    ? `sword in ${pose.sword.hand} hand ✓`
    : 'NO SWORD (click Left/Right hand first)';
  status(`saved “${name}” — ${Object.keys(pose.bones).length} joints, ${sw}`);
};

document.getElementById('export').onclick = () => {
  const blob = new Blob([JSON.stringify(loadStore(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'poses.json'; a.click();
};

document.getElementById('reset').onclick = () => {
  for (const n of POSABLE) {
    const b = bones.get(n), bind = bindLocal.get(n);
    if (b && bind) b.quaternion.copy(bind);
  }
  status('reset to rest pose');
};

// ---------------------------------------------------------------- ui wiring

for (const btn of document.querySelectorAll('#mode button')) {
  btn.onclick = () => { gizmo.setMode(btn.dataset.mode);
    document.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b === btn)); };
}
for (const btn of document.querySelectorAll('#space button')) {
  btn.onclick = () => { gizmo.setSpace(btn.dataset.space);
    document.querySelectorAll('#space button').forEach((b) => b.classList.toggle('on', b === btn)); };
}

function updateSwordButtons() {
  for (const b of document.querySelectorAll('#sword button')) b.classList.toggle('on', b.dataset.hand === (swordHand ?? 'off'));
}
for (const btn of document.querySelectorAll('#sword button')) {
  btn.onclick = () => setSwordHand(btn.dataset.hand === 'off' ? null : btn.dataset.hand);
}

const castHost = document.getElementById('cast');
for (const [base, names] of Object.entries(CAST)) for (const n of names) {
  const btn = document.createElement('button'); btn.textContent = n; btn.style.flex = '1 0 28%';
  btn.onclick = () => buildCharacter(base, n);
  castHost.appendChild(btn);
}

// Region visibility toggles + grouped bone buttons.
const regionHost = document.getElementById('regions');
for (const reg of Object.keys(REGIONS)) {
  const btn = document.createElement('button'); btn.textContent = reg; btn.className = 'on';
  btn.style.cssText = `flex:1 0 30%;border-left:3px solid #${REGION_COLOUR[reg].toString(16).padStart(6,'0')}`;
  btn.onclick = () => {
    if (visibleRegions.has(reg)) visibleRegions.delete(reg); else visibleRegions.add(reg);
    btn.classList.toggle('on', visibleRegions.has(reg));
    refreshHandleVisibility();
  };
  regionHost.appendChild(btn);
}

const boneHost = document.getElementById('bones');
for (const [reg, names] of Object.entries(REGIONS)) {
  for (const n of names) {
    const btn = document.createElement('button'); btn.textContent = n; btn.dataset.bone = n;
    btn.onclick = () => { if (bones.get(n)) { visibleRegions.add(reg); refreshHandleVisibility(); select(n); } };
    boneHost.appendChild(btn);
  }
}

renderPoseList();

// ---------------------------------------------------------------- loop

function frame() {
  requestAnimationFrame(frame);
  for (const [n, h] of handles) {
    if (!h.visible) continue;
    const b = bones.get(n);
    if (b) { b.updateWorldMatrix(true, false); h.position.setFromMatrixPosition(b.matrixWorld); }
  }
  orbit.update();
  renderer.render(scene, camera);
}

resize();
buildCharacter('venus', 'Maple').then(frame);
