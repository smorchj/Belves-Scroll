"""Generate NPC voice audio from tools/voicelines.json with KittenTTS.

Writes public/assets/voice/<speaker>/<hash>.ogg (opus 32k mono, from the
model's 24 kHz output) plus public/assets/voice/manifest.json:

    { "<speaker>": { "<line text>": { "f": "<speaker>/<hash>.ogg", "d": seconds } } }

Idempotent: a line whose (voice, rate, text) hash already has a file on disk
is skipped, so reruns only synthesise new or changed lines.

    tools/tts-env/Scripts/python tools/gen-voices.py
"""
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "voice")
LINES = json.load(open(os.path.join(ROOT, "tools", "voicelines.json"), encoding="utf-8"))

import soundfile as sf
from kittentts import KittenTTS

model = KittenTTS("KittenML/kitten-tts-mini-0.8")

manifest = {}
made = skipped = failed = 0
for i, line in enumerate(LINES):
    speaker, voice, rate, text = line["speaker"], line["voice"], line.get("rate", 1), line["text"]
    key = hashlib.sha1(f"{voice}|{rate}|{text}".encode()).hexdigest()[:12]
    rel = f"{speaker}/{key}.ogg"
    path = os.path.join(OUT, speaker, f"{key}.ogg")
    os.makedirs(os.path.dirname(path), exist_ok=True)

    if not os.path.exists(path):
        try:
            audio = model.generate(text, voice=voice, speed=rate)
        except TypeError:
            audio = model.generate(text, voice=voice)
        except Exception as e:
            print(f"  FAILED [{speaker}] {text[:50]}: {e}", flush=True)
            failed += 1
            continue
        wav = path[:-4] + ".wav"
        sf.write(wav, audio, 24000)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
             "-c:a", "libopus", "-b:a", "32k", "-ac", "1", path],
            check=True)
        os.remove(wav)
        made += 1
    else:
        skipped += 1

    dur = sf.info(path).duration if os.path.exists(path) else 0
    manifest.setdefault(speaker, {})[text] = {"f": rel, "d": round(dur, 2)}
    if (i + 1) % 25 == 0:
        print(f"  {i + 1}/{len(LINES)}", flush=True)

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print(f"done: {made} generated, {skipped} cached, {failed} failed -> {OUT}")
