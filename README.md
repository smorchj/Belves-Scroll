# Belve's Scroll

A browser-playable open-world RPG demo built in [three.js](https://threejs.org),
with an **in-game character creator** and a full cast of characters generated
through [**creategamecharacters.ai**](https://creategamecharacters.ai).

### ▶ [Play the demo](https://smorchj.github.io/Belves-Scroll/)

*(Desktop + a discrete GPU recommended. First load pulls the world assets, so
give it a moment.)*

---

## What this demo is really testing

**This demo is mainly a test of how well an AI agent can build an in-game
character creator using [creategamecharacters.ai](https://creategamecharacters.ai)
— and the answer is: very easily.**

The site's assets and documentation unlock that power in *any* agent that visits
it. The whole recipe pipeline — two shared rigged base meshes, per-character
sparse-offset recipes, 68 identity blendshapes, shared morph library, seated
conforming hair, outfit layers with body-culling, up-to-four-way heritage
blending, one-way texture rules — was reconstructed by an agent purely from what
the site publishes at `/agent.md` and `/agent/…`. **10/10 on this.**

The **in-game character creator is where the demo truly shines** — effectively
one-shotted by pointing **Claude Opus 4.8** at creategamecharacters.ai and
letting it read the docs.

Being honest about the rest: **the world-building leaves a lot to be desired,
and the procedural animations are goofy.** That's the agent's work around the
edges — not the character tech, which is the strong part.

---

## Credits & attribution

### Characters — [creategamecharacters.ai](https://creategamecharacters.ai)
Every human in this game — the player, the named cast, and the crowd of blended
villagers — is built from **creategamecharacters.ai**: its two prepared base
meshes, its exported character *recipes* (sparse geometry offsets + skin
textures), its ARKit blendshapes, its hair and outfit exports, and its
documented three.js shader/rig integration. The in-game creator is a direct
implementation of the site's `export=recipe` pipeline. If you want to build
game-ready characters yourself — or point your own agent at a documented
character API — start there.

### Other assets
- **Props, buildings & creatures** — generated with [Meshy AI](https://meshy.ai).
- **NPC voices** — pre-generated with [KittenTTS](https://github.com/KittenML/KittenTTS)
  (Apache-2.0), with an optional in-browser realtime fallback via
  [onnxruntime-web](https://github.com/microsoft/onnxruntime).
- **Terrain** — elevation sampled from Kartverket (Norwegian Mapping Authority)
  DTM tiles over the Herøy islands.
- **Engine** — [three.js](https://threejs.org).

### Built by
Directed by [@smorchj](https://github.com/smorchj), implemented by
**Claude** (Anthropic) — Opus 4.8 for the character creator, and the wider
build across the Claude family.

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
```

The processed runtime assets live under `public/assets` and ship with the repo.
The raw source assets (`assets-src`, ~2.8 GB of Meshy/character exports) are not
committed; `npm run assets` regenerates `public/assets` from them if you have
them.

## Controls

`WASD` move · `Shift` run · `Space` jump · `LMB` attack · `Shift+LMB` power
attack · `RMB` block · `E` interact · `I` inventory · `J` journal · `Esc` close

---

*Belve's Scroll is a non-commercial technology demo. creategamecharacters.ai,
Meshy, KittenTTS and three.js are the property of their respective owners.*
