/**
 * Viseme-driven lipsync for browser speech synthesis.
 *
 * SpeechSynthesis exposes no phoneme stream — the only timing signal is a
 * `boundary` event at each word. So the approach is: convert the text to a
 * viseme timeline up front using English grapheme rules, then use the real
 * boundary events to re-anchor that timeline as the voice actually progresses.
 * Between anchors the schedule runs on estimated durations, which keeps the
 * mouth honest even on voices that fire boundaries sparsely or not at all.
 *
 * Shapes are ARKit blend-shape blends, applied through CharacterAnimator.
 */

// Mouth poses. Values are deliberately under 1.0 — real speech is not maximal,
// and shapes at full weight read as shouting.
const VISEMES = {
  rest: {},
  AI: { jawOpen: 0.52, mouthStretchLeft: 0.18, mouthStretchRight: 0.18 },
  E:  { jawOpen: 0.28, mouthStretchLeft: 0.34, mouthStretchRight: 0.34 },
  I:  { jawOpen: 0.18, mouthStretchLeft: 0.30, mouthStretchRight: 0.30, mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 },
  O:  { jawOpen: 0.42, mouthFunnel: 0.55, mouthPucker: 0.22 },
  U:  { jawOpen: 0.14, mouthPucker: 0.72, mouthFunnel: 0.30 },
  // Lips together — the shape that sells "m", "b", "p" and stops the mouth
  // hanging open between words.
  MBP: { jawOpen: 0.02, mouthPressLeft: 0.42, mouthPressRight: 0.42, mouthRollLower: 0.2, mouthRollUpper: 0.2 },
  FV: { jawOpen: 0.10, mouthShrugUpper: 0.30, mouthLowerDownLeft: 0.28, mouthLowerDownRight: 0.28 },
  WQ: { jawOpen: 0.12, mouthPucker: 0.85, mouthFunnel: 0.25 },
  L:  { jawOpen: 0.32, mouthStretchLeft: 0.12, mouthStretchRight: 0.12 },
  TH: { jawOpen: 0.20, mouthStretchLeft: 0.20, mouthStretchRight: 0.20, mouthLowerDownLeft: 0.15, mouthLowerDownRight: 0.15 },
  SZ: { jawOpen: 0.10, mouthStretchLeft: 0.28, mouthStretchRight: 0.28, mouthPressLeft: 0.15, mouthPressRight: 0.15 },
  CH: { jawOpen: 0.18, mouthPucker: 0.42, mouthFunnel: 0.35 },
  KG: { jawOpen: 0.30, mouthStretchLeft: 0.10, mouthStretchRight: 0.10 },
  NT: { jawOpen: 0.16, mouthStretchLeft: 0.16, mouthStretchRight: 0.16 },
  R:  { jawOpen: 0.22, mouthPucker: 0.34, mouthFunnel: 0.20 },
};

// Relative duration weights — vowels hold, plosives are brief.
const HOLD = {
  rest: 1.0, AI: 1.35, E: 1.15, I: 1.0, O: 1.3, U: 1.2, WQ: 1.0,
  MBP: 0.6, FV: 0.85, L: 0.9, TH: 0.9, SZ: 1.0, CH: 0.95, KG: 0.7, NT: 0.7, R: 0.95,
};

/** Map a word's graphemes to a viseme sequence, with a few digraph rules. */
function wordToVisemes(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return [];
  const out = [];
  let i = 0;

  while (i < w.length) {
    const two = w.slice(i, i + 2);
    const c = w[i];

    // Digraphs first — "sh" is not s + h.
    if (two === 'sh' || two === 'ch' || two === 'tc') { out.push('CH'); i += 2; continue; }
    if (two === 'th') { out.push('TH'); i += 2; continue; }
    if (two === 'ph') { out.push('FV'); i += 2; continue; }
    if (two === 'wh' || two === 'qu') { out.push('WQ'); i += 2; continue; }
    if (two === 'ck' || two === 'gh') { out.push('KG'); i += 2; continue; }
    if (two === 'ng' || two === 'nk') { out.push('KG'); i += 2; continue; }
    if (two === 'oo' || two === 'ou' || two === 'ew') { out.push('U'); i += 2; continue; }
    if (two === 'ee' || two === 'ea' || two === 'ie') { out.push('E'); i += 2; continue; }
    if (two === 'oa' || two === 'ow') { out.push('O'); i += 2; continue; }
    if (two === 'ai' || two === 'ay') { out.push('AI'); i += 2; continue; }

    // Silent trailing 'e' ("gate", "rose") — skip rather than adding a vowel.
    if (c === 'e' && i === w.length - 1 && w.length > 2) { i += 1; continue; }

    if ('aà'.includes(c)) out.push('AI');
    else if (c === 'e') out.push('E');
    else if (c === 'i' || c === 'y') out.push('I');
    else if (c === 'o') out.push('O');
    else if (c === 'u') out.push('U');
    else if ('mbp'.includes(c)) out.push('MBP');
    else if ('fv'.includes(c)) out.push('FV');
    else if (c === 'w') out.push('WQ');
    else if (c === 'l') out.push('L');
    else if ('szxc'.includes(c)) out.push('SZ');
    else if ('jg'.includes(c)) out.push('CH');
    else if ('kq'.includes(c)) out.push('KG');
    else if ('ntd'.includes(c)) out.push('NT');
    else if (c === 'r') out.push('R');
    else if (c === 'h') out.push('AI');
    i += 1;
  }

  // Collapse immediate repeats ("ll", "tt") — the mouth doesn't re-articulate.
  return out.filter((v, k) => v !== out[k - 1]);
}

