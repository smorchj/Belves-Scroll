# Asset reference

What every prop in `src/data/catalog.js` **actually is**, established by looking at a
render of it. Renders are in `docs/asset-shots/<name>.png`.

## Why this file exists

Most props came out of Meshy, and a Meshy filename is a **truncated generation
prompt**, not a description of the mesh. Names are cut off mid-word, describe what
was asked for rather than what came back, and in several cases describe the wrong
object entirely. Three bugs came from trusting them:

- **The cabinet that was a house.** `Meshy_AI_Rustic_Farmhouse_Cabi...` was read as
  "Farmhouse Cabin", catalogued as a 7m dwelling and put in the Main Street
  rotation. It is a kitchen **cabinet** — the name was truncated at `Cabi`. Its
  dimensions said so the whole time: 1.51 x 1.92 x **0.42** — a 40cm-deep,
  flat-backed object. Two build agents wrote comments apologising for the "1.5m-deep
  facade" and coded around it instead of asking why a house was 40cm deep. See
  `docs/asset-shots/cabinet.png`; there is no reading of that image in which it is a
  building.
- **The wrong building got scaled twice.** The user pointed at an ornate dark
  building and said it was too small. It was guessed to be `treehouse` and scaled up
  twice. It was `potion-house`. The treehouse was 1.3km away and is still carrying
  both erroneous size bumps.
- **Assets catalogued as houses on no evidence.** Several entries named things like
  `A_3D_image_of_a_highl` were filed under `building, house` purely because someone
  needed a house.

Rules at the end of this file. The short version: **the filename is not evidence.**

Sizes below are the model's rendered bounding box in metres at catalog scale, judged
against a 1.7m reference figure in the same shot.

---

## Structures

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `castle-keep` | A walled castle **compound** — curtain walls, arched gatehouse, six conical corner towers, central great hall with spire. Full 360°, on a thin flat slab. | 15.0 W x 8.5 H | 15 ⚠ too small | Major fortress landmark on a flat pad, after roughly a 2x scale-up | Anything a player walks through at current size — the gate arch is 1.4-1.9m, a person ducks |
| `citadel-crimson` | Tiered dark-stone **temple/shrine tower**, infernal styling: red-glowing gothic windows, red crystal spires, flanking obelisks, stepped stair to the entrance. | 23m tall, 2.5m portal | 23 ✓ | Boss lair / cult shrine landmark with a deliberate approach axis up the stair | Interiors — it is a solid exterior shell. It is not a "citadel" complex, it is one tower |
| `citadel-crystal` | **Not a building.** A giant red crystal formation on a dark rocky outcrop, on a circular rock/lava plinth. No doors, windows, walls or floors. | 18m | 18 ✓ (category wrong) | Crystal landmark, mining/harvest node, hazard dressing — sunk into terrain to bury the plinth | Any dwelling or town-building rotation. It will put a mineral deposit where a house belongs |
| `guild-hall` | Two-storey guild hall / tavern: stone ground floor with arched doorways, jettied timber upper storey, purple slate roof, blue heraldic banners. | 2 storeys + roof; door reads 3.8m | 20 ⚠ ~2x too big | Hero town building — guild, tavern, town hall — facing a street or square | Placing at 20m. Two storeys is 10-12m; set `metres: 11` |
| `tower-round` | A **square**-plan brick watchtower: crenellated parapet, grey conical spire, red pennant, dormers, chimneys, plus small attached outbuildings, on a square cobble-and-grass plinth. | 8.8 x 8.8 x 17 H | 17 ✓ | Watchtower or minor wizard's tower on a flat pad | A generic bare tower or repeated wall towers — the annexes and plinth come along, and it is not round |
| `tower-slim` | A **church bell tower / campanile**. Pale sandstone, crenellated parapet with gargoyles, open belfry with a visible bell, gabled cap with a **cross finial**, cruciform arrow-slits. | 6.1 x 3.9 x 18 H | 18 ✓ | Village church tower or religious landmark, ideally abutted to a chapel body | A wizard's or watch tower — it is explicitly ecclesiastical. Check the rear face is closed before letting players walk behind it |
| `ruins-timber` | A low mound of splintered dark timber and mossy rubble. A debris heap. Chunky, mushy low-poly, muddy green texture. | 4.5 x 2.2, waist-to-chest high | 4.5 ✓ (tag wrong) | Scattered ground clutter — roadside debris, forest floor, the edge of a ruin | Communicating "ruins". There is no wall stub, post base or foundation outline anywhere on it. Weakest mesh in the set — keep it at distance |
| `archway-stone` | An **intact, pristine** Romanesque ceremonial gateway: cut voussoirs, clustered columns with moulded capitals, on an integrated flagstone plinth. | 4.2 W x 3.9 H, ~2.5m opening | 4.2 ✓ (tag wrong) | A formal garden, cloister or estate gate, placed deliberately with a path through it | A ruin field. It has crisp arrises, clean joints, no moss, not one missing stone. It is also half the size of `archway`, so they are not interchangeable |
| `pillar-crumbling` | A broken, moss-packed stone column stump: squat mortared shaft, flared base, capital slab sheared off flat. Genuinely weathered. | 1.8 dia x 3.4 H | 3.4 ✓ | Ruin-field dressing in clusters; or as a pedestal — the flat mossy top wants a statue or brazier on it | A slender column. At under 2:1 aspect it reads as a stump, and looks odd standing alone in the open |
| `wishing-well` | Exactly what it says: mortared stone shaft on a stepped footing, blue slate roof on two posts, windlass and rope, bucket on the rim, ivy on one post. | 2.2m tall | 2.2 ✓ | Village square or farmyard centrepiece. Free to scatter and randomly yaw — no base disc, near-radially symmetric | Leaving uncapped if players can reach it — the shaft is genuinely hollow and open |

