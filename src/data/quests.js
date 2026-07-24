/**
 * quests.js — the story of Belve's Scroll, and every word anyone says about it.
 *
 * QUESTS: eight main-line quests, two mutually exclusive endings, ten side quests.
 * DIALOGUE: topic trees. `goto` moves to another topic, `accept` starts a quest,
 * `exit` closes the conversation. Every id referenced here resolves inside this
 * file, npcs.js or items.js.
 *
 * Objective types: 'talk' | 'kill' | 'collect' | 'reach'.
 *
 * A stage may carry an optional `topic` field. If present, a 'talk' objective
 * should open that DIALOGUE topic instead of the NPC's default root — used where
 * a conversation only makes sense at one point in the story. Safe to ignore.
 */

export const QUESTS = [
  // ═══════════════════════════════════════════════════════ MAIN LINE ═══════

  {
    id: "the-quiet-furrow",
    name: "The Quiet Furrow",
    giver: "charles",
    region: "greenhollow",
    level: 1,
    summary: "The Sentinel at the edge of Charles's field has moved. He would like it not to have.",
    stages: [
      { id: "see-the-sentinel", text: "Walk out to the boundary stone and look at the Sentinel.",
        objective: { type: "reach", target: "boundary-sentinel", count: 1 } },
      { id: "check-the-furrow", text: "Find where it stepped. Two paces, south-west, into the barley.",
        objective: { type: "reach", target: "charles-field", count: 1 } },
      { id: "back-to-charles", text: "Tell Charles what you saw. Choose how much of it to tell him.",
        objective: { type: "talk", target: "charles", count: 1 } },
      { id: "talk-to-mildrid", text: "Speak with Mildrid in Greenhollow. Charles needs paper, not comfort.",
        objective: { type: "talk", target: "mildrid", count: 1 } },
    ],
    rewards: { gold: 30, xp: 120, items: ["healing-draught", "travel-bread"] },
    next: "paper-and-plough",
  },

  {
    id: "paper-and-plough",
    name: "Paper and Plough",
    giver: "mildrid",
    region: "greenhollow",
    level: 2,
    summary: "Mildrid can forge Charles a deed the stone will believe — but she needs a sample of the Court's own hand to copy.",
    stages: [
      { id: "find-the-tollpost", text: "There is a Court proclamation still nailed to the wayside toll-post in Hollowmere.",
        objective: { type: "reach", target: "wayside-tollpost", count: 1 } },
      { id: "clear-the-toll", text: "Something is still collecting the toll. Put it down.",
        objective: { type: "kill", target: "tollpost-wraith", count: 3 } },
      { id: "take-the-proclamation", text: "Take the proclamation off the post.",
        objective: { type: "collect", target: "court-proclamation", count: 1 } },
      { id: "return-to-mildrid", text: "Bring it back to Mildrid.",
        objective: { type: "talk", target: "mildrid", count: 1 } },
      { id: "deliver-the-writ", text: "Carry the finished writ out to Charles. Do not read it on the way. She means it.",
        objective: { type: "talk", target: "charles", count: 1 } },
    ],
    rewards: { gold: 75, xp: 260, items: ["mildrids-writ", "iron-sword"] },
    next: "the-long-tally",
  },

  {
    id: "the-long-tally",
    name: "The Long Tally",
    giver: "lilly-raider",
    region: "thistlecrag",
    level: 4,
    summary: "Haggar has taken the tusk-kin's two-hundred-year debt-roll and a scrap of vellum off a dead Ruby courier. He intends to burn both.",
    stages: [
      { id: "meet-braid", text: "Climb to the tally-hall and hear Lilly Braid out.",
        objective: { type: "reach", target: "tallyhall", count: 1 } },
      { id: "reach-the-outpost", text: "The Bracken Free hold the old watchtower in the gully. Get inside it.",
        objective: { type: "reach", target: "bracken-outpost", count: 1 } },
      { id: "break-the-warband", text: "Break the warband.",
        objective: { type: "kill", target: "outpost-raider", count: 8 } },
      { id: "kill-haggar", text: "Haggar will not run and will not talk long. End it.",
        objective: { type: "kill", target: "haggar", count: 1 } },
      { id: "take-the-tally", text: "Recover the Long Tally before the fire does.",
        objective: { type: "collect", target: "tusk-kin-tally", count: 1 } },
      { id: "take-the-fragment", text: "Take the courier's vellum. It is not a letter.",
        objective: { type: "collect", target: "scroll-fragment-first", count: 1 } },
      { id: "return-to-braid", text: "Return both to Lilly. Watch what she does with the choice.",
        objective: { type: "talk", target: "lilly-raider", count: 1 } },
    ],
    rewards: { gold: 200, xp: 700, items: ["tusk-spear", "tusk-harness", "greater-healing-draught"] },
    next: "eleven-minutes-fast",
  },

  {
    id: "eleven-minutes-fast",
    name: "Eleven Minutes Fast",
    giver: "woodland-druid",
    region: "hollowmere",
    level: 6,
    summary: "Nobody can date a Survey hand without true Court time, and the Clockwork Groves are running fast. Ferren Ninebark needs cogs, and you need his tree.",
    stages: [
      { id: "meet-ninebark", text: "Find Ferren at the first grove, elbow-deep in brass.",
        objective: { type: "reach", target: "clockwork-grove-first", count: 1 } },
      { id: "gather-cogs", text: "Three heartwood cogs, from the wrecks of the outer groves.",
        objective: { type: "collect", target: "grove-cog", count: 3 } },
      { id: "clear-the-grove", text: "Something has been sleeping in the gear-pit and it is awake now.",
        objective: { type: "kill", target: "tallow-wraith", count: 4 } },
      { id: "retune", text: "Bring the cogs back and hold the escapement steady while he cuts.",
        objective: { type: "talk", target: "woodland-druid", count: 1 } },
      { id: "go-to-the-tree", text: "Ferren will not date the fragment. He will only take you to the tree.",
        objective: { type: "reach", target: "hollow-tree", count: 1 } },
      { id: "meet-nettle", text: "Speak with Nettle, who was alive when the ink was wet.",
        objective: { type: "talk", target: "woodland-huldra", count: 1 } },
    ],
    rewards: { gold: 180, xp: 900, items: ["grove-sickle", "bark-mail", "grove-oil"] },
    next: "the-drowned-ledger",
  },

  {
    id: "the-drowned-ledger",
    name: "The Drowned Ledger",
    giver: "woodland-huldra",
    region: "sundermarsh",
    level: 8,
    summary: "The Court's regional records office sank in the Blank Year with four hundred clerks and one Sentinel inside it. The second fragment went down with them.",
    stages: [
      { id: "reach-the-ruins", text: "Find the timber ruins standing out of the water in Sundermarsh.",
        objective: { type: "reach", target: "drowned-ledger", count: 1 } },
      { id: "clear-the-queue", text: "The wraiths here are queuing. Do not join the queue.",
        objective: { type: "kill", target: "tallow-wraith", count: 6 } },
      { id: "find-the-vault", text: "Descend to the flood-doors. Three floors of filing, all of it underwater.",
        objective: { type: "reach", target: "ledger-vault", count: 1 } },
      { id: "kill-the-filed", text: "There is a Sentinel down here that was archived rather than destroyed. It has been waiting two hundred years for someone to read it something.",
        objective: { type: "kill", target: "sunken-sentinel", count: 1 } },
      { id: "take-the-key", text: "Take the wheel-key off it.",
        objective: { type: "collect", target: "ledger-key", count: 1 } },
      { id: "open-the-cylinder", text: "The strongroom holds a sealed brass cylinder, still dry.",
        objective: { type: "collect", target: "brass-tally-cylinder", count: 1 } },
      { id: "second-fragment", text: "Inside: the Drowned Hand.",
        objective: { type: "collect", target: "scroll-fragment-second", count: 1 } },
      { id: "the-woman-waiting", text: "Someone was here before you and did not take it. Find out why.",
        objective: { type: "talk", target: "miriam", count: 1 } },
    ],
    rewards: { gold: 320, xp: 1400, items: ["sentinel-buckler", "warden-blade", "greater-healing-draught"] },
    next: "the-erasure-clause",
  },

  {
    id: "the-erasure-clause",
    name: "The Erasure Clause",
    giver: "miriam",
    region: "sundermarsh",
    level: 9,
    summary: "Miriam Sedge will trade what the Quiet Desk knows about the third fragment for one deletion the Desk refuses to sell: her own.",
    stages: [
      { id: "buy-the-door", text: "The chapterhouse opens for paying customers. Get a tally.",
        objective: { type: "collect", target: "chapterhouse-key", count: 1 } },
      { id: "enter-the-chapterhouse", text: "Walk in the front. Miriam insists. Anything else looks like a job.",
        objective: { type: "reach", target: "desk-chapterhouse", count: 1 } },
      { id: "speak-to-makal", text: "Makal Undwin keeps the Quiet Roll and will explain, at length, why he is doing you a kindness.",
        objective: { type: "talk", target: "makal", count: 1 } },
      { id: "the-adepts", text: "He will also, without raising his voice, have you removed.",
        objective: { type: "kill", target: "desk-adept", count: 5 } },
      { id: "take-the-roll", text: "Take the Quiet Roll.",
        objective: { type: "collect", target: "desk-roll", count: 1 } },
      { id: "give-her-the-line", text: "Bring it to Miriam and let her strike out one line herself.",
        objective: { type: "talk", target: "miriam", count: 1 } },
    ],
    rewards: { gold: 400, xp: 1700, items: ["desk-leathers", "desk-stiletto", "ashroot-salve"] },
    next: "ash-and-oath",
  },

  {
    id: "ash-and-oath",
    name: "Ash and Oath",
    giver: "ember",
    region: "cinderfell",
    level: 11,
    summary: "The Ashen Vigil holds the last fragment and intends to burn it. Ember Vause will let you read it once, if you ride the Furrow with her squad first.",
    stages: [
      { id: "make-camp", text: "Report to the Vigil camp. Snader will find you before you find anyone.",
        objective: { type: "talk", target: "snader", count: 1 } },
      { id: "ride-the-furrow", text: "Ride the Furrow with the squad as far as the old stones.",
        objective: { type: "reach", target: "the-furrow", count: 1 } },
      { id: "the-thing-in-the-ash", text: "Something has stood up out of the ash and started walking west.",
        objective: { type: "kill", target: "waking-sentinel", count: 1 } },
      { id: "the-ambush", text: "Ruby lancers, in the Furrow, on a route four people knew. Survive it.",
        objective: { type: "kill", target: "ruby-lancer", count: 6 } },
      { id: "count-the-dead", text: "Speak to Ember. She has already worked it out and she would like to be wrong.",
        objective: { type: "talk", target: "ember", count: 1 } },
      { id: "stagward", text: "Snader is at Stagward Tower. He has not run. He has lit the beacon and put the kettle on.",
        objective: { type: "reach", target: "stagward-tower", count: 1 } },
      { id: "hear-him-out", text: "Let him say it. He has been rehearsing it for a year.",
        objective: { type: "talk", target: "snader", count: 1 }, topic: "snader-confession" },
      { id: "the-price", text: "End it, or be ended. He will not draw first and he will not put it down.",
        objective: { type: "kill", target: "snader", count: 1 } },
      { id: "third-fragment", text: "The Ash Hand was in his saddlebag, half-way to the Reach.",
        objective: { type: "collect", target: "scroll-fragment-third", count: 1 } },
    ],
    rewards: { gold: 600, xp: 2600, items: ["vigil-cuirass", "warden-helm", "ash-brand"] },
    next: "the-reading",
  },

  {
    id: "the-reading",
    name: "The Reading",
    giver: "cedar",
    region: "carnelian-reach",
    level: 13,
    summary: "Three fragments make a Scroll. Cedar Vantance has invited you up the Reach to read it aloud. Ember Vause has invited you to Cinderfell to burn it. Both invitations are sincere.",
    stages: [
      { id: "assemble", text: "Set the three hands side by side. They fit. That is the worst part.",
        objective: { type: "collect", target: "belves-scroll", count: 1 } },
      { id: "ask-nettle", text: "Go back to the Hollow Tree and ask Nettle, once, to tell you which line is the lie.",
        objective: { type: "talk", target: "woodland-huldra", count: 1 } },
      { id: "the-approach", text: "Walk up the Carnelian approach. It has been swept for you.",
        objective: { type: "reach", target: "citadel-approach", count: 1 } },
      { id: "hear-cedar", text: "Hear Cedar's offer in full. He will not interrupt yours.",
        objective: { type: "talk", target: "cedar", count: 1 } },
      { id: "hear-ember", text: "Hear Ember's. She will interrupt yours constantly.",
        objective: { type: "talk", target: "ember", count: 1 } },
      { id: "decide", text: "Choose. There is no third door and everyone has stopped pretending there is.",
        objective: { type: "reach", target: "crimson-citadel", count: 1 } },
    ],
    rewards: { gold: 500, xp: 3000, items: ["belve-nib"] },
    next: null,
  },

  // ══════════════════════════════════════════ ENDINGS (EXCLUSIVE) ══════════

  {
    id: "the-corrected-hand",
    name: "The Corrected Hand",
    giver: "cedar",
    region: "carnelian-reach",
    level: 14,
    summary: "ENDING. Read the Scroll into the Citadel, wake the Groves, and give Ossmere its law back — including every line of it you know to be false.",
    stages: [
      { id: "the-annexe", text: "The crystal annexe still holds a working reading-floor. Cedar has kept it lit for eleven years.",
        objective: { type: "reach", target: "crystal-annexe", count: 1 } },
      { id: "the-seal", text: "Take the seal-matrix from Cedar's own hand. He gives it over without a word, which is his whole argument.",
        objective: { type: "collect", target: "citadel-seal", count: 1 } },
      { id: "the-chained", text: "The Citadel's Sentinels are chained. Unchaining them is the point. Prove you can put one down first.",
        objective: { type: "kill", target: "citadel-sentinel", count: 1 } },
      { id: "the-vigil-comes", text: "Ember will come up the road to stop you. She will not send a messenger.",
        objective: { type: "kill", target: "ember", count: 1 } },
      { id: "read-it", text: "Read it aloud. All of it. Charles's field is on page one and it is not in his name.",
        objective: { type: "reach", target: "crimson-citadel", count: 1 } },
    ],
    rewards: { gold: 2000, xp: 6000, items: ["ruby-half-plate", "citadel-seal"] },
    next: null,
  },

  {
    id: "the-blank-year",
    name: "The Second Blank Year",
    giver: "ember",
    region: "cinderfell",
    level: 14,
    summary: "ENDING. Burn the Scroll on the Vigil's pyre. No law, no claim, no Sentinel ever again — and nothing at all standing between the weak and whoever comes next.",
    stages: [
      { id: "the-pyre", text: "The Vigil keeps a fire in the Furrow that has not gone out in ninety years. Reach it.",
        objective: { type: "reach", target: "vigil-camp", count: 1 } },
      { id: "the-order-comes", text: "Cedar's lancers will ride the Cinder Road to take it off you. They will be very polite about it.",
        objective: { type: "kill", target: "ruby-lancer", count: 10 } },
      { id: "cedar-himself", text: "And then Cedar, on foot, alone, still asking. He is the last person in Ossmere who believes in an argument.",
        objective: { type: "kill", target: "cedar", count: 1 } },
      { id: "the-last-sentinel", text: "Without a roll to dream, the nearest colossus stands up. This is what the world is like now. Get used to it.",
        objective: { type: "kill", target: "waking-sentinel", count: 1 } },
      { id: "burn-it", text: "Put Belve's Scroll in the fire. Two hundred and forty families are in there. So is every lie.",
        objective: { type: "reach", target: "the-furrow", count: 1 } },
    ],
    rewards: { gold: 2000, xp: 6000, items: ["sentinel-maul", "ash-brand"] },
    next: null,
  },

  // ═════════════════════════════════════════════════════ SIDE QUESTS ═══════

  {
    id: "the-hand-that-still-works",
    name: "The Hand That Still Works",
    giver: "charles",
    region: "greenhollow",
    level: 1,
    summary: "Something is taking Charles's turnips at night, row by row, neatly, and putting the tops back.",
    stages: [
      { id: "find-the-bell", text: "Find the ewe's bell in the turnip rows.",
        objective: { type: "collect", target: "sheep-bell", count: 1 } },
      { id: "wait-for-it", text: "Be in the field after dark.",
        objective: { type: "reach", target: "charles-field", count: 1 } },
      { id: "the-farmhand", text: "It is not a thief. It is a farmhand, and it is still working its shift.",
        objective: { type: "kill", target: "tollpost-wraith", count: 1 } },
      { id: "tell-him", text: "Tell Charles. He will know the name before you say it.",
        objective: { type: "talk", target: "charles", count: 1 } },
    ],
    rewards: { gold: 25, xp: 150, items: ["healing-draught", "farmhand-tunic"] },
    next: null,
  },

  {
    id: "the-honest-forgery",
    name: "The Honest Forgery",
    giver: "mildrid",
    region: "greenhollow",
    level: 3,
    summary: "Twenty years ago Mildrid faked a mill deed for a widow with no claim. The widow's grandchildren live there now, and an Order auditor is coming to test it.",
    stages: [
      { id: "the-guildhall", text: "The deed is lodged in the Greenhollow guild hall strongbox.",
        objective: { type: "reach", target: "greenhollow-guildhall", count: 1 } },
      { id: "take-the-deed", text: "Take the Ashcombe Mill deed.",
        objective: { type: "collect", target: "widows-deed", count: 1 } },
      { id: "bram-knows", text: "Bram Thatcher witnessed it. He has been drinking about it for twenty years.",
        objective: { type: "talk", target: "bram-thatcher", count: 1 } },
      { id: "back-to-mildrid", text: "Take it back to Mildrid, or don't.",
        objective: { type: "talk", target: "mildrid", count: 1 } },
    ],
    rewards: { gold: 120, xp: 400, items: ["gold-crown", "greater-healing-draught"] },
    next: null,
  },

  {
    id: "a-face-for-the-office",
    name: "A Face for the Office",
    giver: "maple",
    region: "greenhollow",
    level: 3,
    summary: "Maple found an auditor's owl masque in her grandmother's chest and would very much like to be told a comfortable lie about it.",
    stages: [
      { id: "the-mask", text: "Take the masque out of the chest in the loft.",
        objective: { type: "collect", target: "owl-mask", count: 1 } },
      { id: "the-grey-ledger", text: "Under the masque: Mildrid's private book. Every deed she ever faked, and what it cost.",
        objective: { type: "collect", target: "mildrids-ledger", count: 1 } },
      { id: "ask-around", text: "Show the masque to Goodwife Ren's neighbour. Ask what the Ashcombes did before they sold paper.",
        objective: { type: "talk", target: "bram-thatcher", count: 1 } },
      { id: "tell-maple", text: "Go back to Maple. Decide what she gets to keep.",
        objective: { type: "talk", target: "maple", count: 1 } },
    ],
    rewards: { gold: 60, xp: 380, items: ["owl-mask"] },
    next: null,
  },

  {
    id: "what-braid-owes",
    name: "What Braid Owes",
    giver: "lilly-raider",
    region: "greenhollow",
    level: 5,
    summary: "Lilly Braid intends to repay one entry in the Long Tally. The debt is eighty years old and the family it is owed to would rather she didn't.",
    stages: [
      { id: "the-stone", text: "Take the tally-stone for the debt from the hall.",
        objective: { type: "collect", target: "bone-tally-stone", count: 1 } },
      { id: "find-the-farm", text: "Carry it and forty crowns down to the farmstead in Greenhollow.",
        objective: { type: "reach", target: "charles-farm", count: 1 } },
      { id: "offer-it", text: "Offer it to Bram Thatcher. Watch him refuse.",
        objective: { type: "talk", target: "bram-thatcher", count: 1 } },
      { id: "go-back-up", text: "Take the stone back up the crag and tell Lilly what refusing looked like.",
        objective: { type: "talk", target: "lilly-raider", count: 1 } },
    ],
    rewards: { gold: 90, xp: 520, items: ["bone-tally-stone", "ashroot-salve"] },
    next: null,
  },

  {
    id: "the-seventh-train",
    name: "The Seventh Train",
    giver: "woodland-druid",
    region: "hollowmere",
    level: 5,
    summary: "Two outer groves have fouled. Ferren cannot be in three places and will not let anyone else cut brass, so you get to hold things.",
    stages: [
      { id: "gather-more-cogs", text: "Four more heartwood cogs. There is no one left who can make them, so mind the teeth.",
        objective: { type: "collect", target: "grove-cog", count: 4 } },
      { id: "oil", text: "Grove oil, pressed from hollow-tree mast. Two flasks.",
        objective: { type: "collect", target: "grove-oil", count: 2 } },
      { id: "clear-the-canopy", text: "Something has been nesting in the crown gear.",
        objective: { type: "kill", target: "tallow-wraith", count: 3 } },
      { id: "the-treehouse", text: "Meet Ferren up in the Grovekeeper treehouse to fit them.",
        objective: { type: "reach", target: "grovekeeper-treehouse", count: 1 } },
    ],
    rewards: { gold: 140, xp: 620, items: ["antler-circlet", "grove-oil"] },
    next: null,
  },

  {
    id: "nothing-written-here",
    name: "Nothing Written Here",
    giver: "woodland-huldra",
    region: "hollowmere",
    level: 7,
    summary: "Nettle asks you to visit four sites of hand-painted rock drawings and record absolutely nothing about them. That is the whole task. She is entirely serious.",
    stages: [
      { id: "crag-site", text: "The handprints above the Thistlecrag archway.",
        objective: { type: "reach", target: "crag-drawings", count: 1 } },
      { id: "mire-site", text: "The drowned herd in Sundermarsh, visible at low water.",
        objective: { type: "reach", target: "mire-drawings", count: 1 } },
      { id: "furrow-site", text: "The stones in Cinderfell the Sentinel stepped over instead of through.",
        objective: { type: "reach", target: "furrow-drawings", count: 1 } },
      { id: "reach-site", text: "The woman with the hoop, on the Carnelian Reach, under Ruby Order scaffolding.",
        objective: { type: "reach", target: "reach-drawings", count: 1 } },
      { id: "come-back", text: "Come back with nothing. Nettle will ask you what you saw and will not want an answer.",
        objective: { type: "talk", target: "woodland-huldra", count: 1 } },
    ],
    rewards: { gold: 0, xp: 900, items: ["amber-ring", "ochre-pot"] },
    next: null,
  },

  {
    id: "the-willing-name",
    name: "The Willing Name",
    giver: "makal",
    region: "sundermarsh",
    level: 9,
    summary: "The Quiet Desk has a paid contract on a man in Sundermarsh. The man who paid for it is the man on it.",
    stages: [
      { id: "the-contract", text: "Take the tally from Makal. Read the fee. Read the name under the fee.",
        objective: { type: "collect", target: "chapterhouse-key", count: 1 } },
      { id: "find-him", text: "He drinks at the ruins by the water and has been waiting eleven days.",
        objective: { type: "reach", target: "drowned-ledger", count: 1 } },
      { id: "talk-to-him", text: "He will want to talk first. Everyone does. Makal considers this part of the service.",
        objective: { type: "talk", target: "desk-adept", count: 1 } },
      { id: "resolve", text: "Go back to Makal, whatever you did or didn't do.",
        objective: { type: "talk", target: "makal", count: 1 } },
    ],
    rewards: { gold: 350, xp: 1100, items: ["desk-stiletto", "mire-brandy"] },
    next: null,
  },

  {
    id: "six-lamps-on-the-cinder-road",
    name: "Six Lamps on the Cinder Road",
    giver: "snader",
    region: "cinderfell",
    level: 10,
    summary: "Snader wants the watchtowers along the Cinder Road lit so the Vigil can see a Sentinel move at night. He is very good company about it.",
    stages: [
      { id: "get-oil", text: "Six flasks of signal oil. Snader has already lost his, twice.",
        objective: { type: "collect", target: "signal-oil", count: 6 } },
      { id: "the-road", text: "Light the towers along the Cinder Road.",
        objective: { type: "reach", target: "cinder-road-towers", count: 1 } },
      { id: "stagward-last", text: "Stagward is the last and the highest. Snader will walk you up it and talk the whole way.",
        objective: { type: "reach", target: "stagward-tower", count: 1 } },
      { id: "drink-on-it", text: "Have a drink at the top. He is not lying about anything he says up there, which he will later find important.",
        objective: { type: "talk", target: "snader", count: 1 } },
    ],
    rewards: { gold: 160, xp: 1200, items: ["signal-oil", "vigil-cuirass", "mire-brandy"] },
    next: null,
  },

  {
    id: "the-red-courtesy",
    name: "The Red Courtesy",
    giver: "cedar",
    region: "thistlecrag",
    level: 12,
    summary: "Cedar is sending a surveyor onto tusk-kin ground and asks you to escort her — and to kill nobody at all, no matter what is thrown.",
    stages: [
      { id: "meet-the-surveyor", text: "Take the surveyor from the Carnelian approach.",
        objective: { type: "reach", target: "citadel-approach", count: 1 } },
      { id: "the-archway", text: "Escort her as far as the Thistlecrag archway.",
        objective: { type: "reach", target: "thistle-archway", count: 1 } },
      { id: "the-outriders", text: "Outriders will come down off the stones. Sergeant Ould will want an order. He will follow whichever one you give.",
        objective: { type: "talk", target: "sergeant-ould", count: 1 } },
      { id: "braid-arrives", text: "Lilly Braid arrives last, on purpose, to see what the Order does when nobody is watching.",
        objective: { type: "talk", target: "lilly-raider", count: 1 } },
      { id: "report", text: "Report to Cedar. He will already know. He always already knows, and he still asks.",
        objective: { type: "talk", target: "cedar", count: 1 } },
    ],
    rewards: { gold: 450, xp: 1800, items: ["ruby-half-plate", "gold-crown"] },
    next: null,
  },

  {
    id: "the-flamewing-account",
    name: "The Flamewing Account",
    giver: "miriam",
    region: "sundermarsh",
    level: 12,
    summary: "A Desk eraser took her forty-name dagger and walked. Miriam wants the dagger back. She is conspicuously uninterested in the woman.",
    stages: [
      { id: "the-chapterhouse-again", text: "The defector's cell in the chapterhouse, and what she left in it.",
        objective: { type: "reach", target: "desk-chapterhouse", count: 1 } },
      { id: "hunt", text: "Her handlers found her first, and they are still standing over it.",
        objective: { type: "kill", target: "desk-adept", count: 4 } },
      { id: "the-dagger", text: "Recover the Flamewing Dagger.",
        objective: { type: "collect", target: "flamewing-dagger", count: 1 } },
      { id: "give-it-back", text: "Bring it to Miriam and see whether she takes it.",
        objective: { type: "talk", target: "miriam", count: 1 } },
    ],
    rewards: { gold: 300, xp: 1900, items: ["flamewing-dagger", "grove-oil"] },
    next: null,
  },
];

