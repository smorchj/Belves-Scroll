// Tiny CORS receiver so the character site can POST exported GLBs straight to disk.
// Chrome treats http://localhost as a secure origin, so an https page may post to it.
//   node tools/export-receiver.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets-src', 'characters');
fs.mkdirSync(outDir, { recursive: true });

const PORT = 8787;

http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  // Chrome Private Network Access: a public HTTPS page reaching localhost needs this on the preflight.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url.startsWith('/ping')) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (req.method === 'POST' && req.url.startsWith('/upload')) {
    const name = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('name') || 'unnamed.glb');
    const safe = path.basename(name).replace(/[^A-Za-z0-9._ -]/g, '_');
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(outDir, safe), buf);
      console.log(`wrote ${safe} (${(buf.length / 1048576).toFixed(1)} MB)`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(String(buf.length));
    });
    return;
  }

  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`export receiver on http://localhost:${PORT} -> ${outDir}`));