## Houses and dwellings

Only four of these are safe in a general dwelling rotation: `farmstead`, `house-t1`,
`house-t2`, `house-t3`. Read the "do NOT" column before adding any other.

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `house-t1` | Stylized European fantasy cottage: teal shingled gable roof, timber framing over cream plaster, stone base course, arched plank door, glowing leaded windows. | 5.9 x 5.4 x 8 H | 8 ✓ | The cleanest dwelling in the set. Street ribbons, paired with `house-t2`. Seats on terrain cleanly — no base disc | Random yaw — it has an obvious door face and needs street alignment |
| `house-t2` | Same art family as t1: teal roof with a dormer, timber frame, stone steps to an arched door, side lean-to porch, hanging lantern, barrel. On an integrated oval grass disc. | 6.0 x 7.5 x 8 H | 8 ✓ | Dwelling, matched pair with `house-t1` | Repeating often — the fixed lantern/barrel/porch clutter make each instance recognisably the same building. Sink the base disc |
| `house-t3` | Realistic rustic **stone croft**: drystone walls, heavy thatch with a thatched eyebrow dormer, tall mortared chimney, plank door. | 7.5 L x 4.7 H x 5.2 D | 7.5 ✓ (**width**-driven) | Best fit for a Norwegian coastal setting. Single-storey and long, sits well in a row, reads vernacular not fairytale | Mixing with the painterly t1/t2 in the same row — it is photoreal and will clash |
| `farmstead` | **One** two-storey rustic farmhouse: white plaster with exposed timber, stone-slate roof, lean-to porch on posts, and a small white sheep on the porch roof. On a baked grass patch. | 10 W x 7.2 H | 10 ✓ | Rural dwelling. The one asset in the batch placeable unmodified | Dressing a farm by itself — no barn, fences or fields despite the name. Sink the ragged grass base on slopes |
| `house-trad` | An **East-Asian (Japanese) thatched merchant house**: flared straw roof with exposed ridge poles, shoji screens, open shopfront with produce, gourds, sacks and a stool. Integrated oval earth pad. | 8m to ridge | 8 ✓ (style wrong) | A distinct district where East-Asian architecture is intended | The Norse Main Street ribbon. It is a Japanese minka standing between two European cottages and a stone croft; it reads as an error. Fixed open front, cannot be randomly yawed |
| `house-highl` | A witch's hut **landmark diorama**. Crooked dark spire roof with a smoke wisp, glowing orange windows, wraparound veranda — welded to its own circular terrain mound with grass, a boulder rim, dead trees, a picket fence, **gravestones** and steps. | 8m total, only ~5m is building | 8 ✓ (category wrong) | A one-off spooky landmark alone on flat ground, same class as `potion-house` | The dwelling rotation. It brings its own hill — line these up on a street and each instance plants an 8m graveyard mound intersecting its neighbours and the road |
| `potion-house` | A **single-storey** alchemist's cottage: stone and timber walls, purple shingled roof, arched door with a stone step, round gable window, and a giant purple potion bottle through the roof as a shop sign (its cork is the chimney). | Door reads 4.1m; body alone ~14m | 19 ⚠ ~2x too big | Alchemist shop, facing a street, at `metres: 10` | Leaving at 19. It is a one-room cottage as tall as a four-storey block. **This is the "ornate dark building" from the mix-up** — purple roof, giant purple bottle, unmistakable |
| `treehouse` | Fairy/elven tree-dwelling: living trunk with sprawling roots as the ground storey, upper room with green diamond-paned windows and a balcony, tall leafy conical roof, lanterns, mushrooms, glowing arched door up a stone stair. Baked oval grass base. | Door reads 3.6m; upper room would be 8m floor-to-ceiling | 26 ⚠ ~1.7x too big | Elven/fae dwelling or forest landmark, among tall trees, at `metres: 15` | Leaving at 26. **This number is residue from the known mix-up** — it was scaled up twice chasing a complaint about `potion-house`. Revert it deliberately, do not nudge it |

