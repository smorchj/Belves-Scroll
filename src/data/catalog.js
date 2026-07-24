/**
 * Curated asset catalog — the single source of truth for what exists, what it's
 * called, and how big it is.
 *
 * Meshy normalizes every generated prop into a ~2-unit bounding cube, so a sword,
 * a castle keep and a tree stump all arrive the same "size". None of the real
 * scale survives the export, so every `scale` here is authored by hand against an
 * intended real-world height in metres (`metres`, for reference).
 *
 * Used by tools/process-assets.mjs (to name outputs) and by the world builder.
 */

export const PROPS = {
  // ---- weapons (blade lengths in the 0.5–1.2m range) ----
  'sword-iron':       { src: 'sword_0718203427',            scale: 0.55, metres: 1.1, tags: ['weapon', 'sword'] },
  'sword-slim':       { src: 'sword_0718203541',            scale: 0.52, metres: 1.0, tags: ['weapon', 'sword'] },
  'dagger-flamewing': { src: 'Flamewing_Dagger_0718202856', scale: 0.28, metres: 0.53, tags: ['weapon', 'dagger'] },

  // ---- structures ----
  // A walled compound — curtain walls, gatehouse, six towers, a great hall — not
  // a single keep. At 15m the gatehouse arch measured 1.4-1.9m against a 1.7m
  // figure; 35 is the smallest size at which the gate and walls read correctly.
  // Note `metres` is footprint-driven here (15.0 wide vs 8.5 tall), unlike the
  // rest of the buildings, so raising it widens more than it heightens.
  'castle-keep':      { src: 'Castle_Keep_0718203528',       scale: 18.402, metres: 35,  tags: ['building', 'landmark', 'castle', 'fortification'] },
  'citadel-crimson':  { src: 'Crimson_Citadel_0718210206',   scale: 12, metres: 23,  tags: ['building', 'landmark', 'temple'] },
  // Named 'citadel' but there is no architecture on it at all: a giant red
  // crystal erupting from a rock outcrop, on a baked lava plinth. Not a building
  // and must never enter a dwelling or town rotation. Sink to hide the plinth.
  'citadel-crystal':  { src: 'Crimson_Crystal_Citad_0718210040', scale: 9.531, metres: 18, tags: ['landmark', 'crystal', 'terrain', 'resource-node'] },
  // Two storeys plus a roof. At 20 the main arch measured 3.8m — a double-height
  // door — because `metres` was set by how important the building is rather than
  // by counting storeys.
  // High-detail re-export (0723, ~30k tris) as the near LOD; the original
  // ~3k export is kept as `lodFar` for distance. Low-poly read badly up close
  // at 11m — see tools/process-assets emitting <name>.lod1.glb.
  'guild-hall':       { src: 'Fantasy_Guild_Hall_0723190759', lodFar: 'Fantasy_Guild_Hall_0718205944', scale: 5.511,  metres: 11,  tags: ['building', 'town', 'guild', 'tavern'] },
  // A one-room cottage with a giant bottle through the roof as its shop sign. At
  // 19 the door measured 4.1m and the cottage body alone stood as tall as a
  // four-storey block. 10 is the cottage at ~7.5m plus the bottle.
  'potion-house':     { src: 'Magic_Potion_House_0723190905', lodFar: 'Magic_Potion_House_0718205925', scale: 5.024,  metres: 10,  tags: ['building', 'town', 'shop', 'alchemist'] },
  'farmstead':        { src: 'Domaine_des_Moutons__0718205954', scale: 5.115, metres: 10, tags: ['building'] },
  'tower-round':      { src: 'tower_0718204822',             scale: 9,  metres: 17,  tags: ['building'] },
  // Bell, cross finial and cruciform windows: explicitly a church campanile, not
  // a generic tower. Do not reuse it as a watch or wizard tower.
  'tower-slim':       { src: 'tower_0718204835',             scale: 9,  metres: 18,  tags: ['building', 'tower', 'church', 'religious'] },
  // 26 was residue from the potion-house mix-up: this asset was scaled up twice
  // by agents chasing a complaint about a building 1.3km away. Reverted rather
  // than nudged. At 26 its one habitable room was 8m floor to ceiling.
  'treehouse':        { src: 'Verdant_Lantern_Treeh_0718210220', scale: 7.904, metres: 15, tags: ['building', 'landmark', 'dwelling', 'elven', 'forest'] },
  // Not a ruin — a debris heap. No wall stubs, no post bases, no doorway, nothing
  // that says a building stood here. Size is right; it is only ever ground
  // clutter, and it cannot communicate "ruins" to the player on its own.
  'ruins-timber':     { src: 'Mossy_Timber_Ruins_0718205057', scale: 2.455,  metres: 4.5, tags: ['debris', 'clutter', 'terrain', 'forest'] },

  // ---- landscape dressing ----
  // A natural rock arch, not masonry: no dressed stone, no courses, no keystone.
  // Tagged 'ruin' it would land in ruined-settlement rotations beside real walls.
  'archway':          { src: 'Ancient_Mossy_Archway_0718205358', scale: 4, metres: 7.6, tags: ['nature', 'terrain', 'landmark'] },
  // A natural hoodoo, not a worked monolith — no carving, no deliberate shaping.
  // Do not use it where a standing stone or menhir is wanted.
  'pillar-stone':     { src: 'Stone_Pillar_0718204802',      scale: 3,  metres: 5.7, tags: ['nature', 'terrain', 'rock'] },
  // A natural boulder that was carved, rather than a collapsed structure. The
  // petroglyphs are on ONE face; the reverse is blank, so it must be turned to
  // face the approach or the whole point of the asset is lost.
  'rock-drawings':    { src: 'Ancient_Rock_Drawings_0718204749', scale: 1.488, metres: 2.8, tags: ['nature', 'lore', 'landmark'] },
  // No figure, no carved face, no plinth — a slate crag with a short stone stair
  // at its foot. Anything that places this expecting a humanoid guardian gets a
  // pile of rocks. Kept under the old key only so existing saves resolve.
  'sentinel-statue':  { src: 'Stone_Sentinel_0718204326',     scale: 3,  metres: 5.7, tags: ['nature', 'terrain', 'rock', 'landmark'] },
  // Five separate trees on visible plinth slabs. 4 was measuring the WIDTH OF THE
  // ROW: each tree stood 1.41m, shoulder height on a 1.7m figure, which is why it
  // could not work as the landmark it was tagged as. 16 puts the trees at 5-6m.
  // Sink hard when placing — every tree carries a display-stand base slab.
  'clockwork-grove':  { src: 'Clockwork_Grove_0718205345',    scale: 8.466,  metres: 16,   tags: ['nature', 'cluster', 'decor'] },
  'tree-hollow':      { src: 'Enchanted_Hollow_Tree_0718205315', scale: 7, metres: 14, tags: ['nature'] },
  // 1.9 made this chest-height on the figure, off a two-metre-thick trunk. A
  // forest stump is knee-to-thigh; scatter jitter takes 1.1 across the range.
  'stump-mossy':      { src: 'Mossy_Stump_0718204306',       scale: 0.578, metres: 1.1, tags: ['nature'] },
  // Not a variant — the same mesh as stump-mossy, 5% smaller. The '-b' suffix
  // promised shape variety that does not exist, so a scatter set picking between
  // the two produced visible repetition. Left catalogued (the file is real) but
  // deliberately unused; vary stump-mossy procedurally instead.
  'stump-mossy-b':    { src: 'Mossy_Stump_0718203923',       scale: 0.576, metres: 1.1, tags: ['nature', 'duplicate'] },

  // ---- small props ----
  // The stone is crimson, not amber. 0.07 was a napkin ring — three times a real
  // ring — so in-world it rendered comically oversized. At a true 0.025 it is
  // sub-pixel at any normal camera distance: treat it as an inventory icon.
  'ring-amber':       { src: 'Amber_Heart_Vine_Ring_0718103548', scale: 0.013, metres: 0.025, tags: ['trinket', 'jewellery', 'loot'] },
  'mask-owl':         { src: 'The_Verdant_Owl_Masqu_0718103600', scale: 0.14, metres: 0.27, tags: ['trinket'] },

  // --- interiors: dressing for the enterable buildings ---
  // At 3.0 the counter top sat at 0.63m — knee height, which is why it was given
  // a plinth to stand on. The mesh's internal proportions are correct (stool seat
  // to counter top is 0.62, real bars are ~0.68); it was simply scaled to 57% of
  // life. 5.3 brings the counter to 1.1m, and the plinth is no longer needed.
  // Cluster: four stools are fused to the counter and cannot be moved or added to.
  'inn-bar':          { src: 'inn-bar',        scale: 2.791,  metres: 5.3, tags: ['interior', 'furniture', 'tavern', 'cluster'] },
  // `metres` is the cluster footprint including the one fused stool; the tabletop
  // itself is ~1.1m square.
  'inn-table':        { src: 'inn-table',      scale: 0.95, metres: 1.8, tags: ['interior', 'furniture', 'cluster'] },
  'barrel':           { src: 'barrel',         scale: 0.45, metres: 0.9, tags: ['prop', 'container', 'interior', 'exterior'] },
  // Not a container. A mossy cave mouth on a baked oval of terrain, with coins
  // scattered in the ground texture — which is all the name was ever based on.
  // At 1.1 the arch was knee-high and nothing could enter it. Exterior only, and
  // it has to be sunk into a bank or its own ground slab shows.
  'treasure':         { src: 'treasure',       scale: 1.584,  metres: 3, tags: ['ruin', 'nature', 'landmark', 'cave'] },

  // --- houses: the ribbon along Main Street is built from these ---
  // Four distinct dwellings. With per-instance scale jitter, street-aligned
  // rotation and tint variation, four meshes cover ~22 houses without the
  // ribbon reading as copy-paste.
  //
  // house-trad is a Japanese minka shopfront, not a Norse dwelling, and clashes
  // with its neighbours in a row — kept in the rotation only as the inn, which is
  // a shop and stands apart from the ribbon.
  'house-trad':       { src: 'building-trad',  scale: 4.2,  metres: 8.0, tags: ['building', 'shop', 'east-asian', 'has-base'] },
  // Not a house: a witch's-hut diorama welded to its own circular terrain mound,
  // complete with boulder rim, dead trees, picket fence and gravestones. Only ~5m
  // of the 8 is habitable structure; the rest is landscape. Instances cannot be
  // lined up along a street — each one plants a hill with a graveyard on it — so
  // it is out of the dwelling rotation and belongs alone on flat ground.
  'house-highl':      { src: 'building-highl', scale: 4.406,  metres: 8.0, tags: ['building', 'landmark', 'diorama', 'has-terrain-base', 'spooky'] },
  'house-t1':         { src: 'house-t1',       scale: 4.2,  metres: 8.0, tags: ['building', 'house'] },
  'house-t2':         { src: 'house-t2',       scale: 4.2,  metres: 8.0, tags: ['building', 'house'] },
  // 7.5m read as a playhouse — the mesh carries TWO storeys of gable windows,
  // and at 7.5 its door stood 1.2m. At 11.5 the door is ~1.9m and the naust
  // variants (0.72-0.88 scaleMul) land on the real 8-10m naust footprint.
  'house-t3':         { src: 'house-t3',       scale: 5.779,  metres: 11.5, tags: ['building', 'house'] },

  // --- imported batch: trees, furniture, containers, weapons ---
  'tree-fir':           { src: 'tree-fir',            scale: 5.334, metres: 9, tags: ['nature', 'tree'] },
  'tree-old':           { src: 'tree-old',            scale: 3.79, metres: 7.5, tags: ['nature', 'tree'] },
  'tree-verdant':       { src: 'tree-verdant',        scale: 3.88, metres: 7, tags: ['nature', 'tree'] },
  'tree-cluster':       { src: 'tree-cluster',        scale: 4.972, metres: 9.5, tags: ['nature', 'tree'] },
  'plant-succulent':    { src: 'plant-succulent',     scale: 0.261, metres: 0.5, tags: ['nature', 'plant'] },
  'logs':               { src: 'logs',                scale: 1.139, metres: 2.2, tags: ['nature', 'prop'] },
  'cabinet':            { src: 'house-cabin',        scale: 1.042, metres: 2, tags: ['interior', 'furniture'] },
  'wishing-well':       { src: 'wishing-well',        scale: 1.125, metres: 2.2, tags: ['structure'] },
  // Pristine, not ruined: crisp arrises, clean joints, no moss, not one missing
  // stone. Placed in a ruin field beside genuinely weathered pieces like
  // pillar-crumbling it reads as a mistake. It is a ceremonial gateway — give it
  // a path through it. Carries a paved plinth that has to be sunk. Note the
  // separate 'archway' entry is 7.6m, so the two are not interchangeable.
  'archway-stone':      { src: 'archway-stone',       scale: 2.103, metres: 4.2, tags: ['structure', 'gateway', 'architecture', 'has-base'] },
  'pillar-crumbling':   { src: 'pillar-crumbling',    scale: 1.69, metres: 3.4, tags: ['structure', 'ruin'] },
  'bed':                { src: 'bed',                 scale: 1, metres: 2, tags: ['interior', 'furniture'] },
  'bathtub':            { src: 'bathtub',             scale: 0.847, metres: 1.7, tags: ['interior', 'furniture'] },
  'stump-chair':        { src: 'stump-chair',         scale: 0.469, metres: 0.9, tags: ['interior', 'furniture'] },
  'stone-throne':       { src: 'stone-throne',        scale: 0.885, metres: 1.7, tags: ['interior', 'furniture'] },
  'candelabra':         { src: 'candelabra',          scale: 0.255, metres: 0.5, tags: ['interior', 'light'] },
  'chest-plain':        { src: 'chest-plain',         scale: 0.518, metres: 1, tags: ['prop', 'container', 'loot'] },
  'chest-iron':         { src: 'chest-iron',          scale: 0.521, metres: 1, tags: ['prop', 'container', 'loot'] },
  'chest-vine':         { src: 'chest-vine',          scale: 0.55, metres: 1.1, tags: ['prop', 'container', 'loot'] },
  'chest-overgrown':    { src: 'chest-overgrown',     scale: 0.565, metres: 1.1, tags: ['prop', 'container', 'loot'] },
  'goblet-gold':        { src: 'goblet-gold',         scale: 0.105, metres: 0.2, tags: ['interior', 'clutter'] },
  'chalice-vine':       { src: 'chalice-vine',        scale: 0.125, metres: 0.24, tags: ['interior', 'clutter'] },
  // An Attic Greek black-figure amphora. Size is right, but 'vase' plus 'clutter'
  // invited scattering it through Norse cottages, where it reads as an
  // anachronism. It is a container, and it wants a trader, temple or study.
  'vase':               { src: 'vase',                scale: 0.348, metres: 0.7, tags: ['interior', 'container', 'classical', 'exotic'] },
  // Not a carving. A low round brass tray table on three cabriole legs, 0.36m
  // tall — the house-cabin failure repeating. Anyone trusting the name places a
  // wall relief and gets a coffee table on the floor. It is furniture, and it
  // must stand on the floor, never on a shelf or a counter.
  'decor-carving':      { src: 'decor-carving',       scale: 0.419, metres: 0.8, tags: ['interior', 'furniture', 'table', 'exotic', 'metal'] },
  'sword-enchanted':    { src: 'sword-enchanted',     scale: 0.544, metres: 1.05, tags: ['weapon'] },
  'sword-shadow':       { src: 'sword-shadow',        scale: 0.546, metres: 1.05, tags: ['weapon'] },
  'axe-viking':         { src: 'axe-viking',          scale: 0.468, metres: 0.9, tags: ['weapon'] },

  // --- generated dressing batch (Meshy, 2026-07-23) ---
  // All normalise to Meshy's ~1.9-unit longest axis, so scale ≈ metres / 1.9.
  // Village, farm and waterfront clutter — the "world feels empty" fix.
  // A Norse stave church: the village's landmark, ~13m to the ridge. Tall and
  // slender, so scale is driven by height, not footprint.
  // A stave church has to tower over the village to read as its landmark — at
  // 13m it stood no taller than the houses. ~22m to the spire.
  'stave-church':   { src: 'stave-church',  scale: 11.5, metres: 22,  tags: ['building', 'landmark', 'church', 'religious', 'norse'] },
  'rowboat':        { src: 'rowboat',       scale: 2.1,  metres: 4.0, tags: ['prop', 'boat', 'waterfront', 'exterior'] },
  'fish-rack':      { src: 'fish-rack',     scale: 1.84, metres: 3.5, tags: ['prop', 'waterfront', 'farm', 'exterior'] },
  'market-stall':   { src: 'market-stall',  scale: 1.58, metres: 3.0, tags: ['prop', 'town', 'market', 'exterior'] },
  'handcart':       { src: 'handcart',      scale: 1.32, metres: 2.5, tags: ['prop', 'town', 'farm', 'exterior'] },
  'haystack':       { src: 'haystack',      scale: 1.4,  metres: 2.4, tags: ['prop', 'farm', 'exterior'] },
  'woodpile':       { src: 'woodpile',      scale: 1.05, metres: 2.0, tags: ['prop', 'village', 'exterior'] },
  'rune-stone':     { src: 'rune-stone',    scale: 1.26, metres: 2.4, tags: ['landmark', 'lore', 'wildlands', 'exterior'] },
  'crates':         { src: 'crates',        scale: 0.9,  metres: 1.7, tags: ['prop', 'container', 'waterfront', 'exterior'] },
  'sign-post':      { src: 'sign-post',     scale: 1.58, metres: 3.0, tags: ['prop', 'town', 'exterior'] },
  // Marks where someone fell — spawned at runtime once a body has settled.
  'gravestone':     { src: 'gravestone',    scale: 0.58, metres: 1.1, tags: ['prop', 'grave', 'exterior'] },

};

