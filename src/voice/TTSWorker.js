/**
 * KittenTTS nano running in a Web Worker — realtime voice for any dialogue
 * line that has no pre-generated clip. WASM only (single-threaded: no
 * cross-origin isolation in dev, and the game already owns the GPU).
 *
 * Assets are fully self-hosted under /assets/tts/ (Apache-2.0, from
 * KittenML/kitten-tts and clowerweb/kitten-tts-web-demo): the ONNX model,
 * voices.json (8 style embeddings), tokenizer.json (phoneme vocab), and the
 * exact onnxruntime-web build the wasm binary was shipped with.
 *
 * Protocol: { id, text, voice, speed } in →
 *           { id, audio: Float32Array (transferred), sampleRate } | { id, error } out.
 */
import { phonemize } from 'phonemizer';

const BASE = `${import.meta.env.BASE_URL}assets/tts/`;
let ready = null;
let ort, session, vocab, voices;

async function init() {
  ready ??= (async () => {
    ort = await import(/* @vite-ignore */ `${BASE}ort.bundle.min.mjs`);
    ort.env.wasm.wasmPaths = BASE;
    ort.env.wasm.numThreads = 1;      // SharedArrayBuffer needs COOP/COEP; don't require it

    // Cache the 24MB model between sessions so only the first visit downloads.
    const fetchCached = async (url) => {
      try {
        const cache = await caches.open('belve-tts-v1');
        const hit = await cache.match(url);
        if (hit) return hit;
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res.clone());
        return res;
      } catch { return fetch(url); }
    };

    const [model, voicesJson, tokenizer] = await Promise.all([
      fetchCached(`${BASE}model_quantized.onnx`).then((r) => r.arrayBuffer()),
      fetchCached(`${BASE}voices.json`).then((r) => r.json()),
      fetchCached(`${BASE}tokenizer.json`).then((r) => r.json()),
    ]);
    session = await ort.InferenceSession.create(model, {
      executionProviders: [{ name: 'wasm', simd: true }],
    });
    voices = voicesJson;
    vocab = tokenizer.model.vocab;
  })();
  return ready;
}

/** Sentence-split so long monologue lines synthesise in steady chunks. */
function sentences(text) {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g) ?? [text];
  return parts.map((s) => s.trim()).filter(Boolean);
}

async function synthesize(text, voice, speed) {
  await init();
  const emb = voices[voice]?.[0];
  if (!emb) throw new Error(`unknown voice "${voice}"`);
  const style = new Float32Array(emb);

  const pieces = [];
  let total = 0;
  const gap = Math.round(24000 * 0.12);

  for (const sentence of sentences(text)) {
    const phonemes = await phonemize(sentence, 'en-us');
    const tokens = `$${phonemes}$`.split('').map((ch) => vocab[ch] ?? 0);
    const out = await session.run({
      input_ids: new ort.Tensor('int64', new BigInt64Array(tokens.map(BigInt)), [1, tokens.length]),
      style: new ort.Tensor('float32', style, [1, style.length]),
      speed: new ort.Tensor('float32', new Float32Array([speed]), [1]),
    });
    let audio = out.waveform.data;
    // Model occasionally emits NaN under quantisation — silence them.
    for (let i = 0; i < audio.length; i++) if (Number.isNaN(audio[i])) audio[i] = 0;
    // The model pads its output with leading/trailing quiet — keep as-is,
    // it reads as natural breath. Just stitch sentences with a short gap.
    pieces.push(audio);
    total += audio.length + gap;
  }

  const joined = new Float32Array(Math.max(0, total - gap));
  let at = 0;
  for (let i = 0; i < pieces.length; i++) {
    joined.set(pieces[i], at);
    at += pieces[i].length + gap;
  }
  return joined;
}

self.onmessage = async (e) => {
  const { id, text, voice, speed = 1 } = e.data;
  if (e.data.warmup) { try { await init(); self.postMessage({ id, ready: true }); } catch (err) { self.postMessage({ id, error: String(err) }); } return; }
  try {
    const audio = await synthesize(text, voice, speed);
    self.postMessage({ id, audio, sampleRate: 24000 }, [audio.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
