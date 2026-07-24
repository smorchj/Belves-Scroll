/**
 * lore.js — the world bible for Belve's Scroll.
 *
 * Pure data. No engine imports. Everything referenced here has a matching asset
 * in catalog.js; nothing is invented that cannot be built.
 */

export const WORLD = {
  name: "Ossmere",
  subtitle: "Belve's Scroll",

  /**
   * Four paragraphs of history. Written in-world, as a Greenhollow schoolmaster
   * might tell it — which is to say, roughly, and with one or two things wrong.
   */
  history: [
    // 1 — how the Court ruled
    "For four hundred years the Carnelian Court held the isles of Ossmere from the " +
    "Crimson Citadel, and in all that time it never once raised an army. It did not " +
    "need one. The Court ruled by the Great Survey: a single bound roll on which every " +
    "acre, weir, orchard, toll-bridge and inheritance in the province was written in a " +
    "clerk's small hand. What the Survey said was so, was so. To enforce it the " +
    "stone-singers cut the Sentinels — colossi of green-veined rock, set at every march " +
    "and boundary, deaf to argument and incapable of doubt. A Sentinel could not be " +
    "bribed, because it wanted nothing. It could not be reasoned with, because it could " +
    "not read a face, only a deed. If the roll said the northern field was Hale's, then " +
    "the Sentinel at the hedge would let Hale plough it and would kill, without heat and " +
    "without hurry, anyone else who tried. This was called the Peace, and for four " +
    "centuries it very nearly was one.",

    // 2 — the machinery, and the people it was built on top of
    "The Sentinels kept no memory of their own. They were tuned — nightly, by brass — to " +
    "the Clockwork Groves, orreries the size of barns that the Court had grown living " +
    "trees through, so that root and gear-train held one another steady against frost " +
    "and time. So long as the Groves ticked true, the Sentinels dreamed the Survey and " +
    "obeyed it. Older than any of this, and never mentioned in the roll, are the Rock " +
    "Drawings: ochre handprints, herds, a woman with a hoop, scattered across the crags " +
    "and marsh-stones by people who had no writing at all. Because they had no writing, " +
    "the Court's first surveyors recorded the isles as unclaimed. That single clerical " +
    "convenience is the oldest wound in Ossmere, and every quarrel since has been the " +
    "same quarrel wearing a newer coat.",

    // 3 — Belve, and the Blank Year
    "Belve was nobody. Sub-clerk of the seventh desk, thirty-one years of service, no " +
    "portrait, no title, a bad hip. For most of those thirty-one years she was the hand " +
    "that quietly amended the Survey whenever a cousin of the Court wanted a mill, or a " +
    "village that had voted badly needed to discover it had never owned its own commons. " +
    "She wrote the change; the Groves carried it; the Sentinels went and did the rest. " +
    "She did this two hundred and forty times, by her own count. And then in the winter " +
    "of the Nine Storms, for reasons she never explained to anyone who wrote it down, she " +
    "walked out of the Citadel with the master roll under her coat. What followed is " +
    "called the Blank Year. The Sentinels woke to find no Survey to dream, and defaulted " +
    "to the oldest instruction cut into them — CLEAR THE GROUND — and began, patiently, " +
    "to do so. Half the main island burned. The Citadel cracked from its own foundations and " +
    "the crimson stone of it is still up there on the Reach, leaning, with the sky " +
    "showing through. Belve spent her last eleven years in a hollow tree writing out the " +
    "Survey again from memory: this time, she claimed, truly.",

    // 4 — the present
    "Two hundred years on, the Groves still turn and the Sentinels still sleep, mostly. " +
    "Ossmere is a patchwork of holdings whose owners hold them because they are standing " +
    "on them. Deeds are bought from forgers in every market town, and everyone knows it, " +
    "and everyone accepts it, because the alternative is worse. Belve's Scroll — the " +
    "honest copy, written from memory by a confessed liar — was cut into three parts " +
    "after her death by people who could not agree on what to do with it, and every " +
    "faction in the isles now wants those three parts for exactly opposite reasons. The " +
    "Ruby Order would read it aloud at the Citadel and give Ossmere back its law. The " +
    "Ashen Vigil would burn it and every copy and every clerk who remembers a line of it. " +
    "And the tusk-kin of the crags, whose grandmothers were the ones the Court recorded " +
    "as not existing, would like very much to be asked.",

    // 5 — the wildlands, and the Red Temple
    "Past the last skerry with a name on it, west across the sound, lies the island the " +
    "Survey shows only as a red hatching and one word: RESERVED. It was the " +
    "stone-singers' own ground — the Red Temple, where every Sentinel in Ossmere was " +
    "cut, sung awake, and given its first instruction. When the Peace broke, the singers " +
    "did not flee to the Citadel with everyone else. They rowed out to the temple, shut " +
    "the red door from the inside, and were not seen again. Fishermen keep well south of " +
    "it. On still nights the light off the water there is wrong — too red, too steady — " +
    "and the Vigil, who burn everything and fear nothing, have never once landed a boat " +
    "on it. Whatever still keeps the temple has been keeping it for two hundred years, " +
    "and it does not want visitors. It wants the Scroll.",
  ],

  /**
   * The named cast — the 100% recipes. Everyone else on the isles is blended
   * island stock; these eleven are the people the story is actually about.
   */
  mainCast: [
    "Charles", "Mildrid", "Maple", "Haggar", "Ember", "Snader",
    "Cedar", "Willow", "Kari", "Travis", "Pobart",
  ],

  /** Short pitch used on the title card and the journal's first page. */
  premise:
    "A land where law was a document and the police were made of stone. The document is " +
    "lost in three pieces. You are going to find it, and then you are going to have to " +
    "decide whether anyone should ever read it again.",

  /** The MacGuffin, described honestly. */
  scroll: {
    name: "Belve's Scroll",
    truth:
      "It is not a prophecy and it is not magic. It is a land register, reconstructed " +
      "from memory by the woman who spent three decades falsifying the original. It is " +
      "the most complete record of who owned what in Ossmere before the Blank Year, and " +
      "there is no living person who can certify a single line of it. Nettle can. " +
      "Nettle won't.",
    fragments: ["scroll-fragment-first", "scroll-fragment-second", "scroll-fragment-third"],
  },

  startRegion: "greenhollow",
  startTime: 7.5,
};