## Landscape and terrain dressing

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `archway` | A **natural rock arch** — two mossy weathered piers under a heavy horizontal rock mass, grass tufts, hanging vines. No dressed stone, no courses, no keystone. | 7.6 W x 3.65 D; opening ~3.5 x 5m | 7.6 ✓ (tag wrong) | Walkable gateway landmark on a trail or ridge. Real geometry on the back, no front, rotates freely | Ruined-settlement rotations. It is geology, not architecture — currently tagged `ruin` |
| `pillar-stone` | A free-standing columnar **rock spire** — ochre sandstone hoodoo with vertical fracture lines and a broken top. Natural, not carved. | 5.7m, ~3.3x the figure | 5.7 ✓ (tag wrong) | Badlands / canyon terrain dressing, small navigation waypoint. Sits flat, no plinth, no front | A standing stone or menhir — no carving, no shaping, no upright regularity. Also currently tagged `ruin` |
| `rock-drawings` | A pale tan boulder carved with petroglyphs: a running antlered stag, a spear-carrying hunter, a spiral, tally marks, a row of animal glyphs. | 2.8 W x 1.68 H | 2.8 ✓ | Lore prop / discovery point / quest marker, read at close range | Random rotation. **The carvings are on one face only**; the other side is blank rock and the asset's entire point is lost |
| `sentinel-statue` | **Not a statue.** A dark grey-blue rocky crag — angular slate boulders and shards piled around two upright rock fins, with a small flight of stone steps at the base. No figure, no face, no plinth. | 5.7m | 5.7 ✓ (category wrong) | A crag landmark, or the setting for a shrine — the steps imply an approach, so face them at the player | Anywhere a carved guardian is wanted — gate watcher, boss marker, shrine idol. Rename it; `crag-dark` or `rock-outcrop-steps` |
| `treasure` | **Not a container.** A mossy stone **cave mouth / grotto arch** on an integrated oval grass-and-dirt slab, with gold coins scattered in the ground texture under the arch. The dark opening is a shallow recess, not a passage. | 1.1m — arch opening is knee-high | 1.1 ⚠ too small | A cave-mouth or loot-shrine set piece at ~3m, sunk into a bank so the slab is buried | The loot/container rotation, where it currently sits beside four real chests. The baked-in coins are why it got the name |
| `stump-mossy` | A large cut tree stump: flared buttress roots, heavy moss, flat pale sawn top with growth rings. | 1.9 W x 1.6 H, chest-height | 1.9 ⚠ large | Forest floor and logging-area filler, at ~1.1m | Ordinary forest at current size — 1.9m across implies a two-metre-thick trunk, giant-sequoia proportions |
| `stump-mossy-b` | **The same mesh as `stump-mossy`**, rendered about 5% smaller. Identical silhouette, root flare, moss placement, sawn top and growth rings. Not a variant. | 1.8 W x 1.5 H | 1.8 ⚠ duplicate | Nothing distinct | Treating these as two options in a scatter set. A random pick between them produces visible repetition. Delete one and vary scale procedurally |
| `logs` | Two cut trunk sections standing **upright** side by side — sawn faces top and bottom, pale heartwood on the top cuts, cracked bark on the sides. | 2.2m tall, **taller than the figure** | 2.2 ✓ (orientation wrong) | Felled logs — **rotate 90°** and they become a woodpile, trail obstacle or sawmill dressing | Scattering as-authored. You get two 2.2m totem poles standing over the player. Also a fused pair, so it cannot be placed or scattered as one log |
| `plant-succulent` | A low clump of succulents — rosettes in sage green, cream, dusty pink and yellow-orange, packed tight and flat to the ground. | 0.5 W x 0.27 H | 0.5 ✓ | Close-range ground detail near paths and camps, arid or coastal. Sits flat, no plinth, rotates freely. Works indoors in a pot | Broad terrain cover — invisible at distance, and the identical rosette pattern tiles visibly when dense |

## Trees

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `tree-fir` | A single spruce/fir — tiered whorls of dark desaturated foliage tapering to a spire, branch skirt reaching almost to the ground. Realistic/photoscan style. Foliage is flat cards. | 3.64 x 9.0 H x 3.49 | 9 ✓ (height-driven) | Standalone conifer or forest-edge filler on cold upland terrain. No plinth, no front, rotates freely | Walk-under canopy or dense interior forest — the skirt goes to ground and the cards read as intersecting planes from inside or below |
| `tree-old` | Stylised **cartoon** broadleaf: thick buttressed trunk splitting into four blobby canopy masses in bright saturated green. Hand-painted/toon. Mounted on an **integral circular base disc** ~3m across and 25-30cm thick. | 5.22 x 7.5 H x 5.35 | 7.5 ✓ | Flat ground only — village green, courtyard, plaza, a dressed clearing | Scattered forest placement. The disc floats on one side and sinks on the other on any slope, z-fights on the flat, and makes `box.min.y` the disc bottom so seat-on-terrain logic sits the tree 25cm high. Also do not stand it next to `tree-fir`/`tree-cluster` — toon vs photoscan |
| `tree-verdant` | Young deciduous tree: slender straight trunk, first branching ~3m up, sparse open crown of large flat leaf cards with daylight through it. Mid-realism. Minor leaf litter at the base. | 3.87 x 7.0 H x 4.02 | 7 ✓ | Lone roadside or field tree, garden, hedgerow, riverbank. **The one tree here you can genuinely walk under** | Forest fill or shade — the canopy is thin and reads scrappy at distance. Use it singly |
| `tree-cluster` | **Four** separate columnar cypress-like conifers grouped tightly on a **shared baked ground patch** with boulders and grass. Photoscan style, matches `tree-fir`. | 4.72 x 9.5 H x 4.95 (9.5 = tallest member) | 9.5 ✓ | A copse, hilltop stand, windbreak or ridge marker used as one unit — cheap density from one draw call | Random-density scatter. Four trees in an identical relative arrangement across a hillside reads instantly as copy-paste. Placement logic treating it as one 9.5m tree under-reserves its ~5m footprint. Flat or gentle ground only |
| `tree-hollow` | A single large gnarled **dead** tree: twisting trunk, heavy exposed roots, bare branches, hanging moss, and a real dark hollow opening at the trunk base. | Tree 14m; base disc ~11m across | 14 ✓ | Landmark tree / named location. The hollow is a genuine opening — den, stash, small entrance (check the interior is modelled and not backfaces) | Dropping on grass as-is. It stands on a circular pebble-textured **display plinth** with a hard edge that will not blend into any ground. The disc also drives an 11.8 x 11.0m footprint, so collision radius is far larger than the trunk needs |
| `clockwork-grove` | A row of **five small separate trees**, each on its own visible rectangular plinth, dense broccoli-like canopies, brass gears tucked into the second tree's foliage and small hanging pendulums. Each tree is **1.41m — shorter than the figure**. | 4m wide row; trees 1.41m each | 4 ⚠ measures the row's **width** | A miniature, diorama or garden feature at current size; a real grove at ~16m wide (4x) | Anything tagged `landmark` — a landmark you look down on is not a landmark. The plinths read as museum display stands and must be sunk or removed. Fused cluster of five, cannot be scattered or randomised |

