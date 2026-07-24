/** Render each new Meshy asset on a neutral turntable so bad generations are
 *  caught before they go into the world. Writes tools/newasset-<slug>.png. */
import { chromium } from 'playwright';
import { writeFileSync, readdirSync } from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = 'assets-src/meshy-new';
const slugs = readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => f.replace('.glb', ''));

// Tiny static server so the loader can fetch the GLBs over http.
const root = path.resolve('.');
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  try { res.end(require('fs').readFileSync(p)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
page.on('pageerror', (e) => console.log('[err]', String(e).slice(0, 150)));

for (const slug of slugs) {
  const dataUrl = await page.evaluate(async ({ slug, port }) => {
    const THREE = await import('https://esm.sh/three@0.169.0');
    const { GLTFLoader } = await import('https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(400, 400);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe4ea);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 5, 4); scene.add(key);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    const gltf = await new GLTFLoader().loadAsync(`http://localhost:${port}/assets-src/meshy-new/${slug}.glb`);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z);
    gltf.scene.position.sub(c);
    scene.add(gltf.scene);
    cam.position.set(r * 1.4, r * 0.9, r * 1.6);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL('image/png');
  }, { slug, port });
  writeFileSync(`tools/newasset-${slug}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('shot', slug);
}
await browser.close();
server.close();
