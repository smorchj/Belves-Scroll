# creategamecharacters.ai — integration notes

Written while building *Belve's Scroll*, a three.js action RPG, against the
platform's agent API. Everything below is from working with the real exports —
12 saved characters, both base meshes, the face recipes and the skin sets.

---

## What works, and works well

**The agent surface is genuinely machine-drivable.** `/agent.md` and
`/.well-known/ai-tools.json` are accurate, complete, and written for a program
rather than retrofitted from a UI. I drove the whole export pipeline from them
without once guessing. That is rare and worth keeping.

**URL-driven export is the right primitive.**
`/image-demo.html?character=<id>&export=character` meant I could pull twelve
finished characters in two batched passes. `export=body` / `head` / `outfit`
covering the separable pieces is exactly the granularity an engine wants.

**The face recipe is the standout feature.** `GET /agent/integration/face-recipe/<base>.json`
being free, unauthenticated and static is a genuinely good decision — it turns a
closed character creator into something I can rebuild inside my own game. All 68
sliders decoded cleanly on both bases (188 targets / 291,304 vertex deltas for
venus; 169 / 260,916 for mars) with no malformed entries. The multi-mesh
coordination on head sliders is correct; nothing separated at the seams.

**Topology is shared across the entire catalogue.** Body 9338, head 6162, eyes
626 each, lashes 480, teeth 7669 — identical on venus, mars, and every exported
character regardless of how far the face was warped. This is the single most
useful property of the platform and it isn't advertised anywhere in the docs. It
let me ship one 1.2MB ARKit morph library and attach it at runtime to whoever is
speaking, instead of carrying the same data in all twelve files.

**The animation documentation is correct.** The character-space delta formula
(`localQuat = inverse(parentBindWorldQuat) · d · bindWorldQuat`) works as
written. More impressively, the tuning numbers are real measurements, not
hand-waving:

| documented | measured |
|---|---|
| bind-pose hand at `[±0.52, 1.01, 0.07]` | `[-0.504, 1.006, 0.16]` |
| "avoid 1.0 rad, it clips at the centreline" | at 1.0 rad the hand reaches `x = +0.02` — across the body midline |

I used the doc's own `probe()` advice to tune my rest pose and landed on 0.55
rad. Docs that survive being checked are worth a lot.

**The skeleton is exactly as specified** — 73 joints, CamelCase with L/R
suffixes, twist bones present and safely ignorable.

---

## What cost me the most time

Ordered by how much work each one caused.

### 1. Hair ships with no texture and no UVs

The hair-shader guide describes a coverage mask in the texture's red channel and
gives a `DoubleSide` + `alphaToCoverage` recipe for it. But the exported hair
meshes carry **no texture at all** (`baseColorTexture: NONE`, `baseColorFactor:
0,0,0,1`) and, more decisively, **no `uv` attribute** — only `position`,
`normal`, `skinIndex`, `skinWeight`.

So the documented technique cannot be applied: there is nothing to sample and no
coordinates to sample it at. Following the guide literally (adding an alpha map)
makes the hair vanish completely. Left alone it renders as opaque black slabs
with a plastic sheen.

These are modelled strand clumps (~30k verts), so opaque rendering is actually
correct — the fix was just roughness `0.88` and dropping the alpha path entirely.
**Either ship the coverage texture and UVs, or update the guide to say that hair
is solid geometry.** Right now the docs describe a pipeline the assets don't
support.

**The fitting side, by contrast, is excellent — and undocumented.** `setHair()`
on `window.__viewerApi` refits a style to whatever skull it is applied to, and
the two fits of one style are *topologically identical* (Quiff: 49,789 verts on
both venus and mars; MidLengthShag: 30,369). They differ only in how the cards
sit on the head — up to 8cm, with the head bone itself 14cm higher on mars.

That property is worth advertising loudly, because it makes a per-lineage hair
system almost free: export both fits, difference them, ship one mesh with the
venus fit as base and the venus→mars delta as a morph target. Influence 0 is the
feminine skull, 1 the masculine, and intermediate values cover a sculpted head in
between. Two styles cost 3.6MB for *both* lineages, and a style authored once
works on every character.

Without knowing this, the obvious move is to lift hair off whichever character
happens to wear it and rescale it onto the other skull, which is wrong by that
same 8cm and shows as hair sinking into or floating off the scalp. Neither
`setHair` nor the shared-topology guarantee appears in `agent.md` or the verb
manifest — `editor.apply_hair` is listed, but nothing says the result is
refitted per base or that fits are interchangeable.

### 2. `samples/<id>/<id>.glb` is the unrigged authoring mesh

This one is a real trap. The obvious way to build a character creator is to start
from the neutral base, and `samples/venus/venus.glb` is served publicly and loads
fine. But it carries **11 generic bones** — `Bone`, `Bone001` … `neutral_bone` —
not the 73-joint humanoid rig. Anything built on it cannot be animated at all.