## Interior furniture and dressing

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `cabinet` | A painted farmhouse **dresser/hutch**: distressed turquoise and yellow paint, glazed upper cabinet with three mullioned doors, a shelf band, three drawers, three lower doors, a rooster painted on every panel, iron hinges. | 1.58 W x 2.01 H x **0.44 D** | 2 ✓ | Kitchen or tavern dressing, flat against a wall | Anything freestanding. **This is the `house-cabin` asset that was once a 7m house** — 44cm deep with a flat back is furniture geometry. The orphan `public/assets/props/house-cabin.glb` no catalog key points at is the same object and should be deleted so nobody re-adds it |
| `inn-bar` | An L-shaped tavern bar counter in warm timber — plank top, log-clad front, raised service hatch at the corner, with **four round stools fused into the same mesh**. | 3.04 W x **0.63 H** x 1.84 D | 3 ⚠ too small | Tavern main room against a back wall, after rescaling to `metres: 5.3` (brings the counter to 1.1m) | Using at 3m — the counter is at **knee height** on the figure. Internal proportions are fine, the whole thing is just at 57% of life. The stools cannot be moved, removed or re-spaced, and four seats is all you get |
| `inn-table` | A rustic four-legged dining table, thick plank top, chunky chamfered legs, plus **one** round log stool fused to the right-hand side. | 1.80 W x 0.70 H x 1.20 D; tabletop itself ~1.1m sq | 1.8 ✓ | Tavern and cottage interiors, with separate loose stools added around it | Reading `metres: 1.8` as the tabletop length — that is the cluster footprint including the stool. The fused stool also fixes an arbitrary front |
| `bed` | A bare dark-stained **bed frame** — four short corner posts, side rails, eight exposed slats. No mattress, no bedding, no pillow, no headboard. | 2.00 W x 0.41 H x 1.50 D | 2 ✓ | Bedchambers, inn rooms, barracks — once a mattress/bedding prop exists to lay on it | Placing bare unless "stripped/abandoned" is the intent. It is also end-to-end symmetric, so nothing marks the head |
| `bathtub` | A coopered wooden bathtub — vertical staves with iron/rope banding, oval open top, four carved claw feet. Interior hollow and fully modelled. | 1.70 W x 0.63 H x 1.00 D | 1.7 ✓ | Bath house, inn back room, wealthier dwelling, or a yard. A character can be placed in it and a water plane dropped inside. Rotates freely | — no defects |
| `stump-chair` | An armchair carved from a hollowed stump — rough bark outside, scooped seat, low wrap-around back and arms cut from the solid. | 0.72 W x 0.69 H x **0.90 D** | 0.9 ✓ (**depth**-driven) | Cottage and hut interiors, and equally outdoors by a fire pit or on a trail — it should carry the `exterior` tag it lacks | — solid, all sides modelled, no facade |
| `stone-throne` | A throne of rough-hewn pale stone blocks — tall split slab back engraved with a sun disc, crescent moon with rays, spiral and chevron band; glyph-carved armrests; boulder plinth. | 1.38 W x 1.70 H x 1.08 D, seat ~0.75m | 1.7 ✓ | A jarl's hall, a barrow, a ruin, or an outdoor stone circle / shrine — it works as a landmark as much as furniture | Worrying about the crack in the backrest — it is deliberate weathering. Strong front, must be aimed |
| `candelabra` | A polished **brass** three-branch candelabrum: baroque scrollwork on stem and arms, domed circular foot, three white candles. | 0.34 W x 0.50 H x **0.13 D** | 0.5 ✓ | A table, mantel or altar. Good anchor for a warm point light | The floor — it is tabletop scale. It is also essentially planar (13cm deep, all three arms in one plane) so it wants front-on viewing. Baroque polished brass is wrong for a fisherman's cottage or a rustic tavern |
| `vase` | A Greek black-figure **amphora** — terracotta body with black figural scenes (a warrior and a draped figure), a shoulder band, two arched handles, narrow neck, flared ring foot. | 0.46 W x 0.70 H x 0.45 D | 0.7 ✓ (category wrong) | A collector's study, a temple, a trader's cargo — anywhere a Mediterranean import is intended | Generic interior clutter, which its `vase` + `clutter` tagging invites. Attic Greek pottery is an anachronism in a Norse cottage. It is also a container, not decor |
| `decor-carving` | **Not a carving.** A low round **bronze table** — an 80cm engraved disc top with concentric chased ornament on three cast cabriole legs with hoof feet. Moorish/oriental tray table. | 0.80 W x 0.36 H x 0.75 D | 0.8 ✓ (category wrong) | A floor-standing low table in a wealthy, exotic or scholarly interior — put goblets or a candelabrum on it | Wall placement. **This is the `house-cabin` failure repeating**: trust the name and you mount a coffee table on a wall. Rename to `table-low-brass`, retag as furniture |
| `goblet-gold` | A stemmed drinking goblet — dark lacquered bowl, bright gold rim and stem, flared domed foot. Clean and undecorated. | 0.11 x 0.20 H x 0.11 | 0.2 ✓ | Feast tables, altars, treasure piles. Hollow bowl, radially symmetric, no front | Expecting it to read as gold — only the rim and stem are gold, the bowl is near-black and needs warm light to pop |
| `chalice-vine` | A heavier tarnished **bronze ritual chalice** — green-black patina, sculpted leaf/vine relief around the bowl, deliberately ragged rim, bulbous knop, wide foot. | 0.13 x 0.24 H x 0.14 | 0.24 ✓ | Shrines, ritual sites, a witch's or alchemist's room, grave goods. Reads as an artefact | Pairing with `goblet-gold` in one room as two distinct props — at normal viewing distance they are both just dark stemmed cups. The ragged rim can also read as damage at distance |