/** id -> quest, for the journal. */
export const QUESTS_BY_ID = Object.freeze(
  QUESTS.reduce((acc, q) => { acc[q.id] = q; return acc; }, {})
);

// ═════════════════════════════════════════════════════════ DIALOGUE ════════

export const DIALOGUE = {
  // ───────────────────────────────────────────────────────── CHARLES ───────
  "charles-intro": {
    speaker: "charles",
    lines: [
      { text: "You're not from the Order. Good. Sit on the wall, mind the loose one.", mood: 0.2 },
      { text: "There's a Sentinel at the bottom of my field. Been there since my " +
              "great-grandfather's day, quiet as a gatepost. Tuesday morning it was two " +
              "paces further into my barley than it was on Monday.", mood: -0.3 },
      { text: "I'm not asking anybody to fight it. I'm asking somebody to go and look at " +
              "it, so I can stop looking at it.", mood: -0.1 },
    ],
    options: [
      { text: "Two paces. You're sure?", goto: "charles-sentinel" },
      { text: "Whose field is this, Charles?", goto: "charles-field-truth" },
      { text: "I'll go and look.", accept: "the-quiet-furrow", goto: "charles-thanks" },
      { text: "Anything else wrong out here?", goto: "charles-turnips" },
      { text: "Good day to you.", exit: true },
    ],
  },

  "charles-sentinel": {
    speaker: "charles",
    lines: [
      { text: "I've ploughed to within a yard of that thing for thirty-one years. I know " +
              "where it stands the way you know where your own doorframe is.", mood: -0.2 },
      { text: "It's a green stone man, four times my height, and it has taken two steps " +
              "into ground it's stood guard over since before my line was in this valley.", mood: -0.5 },
      { text: "And it stopped. That's the bit that keeps me up. It stopped, like it got " +
              "half a sentence and waited for the rest.", mood: -0.6 },
    ],
    options: [
      { text: "Whose field is this?", goto: "charles-field-truth" },
      { text: "I'll go and look.", accept: "the-quiet-furrow", goto: "charles-thanks" },
      { text: "I'll think about it.", exit: true },
    ],
  },

  "charles-field-truth": {
    speaker: "charles",
    lines: [
      { text: "...You've a nasty way of asking a friendly question.", mood: -0.4 },
      { text: "It's mine. My father worked it, and his mother before him, and she came " +
              "onto it in the bad years when there was nobody to work it and nobody left " +
              "to say so.", mood: -0.2 },
      { text: "There's no paper. There's never been paper. There's forty years of my own " +
              "sweat in that dirt and a wall I built with these hands, and if you think " +
              "that's not a claim then you've never built anything.", mood: -0.7 },
      { text: "But stone can't read a wall. That's the trouble. Stone reads a roll, and " +
              "somewhere there's a roll with a name on it that isn't Hale.", mood: -0.5 },
    ],
    options: [
      { text: "Then let's find out what the roll says.", goto: "charles-thanks", accept: "the-quiet-furrow" },
      { text: "Some things shouldn't be written down.", goto: "charles-sentinel" },
      { text: "I'll leave you to it.", exit: true },
    ],
  },

  "charles-thanks": {
    speaker: "charles",
    lines: [
      { text: "Right. Right, good.", mood: 0.4 },
      { text: "Boundary stone's the flat grey one, past the second hedge. Don't shout at " +
              "it. Don't touch it. And whatever you find — come and tell me before you " +
              "tell anybody in the village, because half of them will have it as a curse " +
              "and the other half will have it as a land claim by Thursday.", mood: 0.2 },
      { text: "If it's bad news, go and see Mildrid Ashcombe first. She sells paper. Don't " +
              "make a face at me. Everybody in this valley owns their house because of a " +
              "woman like Mildrid.", mood: 0.0 },
    ],
    options: [{ text: "I'll be back.", exit: true }],
  },

  "charles-turnips": {
    speaker: "charles",
    lines: [
      { text: "Something's at my turnips. Row at a time, dead straight, and it puts the " +
              "tops back after. Neat. Neater than I'd do it.", mood: 0.1 },
      { text: "A fox doesn't do neat. A man does neat, and no man in Greenhollow is going " +
              "hungry enough to steal turnips and then tidy up.", mood: -0.2 },
      { text: "I found my ewe's bell out there. She hasn't been out there in a year and a " +
              "half. She hasn't been anywhere in a year and a half; we ate her.", mood: -0.3 },
    ],
    options: [
      { text: "I'll sit out there tonight.", accept: "the-hand-that-still-works", goto: "charles-turnips-yes" },
      { text: "Buy a dog.", exit: true },
    ],
  },

  "charles-turnips-yes": {
    speaker: "charles",
    lines: [
      { text: "Take the lantern off the byre hook and don't light it till you're in the " +
              "rows. Light travels out here.", mood: 0.3 },
      { text: "And — look. If it's got a face. If it's got a face I know.", mood: -0.4 },
      { text: "Just come and tell me. Don't be gentle about it. Gentle takes longer.", mood: -0.5 },
    ],
    options: [{ text: "Tonight, then.", exit: true }],
  },

  // ───────────────────────────────────────────────────────── MILDRID ───────
  "mildrid-intro": {
    speaker: "mildrid",
    lines: [
      { text: "Hale sent you. He's got that face on, hasn't he — like a man who's just " +
              "found out weather is a thing that happens to him personally.", mood: 0.4 },
      { text: "Sit. Mind the wet sheets, that's a birth record for a boy who was born " +
              "eleven years earlier than he was actually born, and it needs to dry flat.", mood: 0.5 },
      { text: "I'm a deedwright. I write deeds. I write them very well, on the right " +
              "vellum, in the right hand, with the right dirt rubbed into the folds. " +
              "Nobody in Greenhollow pretends otherwise and nobody in Greenhollow has been " +
              "put off their land in forty years. Draw whatever conclusion you like.", mood: 0.3 },
    ],
    options: [
      { text: "You're a forger.", goto: "mildrid-trade" },
      { text: "Who was Belve?", goto: "mildrid-belve" },
      { text: "Charles needs a deed the stone will believe.", accept: "paper-and-plough", goto: "mildrid-thanks" },
      { text: "You look like a woman with a problem of her own.", goto: "mildrid-mill" },
      { text: "Later.", exit: true },
    ],
  },

  "mildrid-trade": {
    speaker: "mildrid",
    lines: [
      { text: "I am. Say it louder, the roof beams didn't catch it.", mood: 0.5 },
      { text: "Here is the thing people your age never sit still long enough to understand. " +
              "There is no true deed in Ossmere. There hasn't been since the Blank Year. " +
              "The true ones went into the mud with the clerks who kept them.", mood: 0.1 },
      { text: "So every scrap of paper holding up every roof in this valley is either a " +
              "forgery, or a forgery so old it's got respectable. The only question left " +
              "is whether the forger is any good, and whether she's got a conscience.", mood: 0.0 },
      { text: "I'm very good. And I keep a book of every single one I've written and what " +
              "it cost the poor soul on the other side of it. That's not a boast. That's " +
              "the interest I pay.", mood: -0.3 },
    ],
    options: [
      { text: "What's in the book?", goto: "mildrid-mill" },
      { text: "Who taught you the Court hand?", goto: "mildrid-belve" },
      { text: "Charles needs a deed.", accept: "paper-and-plough", goto: "mildrid-thanks" },
      { text: "That's enough honesty for one morning.", exit: true },
    ],
  },

  "mildrid-belve": {
    speaker: "mildrid",
    lines: [
      { text: "Belve. Every child in this valley gets her as a bedtime story and every " +
              "one of them gets her wrong.", mood: 0.1 },
      { text: "They tell it as a theft. Brave little clerk steals the wicked roll, tyranny " +
              "falls, hurrah. Nobody tells the front half, which is that she spent " +
              "thirty-one years writing the lies she later ran off with.", mood: -0.4 },
      { text: "Two hundred and forty families. She counted. That's the detail that gets " +
              "me — she counted, all the way through, and kept going.", mood: -0.6 },
      { text: "Then she sat in a tree for eleven years writing it all out again, honestly, " +
              "from memory. And here is what I want you to hold in your head, because " +
              "everyone forgets it the moment it becomes inconvenient: nobody can check " +
              "her work. Nobody. It is a document whose only guarantee is the word of a " +
              "woman who forged documents for a living.", mood: -0.2 },
      { text: "I'd know. It's my trade. It's very nearly my family trade.", mood: -0.5 },
    ],
    options: [
      { text: "Family trade?", goto: "mildrid-mill" },
      { text: "Charles needs a deed.", accept: "paper-and-plough", goto: "mildrid-thanks" },
      { text: "Thank you.", exit: true },
    ],
  },

  "mildrid-thanks": {
    speaker: "mildrid",
    lines: [
      { text: "Good. Then listen, because there's a limit to what I can conjure.", mood: 0.3 },
      { text: "A Sentinel doesn't read words. It reads a hand. The specific loops and " +
              "pressure of a Court clerk's pen, the way the descenders drag when the ink's " +
              "cold. I can copy any hand alive, but the Court's been dead two centuries " +
              "and I need a sample.", mood: 0.2 },
      { text: "There's a proclamation still nailed to the wayside toll-post out in " +
              "Hollowmere. Toll notice, year three ninety-one. Utterly worthless and " +
              "exactly what I need.", mood: 0.4 },
      { text: "Fair warning: the tollman's still on it. He's been collecting for two " +
              "hundred years and he doesn't accept modern coin.", mood: -0.2 },
    ],
    options: [
      { text: "I'll bring it back.", exit: true },
      { text: "And after that?", goto: "mildrid-trade" },
    ],
  },

  "mildrid-mill": {
    speaker: "mildrid",
    lines: [
      { text: "...Ashcombe Mill.", mood: -0.5 },
      { text: "Twenty years ago a widow came in here with three children and a dead " +
              "husband's brother who had the law on his side, and I made her a mill she " +
              "had no right to. I did it for nothing. I have never been prouder of a " +
              "piece of work.", mood: -0.1 },
      { text: "Her grandchildren are in it now. Six of them. They think their great-gran " +
              "bought it fair, and I have let them think that for two decades because it " +
              "is a kinder world with them in that mill than out of it.", mood: -0.3 },
      { text: "And now there's a Ruby Order auditor coming down from the Reach to test " +
              "lodged deeds against the fragments they've got, and mine is sitting in the " +
              "guild hall strongbox waiting to be beautiful at exactly the wrong moment.", mood: -0.8 },
    ],
    options: [
      { text: "I'll get it out of the strongbox.", accept: "the-honest-forgery", goto: "mildrid-mill-yes" },
      { text: "Maybe the auditor should read it.", goto: "mildrid-mill-yes", accept: "the-honest-forgery" },
      { text: "Not my mill, not my problem.", exit: true },
    ],
  },

  "mildrid-mill-yes": {
    speaker: "mildrid",
    lines: [
      { text: "Strongbox, guild hall, third shelf, marked as a tithe return so nobody " +
              "reads it. The lock's a joke and the joke is that everyone in Greenhollow " +
              "knows it's a joke.", mood: 0.2 },
      { text: "Bram Thatcher witnessed it. He was drunk. He's been drunk about it since, " +
              "on and off, in a considered sort of way.", mood: -0.2 },
      { text: "And — I'm not going to tell you what to do with it once it's in your hand. " +
              "That would be cheating. I've spent twenty years deciding for other people " +
              "what's true. Have a turn.", mood: -0.4 },
    ],
    options: [{ text: "I'll be back.", exit: true }],
  },

  // ─────────────────────────────────────────────────────────── MAPLE ───────
  "maple-intro": {
    speaker: "maple",
    lines: [
      { text: "Oh — good. Someone who doesn't already know everything about me since I " +
              "was four.", mood: 0.6 },
      { text: "I'm Maple. Gran's apprentice. I mix inks, I age vellum in the smoke, I've " +
              "got the second-best Court hand in the valley and I'm nineteen, which " +
              "everyone tells me like it's a compliment.", mood: 0.4 },
      { text: "It isn't, though, is it. Being very good at lying isn't a compliment. It's " +
              "just a fact about your hands.", mood: -0.2 },
    ],
    options: [
      { text: "Your grandmother seems proud of you.", goto: "maple-gran" },
      { text: "What's that in the chest up there?", goto: "maple-mask" },
      { text: "You go and stare at the Sentinel most days.", goto: "maple-sentinel" },
      { text: "Keep at it.", exit: true },
    ],
  },

  "maple-gran": {
    speaker: "maple",
    lines: [
      { text: "She is. That's the problem. She's proud of me for exactly the thing I want " +
              "to stop doing.", mood: -0.3 },
      { text: "She says there's no true deed left so we may as well write kind ones. And " +
              "I've heard her say it four hundred times and it's a good line and I still " +
              "think it's rot.", mood: 0.0 },
      { text: "Because a kind lie is still a thing somebody has to keep track of. Someone " +
              "has to remember which mill is really whose. And Gran remembers. She keeps " +
              "a book. And when she dies the book will just be a book, and every kind lie " +
              "in this valley turns into a fight.", mood: -0.5 },
      { text: "I don't want a kinder lie. I want one true page. Just one. I'd start there.", mood: 0.2 },
    ],
    options: [
      { text: "Belve wanted the same thing.", goto: "maple-mask" },
      { text: "One true page can get people killed.", goto: "maple-sentinel" },
      { text: "Good luck.", exit: true },
    ],
  },

  "maple-mask": {
    speaker: "maple",
    lines: [
      { text: "You saw it. Right — good, then I'm not mad.", mood: 0.3 },
      { text: "There's a chest in my loft that's Gran's and I'm not to open it, and I " +
              "opened it, obviously, when I was eleven and again last week.", mood: 0.4 },
      { text: "There's a mask in it. Green leather, owl's face, gilt round the eyes. And " +
              "I know what it is because I've copied the seal that goes with it a hundred " +
              "times without ever once asking why we had the seal.", mood: -0.2 },
      { text: "It's an auditor's masque. Court issue. They wore them on circuit so the " +
              "village would remember the office and not the woman.", mood: -0.5 },
      { text: "The Ashcombes didn't start out forging deeds against the Court. We were the " +
              "Court. And the leather's worn pale on the inside of the left cheek, so " +
              "whoever wore it wore it for years.", mood: -0.7 },
    ],
    options: [
      { text: "I'll find out who wore it.", accept: "a-face-for-the-office", goto: "maple-thanks" },
      { text: "Some chests should stay shut.", goto: "maple-gran" },
      { text: "That's between you and your gran.", exit: true },
    ],
  },

  "maple-thanks": {
    speaker: "maple",
    lines: [
      { text: "Bram Thatcher's the oldest thing in this village that still talks. Start " +
              "with him and buy him something.", mood: 0.3 },
      { text: "And — take the book that's under the mask as well. I couldn't. I got my " +
              "hand on it and I couldn't lift it, which is stupid, it's a book.", mood: -0.3 },
      { text: "If it's bad, tell me anyway. I'd rather have it than not. I've thought " +
              "about that a lot and I'm fairly sure.", mood: -0.1 },
    ],
    options: [{ text: "Fairly sure will do.", exit: true }],
  },

  "maple-sentinel": {
    speaker: "maple",
    lines: [
      { text: "Every few days, yes. I take my dinner out and I sit on the wall and I look " +
              "at it and nobody else in this village will even turn their head.", mood: 0.2 },
      { text: "There's a four-metre stone man standing in a barley field and four hundred " +
              "people have agreed to treat it as scenery. That's not calm. That's a whole " +
              "village holding its breath for two centuries.", mood: -0.4 },
      { text: "I've been counting its distance from the third fencepost since I was " +
              "twelve. It's moved twice. Nobody wants that written down either.", mood: -0.6 },
    ],
    options: [
      { text: "Twice?", goto: "maple-mask" },
      { text: "Keep counting.", exit: true },
    ],
  },

  // ───────────────────────────────────────────────────── LILLY BRAID ───────
  "lilly-intro": {
    speaker: "lilly-raider",
    lines: [
      { text: "Stop there. Hands where the wind can see them.", mood: -0.4 },
      { text: "Lilly Braid. Tally-keeper of the crag clans, which sounds grander than it " +
              "is — mostly it means I'm the one who writes down what we steal.", mood: -0.1 },
      { text: "Yes. Steal. I'm not going to do the thing where I call it foraging and you " +
              "do the thing where you pretend to believe me. We come down off this crag " +
              "and we take barley, and we notch a bone for every bushel, and one day we " +
              "pay it back.", mood: 0.1 },
      { text: "Don't laugh. Two of you laughed this year and I only hit one of them.", mood: 0.2 },
    ],
    options: [
      { text: "Two hundred years of debt you intend to pay?", goto: "lilly-tally" },
      { text: "There's smoke in the gully below you.", goto: "lilly-haggar" },
      { text: "Try paying one of them and see what happens.", goto: "lilly-debt" },
      { text: "I'll move along.", exit: true },
    ],
  },

  "lilly-tally": {
    speaker: "lilly-raider",
    lines: [
      { text: "Two hundred and eleven years. Eleven thousand notches. It fills a hall and " +
              "we've had to prop the roof.", mood: 0.0 },
      { text: "You want to know why. Everyone does, and they always ask it in that voice, " +
              "like they've caught us at something.", mood: -0.2 },
      { text: "When the first surveyors came through, they wrote this valley down as " +
              "unclaimed. Not stolen — unclaimed. Because my grandmothers didn't write, " +
              "and if you don't write, you don't own, and if you don't own, you aren't " +
              "anybody. Four hundred years of law grew out of that one clerk's afternoon.", mood: -0.6 },
      { text: "So we keep the tally. Because if we ever pay it — every bushel, every " +
              "sheep, every stolen winter — then nobody in Ossmere can ever say we took " +
              "and gave nothing. We will have a record. We will be a people with a record.", mood: 0.3 },
      { text: "It's the stupidest thing I've ever heard of and I have given my whole life " +
              "to it. Both those things are true at once. Get used to that up here.", mood: 0.1 },
    ],
    options: [
      { text: "Then let's start paying one.", goto: "lilly-debt" },
      { text: "Haggar doesn't agree.", goto: "lilly-haggar" },
      { text: "Understood.", exit: true },
    ],
  },

  "lilly-haggar": {
    speaker: "lilly-raider",
    lines: [
      { text: "Haggar Scaur. He carried me eleven miles with a spear in his leg when I " +
              "was nineteen. Now he's got sixty men in the gully and a fire that hasn't " +
              "gone out in a month.", mood: -0.7 },
      { text: "He didn't turn on us. He agreed with us, and then he kept going past where " +
              "we stopped. If nothing written is real, he says, then stop writing. Stop " +
              "counting. Take, and don't ledger it, and let the whole rotten arrangement " +
              "starve.", mood: -0.4 },
      { text: "He's got the Long Tally. Came up in the night, four dead, took the roll, " +
              "and he'll burn it at the next dark moon in front of anyone who'll watch.", mood: -0.9 },
      { text: "And there's another thing in his tent. He gutted a Ruby Order courier last " +
              "week and took a scrap of vellum off him that six knights died trying to " +
              "get back. That's not a letter. Knights don't die for letters.", mood: -0.3 },
    ],
    options: [
      { text: "I'll go into the gully.", accept: "the-long-tally", goto: "lilly-thanks" },
      { text: "He might be right, you know.", goto: "lilly-tally" },
      { text: "That's a clan matter.", exit: true },
    ],
  },

  "lilly-thanks": {
    speaker: "lilly-raider",
    lines: [
      { text: "Then we go tonight, and we go up the goat track, and we don't announce " +
              "ourselves.", mood: 0.4 },
      { text: "The Tally first. The Tally before anything, before me, before you. If it's " +
              "burning and I'm burning, you put the roll out.", mood: 0.1 },
      { text: "And Haggar's mine to talk to. I get one try. I know how it ends, I've known " +
              "for a month, I'd just like to have had the try.", mood: -0.6 },
    ],
    options: [{ text: "Up the goat track, then.", exit: true }],
  },

  "lilly-debt": {
    speaker: "lilly-raider",
    lines: [
      { text: "You think I haven't? Fine. Fine, come here, I'll show you the one that " +
              "sticks in my teeth.", mood: 0.2 },
      { text: "Winter of the long frost, eighty years back. We came off the crag into a " +
              "farm at Greenhollow and took nine sacks of barley and a milk cow. The " +
              "notch says the family's name was Thatcher and the mother's name was Nan.", mood: -0.1 },
      { text: "Nan Thatcher's grandson is still down there on that ground. Nine sacks and " +
              "a cow, at fair rate with eighty years on it, is about forty crowns.", mood: 0.0 },
      { text: "I've had the forty crowns in a bag under my bed for four years. Take it " +
              "down. Take the stone with it, so he knows exactly which winter he's being " +
              "paid for.", mood: 0.3 },
    ],
    options: [
      { text: "I'll carry it down.", accept: "what-braid-owes", goto: "lilly-debt-yes" },
      { text: "He won't take it.", goto: "lilly-debt-yes", accept: "what-braid-owes" },
      { text: "Some debts should just be dropped.", exit: true },
    ],
  },

  "lilly-debt-yes": {
    speaker: "lilly-raider",
    lines: [
      { text: "He won't take it. I know. I've sent three people and he's refused three " +
              "times and once he threw the bag in a ditch.", mood: -0.3 },
      { text: "Because if he takes it, it happened. If he takes it, his gran was robbed " +
              "and starved and it's a real thing with a price on it, instead of a story " +
              "he tells that makes him the only honest man in the room.", mood: -0.1 },
      { text: "Nobody wants their grievance settled. They want it kept. Warm. Fed.", mood: -0.4 },
      { text: "Take it anyway. I'll keep sending it down every four years until one of us " +
              "is dead, and then I'll leave instructions.", mood: 0.2 },
    ],
    options: [{ text: "I'll go and be refused.", exit: true }],
  },

  // ────────────────────────────────────────────────────────── HAGGAR ───────
  "haggar-intro": {
    speaker: "haggar",
    lines: [
      { text: "There. There it is. That look.", mood: -0.6 },
      { text: "You've come up my gully with a list in your head. Names on it, and a tick " +
              "next to each one when it's done, and mine's the big one at the bottom.", mood: -0.5 },
      { text: "That's all any of you have ever been. Clerks with knives.", mood: -0.8 },
    ],
    options: [
      { text: "Burning the Tally doesn't free anyone.", goto: "haggar-why" },
      { text: "Lilly carried your name for years.", goto: "haggar-lilly" },
      { text: "Where's the courier's vellum?", goto: "haggar-last" },
      { text: "(Draw.)", exit: true },
    ],
  },

  "haggar-why": {
    speaker: "haggar",
    lines: [
      { text: "Eleven thousand notches. You've seen the hall? Braid's got it propped " +
              "with beams because the weight of what we owe is going through the floor.", mood: -0.3 },
      { text: "I carried tally-bone for twenty-two years. Every sack, every hen. And I " +
              "worked out one night at about the age of forty that I would die owing, and " +
              "my children would be born owing, and their children, and that the ledger " +
              "was not a promise to repay. It was a leash we plaited ourselves.", mood: -0.2 },
      { text: "They made us not-people with a pen. And we answered with a better set of " +
              "books. Do you see how funny that is? We spent two hundred years learning " +
              "to be excellent bookkeepers so that one day the people who erased us would " +
              "audit us and say: yes, all right, these ones exist.", mood: -0.7 },
      { text: "No. Burn it. Burn all of it, theirs and ours, and then there's just what " +
              "you are and what you can hold, which is the only true thing there has ever " +
              "been.", mood: 0.1 },
      { text: "You think that's monstrous. It is. It's the smallest monster on offer.", mood: -0.4 },
    ],
    options: [
      { text: "And the people who can't hold anything?", goto: "haggar-lilly" },
      { text: "Enough.", exit: true },
    ],
  },

  "haggar-lilly": {
    speaker: "haggar",
    lines: [
      { text: "Don't. Don't use her on me.", mood: -0.9 },
      { text: "Eleven miles I carried that girl. With a Ruby spear in my thigh, up the " +
              "north face, in the dark, and she talked the whole way about what she'd " +
              "notch it as.", mood: -0.3 },
      { text: "She's the best of us and she's the sickness. She'd have us kneel in a hall " +
              "full of bones for another two hundred years, paying a debt to people who " +
              "would not cross a road to spit on us.", mood: -0.6 },
      { text: "And she'll come up here herself, won't she. Not send you. She'll come and " +
              "she'll want to talk first.", mood: -0.7 },
      { text: "Tell her I said no. Tell her I said it kindly. She'll know that's a lie and " +
              "it'll help.", mood: -0.5 },
    ],
    options: [
      { text: "You could tell her yourself.", goto: "haggar-last" },
      { text: "I'll tell her.", exit: true },
    ],
  },

  "haggar-last": {
    speaker: "haggar",
    lines: [
      { text: "The vellum's in the fire pit under a stone, and it's staying there till the " +
              "dark moon, and then it goes in with the rest.", mood: -0.4 },
      { text: "I can't read it. Nobody up here can. That's the joke — I've got the thing " +
              "six knights died for and it's marks on a skin to me.", mood: -0.1 },
      { text: "But I know what it is by how badly you all want it. That's how I've read " +
              "everything my whole life, and I've never once been wrong.", mood: 0.2 },
      { text: "Come on then. Let's find out if I'm on your list.", mood: -0.8 },
    ],
    options: [{ text: "(Draw.)", exit: true }],
  },

  // ───────────────────────────────────────────────── FERREN NINEBARK ───────
  "ferren-intro": {
    speaker: "woodland-druid",
    lines: [
      { text: "Don't— don't step there. That's the seventh train's return spring and it's " +
              "under about forty stone of tension.", mood: -0.2 },
      { text: "Ferren Ninebark. Grove-wright. Two hundred and six years of my order have " +
              "done this and I am doing it badly.", mood: 0.1 },
      { text: "The Groves are eleven minutes fast. Eleven. They've been within four " +
              "seconds of true since the year one hundred and eighty-eight and now they're " +
              "eleven minutes fast and I have re-cut the escapement twice.", mood: -0.5 },
    ],
    options: [
      { text: "What happens if they stop?", goto: "ferren-groves" },
      { text: "Who lives in the hollow tree?", goto: "ferren-nettle" },
      { text: "You look like you need hands.", goto: "ferren-seventh" },
      { text: "I'll leave you to it.", exit: true },
    ],
  },

  "ferren-groves": {
    speaker: "woodland-druid",
    lines: [
      { text: "Then the Sentinels wake up.", mood: -0.8 },
      { text: "They don't run on hate. They run on time. Every night, every one of them in " +
              "this valley reaches out for the Groves the way you reach for the wall in a " +
              "dark room, and finds the tick, and knows what o'clock it is and what year " +
              "and therefore which Survey it is meant to be dreaming.", mood: 0.0 },
      { text: "There is no Survey. Hasn't been for two hundred years. So they reach out, " +
              "and find the tick, and find no roll behind it, and they go back to sleep " +
              "confused. That confusion is the only thing keeping this valley alive and I " +
              "maintain it with a sickle and a pot of oil.", mood: -0.4 },
      { text: "And yes. Yes, I know. These are Court machines. Built to keep a boot on a " +
              "province. My whole order is a maintenance schedule for the instruments of " +
              "our own grandmothers' ruin, and we sing while we oil them.", mood: -0.3 },
      { text: "You can hold two things. Everyone in Hollowmere holds two things. It's the " +
              "entry requirement.", mood: 0.2 },
    ],
    options: [
      { text: "Then let's keep them ticking.", accept: "eleven-minutes-fast", goto: "ferren-thanks" },
      { text: "Who lives in the tree?", goto: "ferren-nettle" },
      { text: "Grim work.", exit: true },
    ],
  },

  "ferren-nettle": {
    speaker: "woodland-druid",
    lines: [
      { text: "Nettle. And before you ask: yes, she was here. Yes, she knew her. No, she " +
              "will not tell you anything about it.", mood: 0.0 },
      { text: "Belve spent her last eleven years in that tree. Nettle brought her water " +
              "and mast-bread and sat on the root and watched her write out four hundred " +
              "years of a province from memory, page by page, by one candle.", mood: 0.3 },
      { text: "She is the only living witness to the writing of Belve's Scroll. She could " +
              "settle the whole question tomorrow. Cedar Vantance has offered her a wing " +
              "of the Citadel. Ember Vause has offered to burn the tree with her in it. " +
              "She has said the same thing to both.", mood: -0.1 },
      { text: "Which is nothing. She says nothing. For sixty-one years.", mood: -0.3 },
      { text: "Bring me my cogs and I'll walk you up there. That's the only price I've got " +
              "and I'd like it paid in brass.", mood: 0.4 },
    ],
    options: [
      { text: "Three cogs. Done.", accept: "eleven-minutes-fast", goto: "ferren-thanks" },
      { text: "What happens if the Groves stop?", goto: "ferren-groves" },
      { text: "Not today.", exit: true },
    ],
  },

  "ferren-thanks": {
    speaker: "woodland-druid",
    lines: [
      { text: "Heartwood cores, brass rim, hand-cut teeth. Three of them, from the outer " +
              "groves — the ones that came down in the storm year and nobody's stripped.", mood: 0.4 },
      { text: "There's no one alive who can make a new one. I've tried for thirty years. " +
              "The wood has to be cut in a particular month by someone who knew what she " +
              "was listening for, and she died before she taught it, and that is the " +
              "actual quiet ending of every civilisation there has ever been.", mood: -0.4 },
      { text: "Something's in the gear-pit at the second grove. It was a person. Be quick " +
              "and don't look at its hands.", mood: -0.5 },
    ],
    options: [{ text: "Three cogs.", exit: true }],
  },

  "ferren-seventh": {
    speaker: "woodland-druid",
    lines: [
      { text: "I need four more cogs and two flasks of pressed mast-oil and a person to " +
              "hold a two-hundred-pound gear steady while I cut a tooth into it.", mood: 0.3 },
      { text: "Warden Ilse used to do the holding. She's got a hand that doesn't close now.", mood: -0.3 },
      { text: "It's not glamorous. It's a maintenance round. But every one of these rounds " +
              "for two hundred years is the reason there is a Greenhollow to have opinions " +
              "in.", mood: 0.2 },
    ],
    options: [
      { text: "I'll hold your gear.", accept: "the-seventh-train", goto: "ferren-seventh-yes" },
      { text: "Find someone else.", exit: true },
    ],
  },

  "ferren-seventh-yes": {
    speaker: "woodland-druid",
    lines: [
      { text: "Good. Bring the oil last, it goes off in the cold.", mood: 0.4 },
      { text: "And something's got into the crown gear at the third grove. Nesting. It " +
              "used to be a toll clerk, I think, by the coat.", mood: -0.2 },
      { text: "Don't talk to it. They answer. That's much worse.", mood: -0.5 },
    ],
    options: [{ text: "Understood.", exit: true }],
  },

  // ────────────────────────────────────────────────────────── NETTLE ───────
  "nettle-intro": {
    speaker: "woodland-huldra",
    lines: [
      { text: "Sit on the root, not the step. The step is hers.", mood: 0.1 },
      { text: "You've come about the Scroll. Everyone comes about the Scroll. I've had " +
              "four kings' worth of people up that path and not one of them ever came " +
              "about the tree.", mood: -0.2 },
      { text: "Before you start: I know what you want and the answer is no, and it will " +
              "be no in an hour, and it was no sixty-one years ago when a very polite man " +
              "in red asked me the same thing.", mood: 0.0 },
    ],
    options: [
      { text: "What was she like?", goto: "nettle-belve" },
      { text: "You could end all of this with one sentence.", goto: "nettle-witness" },
      { text: "There's a second fragment in the marsh.", goto: "nettle-ledger" },
      { text: "Tell me about the handprints on the rocks.", goto: "nettle-drawings" },
      { text: "I'll sit a while.", exit: true },
    ],
  },

  "nettle-belve": {
    speaker: "woodland-huldra",
    lines: [
      { text: "Small. Bad hip. Ate almost nothing and complained about the quality of the " +
              "nothing.", mood: 0.4 },
      { text: "She wrote for eleven years by one candle in that hollow and she would not " +
              "let me look at a single page. Not once. I brought her water twice a day " +
              "for eleven years and she covered the sheet with her arm like a child in a " +
              "schoolroom.", mood: 0.2 },
      { text: "Near the end she got frightened. Not of dying — of finishing. She'd say: " +
              "Nettle, I've put in the weir at Ashcombe and I've put it in as belonging to " +
              "the Fen family, and I am almost sure that is right.", mood: -0.3 },
      { text: "Almost sure. Eleven years of almost sure, four hundred years deep, by one " +
              "candle, from the memory of a woman of seventy-one who had spent thirty-one " +
              "years deliberately writing things down wrong.", mood: -0.6 },
      { text: "The last thing she said to me was: don't ever tell them how it was made.", mood: -0.4 },
    ],
    options: [
      { text: "So it's worthless.", goto: "nettle-witness" },
      { text: "She was trying to make it right.", goto: "nettle-witness" },
      { text: "Thank you for telling me that much.", exit: true },
    ],
  },

  "nettle-witness": {
    speaker: "woodland-huldra",
    lines: [
      { text: "One sentence. Yes. I've had sixty-one years to compose it and it's a very " +
              "good sentence.", mood: 0.1 },
      { text: "I sat on that root and I watched her write. I know which pages she wrote " +
              "warm and sure and which ones she wrote at three in the morning with her " +
              "hand over her mouth. I know one line — one — that she put in knowing it was " +
              "false, and I know exactly why she did it, and it was, I think, an act of " +
              "love.", mood: -0.2 },
      { text: "And if I tell you, then my saying so becomes the record. Then it's Nettle's " +
              "word that decides which family keeps a weir, and in forty years someone " +
              "will be standing in a burnt doorway saying 'but the huldra said.'", mood: -0.5 },
      { text: "That is the disease. Not the Court, not the Sentinels. The wanting-someone-" +
              "to-settle-it. Everyone in this valley is desperate to find the one person " +
              "whose say-so is final, and every single time they find one, the stone gets " +
              "up and starts walking.", mood: -0.7 },
      { text: "So: no. Not to the red man, not to the grey woman, not to you. Ask me about " +
              "the tree instead. Nobody ever asks about the tree.", mood: 0.3 },
    ],
    options: [
      { text: "Tell me about the tree.", goto: "nettle-belve" },
      { text: "Then help me find the rest of it.", goto: "nettle-ledger" },
      { text: "That's a coward's answer.", goto: "nettle-drawings" },
    ],
  },

  "nettle-ledger": {
    speaker: "woodland-huldra",
    lines: [
      { text: "The marsh. Yes. I won't tell you what's true but I'll tell you where things " +
              "are, and if you think that's a coward's line — it is, and I've made my " +
              "peace with it.", mood: -0.1 },
      { text: "The Court kept a regional office at what's now Sundermarsh. Four hundred " +
              "clerks. When the Blank Year came they didn't run, because the standing " +
              "instruction was to protect the records, and clerks are the most obedient " +
              "creatures God ever made.", mood: -0.4 },
      { text: "The ground gave. The whole office went down three floors into the water " +
              "with everyone still at their desks. They are still at their desks. They " +
              "queue, apparently. I've never been able to find out for what.", mood: -0.6 },
      { text: "There's a Sentinel down there too. Not destroyed — filed. Somebody in the " +
              "last hour of that building had the presence of mind to archive a colossus, " +
              "and it has been waiting two centuries for someone to come and read it " +
              "something.", mood: -0.3 },
      { text: "The Drowned Hand is in a brass cylinder in the strongroom. Take a light " +
              "that doesn't need air.", mood: 0.0 },
    ],
    options: [
      { text: "I'll go down.", accept: "the-drowned-ledger", goto: "nettle-thanks" },
      { text: "Come with me.", goto: "nettle-witness" },
      { text: "Not yet.", exit: true },
    ],
  },

  "nettle-thanks": {
    speaker: "woodland-huldra",
    lines: [
      { text: "Take ashroot. The chill down there isn't cold, it's unresolved, and it gets " +
              "into the joints.", mood: 0.2 },
      { text: "And listen — someone else is already in the marsh. Red-black leathers, very " +
              "quiet, been circling the ruins for a month without going in.", mood: -0.2 },
      { text: "A Quiet Desk eraser who won't take a thing she could have had four weeks " +
              "ago. I'd want to know why, in your place. I'd want to know that quite " +
              "badly.", mood: 0.1 },
    ],
    options: [{ text: "I'll ask her.", exit: true }],
  },

  "nettle-drawings": {
    speaker: "woodland-huldra",
    lines: [
      { text: "Ochre. Fat. A little ash. Same recipe for fourteen hundred years — you " +
              "could mix a pot tonight and put your hand on a stone and be understood " +
              "perfectly by someone dead a thousand years.", mood: 0.5 },
      { text: "There are four sites left. A herd in the marsh you can only see at low " +
              "water. Handprints over the Thistlecrag arch. Stones in the Furrow that the " +
              "Sentinel stepped over rather than through, which I think about a great " +
              "deal. And a woman with a hoop on the Reach, which the Ruby Order have very " +
              "carefully built a scaffold over to protect.", mood: 0.2 },
      { text: "I'd like someone to go and look at all four. And then I would like them to " +
              "write down nothing. No rubbing, no copy, no sketch, no notes, no report.", mood: 0.4 },
      { text: "Just go, and see, and let it stay a thing that is seen and not a thing that " +
              "is held. It's the only way anyone has ever owned anything up here and it " +
              "worked for fourteen centuries.", mood: 0.6 },
    ],
    options: [
      { text: "Four sites. Nothing written.", accept: "nothing-written-here", goto: "nettle-drawings-yes" },
      { text: "Records protect people too.", goto: "nettle-witness" },
      { text: "That's not a task, that's a sermon.", exit: true },
    ],
  },

  "nettle-drawings-yes": {
    speaker: "woodland-huldra",
    lines: [
      { text: "Good. And when you come back I'm going to ask you what you saw, and you're " +
              "going to start telling me, and I'm going to stop you.", mood: 0.3 },
      { text: "Don't take that badly. It's the nicest thing I do for anyone.", mood: 0.5 },
    ],
    options: [{ text: "I'll go and look at nothing.", exit: true }],
  },

  // ──────────────────────────────────────────────────── MIRIAM SEDGE ───────
  "miriam-intro": {
    speaker: "miriam",
    lines: [
      { text: "You've got the cylinder. Good. I've been standing in this water for four " +
              "weeks not taking it.", mood: -0.1 },
      { text: "Miriam Sedge. Quiet Desk. Before you reach for anything: if I'd been sent " +
              "for you, we would not be having a conversation, we would be having a " +
              "silence.", mood: 0.0 },
      { text: "I could have gone down there any night this month. I didn't, because the " +
              "moment I hand a fragment of Belve's Scroll to my guild, I am the woman who " +
              "did that, and I am trying very hard to stop being a woman who did things.", mood: -0.3 },
    ],
    options: [
      { text: "What is the Quiet Desk, exactly?", goto: "miriam-desk" },
      { text: "You want something from me.", goto: "miriam-self" },
      { text: "You're carrying a very expensive dagger.", goto: "miriam-flamewing" },
      { text: "Stay out of my way.", exit: true },
    ],
  },

  "miriam-desk": {
    speaker: "miriam",
    lines: [
      { text: "We don't sell murder. Any fool with a grudge and a rock can buy murder.", mood: 0.1 },
      { text: "We sell deletion. You pay, and a person stops, and then we go and take them " +
              "out of everything. Parish register, tithe book, muster roll, apprentice " +
              "papers, the little cross their mother scratched in the church beam. Two " +
              "hundred and six documents, on average, for a farmer. Nine hundred for a " +
              "merchant.", mood: -0.2 },
      { text: "By the time we're finished there is no record that they were ever in " +
              "Ossmere. And in a country where being written down is what makes you real, " +
              "that is a more thorough killing than any blade has ever managed.", mood: -0.5 },
      { text: "The wraiths in this marsh? Some of them are drowned clerks. The rest are " +
              "ours. Death has nothing to file them under, so they don't finish.", mood: -0.7 },
      { text: "Forty names, mine. Which is the number where they give you the good dagger.", mood: -0.8 },
    ],
    options: [
      { text: "So stop.", goto: "miriam-self" },
      { text: "Forty. And you sleep?", goto: "miriam-self" },
      { text: "I've heard enough.", exit: true },
    ],
  },

  "miriam-self": {
    speaker: "miriam",
    lines: [
      { text: "I want off the Roll.", mood: -0.4 },
      { text: "The Desk keeps a register of its own — the Quiet Roll. Every eraser, every " +
              "name we took, every fee. The guild that sells non-existence keeps the most " +
              "complete archive in this valley, because Makal says a thing can only be " +
              "properly removed by people who know exactly what was there.", mood: -0.1 },
      { text: "I'm on it. Fourteen lines of me. And the one deletion the Desk will not " +
              "sell, at any price, is its own.", mood: -0.5 },
      { text: "I've asked four times. Makal is enormously kind about it. He explains, very " +
              "gently, that I don't want to be unwritten, I want to be forgiven, and that " +
              "the Desk doesn't stock that.", mood: -0.6 },
      { text: "He's right. That's what makes it unbearable. Help me take the Roll and I'll " +
              "give you what the Desk knows about the third fragment — which is where it " +
              "is, who has it, and who has already offered to sell it.", mood: 0.2 },
    ],
    options: [
      { text: "Then let's go and take it.", accept: "the-erasure-clause", goto: "miriam-thanks" },
      { text: "Striking a line out won't undo forty people.", goto: "miriam-thanks", accept: "the-erasure-clause" },
      { text: "Find another accomplice.", exit: true },
    ],
  },

  "miriam-thanks": {
    speaker: "miriam",
    lines: [
      { text: "We go in the front door. Paying customer, tally in hand, boots on. Anything " +
              "else and every adept in the house treats it as a contract and I'd rather " +
              "not kill people I've eaten with.", mood: 0.1 },
      { text: "Makal will let us all the way in. He'll offer tea. He will not lie to us " +
              "once — he never has, to anyone, it's the thing he's proud of — and it will " +
              "be the most frightening hour of your life.", mood: -0.3 },
      { text: "And I'm not going to burn the Roll. I know that's what you're assuming.", mood: -0.1 },
      { text: "Four hundred names in there and I'm the only one who ever asked to come " +
              "out. The rest are somebody's mother. I'll strike my fourteen lines and I'll " +
              "put it in your hands and you can do what you like with the rest, and I will " +
              "not ask, and I will not want to know.", mood: -0.5 },
    ],
    options: [{ text: "Front door it is.", exit: true }],
  },

  "miriam-flamewing": {
    speaker: "miriam",
    lines: [
      { text: "It's not mine. That's the polite version.", mood: -0.2 },
      { text: "There was an eraser called Sabbe who reached forty a year before I did and " +
              "took the dagger and walked out of the chapterhouse the same night. Straight " +
              "out, in daylight, not even quickly.", mood: 0.1 },
      { text: "Everyone assumed she'd break for the coast. She got six miles. Her own " +
              "handlers found her in a ditch outside the marsh and they are still standing " +
              "over the spot, a year on, because Makal told them to wait for the dagger " +
              "and nobody's told them to stop.", mood: -0.6 },
      { text: "I want it back. Not for the Desk. Because it's got her thumbprint worn into " +
              "the grip and it is currently the only object in Ossmere that proves Sabbe " +
              "was ever alive.", mood: -0.4 },
    ],
    options: [
      { text: "I'll bring it out.", accept: "the-flamewing-account", goto: "miriam-flamewing-yes" },
      { text: "Why not go yourself?", goto: "miriam-flamewing-yes", accept: "the-flamewing-account" },
      { text: "Let her rest.", exit: true },
    ],
  },

  "miriam-flamewing-yes": {
    speaker: "miriam",
    lines: [
      { text: "Because they're mine. I trained two of them. I know which side each of " +
              "them favours and what they say to their hands before they move, and I do " +
              "not want to find out how much of that I remember.", mood: -0.5 },
      { text: "Her cell's second floor, the one with the window bricked from the inside — " +
              "she did that herself, three weeks before she ran, and nobody asked her " +
              "about it. Nobody in this guild has ever asked anybody about anything.", mood: -0.3 },
      { text: "Bring it to me and I'll tell you what I'm going to do with it. I've decided " +
              "and I'd like at least one person to hear me say it out loud.", mood: 0.2 },
    ],
    options: [{ text: "I'll get it.", exit: true }],
  },

  // ─────────────────────────────────────────────────── MAKAL UNDWIN ────────
  "makal-intro": {
    speaker: "makal",
    lines: [
      { text: "Sit. No — properly, back against the chair. You'll be here longer than you " +
              "think and I dislike watching people perch.", mood: 0.2 },
      { text: "Makal Undwin. I keep this desk, and the Roll, and the fee schedule, which " +
              "is nailed to the outside of the door where anyone may read it. We are the " +
              "only guild in Ossmere that publishes its prices.", mood: 0.3 },
      { text: "Miriam has brought you, so I already know the shape of the afternoon. " +
              "Let's have it properly, though. I'd hate to assume.", mood: 0.1 },
    ],
    options: [
      { text: "You murder people and then delete them.", goto: "makal-mercy" },
      { text: "The wraiths in the marsh are yours.", goto: "makal-wraiths" },
      { text: "Miriam wants off the Roll.", goto: "makal-miriam" },
      { text: "I hear you have a contract nobody will take.", goto: "makal-contract" },
      { text: "I've changed my mind about the chair.", exit: true },
    ],
  },

  "makal-mercy": {
    speaker: "makal",
    lines: [
      { text: "Yes. Correct in every particular, and said in a tone I've heard four " +
              "hundred times, and I would like ten minutes to say why the tone is wrong.", mood: 0.1 },
      { text: "What is a person, in Ossmere? Legally. Practically. A person is an entry. " +
              "You are a line in a tithe book and a mark in a muster roll and a name on a " +
              "deed, and every one of those lines is a hook that something can hang a " +
              "claim on. Your debts hang there. Your lord's levy hangs there. Your " +
              "father's disgrace hangs there, and your daughter's, when she has one.", mood: -0.2 },
      { text: "The Court made this. Not us. The Court decided that to exist was to be " +
              "written, and then spent four centuries hanging weight off every entry.", mood: -0.4 },
      { text: "We simply took that seriously. If existence is an entry, then removal is " +
              "the only complete freedom that this world permits. Everything else is " +
              "negotiation.", mood: 0.0 },
      { text: "I have never once lied to a client and I will not start with you. It is a " +
              "monstrous trade. It is also the only honest reading of the law we were all " +
              "handed. Both. Hold both.", mood: 0.2 },
    ],
    options: [
      { text: "And the ones you leave behind in the marsh?", goto: "makal-wraiths" },
      { text: "Miriam wants out.", goto: "makal-miriam" },
      { text: "That's the most careful thing I've ever heard a killer say.", exit: true },
    ],
  },

  "makal-wraiths": {
    speaker: "makal",
    lines: [
      { text: "Ah. You've been out to the ruins at dusk, then.", mood: -0.2 },
      { text: "Yes. Some of them. Not all — the drowned clerks are the Court's doing and " +
              "they queue, which I find unbearable, so I don't go at dusk.", mood: -0.4 },
      { text: "But the rest are ours. It seems that when a person is removed thoroughly " +
              "enough, death cannot complete the transaction. There is nothing to file " +
              "them under. So they stay, and they say their own names, and there is no " +
              "longer anywhere for a name to go.", mood: -0.6 },
      { text: "I discovered this in my nineteenth year in the trade. I had assumed I was " +
              "granting an ending.", mood: -0.7 },
      { text: "I did not stop. You want to know whether I stopped. I didn't, because by " +
              "then I had two hundred of them out there, and stopping would have made me " +
              "a man who had done that for nineteen years and then changed his mind, and " +
              "I found I could not carry it in that shape.", mood: -0.9 },
      { text: "So I carry it in this one. Which is worse, and steadier.", mood: -0.5 },
    ],
    options: [
      { text: "Then help Miriam get out before she's you.", goto: "makal-miriam" },
      { text: "You could still stop.", goto: "makal-contract" },
      { text: "I need air.", exit: true },
    ],
  },

  "makal-miriam": {
    speaker: "makal",
    lines: [
      { text: "She's asked four times. I've said no four times, and each time more gently, " +
              "which I understand is its own cruelty.", mood: -0.2 },
      { text: "She does not want to be unwritten. She has seen what unwritten looks like; " +
              "it is standing in the marsh saying its own name. She wants to be forgiven, " +
              "and she has correctly worked out that there is nobody left alive with " +
              "standing to forgive her, so she is trying to get the effect by " +
              "administrative means.", mood: -0.3 },
      { text: "I taught her. Everything she is good at, I put in her hands personally, " +
              "including the part where she stopped sleeping.", mood: -0.6 },
      { text: "And I will not give her the Roll, because the day I hand an eraser her own " +
              "fourteen lines is the day this guild becomes a thing that grants absolution, " +
              "and then people will start doing it for the absolution.", mood: -0.1 },
      { text: "Take it off me if you like. I'm not going to pretend to be surprised. I'll " +
              "simply have the adepts stop you, and they will fail, and afterwards I'll " +
              "still be sitting here, and Miriam will still be Miriam with a scratched-out " +
              "line, and you will all have learned something at considerable expense.", mood: 0.1 },
    ],
    options: [
      { text: "Then we do it the expensive way.", exit: true },
      { text: "You have a contract you want filled.", goto: "makal-contract" },
    ],
  },

  "makal-contract": {
    speaker: "makal",
    lines: [
      { text: "I do. It has been on the board eleven days and three of my people have " +
              "handed it back, which has never happened in my tenure.", mood: 0.0 },
      { text: "A man in the marsh. Paid the full fee in advance, in Court crowns, " +
              "correctly counted. Two hundred and six documents; he brought a list of them " +
              "himself, in order, with the parish ones flagged.", mood: 0.1 },
      { text: "The name on the contract is his own.", mood: -0.2 },
      { text: "He is not ill and he is not mad — I had him sat where you're sitting for " +
              "two hours and he is the most lucid client I have ever taken. He has simply " +
              "concluded, having read our fee schedule on the door, that he would rather " +
              "have never been than continue to be, and he has the money.", mood: -0.4 },
      { text: "I take no view. That is the position I have held for thirty years and it " +
              "is beginning to cost me something to hold it. He is at the ruins. He has " +
              "been waiting eleven days and he has stopped eating.", mood: -0.5 },
    ],
    options: [
      { text: "I'll go and talk to him.", accept: "the-willing-name", goto: "makal-contract-yes" },
      { text: "You want someone to talk him out of it.", goto: "makal-contract-yes", accept: "the-willing-name" },
      { text: "Take it off your board.", exit: true },
    ],
  },

  "makal-contract-yes": {
    speaker: "makal",
    lines: [
      { text: "Here is the tally. It opens the chapterhouse and it identifies you, which " +
              "in this marsh is the difference between a walk and an incident.", mood: 0.2 },
      { text: "I will tell you what I told the three who handed it back. The contract is " +
              "for a deletion. It is not for a conversation. If you go out there and talk " +
              "to him for four hours and come back with nothing done, the Desk has failed " +
              "a paying client and I will refund him in full and think about it every " +
              "night for a year.", mood: -0.1 },
      { text: "And if you go out there and do it, you will have done a thing he asked for, " +
              "paid for, and understood better than either of us.", mood: -0.3 },
      { text: "I said I take no view. I'd like it noted that I chose the word 'view' very " +
              "carefully.", mood: -0.6 },
    ],
    options: [{ text: "Noted.", exit: true }],
  },

  // ───────────────────────────────────────────────────── EMBER VAUSE ───────
  "ember-intro": {
    speaker: "ember",
    lines: [
      { text: "On the road. Not beside it. That's nine feet of ash and there's a " +
              "cartwright's family under this stretch.", mood: -0.2 },
      { text: "Vause. I keep the Vigil in Cinderfell. If you're sightseeing, look quickly " +
              "and go; if you're here about the Scroll, say so now and save us both the " +
              "slow bit.", mood: -0.3 },
      { text: "I've had four hours' sleep in three days and I'm told that makes me " +
              "unpleasant. It makes me efficient. People confuse those.", mood: 0.0 },
    ],
    options: [
      { text: "What is the Ashen Vigil?", goto: "ember-vigil" },
      { text: "What made the Furrow?", goto: "ember-furrow" },
      { text: "You have the third fragment.", goto: "ember-burn" },
      { text: "Tell me about Snader.", goto: "ember-snader" },
      { text: "I have the whole Scroll.", goto: "ember-ending" },
      { text: "I'll walk on.", exit: true },
    ],
  },

  "ember-vigil": {
    speaker: "ember",
    lines: [
      { text: "We're the keepers' grandchildren. The people who tuned the Sentinels for " +
              "the Court — who oiled them, and read them their instructions, and stood " +
              "next to them while they worked.", mood: -0.1 },
      { text: "Everyone else in this valley learned about the Blank Year from a song. We " +
              "learned it from someone who was holding the manual.", mood: -0.4 },
      { text: "So we hunt Sentinels, we burn archives, and once — once, and I'd do it " +
              "again — we hanged a man for reconstructing a tithe book from memory.", mood: -0.6 },
      { text: "You're about to tell me that's monstrous. Save it, I've got it written down " +
              "somewhere, which is a joke, and it's the only one I've got.", mood: 0.1 },
      { text: "Nobody thanks us. That's actually correct. A thing you do because it has to " +
              "be done shouldn't come with thanks, or you start doing it for the thanks.", mood: -0.2 },
    ],
    options: [
      { text: "Burning everything isn't a policy.", goto: "ember-furrow" },
      { text: "You have the third fragment.", goto: "ember-burn" },
      { text: "Understood.", exit: true },
    ],
  },

  "ember-furrow": {
    speaker: "ember",
    lines: [
      { text: "One Sentinel. One. Walked west for a year and a day, and this is the line " +
              "it took.", mood: -0.5 },
      { text: "Forty miles long, sixty feet wide, nine feet deep. Not rage — it wasn't " +
              "angry, it can't be angry. It had no roll to dream and it defaulted to the " +
              "oldest thing cut into it, which is CLEAR THE GROUND, and it cleared the " +
              "ground. Patiently. It stopped for weather.", mood: -0.7 },
      { text: "It went through eleven villages. It went through a school. There's a stone " +
              "at the sixteen-mile marker with sixty-two names on it and I put it there " +
              "myself and I got two of the names wrong, and I have not been able to find " +
              "out which two.", mood: -0.9 },
      { text: "That's what a written law is, in the end. Not a page. That. A thing that " +
              "reads a line and walks in a straight line and stops for weather.", mood: -0.6 },
      { text: "Cedar Vantance would like to give the stone something to read again. He'll " +
              "say it beautifully. He's a genuinely good man and I would put him in the " +
              "fire with the paper.", mood: -0.3 },
    ],
    options: [
      { text: "Then destroy the last fragment.", goto: "ember-burn" },
      { text: "Cedar says the same about you, but kinder.", goto: "ember-snader" },
      { text: "I'm sorry about the two names.", exit: true },
    ],
  },

  "ember-burn": {
    speaker: "ember",
    lines: [
      { text: "We do. The Ash Hand. Took it off a Ruby courier eight years ago and it goes " +
              "on the pyre the day I'm sure of my own house.", mood: -0.2 },
      { text: "And here's the thing that will annoy you: I'll let you read it first. Once. " +
              "Whole. In daylight, with me standing there.", mood: 0.1 },
      { text: "Because I'm not frightened of what's in it. I'm frightened of it existing " +
              "where a Sentinel can hear it. Read it, memorise it, weep over it — a memory " +
              "can't be waved at a colossus.", mood: 0.0 },
      { text: "The price is a week of your life and your back to mine. There's something " +
              "standing up in the ash at the twelve-mile stretch and I am four riders short " +
              "because the Order have been hitting our routes since spring.", mood: -0.4 },
      { text: "Routes four people know. I'd like to stop thinking about that.", mood: -0.6 },
    ],
    options: [
      { text: "I'll ride with you.", accept: "ash-and-oath", goto: "ember-thanks" },
      { text: "Four people. Who?", goto: "ember-snader" },
      { text: "I'll think about it.", exit: true },
    ],
  },

  "ember-thanks": {
    speaker: "ember",
    lines: [
      { text: "Good. Camp's at the nine-mile. Snader will find you before you find the " +
              "camp; he does that, it's his whole personality and it's load-bearing.", mood: 0.3 },
      { text: "Take ashroot. Take more than you think. The chill out here isn't cold.", mood: 0.1 },
      { text: "And if it goes wrong — and it has been going wrong all spring — you get the " +
              "living out and you leave the paper. That's an order and it's the only one " +
              "I'll give you.", mood: -0.2 },
    ],
    options: [{ text: "Nine-mile camp.", exit: true }],
  },

  "ember-snader": {
    speaker: "ember",
    lines: [
      { text: "Quill.", mood: 0.4 },
      { text: "Best outrider in the Vigil. Funniest man in Cinderfell, which I grant is a " +
              "small field. Eleven years we've ridden the Furrow together and he has " +
              "carried me out of it twice.", mood: 0.5 },
      { text: "He talks the entire time. The entire time. Through ambushes. I once heard " +
              "him do nine minutes on the correct way to boil a turnip while a colossus " +
              "was coming down a hill at us.", mood: 0.6 },
      { text: "He's got a sister at Ashcombe. Small holding, three children, no paper on " +
              "it at all — and the Order have been re-surveying the lowland margins since " +
              "spring.", mood: 0.0 },
      { text: "He asked me about that. Twice. I told him the Vigil doesn't do individual " +
              "cases, because it doesn't, because the moment we start saving particular " +
              "farms we're just another set of lords.", mood: -0.3 },
      { text: "It was the right answer. I've been going over it for a month and it is " +
              "still the right answer.", mood: -0.6 },
    ],
    options: [
      { text: "Four people knew those routes.", goto: "ember-burn" },
      { text: "You already know, don't you.", goto: "ember-aftermath" },
      { text: "Say nothing.", exit: true },
    ],
  },

  "ember-aftermath": {
    speaker: "ember",
    lines: [
      { text: "Don't. Don't say it in that voice, like you're breaking it to me.", mood: -0.8 },
      { text: "Six of mine in the ash. Two I'd trained from fifteen. And the route was " +
              "known to me, to Quill, to Hask who's been dead since the thaw, and to a " +
              "girl of nineteen who was riding drag and died in the first thirty seconds " +
              "of it.", mood: -0.9 },
      { text: "I've known for eleven days. I've had eleven days of knowing and riding " +
              "beside him and letting him talk about turnips.", mood: -1.0 },
      { text: "He's at Stagward. He's lit the beacon, which is the signal for 'come up', " +
              "which he knows I know. He hasn't run. He's put the kettle on and he's " +
              "waiting to explain, and the terrible thing — the genuinely terrible thing — " +
              "is that the explanation is going to be good.", mood: -0.9 },
      { text: "I can't go up. I'd like to say something noble about why. It's not noble. " +
              "I would sit down and listen to him and I would let him live and that is " +
              "eleven years talking, not judgement.", mood: -0.8 },
      { text: "So you go. Let him say it. All of it — he's earned the whole speech. And " +
              "then do what I can't.", mood: -0.7 },
    ],
    options: [{ text: "I'll go up to Stagward.", exit: true }],
  },

  "ember-ending": {
    speaker: "ember",
    lines: [
      { text: "Whole. All three hands. Right.", mood: -0.4 },
      { text: "I'm not going to be clever about this. Vantance will be clever about it and " +
              "he'll be better at it than me, so let me be first and let me be plain.", mood: -0.2 },
      { text: "Bring it here and put it in the fire. That's it. That's the offer. No " +
              "throne, no post, no restored order — you burn it and then you go home and " +
              "nothing gets better.", mood: -0.5 },
      { text: "Charles Hale keeps his field because he's standing on it. The crag clans " +
              "keep the crag because they're on it. Mildrid Ashcombe keeps writing kind " +
              "lies and the mill stays with the children in it. And the strong take from " +
              "the weak, constantly, forever, the way they always have — but they do it " +
              "with their hands, in daylight, where you can see them and hit them.", mood: -0.3 },
      { text: "That's my whole world, and I've thought about it for twenty years, and I " +
              "know exactly what it costs. It costs the widow with a good claim and no " +
              "sword. She loses. Under my world she always loses.", mood: -0.7 },
      { text: "I'd still rather that than one stone man reading page one aloud.", mood: -0.4 },
    ],
    options: [
      { text: "Then we burn it.", accept: "the-blank-year", goto: "ember-ending-yes" },
      { text: "Cedar's world protects that widow.", goto: "ember-furrow" },
      { text: "I need to think.", exit: true },
    ],
  },

  "ember-ending-yes": {
    speaker: "ember",
    lines: [
      { text: "The fire in the Furrow hasn't gone out in ninety years. My grandmother lit " +
              "it. It's not a shrine, it's a working pyre; we've burned four archives on " +
              "it and I've thrown my own family's deed in.", mood: -0.1 },
      { text: "Vantance will come. Not a raid — he'll send lancers to be seen, and then " +
              "he'll walk up the Cinder Road himself, on foot, alone, still talking. " +
              "That's not bravery, it's the deepest thing about him. He genuinely believes " +
              "that if he explains it properly one more time, it will work.", mood: -0.5 },
      { text: "He's the best man in Ossmere. Put that in whatever you tell people " +
              "afterwards. He was the best of us and I put him down on a road because he " +
              "would not stop being right in the wrong direction.", mood: -0.8 },
      { text: "And when it's done — the nearest colossus will stand up. There's no roll " +
              "to dream and there'll be no possibility of one. That's the world you're " +
              "choosing. Walking stone and no paper, forever.", mood: -0.6 },
      { text: "Go and get it. I'll keep the fire.", mood: -0.2 },
    ],
    options: [{ text: "Keep the fire.", exit: true }],
  },

  // ──────────────────────────────────────────────────── SNADER QUILL ───────
  "snader-intro": {
    speaker: "snader",
    lines: [
      { text: "There you are! No, don't — I've been telling Vause for two days that " +
              "someone was coming up the road with that exact walk, and she said a word " +
              "I'm not going to repeat to a stranger.", mood: 0.7 },
      { text: "Snader Quill. Outrider, second-worst cook in the Vigil, and the only person " +
              "here who'll tell you where the latrine is without making it a test of " +
              "character.", mood: 0.6 },
      { text: "Come on. Tea's terrible, ash gets in it, but it's hot and we've got a stool " +
              "with three legs and a story about why.", mood: 0.5 },
    ],
    options: [
      { text: "You're not what I expected from the Vigil.", goto: "snader-jokes" },
      { text: "Vause mentioned you have a sister.", goto: "snader-sister" },
      { text: "What needs doing around here?", goto: "snader-lamps" },
      // Only offered once 'ash-and-oath' has reached the 'stagward' stage; the
      // quest also names this topic directly, so the engine may open it cold.
      { text: "You gave them the spring routes.", goto: "snader-confession" },
      { text: "Another time.", exit: true },
    ],
  },

  "snader-jokes": {
    speaker: "snader",
    lines: [
      { text: "What, grim? Grim's Vause. Grim is a full-time post and she's got it, so " +
              "the rest of us have to do something else or the camp caves in.", mood: 0.6 },
      { text: "I talk. It's not bravery and it isn't good cheer, before you get " +
              "sentimental about it. If I stop talking out here I start counting, and " +
              "there's a stone at the sixteen-mile with sixty-two names on it, and I know " +
              "them, and I will absolutely count them.", mood: 0.0 },
      { text: "So: turnips. Ask me about the correct way to boil a turnip. It's nine " +
              "minutes of material and I've refined it under fire.", mood: 0.7 },
    ],
    options: [
      { text: "Nine minutes on turnips, then.", goto: "snader-lamps" },
      { text: "Tell me about your sister instead.", goto: "snader-sister" },
      { text: "Some other time.", exit: true },
    ],
  },

  "snader-sister": {
    speaker: "snader",
    lines: [
      { text: "Ah. She did mention it. Right.", mood: 0.1 },
      { text: "Ilsabet. Ashcombe way, down in the green country. Small holding — nine " +
              "acres, a bad orchard, three children who are all somehow louder than the " +
              "orchard.", mood: 0.5 },
      { text: "No paper on it. None. Never has been; our people came onto it in the bad " +
              "years like everybody's people did. Which was completely fine for two " +
              "hundred years, and then the Order started re-surveying the lowland margins " +
              "in the spring.", mood: -0.2 },
      { text: "They're very courteous about it. That's the thing nobody warns you about. " +
              "They come up the lane, they take their helmets off, they read out what the " +
              "fragment says, and then they give you a season to leave.", mood: -0.5 },
      { text: "I asked Vause. Twice. She said the Vigil doesn't do individual cases.", mood: -0.6 },
      { text: "She's right, obviously. She's right in a way I can follow every step of. " +
              "Anyway — turnips.", mood: 0.2 },
    ],
    options: [
      { text: "What did you do about it?", goto: "snader-lamps" },
      { text: "Nobody's asking you to be all right about that.", goto: "snader-jokes" },
      { text: "Turnips, then.", exit: true },
    ],
  },

  "snader-lamps": {
    speaker: "snader",
    lines: [
      { text: "Lamps. Six of them, along the Cinder Road, and if you say yes I will be so " +
              "pleased that I'll be insufferable about it for a day.", mood: 0.6 },
      { text: "Watchtowers, from the Court's day. If they're lit we can see a colossus " +
              "move at night from nine miles, and nine miles is four hours, and four hours " +
              "is a village.", mood: 0.4 },
      { text: "I need six flasks of signal oil, which I had, and then didn't, twice, and " +
              "we're not going to examine that.", mood: 0.7 },
      { text: "Stagward's the last one. Highest tower in Cinderfell — you can see the " +
              "whole Furrow from up there, all forty miles of it at once. I'll walk you " +
              "up. I'll talk the whole way. It's the best view in this country and it's " +
              "the worst thing you'll ever look at.", mood: 0.3 },
    ],
    options: [
      { text: "Six lamps. I'll do it.", accept: "six-lamps-on-the-cinder-road", goto: "snader-lamps-yes" },
      { text: "Buy your own oil.", exit: true },
    ],
  },

  "snader-lamps-yes": {
    speaker: "snader",
    lines: [
      { text: "Insufferable. I did warn you.", mood: 0.8 },
      { text: "Right — oil from the camp quartermaster, tell her it's for me and then " +
              "watch her face do something complicated.", mood: 0.7 },
      { text: "And at Stagward we have a drink. That's not optional, that's part of the " +
              "job, I've written it into the job.", mood: 0.6 },
      { text: "I'll tell you something true up there. Everyone should tell someone one " +
              "true thing per tower, that's my rule, and I've got six towers of credit " +
              "built up and nobody to spend it on.", mood: 0.2 },
    ],
    options: [{ text: "Six towers of credit.", exit: true }],
  },

  "snader-confession": {
    speaker: "snader",
    lines: [
      { text: "You came up. Good. I hoped it'd be you and not her. I've hoped that for " +
              "about eleven days, which tells you something about me I'd rather it didn't.", mood: -0.6 },
      { text: "Kettle's on. Sit down. No — sit down, I'm not going to do anything, I've " +
              "had four hours up here to do something and I've made tea twice instead.", mood: -0.4 },
      { text: "I gave them the spring routes. All of them. Since the thaw. Six ambushes, " +
              "and the last one killed Hask and Berrow and Little Ede who was nineteen and " +
              "rode drag because I put her there.", mood: -0.9 },
      { text: "I'm not going to say it was for a good reason. It was for a reason, and I'd " +
              "like to say it out loud once to a person who isn't me.", mood: -0.7 },
    ],
    options: [
      { text: "Say it, then.", goto: "snader-confession-plea" },
      { text: "Nineteen years old.", goto: "snader-confession-plea" },
      { text: "(Say nothing.)", goto: "snader-confession-end" },
    ],
  },

  "snader-confession-plea": {
    speaker: "snader",
    lines: [
      { text: "A Ruby surveyor came up the lane at Ashcombe in the spring, took his helmet " +
              "off, and read out what the fragment said about nine acres and a bad orchard. " +
              "And then he gave Ilsabet a season.", mood: -0.5 },
      { text: "So I went up the Reach and I asked. And Vantance — and this is the part " +
              "that I need you to understand, this is the part I go round and round on — " +
              "Vantance said no.", mood: -0.3 },
      { text: "He said no. Straight out. He said the whole point of a corrected law is " +
              "that it cannot be bought, and if he made an exception for me he'd have made " +
              "the Order into exactly the thing it is trying to stop being. He said it " +
              "kindly. He gave me a horse for the ride back.", mood: -0.4 },
      { text: "It was one of his people who found me on the road two days later. Not on " +
              "his orders. I've thought about that a great deal and I genuinely believe " +
              "it wasn't on his orders, and it changes absolutely nothing.", mood: -0.7 },
      { text: "Route for a holding. That was the trade. And I want to tell you I agonised, " +
              "and I did, for nearly a whole day.", mood: -0.8 },
      { text: "Here's the true thing, and it's the one I owe you from the sixth tower. I'd " +
              "do it again. Not because I think I was right — I know exactly what I am, " +
              "I've had a spring and a summer to work it out. I'd do it again because " +
              "Ede's dead either way now, and Ilsabet's children are in a house.", mood: -1.0 },
      { text: "That's not a defence. That's just what's in me. I thought somebody should " +
              "have it.", mood: -0.9 },
    ],
    options: [
      { text: "Vause couldn't come up here herself.", goto: "snader-confession-end" },
      { text: "You could have asked us. Any of us.", goto: "snader-confession-end" },
    ],
  },

  "snader-confession-end": {
    speaker: "snader",
    lines: [
      { text: "I know she couldn't. That's why I lit the beacon — so she'd know it was " +
              "an invitation and could refuse it in private.", mood: -0.7 },
      { text: "Eleven years. She carried me out of the ash at the twenty-mile with my leg " +
              "in two pieces and she talked the whole way, which she has never done before " +
              "or since, because she'd worked out that if I could hear her talking I'd " +
              "know I wasn't dead yet.", mood: -0.5 },
      { text: "Tell her the tea was fine and the view was good. She'll know that means I " +
              "wasn't frightened, and I am, so it's a lie, but it's the last one and it's " +
              "for her.", mood: -0.8 },
      { text: "The Ash Hand's in the saddlebag on the north wall. I never got it down the " +
              "road. Eleven days I've had it and I couldn't make my hand pick it up.", mood: -0.6 },
      { text: "Right. Stand up. I'm not putting it down and I'm not drawing first, and if " +
              "you want to know why, it's because I've decided I'd like to be somebody who " +
              "didn't, and it's the only decision I've got left.", mood: -0.9 },
    ],
    options: [{ text: "(Stand up.)", exit: true }],
  },

  // ─────────────────────────────────────────────────── CEDAR VANTANCE ──────
  "cedar-intro": {
    speaker: "cedar",
    lines: [
      { text: "You came up the approach without being challenged. That was not an " +
              "oversight — it is the entire policy, and it costs me two knights a year in " +
              "arguments.", mood: 0.5 },
      { text: "Cedar Vantance. First Clerk of the Ruby Order, which is a title I invented, " +
              "for an office that does not exist, in a government that fell two centuries " +
              "ago. I am aware of how that sounds. I've decided to be aware of it out loud " +
              "rather than let people be aware of it behind me.", mood: 0.4 },
      { text: "Ask me anything. Anything at all, including the ones you've been rehearsing " +
              "on the way up. Especially those.", mood: 0.6 },
    ],
    options: [
      { text: "What is the Ruby Order for?", goto: "cedar-order" },
      { text: "You want the Survey back. All of it.", goto: "cedar-survey" },
      { text: "I'm gathering the fragments.", goto: "cedar-reading" },
      { text: "You send surveyors onto tusk-kin ground.", goto: "cedar-courtesy" },
      { text: "I have the whole Scroll.", goto: "cedar-ending" },
      { text: "Not yet.", exit: true },
    ],
  },

  "cedar-order": {
    speaker: "cedar",
    lines: [
      { text: "We keep a ruin clean. That's the honest answer and I lead with it because " +
              "the grand version is available everywhere and costs nothing.", mood: 0.3 },
      { text: "My grandfather swept these halls. My father swept them. I have swept them, " +
              "personally, on the first morning of every month, for nineteen years. There " +
              "is a Citadel up there with no roof over the east wing and the floors are " +
              "immaculate.", mood: 0.4 },
      { text: "People find that absurd. But consider what it is we are actually keeping. " +
              "Not the stone. The idea that there could be, one day, an address in this " +
              "valley where a person with a grievance and no sword could go and be heard.", mood: 0.5 },
      { text: "That's all law is, underneath. It's an address for the weak. Everything " +
              "else — the seals, the Sentinels, the four centuries of horror — that's " +
              "implementation, and implementation can be fixed.", mood: 0.2 },
      { text: "Vause thinks that sentence is the most dangerous one in Ossmere. She may " +
              "be right. She has forty miles of evidence and I have a swept floor.", mood: -0.1 },
    ],
    options: [
      { text: "The implementation walked through a school.", goto: "cedar-survey" },
      { text: "I'm gathering the fragments.", goto: "cedar-reading" },
      { text: "A swept floor is something.", exit: true },
    ],
  },

  "cedar-survey": {
    speaker: "cedar",
    lines: [
      { text: "It did. Eleven villages and a school and sixty-two names on a stone that " +
              "Vause cut herself and got two wrong.", mood: -0.6 },
      { text: "I know the number. I know the two she got wrong; my clerks found them four " +
              "years ago and I have never told her, because she would want to recut the " +
              "stone and I do not think she would survive doing it.", mood: -0.7 },
      { text: "So yes. I want the Survey read again. Not the Court's — theirs was rotten " +
              "at the root, and the rot was not the writing, it was that four men could " +
              "amend it in a night and nobody could check.", mood: 0.1 },
      { text: "Belve's is different in exactly one way that matters: she wrote it against " +
              "herself. Every entry in that Scroll that names a Court cousin's holding is " +
              "an entry that convicts the woman writing it. Nobody forges a document that " +
              "damns them.", mood: 0.4 },
      { text: "And I will tell you the thing I am supposed to hide, because you would find " +
              "it anyway and I'd rather you found it from me. There are people currently " +
              "on land that the Scroll does not give them. A farmer at Greenhollow. Six " +
              "children in a mill at Ashcombe. Nine acres and a bad orchard where a " +
              "sister of the Vigil lives.", mood: -0.5 },
      { text: "If I read it, they lose. I have their names on a list in my desk and I read " +
              "it on the first morning of every month before I sweep. It is four hundred " +
              "and six names long.", mood: -0.8 },
    ],
    options: [
      { text: "Then don't read it.", goto: "cedar-reading" },
      { text: "You'd do that to four hundred families for a principle?", goto: "cedar-reading" },
      { text: "I need to sit with that.", exit: true },
    ],
  },

  "cedar-reading": {
    speaker: "cedar",
    lines: [
      { text: "For a principle, no. For the four hundred and seven thousand who are not on " +
              "that list — yes.", mood: 0.2 },
      { text: "Here is what people never do, and it's the whole of my argument, so forgive " +
              "me for being tedious about it. They count the people the law would displace " +
              "and they never count the people who currently have no law at all.", mood: 0.3 },
      { text: "The widow whose brother-in-law simply takes the mill, because he is larger. " +
              "The crag clans, who have been demanding for two hundred years to be written " +
              "down and are told there is no book. Every single person in this valley who " +
              "is holding what they hold because they can hold it — which is fine if you " +
              "are strong, and is a death sentence at walking pace if you are not.", mood: 0.1 },
      { text: "Vause's world is not freedom. It is a world with no address for the weak. " +
              "It just looks like freedom from where the strong are standing.", mood: 0.0 },
      { text: "So: bring me the three hands. Read it here yourself, aloud, in daylight, " +
              "with the Order kneeling and every objection heard first. I'll go on the " +
              "list myself if the Scroll says the Reach isn't ours. I've had my own " +
              "holdings checked against the first hand already. Two of them fail. I've " +
              "written the surrenders and they are in the top drawer, dated.", mood: 0.5 },
    ],
    options: [
      { text: "Show me the drawer.", accept: "the-reading", goto: "cedar-thanks" },
      { text: "I'll bring you the Scroll.", accept: "the-reading", goto: "cedar-thanks" },
      { text: "And the lie Belve put in it on purpose?", goto: "cedar-survey" },
      { text: "I'll decide in my own time.", exit: true },
    ],
  },

  "cedar-thanks": {
    speaker: "cedar",
    lines: [
      { text: "Thank you. And — before you go, one piece of housekeeping I will not let " +
              "you hear from anyone else.", mood: 0.2 },
      { text: "A Vigil outrider came up this road in the spring and asked me to spare his " +
              "sister's holding. I said no. I was correct and I was cold about it and I " +
              "gave him a horse.", mood: -0.4 },
      { text: "One of my captains went after him on the road without my order, and bought " +
              "something from him, and six people in Cinderfell are dead of it. I found " +
              "out in the summer. I dismissed the captain and I sent Vause a letter that " +
              "she has not opened, because I would not open it either.", mood: -0.8 },
      { text: "I could have kept that from you for another week and I'd have got more out " +
              "of you in that week. Take the week back. Go and check it. I'll be sweeping.", mood: -0.3 },
    ],
    options: [{ text: "I'll check it.", exit: true }],
  },

  "cedar-courtesy": {
    speaker: "cedar",
    lines: [
      { text: "I do, and it goes badly about one time in three, and I keep doing it.", mood: 0.1 },
      { text: "A surveyor is going up to Thistlecrag next week to record what the clans " +
              "actually hold — their words, their names, their boundaries, written down " +
              "as they give them. Not a claim against them. An entry for them.", mood: 0.4 },
      { text: "They will not believe that. Two hundred years of being written down as " +
              "unclaimed will do that, and they are correct to be suspicious, and the " +
              "outriders will come down off the stones with spears.", mood: -0.2 },
      { text: "I want you to escort her. And I want you to kill nobody. Not one. Not if " +
              "they throw, not if they close, not if Sergeant Ould is bleeding and asking " +
              "you for an order.", mood: 0.0 },
      { text: "That's the whole task. If we cannot walk onto that crag and take a beating " +
              "and write down what they tell us, then everything I have said to you today " +
              "is a very well-composed lie and you should go and help Vause burn it.", mood: 0.3 },
    ],
    options: [
      { text: "Nobody dies. Understood.", accept: "the-red-courtesy", goto: "cedar-courtesy-yes" },
      { text: "That'll get your surveyor killed.", goto: "cedar-courtesy-yes", accept: "the-red-courtesy" },
      { text: "Find another escort.", exit: true },
    ],
  },

  "cedar-courtesy-yes": {
    speaker: "cedar",
    lines: [
      { text: "It might. She knows. I told her the odds myself and she asked for the " +
              "figure in writing, which I found reassuring about her and troubling about " +
              "us.", mood: 0.0 },
      { text: "Ould will go with you. He's a good sergeant and a bad listener, and he will " +
              "at some point ask you for permission to make it stop. The answer is no.", mood: 0.2 },
      { text: "And Braid will come last. She always comes last — not out of cowardice, out " +
              "of method. She wants to see what the Order does when it thinks the " +
              "important person hasn't arrived yet.", mood: 0.4 },
      { text: "Good. Let her see it.", mood: 0.5 },
    ],
    options: [{ text: "Let her see it.", exit: true }],
  },

  "cedar-ending": {
    speaker: "cedar",
    lines: [
      { text: "All three. Then I'll say my piece and I will not repeat it, and I will not " +
              "follow you down the road saying it again.", mood: 0.1 },
      { text: "Read it in the annexe. Aloud, in daylight, with the Order kneeling and the " +
              "doors open and every objection heard before a single Sentinel is unchained. " +
              "The seal-matrix is yours; I'll put it in your hand and not ask for it back.", mood: 0.3 },
      { text: "It will hurt immediately. Four hundred and six households, and I have read " +
              "their names every month for nineteen years so that I could not do this " +
              "lightly at the end. Charles Hale is the eleventh name.", mood: -0.6 },
      { text: "And there is a lie in it. Nettle has as good as told us there is, and won't " +
              "say which, and she is right not to. So I am asking you to enforce a document " +
              "that contains at least one known falsehood, because the alternative is a " +
              "document that contains none at all and neither does anything else.", mood: -0.3 },
      { text: "That is the actual choice. Not order against freedom. One flawed shared " +
              "record, against no shared record and whatever the strong do next.", mood: 0.2 },
      { text: "Vause will come up the road to stop me. She'll be right to try. Don't let " +
              "anyone tell you afterwards that she was a monster; she was the only person " +
              "in this valley who counted the dead by hand.", mood: -0.7 },
    ],
    options: [
      { text: "Then we read it.", accept: "the-corrected-hand", goto: "cedar-ending-yes" },
      { text: "Ember's right. It burns.", goto: "cedar-ending-yes" },
      { text: "I'm not ready to choose.", exit: true },
    ],
  },

  "cedar-ending-yes": {
    speaker: "cedar",
    lines: [
      { text: "Then the annexe. It's the only reading-floor left with working acoustics — " +
              "the Groves can hear a voice from that room, which is the entire reason the " +
              "Court built it out of crystal and not stone.", mood: 0.2 },
      { text: "Take the seal. Yes — now, before you've decided anything else. If I hold it " +
              "while you choose, then I am a man with a seal offering you a choice, and " +
              "that is not a choice.", mood: 0.4 },
      { text: "The Citadel's Sentinels are chained. You'll unchain them, at the end, when " +
              "there is something for them to dream. Put one down first — I want you to " +
              "know exactly what you are handing a page to.", mood: -0.2 },
      { text: "And when Vause comes: she will not stop. Not for me, not for you, not for " +
              "anything either of us can say. I've written to her four times. I'd write a " +
              "fifth if there were an hour in it.", mood: -0.8 },
      { text: "Page one is the meadow hand. It opens with the weirs. Charles Hale's field " +
              "is eleven lines down.", mood: -0.5 },
    ],
    options: [{ text: "Eleven lines down.", exit: true }],
  },

  // ══════════════════════════════════════════════════ GENERIC NPCs ═════════
  "bram-intro": {
    speaker: "bram-thatcher",
    lines: [
      { text: "Rain by Thursday. I've been wrong about Thursday for forty years but I'm " +
              "consistent, and consistency's most of a reputation.", mood: 0.3 },
      { text: "Hale's got the good soil and the bad nerves. I'd swap him in a heartbeat " +
              "and I'd sleep like a stone.", mood: 0.2 },
    ],
    options: [
      { text: "Your grandmother. Nan Thatcher.", goto: "bram-hale" },
      { text: "Keep well.", exit: true },
    ],
  },

  "bram-hale": {
    speaker: "bram-thatcher",
    lines: [
      { text: "Don't. Braid's sent people down four times with a bag of crowns and a bit " +
              "of notched bone, and I've said no four times, and I'll say it to you.", mood: -0.5 },
      { text: "They came off that crag in the long frost and took the barley and the cow " +
              "and Nan gave two of her children to that winter. Two.", mood: -0.7 },
      { text: "And now the granddaughter wants to hand me forty crowns and have it be " +
              "settled. Settled. Like it's a fence that wants mending.", mood: -0.8 },
      { text: "...It's not the money. I know what it is. If I take it, it's a thing that " +
              "happened with a price on it, and then it's over, and I've had it my whole " +
              "life and I don't know what I am on the other side of over.", mood: -0.4 },
    ],
    options: [{ text: "Then keep it a while longer.", exit: true }],
  },

  "ren-intro": {
    speaker: "goodwife-ren",
    lines: [
      { text: "Draughts, tonics, salve. No love philtres, no poisons, and no, not even " +
              "for that, and I know exactly who told you I would.", mood: 0.4 },
      { text: "Ashroot's the one you want if you're going near the marsh or the Furrow. " +
              "The chill out there isn't cold, whatever the young ones tell you. Cold you " +
              "can drink your way out of.", mood: 0.1 },
    ],
    options: [{ text: "I'll take what you've got.", exit: true }],
  },

  "esk-intro": {
    speaker: "pedlar-esk",
    lines: [
      { text: "Everything on this cloth is honest. The cloth is stolen. I find people " +
              "prefer knowing which is which.", mood: 0.6 },
      { text: "Bread, brandy, a sword that's more of a suggestion, and a jerkin off a man " +
              "who no longer needs it and never did, honestly, look at the fit.", mood: 0.5 },
    ],
    options: [{ text: "Let's see the cloth, then.", exit: true }],
  },

  "ould-intro": {
    speaker: "sergeant-ould",
    lines: [
      { text: "Approach is open. It's always open. Vantance's order, and before you ask, " +
              "yes, I have raised it, and yes, in writing.", mood: 0.2 },
      { text: "Twelve years I've stood this gate and not once challenged a soul on it. " +
              "You'd think that'd get easier.", mood: 0.0 },
    ],
    options: [
      { text: "Those Sentinels are chained.", goto: "ould-chains" },
      { text: "Carry on, Sergeant.", exit: true },
    ],
  },

  "ould-chains": {
    speaker: "sergeant-ould",
    lines: [
      { text: "Four of them. Iron round the ankles, and I check the links Monday and " +
              "Thursday and I have never once found a link out of true.", mood: 0.1 },
      { text: "Which means either they've never pulled, or they pulled once and it held, " +
              "and I'd genuinely rather not know which.", mood: -0.4 },
      { text: "First Clerk says the chains are the polite part. I've thought about that " +
              "sentence every Monday and Thursday for twelve years.", mood: -0.2 },
    ],
    options: [{ text: "Mind the links.", exit: true }],
  },

  "lancer-bark": {
    speaker: "ruby-lancer",
    lines: [
      { text: "Off the road. This is an Order operation and I'd rather not have to say it " +
              "in a different tone.", mood: -0.5 },
      { text: "We take our helmets off before we read. That's the standing order. Doesn't " +
              "help much, in my experience, but it's the order.", mood: -0.2 },
    ],
    options: [{ text: "(Move on.)", exit: true }],
  },

  "vigil-scout-bark": {
    speaker: "vigil-scout",
    lines: [
      { text: "Sentinel count in this stretch is two. Was one, last month. I've reported " +
              "it twice.", mood: -0.4 },
      { text: "You can tell a fresh archive fire from a house fire — the smoke goes up " +
              "straighter. Vellum burns tidier than thatch. That's a horrible thing to " +
              "know and I know it.", mood: -0.3 },
    ],
    options: [{ text: "Keep your eyes up.", exit: true }],
  },

  "vigil-ranger-bark": {
    speaker: "vigil-ranger",
    lines: [
      { text: "Quill's got us lighting towers again. Third time this season. He's right, " +
              "mind — nine miles is four hours and four hours is a village.", mood: 0.3 },
      { text: "We burn paper, not people. Mostly. Ask the captain about 'mostly' and then " +
              "stand well back.", mood: -0.2 },
    ],
    options: [{ text: "Ride safe.", exit: true }],
  },

  "raider-bark": {
    speaker: "outpost-raider",
    lines: [
      { text: "Nothing written, nothing owed!", mood: -0.7 },
      { text: "Drop the bag and I'll forget your face, which is the best gift anybody's " +
              "giving you today.", mood: -0.8 },
    ],
    options: [{ text: "(Draw.)", exit: true }],
  },

  "cutthroat-bark": {
    speaker: "bracken-cutthroat",
    lines: [
      { text: "We're Braid's cousins, that's all. Cousins who stopped counting.", mood: -0.5 },
      { text: "I had a tally once. Carried it eight years. Weighed more than I did and " +
              "bought me exactly nothing.", mood: -0.6 },
    ],
    options: [{ text: "(Draw.)", exit: true }],
  },

  "adept-bark": {
    speaker: "desk-adept",
    lines: [
      { text: "The fee schedule is on the door. Read it outside.", mood: -0.4 },
      { text: "You have not been commissioned against. Enjoy the feeling — most people " +
              "never notice they're having it.", mood: -0.2 },
    ],
    options: [{ text: "(Say nothing.)", exit: true }],
  },

  "grove-warden-bark": {
    speaker: "grove-warden",
    lines: [
      { text: "Oil, tune, listen, walk. Four times a day, every day, for two hundred " +
              "years. My mother did it. Her mother did it.", mood: 0.4 },
      { text: "If you ever hear it stop ticking — run west, and don't look back at what's " +
              "standing up.", mood: -0.5 },
    ],
    options: [{ text: "Keep it turning.", exit: true }],
  },

  "outrider-bark": {
    speaker: "tusk-outrider",
    lines: [
      { text: "Braid says lowlanders pass. Braid says a lot of things and I keep to all " +
              "of them, which is more than she manages.", mood: -0.2 },
      { text: "Those handprints up there are my great-grandmother's line, four hundred of " +
              "them going back before anyone could write. Yours is a line in a book in a " +
              "town. Which of us is real?", mood: -0.1 },
    ],
    options: [{ text: "Both. That's the trouble.", exit: true }],
  },
};
