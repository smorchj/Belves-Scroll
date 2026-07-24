/**
 * One voice per speaker, decided once and shared by BOTH voicing paths:
 * tools/export-voicelines.mjs (pre-generated clips, mini model) and the
 * in-browser realtime synth (nano model). The two models ship different voice
 * sets, so each speaker owns a SLOT (0-3) within their sex's pool and both
 * paths read the same slot — the timbre differs between models but the casting
 * stays consistent.
 */
import { NPCS, CREATURE_SPAWNS } from './npcs.js';

const VENUS_RECIPES = new Set(['Maple', 'Willow', 'Ember', 'Kari', 'Mildrid', 'Adala', 'Woodland Huldra']);
const NAMED_FEMALE = new Set(['maple', 'mildrid', 'ember', 'kari', 'willow', 'miriam',
  'lilly', 'lilly-raider', 'woodland-huldra', 'adala']);

// Pre-generated (kitten-tts-mini-0.8) voice names by slot.
export const PREGEN_FEMALE = ['Bella', 'Luna', 'Rosie', 'Kiki'];
export const PREGEN_MALE = ['Jasper', 'Bruno', 'Hugo', 'Leo'];
// Realtime (kitten-tts-nano web model) voice names by the same slot.
const LIVE_FEMALE = ['expr-voice-2-f', 'expr-voice-3-f', 'expr-voice-4-f', 'expr-voice-5-f'];
const LIVE_MALE = ['expr-voice-2-m', 'expr-voice-3-m', 'expr-voice-4-m', 'expr-voice-5-m'];

const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function speakerVoice(id) {
  const def = [...NPCS, ...(CREATURE_SPAWNS ?? [])].find((n) => n.id === id);
  let female;
  if (def?.blend) female = VENUS_RECIPES.has(def.blend.a);
  else if (def) female = NAMED_FEMALE.has(def.model) || NAMED_FEMALE.has(def.id);
  else female = NAMED_FEMALE.has(id);
  const pitch = def?.voice?.pitch ?? 1;
  const slot = (Math.round(pitch * 7) + hash(id)) % 4;
  return {
    slot,
    pregen: (female ? PREGEN_FEMALE : PREGEN_MALE)[slot],
    live: (female ? LIVE_FEMALE : LIVE_MALE)[slot],
    rate: def?.voice?.rate ?? 1,
  };
}