## Containers

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `barrel` | An upright wooden barrel: staved body, four iron hoops, solid planked top. Sealed. | 0.77 x 0.89 H x 0.75 | 0.9 ✓ | Tavern cellars, docks, markets. Radially symmetric, so yaw jitter is free variety. Tagged `interior` only — it works outdoors just as well | An open or lootable barrel. Single welded mesh, sealed top |
| `chest-plain` | A domed-lid wooden chest in pale peach wood, iron banding, studded corner caps, feet, brass hasp on the front. Closed. | 1.00 x 0.78 H x 0.70, 1062 verts | 1 ✓ | The standard loot chest. Yaw-align to the hasp | Animating open — the lid is welded to the body |
| `chest-iron` | The **same silhouette as `chest-plain`** — identical dome, banding, corner caps, hasp — retextured vivid **purple and gold**. Nothing on it is iron-coloured. | 1.0m, 1107 verts | 1 ✓ (name wrong) | A royal / high-tier chest deliberately contrasted against `chest-plain` | Picking it by name for a grim or utilitarian chest — you get a treasure-vault chest. Do not place both in one room: it is a retexture, not a second design |
| `chest-vine` | A dark walnut chest, domed lid, broad steel bands, studded corner caps, keyhole escutcheon, thick bright-green vines over the body and sides. Closed. A genuinely distinct model. | 1.10 x 0.90 H x 0.85, 4294 verts | 1.1 ✓ | Abandoned or forest loot chest. Yaw-align to the keyhole plate | Animating open — single closed mesh |
| `chest-overgrown` | A vine-covered chest modelled **permanently open** — lid hinged fully back, hollow interior visible and completely empty. | 1.10m, 10395 verts, one node | 1.1 ✓ | An already-looted chest: dungeon aftermath, ruins dressing. Yaw-align so the player sees into it | The "chest you open". The open lid is baked into the same mesh and can never be closed or animated. It is the chest that is already open |
| `treasure` | **Not a container** — a cave-mouth rock arch on a terrain slab. See the landscape table above. | 1.1m | 1.1 ⚠ | — | Do not place this in a loot rotation |

## Weapons and trinkets

All four swords are modelled **point-up**. `dagger-flamewing` is point-**down** — see
the awkward-assets section.