export const FACTIONS = {
  greenhollow: {
    name: "The Hollow Commons",
    blurb:
      "Not a faction so much as four hundred people who would like to be left alone. " +
      "Greenhollow holds its fields by custom, by fence, and by a steady supply of " +
      "beautifully forged deeds. Its people are not neutral; they are exhausted.",
    hostileTo: ["bandit", "unwritten"],
    colour: "#7fae5a",
  },

  "ruby-order": {
    name: "The Ruby Order",
    blurb:
      "Knights in crimson and silver who keep the ruin of the Crimson Citadel swept, " +
      "polished and lit, waiting for a law to come home to it. They are courteous, " +
      "literate, and absolutely certain that Ossmere's misery is an administrative " +
      "problem with an administrative solution. They may be right. That is the trouble.",
    hostileTo: ["ashen-vigil", "bandit", "unwritten"],
    colour: "#b3243a",
  },

  "ashen-vigil": {
    name: "The Ashen Vigil",
    blurb:
      "Descendants of the Citadel's own Sentinel-keepers, who watched the Blank Year " +
      "from the inside and drew the opposite conclusion. They hunt waking Sentinels, " +
      "burn archives, and hang clerks. They wear the Court's own plate to make a point " +
      "about who is responsible. They have never once been thanked.",
    hostileTo: ["ruby-order", "unwritten", "quiet-desk"],
    colour: "#4a4f57",
  },

  "tusk-kin": {
    name: "The Tusk-Kin",
    blurb:
      "The crag clans, descended from those the first surveyors filed as unclaimed. " +
      "They take what they need from the lowlands and they write down every single " +
      "thing they take, on notched bone, intending to repay it. Two centuries of tally " +
      "sticks are stacked in their hall. Nobody has ever come to collect.",
    hostileTo: ["bandit", "ruby-order"],
    colour: "#c98a3e",
  },

  bandit: {
    name: "The Bracken Free",
    blurb:
      "Haggar's people. Tusk-kin who got tired of the tally sticks, plus every deserter, " +
      "debtor and burned-out farmhand in the valley. Their creed is one sentence long: " +
      "nothing gets written down ever again. They mean it about ledgers and they mean it " +
      "about people.",
    hostileTo: ["greenhollow", "tusk-kin", "ruby-order", "ashen-vigil", "grovekeepers", "quiet-desk"],
    colour: "#6b4226",
  },

  "quiet-desk": {
    name: "The Quiet Desk",
    blurb:
      "A guild that does not sell murder. It sells deletion. For the right fee the Desk " +
      "will end a person and then remove them from every roll, tithe-book and parish " +
      "register in Ossmere, so that they were never here at all. Their fee schedule is " +
      "public. Their client list is not.",
    hostileTo: ["ashen-vigil", "bandit"],
    colour: "#7d1f2e",
  },

  grovekeepers: {
    name: "The Grovekeepers",
    blurb:
      "Bark-skinned wardens of the Clockwork Groves, who oil the Court's machines with " +
      "reverence and know perfectly well what those machines were for. Their whole " +
      "religion is a maintenance schedule. If they stop, the Sentinels wake.",
    hostileTo: ["bandit", "unwritten"],
    colour: "#3f7a4b",
  },

  unwritten: {
    name: "The Unwritten",
    blurb:
      "Sentinels that have lost their referent and walk anyway, and the wraiths — people " +
      "the Desk erased so thoroughly that death itself has no entry to file them under. " +
      "They are not evil. They are unresolved.",
    hostileTo: [
      "greenhollow", "ruby-order", "ashen-vigil", "tusk-kin",
      "bandit", "quiet-desk", "grovekeepers",
    ],
    colour: "#8fd6c4",
  },
};

