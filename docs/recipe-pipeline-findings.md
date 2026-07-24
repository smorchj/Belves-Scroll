# Recipe pipeline — first real test

2026-07-22. First end-to-end run of the `export=recipe` pipeline against the
live site: 11 characters (venus: Maple, Willow, Ember, Kari, Mildrid; mars:
Snader, Haggar, Travis, Cedar, Pobart, Charles), both prepared bases, full
reconstruction in three.js, plus a recipe-blending test.

Artifacts: `tools/audit-recipes.mjs` (measurements → `docs/recipe-audit.json`),
`recipetest.html` + `src/recipe-preview.js` (visual bench:
`?view=full`, `?view=heads&group=venus|mars`, `?view=blend&a=Maple&b=Willow`),
screenshots `recipe-lineup-full.png`, `recipe-heads-*.png`, `recipe-blend.png`.

---

## What works well

**The core promise holds.** All 11 characters rebuilt from 2 base GLBs + 11
recipe JSONs. Reconstruction error vs the full GLB exports is ≤0.01mm on every
mesh of every current-format recipe — exactly the "10 microns" the docs claim.
UV-keyed matching had **zero misses** across all meshes and all characters
(worst UV distance 5.99e-7, far inside the 1e-4 tolerance), and index-keyed
teeth had zero out-of-range indices.

**The prepared bases fix the old trap.** `/api/prepared/<base>` serves fully
rigged meshes: 73 joints with correct names (`Hips`, `Spine_01`…), 51 ARKit
morphs on the head, 7 teeth morphs, named nodes, real textures, no animation
clips — 18–19MB each. This is the rigged neutral base the old feedback doc
begged for, and it's public (no auth). Recipes carry the right `baseUrl`.

**Headless automation is now first-class.** `?character=<id>&export=recipe`
plus `window.__lastExportGLB` (a receipt object: `name`, `bytes`, blob `url`,
`meta` with the full recipe, `path`) worked 11/11 with no clicking and no blob
hooking. Exports are free and cost no tokens.

**Rebuild is fast and blending works.** 6–181ms per character in-browser (cost
is mostly texture decode). Offsets lerp linearly — a 50/50 Maple×Willow with
crossfaded skin textures produces a plausible intermediate face. Recipes are a
*generative* representation, not just compression: crowd NPCs can be bred from
the named cast.

**Size math.** 11 recipes = 40.6MB + two bases 37MB ≈ 78MB, vs ~500MB of raw
GLB exports for the same 11 — before any of the fixes below.

## What can be improved

### Platform side (creategamecharacters.ai)

1. **RESOLVED same day — old-schema exports.** Ember, Mildrid and Travis
   initially exported in an older index-only schema with `textures: null`.
   After the site-side fix, all three re-export in the current format with
   full textures; Mildrid and Travis round-trip at ≤0.009mm. (Ember still
   differs 5.1mm from her Jul 19 GLB — that GLB is stale; she was edited on
   the site after it was exported. The recipe is correct.) The re-export also
   added a `morphTargets` field (ARKit shape names: 51 head, 7 teeth) —
   useful for consumers to validate morph mapping. Remaining ask: bump
   `version` when the schema changes.
2. **`character.id` is `null`** in current-format recipes (the old format
   carried it). Automation needs the id to tie a recipe back to the roster.
3. **The worn outfit is not recorded.** No `outfit` field appears even when
   exporting with `&outfit=Merchant%20Dress`, although `ai-tools.json` and
   `export-recipe.md` both promise one. The game must keep its own
   character→outfit table.