| asset | what it actually is | real size | catalog metres | use it for | do NOT use it for |
|---|---|---|---|---|---|
| `sword-iron` | An **ornate gilded** knightly arming sword: broad silver blade with a gold fuller, elaborate scrolled gold crossguard, gold pommel, leather grip. | 0.25 x 1.09 H x 0.08 | 1.1 ✓ | A hero or knightly sidearm; displays well on a wall or rack | A common guard or bandit. "iron" promises a plain blade and this is heavily gilded |
| `sword-slim` | A slender straight sword: narrow near-black blade, simple oval disc guard, red cord-wrapped grip, plain pommel. Understated. | 0.16 x 0.99 H x **0.04** | 1 ✓ | The common / NPC sword — this is the plain blade `sword-iron`'s name promises | Rack or ground placement without checking the angle — at 4cm thick it nearly vanishes edge-on |
| `sword-enchanted` | A magic sword: faceted violet crystalline blade with a gold inlay strip down the fuller, ornate gold crossguard with a central gem boss, twisted gold-and-purple grip, spiked pommel. | 0.25 x 1.05 H x 0.09 | 1.05 ✓ | Quest reward or boss weapon. The crystal blade would take an emissive material well | A mundane armoury next to `sword-slim` — it is faceted crystal, not metal |
| `sword-shadow` | A **bright pink-and-white** bladed fantasy sword: white blade edges with a hot magenta core stripe and pale filigree, flared purple claw/flame guard, dark grip. The most vivid asset in the set. | 0.25 x 1.05 H | 1.05 ✓ (name wrong) | A radiant, floral or arcane weapon. Rename to `sword-radiant` or `sword-blossom` | Picking a villain's or assassin's weapon by name — you will equip a hot-pink blade |
| `axe-viking` | A **double-bitted** (twin-crescent) battle axe, haft-down: two symmetrical steel blades with etched knotwork, reddish-brown haft, leather grip near the base. | 0.54 W x 0.90 H x 0.11 | 0.9 ✓ | A one- to hand-and-a-half battle axe, or dressing embedded in a stump or block | A historically-styled Norse scene. Real viking axes are single-bitted; this twin-crescent head is a heraldic fantasy form despite the name |
| `dagger-flamewing` | An ornate near-black dagger: gold twisted-wire grip, small crossguard, a flared winged/flame ricasso with an open circular void through it, dark tapering blade. | 0.53 overall, ~0.3m blade | 0.53 ✓ (0.40 would fit the name better) | An ornate ritual or assassin's dagger | Equipping through the same code path as the swords without a 180° correction — **it is modelled point-DOWN and they are all point-up**. Very dark and low-contrast, so it is a silhouette at distance |
| `ring-amber` | A gold band ring with an openwork filigree shank and a single **crimson** cabochon — ruby or garnet, not amber. Stands upright on edge, stone uppermost. | **0.07m** — three times a real ring | 0.07 ⚠ way too big | An inventory icon or a close-up quest trinket. Correct `metres` to ~0.025 and rename to `ring-ruby` | In-world placement at catalog scale — 7cm is a napkin ring. At true scale it is sub-pixel anyway. It also stands on edge, so dropped on the ground it balances implausibly upright |
| `mask-owl` | A verdigris bronze owl **masquerade half-mask**: covers the eyes and upper face, two large open eye holes, prominent gold beak, two pointed ear tufts, rust speckling over the patina, gold wear on the raised edges. Thin hollow shell. | 0.25 W x 0.27 H x 0.13 D | 0.27 ✓ (0.22 tighter) | Wearing, or wall/shrine mounting so the hollow back is hidden | Laying face-up on a table or floor — it is an open shell with no back and shows a void from behind. Strong front |

---

## MISCATALOGUED — needs correction

Every asset whose verdict was not "correct", with the fix.

### Wrong size

| asset | catalog | should be | why |
|---|---|---|---|
| `castle-keep` | 15 | **35** | The only under-scaled asset here. The gatehouse arch measures 1.4-1.9m — a player ducks through the castle gate. An entire compound of six towers, a gatehouse and a great hall is squeezed into the footprint of a large house. A real one is 60m+; 35 is the minimum that makes the gate and walls read. Note `metres` is footprint-driven here (15.0 W vs 8.5 H), unlike everything else, so raising it widens more than it heightens. |
| `guild-hall` | 20 | **11** | Door measures 3.8m, nearly double a real door. It is unambiguously two storeys plus roof = 10-12m. `metres` was evidently set by how *important* the building is rather than by counting storeys. |
| `potion-house` | 19 | **10** | Door measures 4.1m. A one-room cottage, and even excluding the bottle sign the building proper is ~14m — a single storey as tall as a four-storey block. |
| `treehouse` | 26 | **15** | Door measures 3.6m; the single habitable room would be 8m floor-to-ceiling. Almost certainly the two erroneous scale bumps from the `potion-house` mix-up, still sitting in the catalog. Revert deliberately. |
| `inn-bar` | 3 | **5.3** | Counter top is at 0.63m — knee height. Internal proportions are correct (stool/counter ratio 0.62 vs a real 0.68), so the mesh is not squat, it is at 57% of life. 5.3 puts the counter at 1.1m and makes it a long L-bar, which is normal for a tavern. |
| `treasure` | 1.1 | **3** | At 1.1m the cave-arch opening is knee-high; nothing can enter it and it reads as a garden rockery. Also miscategorised — see below. |
| `clockwork-grove` | 4 | **16** if they are meant to be trees | `metres: 4` is measuring the **width of the row**, not the height of anything. Each tree stands 1.41m — shoulder height on the figure — while the entry is tagged `landmark`. |
| `stump-mossy` | 1.9 | **1.1** | 1.9m across implies a two-metre-thick trunk. A normal forest stump is 0.6-1.2m and knee-to-thigh height; this one is chest-height. |
| `ring-amber` | 0.07 | **0.025** | 7cm is a bangle. Roughly 3x a real ring. |

### Wrong category or tags