export const REGIONS = [
  {
    id: "greenhollow",
    name: "Greenhollow",
    biome: "meadow",
    blurb:
      "Low green country of hedgerows, sheep and mossy stumps, with a guild hall that " +
      "is really a tavern and a potion house that is really a rumour exchange. Two " +
      "Sentinels stand at the field-margins here. They have not moved in two hundred " +
      "years, and every child in the village is taught not to point at them.",
  },
  {
    id: "hollowmere",
    name: "Hollowmere",
    biome: "forest",
    blurb:
      "Deep, still, lantern-lit wood where the Clockwork Groves turn under the canopy " +
      "and the whole forest ticks faintly in the small hours. At its heart stands the " +
      "Enchanted Hollow Tree, big enough to live in — which is what Belve did, and what " +
      "Nettle still does. The Grovekeepers' treehouse is roped into the crowns above.",
  },
  {
    id: "thistlecrag",
    name: "Thistlecrag",
    biome: "crag",
    blurb:
      "Windscoured uplands of standing pillars and one enormous mossy archway that goes " +
      "nowhere and never did. The tusk-kin hold the high ground and their tally-hall; " +
      "Haggar's Bracken Free hold a fortified outpost in the gully below it, and the two " +
      "camps are close enough to hear each other's dogs.",
  },
  {
    id: "sundermarsh",
    name: "Sundermarsh",
    biome: "marsh",
    blurb:
      "Where the Court's regional records office sank in the Blank Year, taking four " +
      "hundred clerks and a filed Sentinel down with it. Mossy timber ruins stand out of " +
      "the water like broken teeth. The wraiths here queue. Nobody knows for what.",
  },
  {
    id: "cinderfell",
    name: "Cinderfell",
    biome: "ash",
    blurb:
      "The Furrow: a scar forty miles long where one Sentinel walked west for a year and " +
      "a day, clearing the ground. Nothing has grown back but ashroot. The Ashen Vigil " +
      "keeps its pyres and its watchtowers along the Cinder Road, and old ochre handprints " +
      "survive on stones the Sentinel stepped over.",
  },
  {
    id: "carnelian-reach",
    name: "Carnelian Reach",
    biome: "crag",
    blurb:
      "The shore path west of town, under the leaning bulk of the Crimson Citadel, with " +
      "the crystal annexe still throwing bad light across the sound at sunset. The Ruby " +
      "Order keeps the keep, the towers and the long approach immaculate. Their stone " +
      "Sentinels are polished weekly. They are also, quietly, chained.",
  },
  {
    id: "wildlands",
    name: "The Wildlands",
    biome: "heath",
    blurb:
      "The outer isles: skerries, wind, and one island the Survey marks RESERVED. The " +
      "Red Temple stands on it, red door shut, kept by whatever the stone-singers " +
      "became when they rowed out and did not come back. No road, no pier, no welcome. " +
      "The crossing is open water and the swimming is cold.",
  },
];