/**
 * Both rigged Meshy creatures share an identical 24-joint skeleton, so their
 * clips are interchangeable — 13 usable animations across the two files. Only
 * the *_Merged_Animations exports are loaded; the _Character_output files hold
 * the same mesh with nothing but a bind-pose stub.
 */
export const CREATURES = {
  colossus: {
    src: 'Meshy_AI_Emerald_Colossus_biped/Meshy_AI_Emerald_Colossus_biped_Meshy_AI_Meshy_Merged_Animations',
    scale: 2.4, metres: 4.1,
    clips: {
      walk: 'Walking', run: 'Running',
      attack: 'Punch_Combo', attackHeavy: 'Punch_Combo_2',
      slam: 'Angry_Ground_Stomp_2', hit: 'Face_Punch_Reaction_1',
    },
    // No idle in this file; borrowed from the wraith, whose skeleton matches.
    borrowIdle: 'wraith',
  },
  wraith: {
    src: 'Meshy_AI_Galactic_Entity_Adven_biped/Meshy_AI_Galactic_Entity_Adven_biped_Meshy_AI_Meshy_Merged_Animations',
    scale: 1.15, metres: 1.95,
    clips: {
      idle: 'Idle_10', walk: 'Walking', run: 'Running',
      block: 'Block3', attack: 'Elbow_Strike',
      attackHeavy: 'Charged_Upward_Slash', kick: 'Boxing_Guard_Right_Straight_Kick',
    },
  },
};