| asset | currently | should be | why |
|---|---|---|---|
| `citadel-crystal` | `building, landmark` | `landmark, crystal, terrain, resource-node` | It is a crystal formation on a rock outcrop. No doors, windows, walls or floors. The name is the only evidence anyone ever had that it was a citadel, and the name is a truncated prompt (`Crimson_Crystal_Citad_...`). If it is in a dwelling rotation it puts a mineral deposit where a house belongs. |
| `house-highl` | `building, house` | `building, landmark, diorama, has-terrain-base, spooky` | A witch's-hut diorama welded to its own hill, complete with graveyard and fence. Only ~5m of its 8m is structure. Remove from the five-dwelling Main Street list — instances would intersect each other and the road. `highl` is a truncated prompt and is no evidence of a house. |
| `treasure` | `prop, container, loot` | `ruin, nature, landmark, cave, loot-site` | Terrain dressing sitting beside four real chests. The gold coins baked into its ground texture are almost certainly why it was named "treasure". This is the `house-cabin` failure repeating. |
| `decor-carving` | `interior, clutter` | `interior, furniture, table, exotic, metal` | It is a low bronze tray table on three legs, not a carving. Trust the name and you mount a coffee table on a wall. Rename to `table-low-brass`. |
| `sentinel-statue` | `ruin, landmark` | `nature, terrain, rock, landmark` | A pile of rocks with a short stair at its base. Anything expecting a carved humanoid guardian gets a crag. Rename to `crag-dark` or `rock-outcrop-steps`. |
| `vase` | `interior, clutter` | `interior, container, classical, exotic` | Attic Greek black-figure amphora. `vase` + `clutter` invites sprinkling it through Norse cottages, where it is an anachronism. |
| `archway-stone` | `structure, ruin` | `structure, gateway, architecture, has-base` | Pristine — no moss, no spalling, not one missing stone. In a ruin field beside `pillar-crumbling` it will look like an error. |
| `archway` | `ruin` | `nature, terrain, landmark` | Natural rock arch, no masonry. |
| `pillar-stone` | `ruin` | `nature, terrain, rock, landmark` | Natural hoodoo, no carving or shaping. |
| `rock-drawings` | `ruin, lore` | `nature, lore, landmark` | A natural boulder that was carved, not a collapsed structure. |
| `ruins-timber` | `ruin` | `debris, clutter, terrain` | A heap. No wall stubs, post bases, foundation outline or doorway — nothing says a building stood here. You cannot build a ruined settlement from it. |
| `stump-mossy-b` | `nature` | `nature, duplicate` | Visually indistinguishable from `stump-mossy` at 5% smaller. The `-b` suffix implies a shape variant; there is none. Delete one and vary scale procedurally, or source a genuinely different stump. |
| `tower-slim` | `building` | `building, tower, church, religious` | The cross finial, the bell and the cruciform windows make it explicitly ecclesiastical, and the bare `building` tag throws that away. |
| `house-trad` | `building, house` | `building, shop, east-asian, has-base` | A Japanese minka shopfront, not a dwelling, currently one of five interchangeable Main Street houses beside two European cottages and a stone croft. |
| `barrel` | `interior, prop, container` | add `exterior` | Works outdoors; the tag is needlessly limiting. |
| `stump-chair` | `interior, furniture` | add `exterior` | Reads fine beside a fire pit or on a trail. |
| `logs` | `nature, prop` | add `cluster` | Two logs fused, and authored vertical — see below. |

### Wrong name (size and category fine)

- `chest-iron` — is purple and gold. Nothing on it is iron-coloured.
- `sword-shadow` — is the brightest, pinkest asset in the set. `sword-radiant`.
- `sword-iron` — is heavily gilded and ornate, not a plain blade.
- `ring-amber` — the stone is crimson. `ring-ruby` or `ring-garnet`.
- `tower-round` — is square in plan (8.80 x 8.78, square parapet).
- `castle-keep` — is a walled compound, not a keep.
- `citadel-crimson` — is a single tiered temple tower, not a fortified complex.
- `farmstead` — is one farmhouse. No barn, no fences, no fields.
- `axe-viking` — double-bitted, which is a heraldic fantasy form, not a viking one.
- `treehouse` / `potion-house` — both correct names, recorded here only because they
  were confused with each other. `potion-house` has a **purple roof and a giant
  purple bottle through it**; `treehouse` is a **living trunk with a leafy conical
  roof**. Look at `docs/asset-shots/potion-house.png` and
  `docs/asset-shots/treehouse.png` once and the confusion cannot recur.

---

## AWKWARD ASSETS

Things that place badly unless you know about them in advance.

**Baked terrain bases** — the mesh ships welded to a slab of ground that will not
blend, will float on one side of a slope and sink on the other, and will z-fight even
on the flat. It also makes `box.min.y` the slab bottom, so seat-on-terrain logic
lifts the object off the ground. Sink these, or place only on verified-flat spots:
`tree-old` (a clean ~3m dirt saucer, the worst of them), `tree-hollow` (an ~11m
pebble display plinth that also inflates the footprint to 11.8 x 11.0m),
`tree-cluster`, `house-t2`, `house-trad`, `house-highl` (an entire hill with a
graveyard on it), `farmstead`, `treehouse`, `archway-stone`, `citadel-crystal`,
`treasure`, `tower-round`, `clockwork-grove` (five individual plinths).

**Fused clusters** — one mesh containing several objects, so the parts cannot be
moved, removed, re-spaced or scattered individually, and the arrangement repeats
recognisably wherever it is placed: `inn-bar` (counter + 4 stools, and 4 seats is all
you get), `inn-table` (table + 1 stool, which also inflates its `metres` to the
cluster footprint), `logs` (2 logs), `tree-cluster` (4 trees), `clockwork-grove`
(5 trees), `tower-round` (tower + outbuildings, so it cannot be reused as a bare
tower).

