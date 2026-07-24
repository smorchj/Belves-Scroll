// Tiny sink for canvas PNGs from the audit page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || '.';
fs.mkdirSync(OUT, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try {
      const { name, data } = JSON.parse(body);
      const b64 = data.split(',')[1];
      const file = path.join(OUT, `${name}.png`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log('wrote', file, fs.statSync(file).size);
      res.end('ok');
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end('err');
    }
  });
}).listen(7788, () => console.log('receiver on 7788 ->', OUT));
