/**
 * One-off: prefix every runtime `/assets/…` string with the deploy base so the
 * game works when served from a GitHub Pages project subpath. Idempotent-ish;
 * run once. Skips comment lines and the dev-only tool files.
 */
import fs from 'fs';

const FILES = [
  'src/character/CharacterFactory.js',
  'src/character/Creator.js',
  'src/character/FaceLibrary.js',
  'src/character/FaceRecipe.js',
  'src/character/HairLibrary.js',
  'src/character/Poses.js',
  'src/character/VoiceBank.js',
  'src/core/Assets.js',
  'src/game/Animal.js',
  'src/voice/TTSWorker.js',
  'src/world/GrassField.js',
  'src/world/Interior.js',
  'src/world/Settlement.js',
  'src/world/Terrain.js',
];

const B = '${import.meta.env.BASE_URL}';

for (const f of FILES) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let n = 0;
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return line;
    let l = line;
    // Quoted whole-path strings: '/assets/x' or "/assets/x" -> `${BASE}assets/x`
    l = l.replace(/(['"])\/(assets)\/([^'"]*)\1/g, (_m, _q, a, rest) => '`' + B + a + '/' + rest + '`');
    l = l.replace(/(['"])\/(assets)\1/g, () => '`' + B + 'assets`');
    // Backtick template literals starting with /assets/
    l = l.replace(/`\/(assets)\//g, '`' + B + '$1/');
    if (l !== line) n++;
    return l;
  });
  fs.writeFileSync(f, out.join('\n'));
  console.log(`${f}: ${n} line(s)`);
}
console.log('done');
