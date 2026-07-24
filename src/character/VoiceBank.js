/**
 * NPC voice clips, two tiers:
 *
 * 1. Pre-generated (tools/gen-voices.py, mini model — best quality): the
 *    manifest maps speaker id -> exact line text -> { f: file, d: duration }.
 * 2. Realtime (nano model in a Web Worker): any line the manifest doesn't
 *    know — new dialogue is voiced automatically, no generation step ever
 *    required. Same speaker keeps the same voice slot in both tiers.
 *
 * Returns null only when both tiers fail; the caller then paces the line
 * silently. Browser speechSynthesis is never used.
 */

let _manifest = null;

function load() {
  _manifest ??= fetch(`${import.meta.env.BASE_URL}assets/voice/manifest.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return _manifest;
}

/** -> { url, dur } | null */
export async function voiceClip(speakerId, text) {
  if (!speakerId || !text) return null;
  const entry = (await load())[speakerId]?.[text];
  if (entry?.d > 0.1) return { url: `${import.meta.env.BASE_URL}assets/voice/${entry.f}`, dur: entry.d };

  try {
    const [{ synthesize }, { speakerVoice }] = await Promise.all([
      import('../voice/VoiceSynth.js'),
      import('../data/voices.js'),
    ]);
    const v = speakerVoice(speakerId);
    return await synthesize(text, v.live, v.rate);
  } catch {
    return null;
  }
}
