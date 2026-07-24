/**
 * Main-thread door to the realtime KittenTTS worker: synthesize(text, voice)
 * -> { url, dur } playable through the same <audio> path as pre-generated
 * clips. Results are cached as WAV blob URLs so a repeated greeting costs
 * nothing the second time.
 */

let worker = null;
let seq = 0;
const pending = new Map();          // id -> {resolve, reject}
const cache = new Map();            // `${voice}|${text}` -> {url, dur}
const CACHE_MAX = 120;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./TTSWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.error) p.reject(new Error(e.data.error));
    else p.resolve(e.data);
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message ?? 'TTS worker error'));
    pending.clear();
  };
  return worker;
}

function toWavBlob(samples, sampleRate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Load the model in the background (24MB, cached) so the first spoken line
 *  doesn't pay the warm-up. Call once after the world is up. */
export function prewarm() {
  const id = ++seq;
  ensureWorker().postMessage({ id, warmup: true });
  return new Promise((resolve) => { pending.set(id, { resolve, reject: resolve }); });
}

/** -> { url, dur } | null (null = synth failed; caller falls back to silence) */
export async function synthesize(text, voice, speed = 1) {
  const key = `${voice}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const id = ++seq;
    const result = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ensureWorker().postMessage({ id, text, voice, speed });
    });
    const audio = result.audio;
    if (!audio?.length) return null;
    const entry = {
      url: URL.createObjectURL(toWavBlob(audio, result.sampleRate)),
      dur: audio.length / result.sampleRate,
    };
    if (cache.size >= CACHE_MAX) {
      const [k, v] = cache.entries().next().value;
      URL.revokeObjectURL(v.url);
      cache.delete(k);
    }
    cache.set(key, entry);
    return entry;
  } catch (err) {
    console.warn('[VoiceSynth]', err.message);
    return null;
  }
}
