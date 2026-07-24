// Sink for the asset-identification harness.
// Deliberately not port 8787 — that is the character export receiver.
//   node tools/survey/png-receiver.mjs <outdir> [port]
//
// Accepts the shot-receiver protocol ({name, data} JSON with a data URL) and
// falls back to a raw body with ?name= for anything posting bytes directly.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'shots');
const PORT = Number(process.argv[3] || 8790);
fs.mkdirSync(OUT, { recursive: true });

const safeName = (n) => path.basename(String(n)).replace(/[^A-Za-z0-9._-]/g, '_');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(404); return res.end(); }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    let name = new URL(req.url, 'http://x').searchParams.get('name');
    let png = buf;

    if (buf[0] === 0x7b) {   // '{' — JSON envelope
      try {
        const body = JSON.parse(buf.toString('utf8'));
        if (body.name) name = body.name;
        png = Buffer.from(String(body.data).split(',')[1], 'base64');
      } catch (e) {
        console.error('bad JSON body', e.message);
        res.writeHead(400);
        return res.end('bad json');
      }
    }

    let file = safeName(name || 'unnamed');
    if (!file.endsWith('.png')) file += '.png';
    fs.writeFileSync(path.join(OUT, file), png);
    console.log('wrote', file, png.length);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
}).listen(PORT, () => console.log(`png receiver on ${PORT} -> ${OUT}`));