I only caught this because a `Head` bone lookup returned null late in
integration. I had to re-architect: sculpt the recipe onto an already-rigged
*exported* character instead, which works only because topology is shared.

**A documented URL for a rigged neutral base would remove the whole problem.**
Failing that, the docs should state plainly that the sample meshes are pre-`prepare`
authoring assets.

### 3. Head and body skin tones ship unmatched

Both maps are 2048², sRGB, `flipY=false`, identical material setup — but the
*content* doesn't match. The head is graded from the photo; the body keeps its
base shade. On several characters this is a hard orange-vs-brown seam at the
neck.

`editor.match_skin` exists but is UI-only with no export guarantee, so an
automated pull gets whatever the user last did by hand. I worked around it by
sampling both textures' mean linear colour at load and tinting the body to match.
That's a reasonable engine-side fix, but the grading should survive export.

### 4. Every character duplicates the same ~4.8MB of morph data

Because topology is shared, the 51 ARKit shapes are byte-identical in all twelve
files. Twelve characters meant ~58MB of the same deltas.

Extracting one sparse copy gave **1.2MB for all 58 shapes** (vs 4.21MB dense) —
most shapes only move a small patch of the face, so sparse indices + deltas is a
~4x win before you even account for the duplication. A shared
`expressions.bin` alongside the recipe JSON would be a large, cheap improvement,
and it would let people ship expressive faces on a web budget.

### 5. Undocumented export quirks

- **An 8192×8192 texture** appears in character exports. At RPG viewing distance
  it is invisible; capping at 2048 lost nothing and saved 3MB per character.
- **Meshes are unnamed in character exports.** The base GLBs name them properly
  (`GEO-body_venus`, `eyeL`, `teeth`), but the character exports don't, so
  everything must be identified by vertex count.
- **`eyeL` and `eyeR` both have 626 verts with mirrored deltas.** Vertex-count
  matching crosses them roughly half the time and silently inverts `eyeSpacing`
  and `eyeSize`. Needs a centroid-X or name check.
- **Position attributes are interleaved**, at strides that vary per mesh (6 for
  `eyeL`, 8 for head, 13 for teeth). Naive `array[i*3]` indexing writes morph
  deltas into normals and UVs. Worth a line in the docs.
- **`hair__blend`** is a second full copy of the hair mesh (same ~50k verts) at
  30% alpha, with no alpha map to make it meaningful. It doubles hair cost; I hide
  it.

### 6. No programmatic way to retrieve an export

`driving-by-url.md` documents `export=` but not how to *get the bytes*. There is
no `window.__lastExportGLB` despite `embed.md` referring to one. I ended up
hooking `URL.createObjectURL` to capture the blob before the download fired:

```js
const orig = URL.createObjectURL.bind(URL);
URL.createObjectURL = function (o) {
  if (o instanceof Blob && o.size > 5e6) captured.push(o);
  return orig(o);
};
document.getElementById('exportChar').click();
```

That works, but it's a scraping technique against an otherwise clean API. A
promise-returning `window.gcc.export('character')` would make the embed story
genuinely first-class.

### 7. `?id=<base>` silently loads the last autosaved character

Opening `/image-demo.html?id=mars` with no `character` param loads whatever was
last edited (page title showed "Calm Maple 27"). I exported two "neutral bases"
before noticing the file sizes matched two existing characters to within 12
bytes. An explicit `?fresh=1`, or just not auto-restoring when `id` is given
without `character`, would prevent a subtle and hard-to-notice data error.

### 8. Smaller things

- Recipe `region` is **unique per slider** — 68 sliders across 68 distinct
  regions. It reads like a UI grouping key but can't be used as one; I grouped by
  name prefix instead.
- The recipe JSONs are 5.2MB / 4.8MB and take ~8s to parse. Binary would help.
- Typo in saved data: one outfit is `"Assasin Armor"`, another `"Assassin Armor"`.

---

## The short version

The API, the recipe, and the animation documentation are strong enough that I
built a working character creator, a runtime expression system and a
twelve-character cast against them in a single session. The friction was almost
entirely in the **gap between what the docs describe and what the GLBs actually
contain** — hair with no UVs, a "base mesh" that isn't rigged, skin grading that
doesn't survive export.

Four changes would remove most of it:

1. Publish a **rigged** neutral base, or clearly mark the sample meshes as
   pre-`prepare`.
2. Ship the hair coverage texture and UVs — or correct the guide.
3. Factor the ARKit shapes into one shared, sparse download.
4. **Document the shared topology and `setHair` refitting.** These are two of the
   platform's best properties and neither is written down anywhere. Between them
   they turn hair and expressions from per-character assets into libraries.