4. **~47% of every recipe is duplicated shared textures.** Eye (697KB ×2),
   teeth (294KB) and lash (~600KB) data URIs are byte-identical across all 8
   current-format recipes — the eye/teeth maps are even identical across
   venus and mars — and those same images already live inside the base GLB.
   Only head and body maps differ per character. Shipping just those would cut
   ~4.9MB recipes to ~1MB (close to the docs' advertised ~0.6MB).
5. **Eye colour never survives:** `eyes.color` is `null` in all 11 and the eye
   textures are the base ones, so any per-character eye colour set in the
   editor is lost.
5b. **Recipes invent hair for bald characters.** Willow, Haggar and Charles
   have `hair: {name: null, color: null}` in the character store (verified in
   IndexedDB `characterStore`), but their recipes carry another character's
   hair verbatim — Willow got Maple's (MidLengthShag #c28b66), Haggar got
   Snader's (Quiff #6a472f), Charles got Pobart's (Quiff #6b6b6b). The other
   8 recipes match their stored hair exactly. Likely the exporter falls back
   to the *global* `cf_hair_color`/`cf_hair_name` localStorage state (or the
   last hair applied in-session) when the record has none. A recipe for a
   bald character should say `hair: null`.
5c. **Hair-fitting is undocumented.** `export-recipe.md` says "attach
   hair.style tinted with hair.color" — but the `/_hair/<style>.glb` assets
   are fitted to the *neutral* base skull, and recipes deform skulls by up
   to ~1cm, so base-fit hair can clip or float on heavily sculpted heads.
   The recipe already contains the cure: conform the hair by sampling the
   head's offset field — for each hair vertex take the offset of the nearest
   neutral-base scalp vertex, feathered by distance (full ≤1.5cm, zero at
   4cm). Implemented and verified in the bench (`?conform=0` to compare);
   the docs should describe this (or the exporter should ship per-character
   hair offsets using the same sparse encoding — hair topology is shared per
   style).
6. **Docs drift:** `export-recipe.md`'s example `baseUrl` is
   `/_prepared/venus.glb` which 404s (real: `/api/prepared/<base>`); the
   documented `outfit` field doesn't exist; sizes say ~0.6MB vs actual ~5MB.
7. **Mars base inconsistencies:** the teeth *mesh* record is named `Mesh.001`
   (node name is `teeth` — match on node names, not glTF mesh names), and mars
   lacks the `wetlayer` (266v) and `eye_shadow` (102v) meshes venus has.
8. **Head/body grading — CORRECTED after measurement.** The current-format
   recipe textures ship *well matched*: mean skin tone of head vs body maps
   differs by ≤ 10/255 on all 8 (Maple 10, Snader 9, Kari 8, Pobart 7,
   Charles 6, Willow/Haggar/Cedar 3). The dramatic neck seams in the first
   lineup renders were a **consumer-side artifact**: recomputing normals
   per-mesh after applying offsets breaks the authored normal continuity where
   the head mesh meets the body (`recipe-seams-keepnormals.png` vs
   `recipe-seams-recompute.png`; bench `?view=seams`). Keep the base normals
   (identity offsets are sub-centimetre) — or reconcile boundary normals —
   and the seam disappears. Site-side, per-character **body baking is still
   the right direction** (future scars/tattoos/undergarments, and it removes
   residual per-region differences like hand grading), but there is no urgent
   seam bug in current recipes. The real texture bug remains the three
   old-schema recipes whose textures are `null` (item 1).
9. Small: recipe eyelashes on Willow (450/480 moved) and Haggar (458/480)
   differ from their GLB exports by up to 1.3mm — possibly stale comparison
   GLBs, worth a spot check; the receipt `path` writes the recipe as
   `<name>_recipe.json_22.glb` (a JSON with a `.glb` suffix).

### Game side

10. **Adopt node-name matching with vertex-count fallback** (the bench's
    `findMesh`) — it absorbed the `Mesh.001` quirk. Keep the eyeL/eyeR
    centroid check from `FaceRecipe._bind` for unnamed legacy GLBs.
11. **The roster is stale:** Kari and Pobart exist only on the site
    (`Pobart` is the renamed "Police man", same id `40edbe49…`; Slyder has a
    new id). Add a roster-sync step that scrapes `/saved.html` before pulls.
12. **Outfits are the missing half.** Recipes cover skin/face/hair only; the
    dressed cast needs `export=outfit` (+`hideEncoding`) per outfit and a
    character→outfit map in `src/data/npcs.js` or the roster.
13. **Old-format tolerance:** treat missing `key` as index-keyed and `null`
    textures as "keep base skin" (the bench does) — or better, re-save those
    three characters on the site and re-export.
14. **Dedupe shared textures at asset-build time** even if the platform
    doesn't: hash the data URIs, extract shared ones once (they're already in
    the base GLB), keep only head+body per character. ~40MB → ~13MB for 11.