/**
 * Named places the schedules and quests refer to. The world builder is free to
 * place these anywhere inside the given region.
 */
export const POI_HINTS = {
  "charles-farm":            { region: "greenhollow", prop: "farmstead" },
  "charles-field":           { region: "greenhollow", prop: null },
  "boundary-sentinel":       { region: "greenhollow", prop: "sentinel-statue" },
  "greenhollow-market":      { region: "greenhollow", prop: null },
  "greenhollow-guildhall":   { region: "greenhollow", prop: "guild-hall" },
  "mildrid-shop":            { region: "greenhollow", prop: "potion-house" },
  "maple-loft":              { region: "greenhollow", prop: "potion-house" },
  "wayside-tollpost":        { region: "hollowmere",  prop: "ruins-timber" },
  "clockwork-grove-first":   { region: "hollowmere",  prop: "clockwork-grove" },
  "grovekeeper-treehouse":   { region: "hollowmere",  prop: "treehouse" },
  "hollow-tree":             { region: "hollowmere",  prop: "tree-hollow" },
  "tallyhall":               { region: "thistlecrag", prop: "ruins-timber" },
  "bracken-outpost":         { region: "thistlecrag", prop: "tower-round" },
  "thistle-archway":         { region: "thistlecrag", prop: "archway" },
  "crag-drawings":           { region: "thistlecrag", prop: "rock-drawings" },
  "drowned-ledger":          { region: "sundermarsh", prop: "ruins-timber" },
  "ledger-vault":            { region: "sundermarsh", prop: null },
  "desk-chapterhouse":       { region: "sundermarsh", prop: "tower-slim" },
  "mire-drawings":           { region: "sundermarsh", prop: "rock-drawings" },
  "vigil-camp":              { region: "cinderfell",  prop: null },
  "the-furrow":              { region: "cinderfell",  prop: null },
  "stagward-tower":          { region: "cinderfell",  prop: "tower-slim" },
  "cinder-road-towers":      { region: "cinderfell",  prop: "tower-round" },
  "furrow-drawings":         { region: "cinderfell",  prop: "rock-drawings" },
  "citadel-approach":        { region: "carnelian-reach", prop: "pillar-stone" },
  "crimson-citadel":         { region: "carnelian-reach", prop: "citadel-crimson" },
  "crystal-annexe":          { region: "carnelian-reach", prop: "citadel-crystal" },
  "ruby-keep":               { region: "carnelian-reach", prop: "castle-keep" },
  "reach-drawings":          { region: "carnelian-reach", prop: "rock-drawings" },
  "dark-temple":             { region: "wildlands", prop: "citadel-crimson" },
  "temple-door":             { region: "wildlands", prop: null },
};

/** Things NPCs and books can reference; used for ambient barks and readables. */
export const TIMELINE = [
  { year: -1400, event: "The hand-painters. Ochre on stone. No writing, therefore no claim." },
  { year: 0,     event: "First Survey. Ossmere recorded as unclaimed. The Citadel is founded." },
  { year: 44,    event: "The Red Temple is raised on the western island; the Survey marks the isle RESERVED." },
  { year: 61,    event: "The stone-singers cut the first Sentinel at the temple and set it at the Hollowmere march." },
  { year: 188,   event: "The Clockwork Groves are grown; nightly tuning begins." },
  { year: 372,   event: "Belve enters the seventh desk as a sub-clerk, aged nineteen." },
  { year: 403,   event: "The winter of the Nine Storms. Belve leaves with the master roll." },
  { year: 404,   event: "The Blank Year. CLEAR THE GROUND. The Furrow is cut. The Citadel splits. The stone-singers row west and shut the red door." },
  { year: 415,   event: "Belve dies in the Hollow Tree, having rewritten the Survey from memory." },
  { year: 419,   event: "Her heirs cannot agree. The Scroll is cut into three and scattered." },
  { year: 604,   event: "Now. The Groves are running eleven minutes fast." },
];