export class Lipsync {
  constructor(animator) {
    this.animator = animator;
    this.timeline = [];      // { viseme, start, end }
    this.wordStarts = [];    // { charIndex, timelineIndex }
    this.playing = false;
    this.t = 0;
    this.rate = 1;
  }

  /**
   * Build the timeline for `text`. `rate` matches the utterance's rate so the
   * schedule tracks a fast or slow voice.
   */
  prepare(text, rate = 1) {
    this.timeline = [];
    this.wordStarts = [];
    this.rate = rate;
    this.t = 0;

    // ~14 phonemes/second at rate 1.0 is close to conversational English.
    const unit = 1 / (14 * rate);
    let cursor = 0;
    const wordRe = /\S+/g;
    let m;

    while ((m = wordRe.exec(text)) !== null) {
      const visemes = wordToVisemes(m[0]);
      this.wordStarts.push({ charIndex: m.index, time: cursor, timelineIndex: this.timeline.length });

      for (const v of visemes) {
        const dur = unit * (HOLD[v] ?? 1);
        this.timeline.push({ viseme: v, start: cursor, end: cursor + dur });
        cursor += dur;
      }

      // Pause between words, longer at punctuation.
      const tail = /[.!?]$/.test(m[0]) ? unit * 5 : /[,;:]$/.test(m[0]) ? unit * 3 : unit * 0.9;
      this.timeline.push({ viseme: 'rest', start: cursor, end: cursor + tail });
      cursor += tail;
    }

    this.duration = cursor;
    return this;
  }

  start() { this.playing = true; this.t = 0; }

  stop() {
    this.playing = false;
    this.animator.setViseme(null);
  }

  /**
   * Re-anchor to a real boundary event. Voices drift from the estimate, and
   * without this the mouth slowly desynchronises over a long line.
   */
  syncToBoundary(charIndex) {
    if (!this.playing) return;
    let best = null;
    for (const w of this.wordStarts) {
      if (w.charIndex <= charIndex) best = w; else break;
    }
    if (!best) return;
    // Ease rather than jump, so a late boundary doesn't visibly snap the mouth.
    this.t += (best.time - this.t) * 0.5;
  }

  update(dt) {
    if (!this.playing) return;
    this.t += dt;

    if (this.t >= this.duration) { this.stop(); return; }

    // Find the active segment and the next, then crossfade between them —
    // hard-switching visemes looks like a puppet.
    let idx = -1;
    for (let i = 0; i < this.timeline.length; i++) {
      if (this.t >= this.timeline[i].start && this.t < this.timeline[i].end) { idx = i; break; }
    }
    if (idx === -1) { this.animator.setViseme(VISEMES.rest); return; }

    const cur = this.timeline[idx];
    const next = this.timeline[idx + 1];
    const span = cur.end - cur.start;
    const k = span > 0 ? (this.t - cur.start) / span : 1;

    const a = VISEMES[cur.viseme] ?? VISEMES.rest;
    const b = next ? (VISEMES[next.viseme] ?? VISEMES.rest) : VISEMES.rest;

    // Blend over the last third of each segment.
    const blend = k > 0.66 ? (k - 0.66) / 0.34 : 0;
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[key] = (a[key] ?? 0) * (1 - blend) + (b[key] ?? 0) * blend;
    }
    this.animator.setViseme(out);
  }
}

/**
 * Speak a line and drive the character's face from it. Resolves when the voice
 * finishes. Falls back to a timed silent read if speech synthesis is missing or
 * blocked, so dialogue pacing survives either way.
 */
export function speak(text, animator, opts = {}) {
  const lip = new Lipsync(animator);
  const rate = opts.rate ?? 1;
  lip.prepare(text, rate);

  animator.speaking = true;
  lip.start();

  return new Promise((resolve) => {
    const finish = () => {
      animator.speaking = false;
      lip.stop();
      resolve();
    };

    if (typeof speechSynthesis === 'undefined') {
      setTimeout(finish, lip.duration * 1000);
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = opts.pitch ?? 1;
    if (opts.voice) u.voice = opts.voice;

    u.onboundary = (e) => lip.syncToBoundary(e.charIndex);
    u.onend = finish;
    u.onerror = finish;

    // Some browsers silently drop utterances; the timeout is the safety net.
    const guard = setTimeout(finish, (lip.duration + 3) * 1000);
    const wrapped = () => { clearTimeout(guard); finish(); };
    u.onend = wrapped;
    u.onerror = wrapped;

    speechSynthesis.speak(u);
    opts.onTick?.(lip);
  }).finally(() => { opts.onDone?.(); });
}