**Strong front, must be aimed** — random yaw destroys these:
`rock-drawings` (carvings on one face only, blank on the other — the whole point of
the asset), all four chests (hasp/keyhole plate), `chest-overgrown` (must be aimed so
the player sees into it), `mask-owl`, `candelabra` (planar, 13cm deep),
`stone-throne`, `citadel-crimson` (approach stair), `house-t1`/`t2`/`t3`,
`house-trad` (open shopfront), `sentinel-statue` (the stair implies an approach),
`inn-bar`, `inn-table`.

**Safe to rotate freely** — no front, radially symmetric or fully modelled all round:
`barrel`, `bathtub`, `wishing-well`, `pillar-crumbling`, `pillar-stone`, `archway`,
`plant-succulent`, `stump-mossy`, `stump-chair`, `goblet-gold`, `chalice-vine`,
`decor-carving`, `tree-fir`, `tree-old`, `tree-verdant`.

**Wrong resting orientation** —
`logs` is authored **standing upright**; scatter it as-is and you get two 2.2m totem
poles over the player's head. Rotate 90°.
`dagger-flamewing` is modelled **point-down** while all four swords are point-up; any
shared equip or rack code presents it upside down.
`ring-amber` stands on edge, so it balances implausibly upright when dropped.

**Hollow or open** —
`wishing-well`'s shaft is genuinely open at the top; cap it with a collider rather
than trusting the mesh.
`tree-hollow`'s trunk opening is real; check whether the interior is modelled or
whether it reveals backfaces.
`mask-owl` is a shell with no back — a void from behind.
`chest-overgrown` is modelled permanently open **and empty**.
`bathtub` is hollow in a good way: a character or a water plane drops in cleanly.

**Cannot animate** — every chest is a single mesh with the lid welded on.
`chest-plain`, `chest-iron` and `chest-vine` can never open; `chest-overgrown` can
never close. If the game needs an opening chest, that is a new asset.

**Near-invisible from some angles** — `sword-slim` is 4cm thick edge-on;
`candelabra` is 13cm deep with all three arms in one plane; `cabinet` is 44cm deep
with a flat back.

**Visual duplicates that will read as copy-paste** — `stump-mossy` / `stump-mossy-b`
(the same mesh 5% apart); `chest-plain` / `chest-iron` (a retexture pair, same
silhouette); `goblet-gold` / `chalice-vine` (both read as dark stemmed cups beyond
arm's length).

**Style clashes** — the assets are from several art families and mixing them in one
shot looks like two different games. Photoscan/realistic: `tree-fir`, `tree-cluster`,
`house-t3`. Toon/hand-painted: `tree-old`, `house-t1`, `house-t2`. East-Asian:
`house-trad`. Baroque polished metal, wrong for a rustic Norse setting: `candelabra`,
`decor-carving`, `vase`, `chest-iron`. Pick one family per scene; that matters more
than having five meshes.

---

## Rules

1. **Never identify an asset from its filename.** Meshy names are truncated prompts.
   `house-cabin` is a cabinet, `sentinel-statue` is a pile of rocks,
   `decor-carving` is a table, `treasure` is a cave mouth, `sword-shadow` is pink.
   Open `docs/asset-shots/<name>.png` first. If you have not looked at the image, you
   do not know what the asset is.
2. **Check depth before calling something a building.** A 0.42m-deep object is
   furniture. If you find yourself writing a comment apologising for an asset being a
   "facade", stop — you have the wrong asset, not a difficult one.
3. **Know which axis `metres` is measuring.** It is the *longest* dimension, and
   which axis that is varies: height for most towers and trees, **width** for
   `castle-keep`, `house-t3` and `clockwork-grove`, **depth** for `stump-chair`, and
   the *cluster footprint* for `inn-table` and `tree-cluster`. A number that looks
   plausible for a height can be nonsense as a width.
4. **`tools/audit-scales.mjs` passing proves nothing about size.** It only checks
   that `scale` and `metres` are arithmetically consistent. It reported 0 of 58 wrong
   while `inn-bar` was knee-high and `treehouse` was 1.7x oversized.
5. **Measure against the figure, not against intuition.** Every one of the size
   errors was found by comparing a door, a counter top or a tree against the 1.7m
   reference. A door that measures 4m means the building is 2x too big, whatever the
   catalog says.
6. **Size buildings by counting storeys, not by importance.** `guild-hall` (20m) and
   `potion-house` (19m) were both roughly doubled because they matter to the world,
   not because they are tall. Two storeys plus a roof is 10-12m.
7. **Set dressing must read at dressing scale.** `clockwork-grove` is tagged
   `landmark` and stands shoulder-high; a landmark you look down on is not a
   landmark. `treasure` is a cave you cannot enter. `ring-amber` is a bangle.
8. **Check what the asset drags along with it.** A baked ground slab, four fused
   stools, three extra trees, an entire hill with a graveyard. If it has its own
   terrain it cannot go in a rotation that lines instances up.
9. **A `-b` suffix is not evidence of a variant.** Compare the renders before
   treating two assets as two options in a scatter set.
10. **When something looks wrong in-world, identify the object before changing it.**
    The treehouse was scaled twice for a complaint about a building 1.3km away. Find
    out which asset the user is actually pointing at first.