/** Named characters exported from the user's creategamecharacters.ai library. */
export const CHARACTERS = [
  'charles', 'mildrid', 'lilly-raider', 'ember', 'haggar', 'maple',
  'snader', 'cedar', 'miriam', 'makal', 'woodland-druid', 'woodland-huldra',
];

/** Skin shades available in the character creator, per base mesh. */
export const SKIN_SHADES = ['pale', 'fair', 'tanned', 'brown', 'black'];
export const HAIR_STYLES = [null, 'Quiff', 'MidLengthShag'];

/** Assets deliberately excluded, so the reason isn't rediscovered later. */
export const EXCLUDED = {
  'Flamewing_Dagger_0718103915': 'raw un-remeshed duplicate, 96,787 tris',
  'sword_0718203505': 'bbox is near-cubic (1.71x1.98x1.59), not blade-shaped',
  'XP_17_0718104015': 'flat plaque, unclear purpose',
  '_Character_output': 'mesh duplicate of the _Merged_Animations file, bind-pose stub only',
};

/**
 * The one place prop scale is decided.
 *
 * Meshy normalises every export into a ~2-unit cube, so `scale` is the authored
 * multiplier that restores its real size, and `metres` is the object's LONGEST
 * real-world dimension. Height is deliberately not the invariant: a bed is 2m
 * long and 0.4m tall, and normalising its height would give a 10m bed.
 *
 * This exists because three modules each grew their own convention — Settlement
 * normalised by height, Landmarks used the raw `scale` field, Vegetation
 * normalised to unit height and multiplied by `metres`. The same asset came out
 * at three different sizes depending on who placed it, which is how the timber
 * ruins ended up at 9.2m and the inn's furniture at knee height. Everything that
 * places a prop calls this.
 */
export function scaleFor(name, fallback = 1) {
  return PROPS[name]?.scale ?? fallback;
}

/**
 * Scale a loaded prop to its catalog size and sit its base on `groundY`.
 * Returns the measured world-space box after placement.
 *
 * Meshy centres geometry in its bounding cube, so placing a node at ground level
 * buries the bottom half — the box has to be measured after scaling, not assumed.
 */
export function placeProp(THREE, node, name, { x, z, groundY, yaw = 0, scaleMul = 1, sink = 0.03 }) {
  node.scale.setScalar(scaleFor(name) * scaleMul);
  node.rotation.y = yaw;
  node.position.set(x, groundY, z);
  node.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(node);
  if (Number.isFinite(box.min.y)) {
    node.position.y += groundY - box.min.y - sink;
    node.updateMatrixWorld(true);
    box.setFromObject(node);
  }
  return box;
}
