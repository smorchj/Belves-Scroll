/**
 * items.js — every object in Ossmere that can sit in an inventory.
 *
 * `model` is a key in catalog.js PROPS, or null for items that are abstract
 * (represented by an icon and a line of text rather than a mesh). Only five
 * items have real geometry; everything else is honest about being a number.
 */

export const ITEMS = [
  // ─────────────────────────────────────────────────────────────── weapons ──
  {
    id: "iron-sword", name: "Iron Sword", type: "weapon", slot: "mainhand",
    model: "sword-iron", damage: 8, defence: 0, value: 45, weight: 6,
    rarity: "common",
    desc: "Village iron, village edge. The crossguard is stamped with a Greenhollow " +
          "hedge-mark, which proves nothing and comforts everyone.",
  },
  {
    id: "warden-blade", name: "Warden's Blade", type: "weapon", slot: "mainhand",
    model: "sword-slim", damage: 13, defence: 1, value: 280, weight: 5,
    rarity: "fine",
    desc: "Court issue: narrow, light, unfussy. Wardens carried these to serve writs, " +
          "not to fight wars. Most of the killing in Ossmere was done by paperwork; " +
          "this was for the last three feet of it.",
  },
  {
    id: "flamewing-dagger", name: "Flamewing Dagger", type: "weapon", slot: "offhand",
    model: "dagger-flamewing", damage: 11, defence: 0, value: 1100, weight: 2,
    rarity: "legendary",
    desc: "A Quiet Desk masterwork with a wing of banded fire-steel folded along the " +
          "spine. It is a beautiful thing made for a plain purpose. The Desk gives one " +
          "to every eraser who reaches forty names, and almost nobody does.",
  },
  {
    id: "notched-cleaver", name: "Notched Cleaver", type: "weapon", slot: "mainhand",
    model: null, damage: 7, defence: 0, value: 18, weight: 7,
    rarity: "common",
    desc: "Was a hedging bill. Somebody ground the hook off and kept going.",
  },
  {
    id: "tusk-spear", name: "Tusk Spear", type: "weapon", slot: "mainhand",
    model: null, damage: 11, defence: 1, value: 90, weight: 5,
    rarity: "fine",
    desc: "Crag ash and a boar's eye-tooth, bound with sinew. The shaft is scored with " +
          "small notches: not kills. Debts.",
  },
  {
    id: "grove-sickle", name: "Grove Sickle", type: "weapon", slot: "mainhand",
    model: null, damage: 9, defence: 0, value: 120, weight: 3,
    rarity: "fine",
    desc: "A pruning tool for brass and bark alike. Grovekeepers use the inner curve on " +
          "gear-teeth and the outer on anything that objects.",
  },
  {
    id: "desk-stiletto", name: "Desk Stiletto", type: "weapon", slot: "offhand",
    model: null, damage: 8, defence: 0, value: 160, weight: 1,
    rarity: "fine",
    desc: "Triangular, unsharpened, no blood-groove — it does not cut, it files. " +
          "Guild issue, numbered, and the number is on a list.",
  },
  {
    id: "sentinel-maul", name: "Sentinel Maul", type: "weapon", slot: "mainhand",
    model: "axe-viking", damage: 18, defence: 2, value: 700, weight: 14,
    twoHanded: true,
    rarity: "rare",
    desc: "Forged around a wedge of a broken Sentinel's forearm. The green stone still " +
          "keeps time, very slightly, against your palm.",
  },

  // ────────────────────────────────────────────────────────────── trinkets ──
  {
    id: "amber-ring", name: "Amber Heart-Vine Ring", type: "trinket", slot: null,
    model: "ring-amber", damage: 0, defence: 1, value: 340, weight: 0.1,
    rarity: "rare",
    desc: "Older than the Survey by a thousand years. Vine-work in gold around a drop of " +
          "amber with a thumbprint pressed in it. It records an ownership no clerk ever " +
          "had a column for.",
  },
  {
    id: "owl-mask", name: "The Verdant Owl Masque", type: "trinket", slot: "head",
    model: "mask-owl", damage: 0, defence: 2, value: 520, weight: 1,
    rarity: "rare",
    desc: "Court auditors wore these on circuit so that a village would remember the " +
          "office and not the face. Behind the beak, the leather is worn pale where " +
          "somebody's cheek rested for thirty years.",
  },
  {
    id: "bone-tally-stone", name: "Bone Tally-Stone", type: "trinket", slot: null,
    model: null, damage: 0, defence: 0, value: 4, weight: 0.2,
    rarity: "common",
    desc: "A knuckle of bone, notched twice on one face. Tusk-kin debt: two bushels of " +
          "barley, owed since a winter nobody alive remembers.",
  },
  {
    id: "belve-nib", name: "Belve's Nib", type: "trinket", slot: null,
    model: null, damage: 0, defence: 0, value: 250, weight: 0.1,
    rarity: "rare",
    desc: "A steel nib worn down to a stub and resharpened eleven times. Two hundred and " +
          "forty families lost everything to this object. It weighs almost nothing.",
  },
  {
    id: "gold-crown", name: "Carnelian Crown", type: "trinket", slot: null,
    model: null, damage: 0, defence: 0, value: 100, weight: 0.05,
    rarity: "fine",
    desc: "Court coin, red gold, still legal tender because nothing has replaced it. The " +
          "face on it has been rubbed featureless by two hundred years of thumbs.",
  },
  {
    id: "ash-brand", name: "Vigil Brand", type: "trinket", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.3,
    rarity: "fine",
    desc: "An iron token burnt through the middle. Ashen Vigil oath-mark. It means: I " +
          "have watched an archive burn and I did not weep, and I am lying about one of " +
          "those.",
  },

  // ─────────────────────────────────────────────────────────────── armour ──
  {
    id: "farmhand-tunic", name: "Farmhand's Tunic", type: "armour", slot: "body",
    model: null, damage: 0, defence: 1, value: 6, weight: 2,
    rarity: "common",
    desc: "Wool, mended at both elbows by two different people with two different ideas " +
          "about thread.",
  },
  {
    id: "merchant-dress", name: "Merchant's Dress", type: "armour", slot: "body",
    model: null, damage: 0, defence: 1, value: 30, weight: 3,
    rarity: "common",
    desc: "Good cloth, deep pockets, an inner seam wide enough to carry a folded deed " +
          "flat. That last part is not an accident.",
  },
  {
    id: "hide-jerkin", name: "Hide Jerkin", type: "armour", slot: "body",
    model: null, damage: 0, defence: 3, value: 40, weight: 6,
    rarity: "common",
    desc: "Boiled hide, boar bristle at the shoulder. Smells like the gully it was made in.",
  },
  {
    id: "raider-hood", name: "Bracken Hood", type: "armour", slot: "head",
    model: null, damage: 0, defence: 2, value: 28, weight: 1.5,
    rarity: "common",
    desc: "Hide and a fringe of dried thistle. Meant to be recognised at a distance and " +
          "then not looked at again.",
  },
  {
    id: "tusk-harness", name: "Feral Hide Harness", type: "armour", slot: "body",
    model: null, damage: 0, defence: 6, value: 190, weight: 9,
    rarity: "fine",
    desc: "Tusks laid like scale over layered hide. Each plate is carved with the name of " +
          "the animal and the name of the person who ate it.",
  },
  {
    id: "vigil-cuirass", name: "Ashen Vigil Cuirass", type: "armour", slot: "body",
    model: null, damage: 0, defence: 9, value: 430, weight: 16,
    rarity: "fine",
    desc: "Court dragon-plate, stripped of its lacquer and left to weather grey. The " +
          "Vigil wear the enemy's armour on purpose. It is a whole argument you can put on.",
  },
  {
    id: "ruby-half-plate", name: "Ruby Half-Plate", type: "armour", slot: "body",
    model: null, damage: 0, defence: 12, value: 980, weight: 20,
    rarity: "rare",
    desc: "Crimson and silver, chased with the Order's fretwork. Maintained to a standard " +
          "that would embarrass a cathedral. Cedar insists on it: an unpolished Order is " +
          "an Order nobody believes.",
  },
  {
    id: "desk-leathers", name: "Quiet Desk Leathers", type: "armour", slot: "body",
    model: null, damage: 0, defence: 5, value: 310, weight: 5,
    rarity: "fine",
    desc: "Red-black, oiled silent, no buckle that catches light. Cut so that if it is " +
          "found on a body nobody can say which guild it came from.",
  },
  {
    id: "bark-mail", name: "Bark Mail", type: "armour", slot: "body",
    model: null, damage: 0, defence: 7, value: 270, weight: 8,
    rarity: "fine",
    desc: "Living plate grown, not made. It closes its own gaps overnight and needs to be " +
          "watered.",
  },
  {
    id: "warden-helm", name: "Warden's Helm", type: "armour", slot: "head",
    model: null, damage: 0, defence: 4, value: 220, weight: 4,
    rarity: "fine",
    desc: "Full-face, narrow slit, no crest. A warden was supposed to be a function, not " +
          "a man with a job.",
  },
  {
    id: "antler-circlet", name: "Antler Circlet", type: "armour", slot: "head",
    model: null, damage: 0, defence: 3, value: 200, weight: 1,
    rarity: "fine",
    desc: "Six points, shed and never cut. A Grovekeeper who cuts antler is buried in it.",
  },
  {
    id: "sentinel-buckler", name: "Sentinel-Shard Buckler", type: "armour", slot: "offhand",
    model: null, damage: 0, defence: 6, value: 360, weight: 7,
    rarity: "rare",
    desc: "A palm of Sentinel stone in an iron rim. It hums when another Sentinel is " +
          "within a mile, which is either a warning or a greeting.",
  },

  // ────────────────────────────────────────────────────────── consumables ──
  {
    id: "healing-draught", name: "Healing Draught", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 25, weight: 0.5,
    rarity: "common",
    desc: "Comfrey, marrow-fat and something the potion house will not name. Restores 40 health.",
  },
  {
    id: "greater-healing-draught", name: "Greater Healing Draught", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 95, weight: 0.6,
    rarity: "fine",
    desc: "The same, brewed twice and cursed at. Restores 110 health.",
  },
  {
    id: "stamina-tonic", name: "Stamina Tonic", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 20, weight: 0.4,
    rarity: "common",
    desc: "Tastes of iron filings and bergamot. Restores stamina and a bad mood.",
  },
  {
    id: "ashroot-salve", name: "Ashroot Salve", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 45, weight: 0.5,
    rarity: "fine",
    desc: "The only thing that grows in the Furrow, boiled down. Cures burns and blocks " +
          "the wraith-chill for an hour.",
  },
  {
    id: "mire-brandy", name: "Mire Brandy", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 12, weight: 0.8,
    rarity: "common",
    desc: "Distilled in Sundermarsh from things that were, broadly speaking, plants. " +
          "Numbs pain. Also the tongue, the memory, and the will to leave.",
  },
  {
    id: "travel-bread", name: "Travel Bread", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 3, weight: 0.5,
    rarity: "common",
    desc: "Keeps for a month. Tastes like it intends to keep for two.",
  },
  {
    id: "dried-fish", name: "Dried Fish", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 4, weight: 0.3,
    rarity: "common", heal: 8,
    desc: "Split, salted and wind-dried on the racks. Half the village lives on it.",
  },
  {
    id: "grove-oil", name: "Grove Oil", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 35, weight: 1,
    rarity: "fine",
    desc: "Pressed from hollow-tree mast. Quiets brass. A drop on a blade makes it silent " +
          "in the draw, which the Grovekeepers say is a misuse and sell anyway.",
  },
  {
    id: "signal-oil", name: "Signal Oil", type: "consumable", slot: null,
    model: null, damage: 0, defence: 0, value: 15, weight: 2,
    rarity: "common",
    desc: "Burns white and high. One flask lights a watchtower beacon for a night, or a " +
          "records room for good.",
  },

  // ─────────────────────────────────────────────────────────────── keys ──
  {
    id: "ledger-key", name: "Vault Wheel-Key", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 2,
    rarity: "rare",
    desc: "A four-spoked brass wheel that turns the flood-doors under the Drowned Ledger. " +
          "It was hanging on a clerk. He was still at his desk.",
  },
  {
    id: "chapterhouse-key", name: "Chapterhouse Tally", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.2,
    rarity: "rare",
    desc: "Not a key. A wooden token with a fee written on it. The Desk's doors open for " +
          "a paying customer and for nobody else.",
  },
  {
    id: "citadel-seal", name: "Citadel Seal-Matrix", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 1,
    rarity: "legendary",
    desc: "The Court's great seal, in silver, reversed. Anything pressed with this is " +
          "true by definition. It is the single most dangerous object in Ossmere and it " +
          "fits in a coat pocket.",
  },

  // ──────────────────────────────────────────────────────── quest objects ──
  {
    id: "scroll-fragment-first", name: "Scroll Fragment: the Meadow Hand", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.5,
    rarity: "legendary",
    desc: "Vellum, scorched along one edge, in a small tired hand. Fields, weirs and " +
          "orchards from Greenhollow to the Thistlecrag march. Charles's field is on it. " +
          "It is not in his family's name.",
  },
  {
    id: "scroll-fragment-second", name: "Scroll Fragment: the Drowned Hand", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.5,
    rarity: "legendary",
    desc: "Sealed in a brass cylinder against the marsh for two hundred years. Tolls, " +
          "tithes and the register of the Court's own holdings — including a list of " +
          "everything the Court took and how.",
  },
  {
    id: "scroll-fragment-third", name: "Scroll Fragment: the Ash Hand", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.5,
    rarity: "legendary",
    desc: "The last section, and the shortest. Not a register at all: the Sentinel " +
          "roll — every colossus in Ossmere, where it stands, and the words that wake it.",
  },
  {
    id: "belves-scroll", name: "Belve's Scroll", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 2,
    rarity: "legendary",
    desc: "Three pieces, whole. Every acre in the valley, as one dying forger remembered " +
          "it. Somewhere in here is at least one lie, put in on purpose, and the only " +
          "person who knows which line it is has taken a vow never to say.",
  },
  {
    id: "court-proclamation", name: "Weathered Proclamation", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 15, weight: 1,
    rarity: "common",
    desc: "A toll notice nailed to a post in the year 391 and never taken down. Worthless " +
          "except for the hand it is written in, which is the Court's, which is what " +
          "Mildrid needs to copy.",
  },
  {
    id: "mildrids-writ", name: "Mildrid's Writ", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.3,
    rarity: "fine",
    desc: "A deed to a field in Greenhollow, in a hand indistinguishable from the Court's, " +
          "sealed, dated eleven years before the forger was born. Flawless work. A lie.",
  },
  {
    id: "mildrids-ledger", name: "The Grey Ledger", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 3,
    rarity: "rare",
    desc: "Mildrid's private book: every deed she has forged, for whom, and what it cost " +
          "the person on the other side of it. She has never once left a line out. That " +
          "is either penance or evidence, depending on who opens it.",
  },
  {
    id: "widows-deed", name: "The Ashcombe Mill Deed", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 0.3,
    rarity: "fine",
    desc: "Twenty years old, beautifully faked, and the only thing standing between a " +
          "family of six and the road.",
  },
  {
    id: "tusk-kin-tally", name: "The Long Tally", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 8,
    rarity: "rare",
    desc: "Two hundred years of notched bone in a hide roll: everything the crag clans " +
          "have taken from the lowlands, and from whom. They kept it so they could pay it " +
          "back. Haggar wanted it burnt so they could stop pretending they ever would.",
  },
  {
    id: "grove-cog", name: "Grove Cog", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 40, weight: 4,
    rarity: "fine",
    desc: "Brass, hand-cut, with a heartwood core so it swells and shrinks with the " +
          "weather exactly as the tree around it does. Nobody left alive can make one.",
  },
  {
    id: "desk-roll", name: "The Quiet Roll", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 0, weight: 2,
    rarity: "legendary",
    desc: "The Desk's register of its own. Every eraser, every name they took, every fee. " +
          "The guild that sells deletion keeps the most complete record in Ossmere. " +
          "Miriam has read her own entry four hundred times.",
  },
  {
    id: "brass-tally-cylinder", name: "Sealed Brass Cylinder", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 60, weight: 3,
    rarity: "rare",
    desc: "Marsh-proof, wax-stoppered, warm to the touch. Something inside it is dry after " +
          "two hundred years underwater.",
  },
  {
    id: "sentinel-core", name: "Sentinel Core", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 500, weight: 10,
    rarity: "legendary",
    desc: "The green heart of a colossus, still ticking, still eleven minutes fast. Hold " +
          "it long enough and you feel it trying to find a deed to obey.",
  },
  {
    id: "sheep-bell", name: "Ewe's Bell", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 2, weight: 0.4,
    rarity: "common",
    desc: "Charles's second-best ewe wore this. Charles's second-best ewe is now a rumour " +
          "in the turnip rows.",
  },
  {
    id: "ochre-pot", name: "Pot of Ochre", type: "quest", slot: null,
    model: null, damage: 0, defence: 0, value: 8, weight: 1,
    rarity: "common",
    desc: "Red earth, animal fat, a little ash. The same recipe for fourteen hundred " +
          "years. You could put your hand on a rock right now and be understood.",
  },
];

/** id -> item, built once for the engine's convenience. */
export const ITEMS_BY_ID = Object.freeze(
  ITEMS.reduce((acc, it) => { acc[it.id] = it; return acc; }, {})
);
