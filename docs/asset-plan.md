# Asset Plan — every asset, and exactly what it becomes

Companion to `world-design.md`. That document decides *what the world is*; this
one decides *what each asset does in it*, so nothing gets scattered without a
reason. Anything without a role listed here does not get placed.

---

## 1. Buildings — Havnstad's ribbon

The town is ~40 buildings along 620m of shore, in three terraces. It is built
from **six** distinct building meshes, so repetition is managed deliberately
rather than accidentally.

| Asset | Role | Count | Placement rule |
|---|---|---|---|
| `house-trad` | Ordinary dwelling | ~12 | Main Street, gable to water, 15–25m apart |
| `house-highl` | Ordinary dwelling, variant | ~10 | Interleaved with `house-trad`, never two alike adjacent |
| `farmstead` | Barn / outbuilding / upper farms | ~8 | Upper Road and behind, 40–80m spacing |
| `ruins-timber` | Boathouses (*naust*) | ~6 | Quay, gable to water, half in the tideline |
| `guild-hall` | **Kvitsalen**, the hall | 1 | Upper terrace, the town's high point |
| `potion-house` | **Apotekaren** | 1 | Main Street, the one odd silhouette |

**Repetition control.** Two house meshes over 22 buildings would normally read as
copy-paste. Three things break it: per-instance uniform **scale jitter** (0.9–1.15),
**rotation** snapped to the street line ±8°, and **roof/wall tint variation** —
falu red, ochre, grey-tar, weathered bare — driven per instance. Norwegian
villages genuinely are the same house painted differently.

Deliberately **not** in the town: `castle-keep`, `citadel-crimson`,
`citadel-crystal`, `tower-round`, `tower-slim`. Those are landmarks; putting a
castle in a fishing village is exactly the mistake that made the last attempt
read as scattered.

---

## 2. Interiors — enterable buildings

Four buildings can be entered. Each is a **separate scene**, Elder-Scrolls style:
walk to the door, prompt appears, screen fades, interior scene loads, exterior
scene unloads. This keeps the exterior cheap and lets interiors be far denser
than the shell would allow.

| Interior | Entered from | Dressed with | Why the player goes |
|---|---|---|---|
| **The Fork & Net** (inn) | Main Street | `inn-bar`, `inn-table` ×4, `barrel` ×6 | Rumours, rest, the quest board, Maple |
| **Kvitsalen** (hall) | Upper terrace | `inn-table` ×2, `barrel`, `treasure` | Ember, the winter feast, main-quest beats |
| **Apotekaren** | Main Street | `inn-table`, `barrel` ×4 | Mildrid, potions, reagent trade |
| **The barrow chamber** | Gravfeltet | `treasure`, `pillar-stone`, `rock-drawings` | The dungeon payoff |

**How an interior is built.** There is no interior geometry in the asset set, so
the shell is generated: a room box sized to the exterior footprint, with walls,
floor and a beamed ceiling built from the terrain textures (`cobble` for the
floor, and the timber texture when it arrives). The Meshy furniture is then
placed inside it. This is the standard approach — interiors almost never match
their exteriors in this genre, and nobody notices.

**What interiors need that I don't have:** a door mesh, a fireplace/hearth, beds,
shelving, and a light source prop (lantern/candle). I can build simple versions
of all of these from primitives — a hearth is a stone box with a fire light, a
bed is a frame plus a mattress volume, shelves are boxes. They will read fine at
game distance. **A lantern/hearth is the important one**, because the interiors
need a warm point light or they will look like empty boxes.

---

## 3. Vegetation — an island with few trees

You said it: this is an island, and it should not be forested. That matches the
real Herøy, which is heath, bog and bare rock with trees only in sheltered
hollows. The plan uses scarcity deliberately.

| Asset | Role | Where |
|---|---|---|
| `clockwork-grove` | The one real stand of trees | Seterdalen only — its strangeness is the POI |
| `tree-hollow` | Single landmark tree | Seterdalen centre, the huldra's tree |
| `treehouse` | Structure in the grove | Seterdalen |
| `stump-mossy` / `-b` | Cut stumps, and low rocks when scaled down | Scattered near the seter and old field edges |

**Where trees would go when you have them:** sheltered east-facing hollows below
60m, in the lee of the massif — never on the exposed west shore, never above the
treeline. That's the real pattern and it will look right rather than sprinkled.
Birch and low pine/juniper scrub are the two that matter most.

Until then the land gets **grass and heather variation** (done) plus scattered
rock — which is authentic, not a compromise.

---

## 4. Landmarks and the wilderness POIs

| Asset | Role |
|---|---|
| `castle-keep` (ruined) | Vardefjell summit — the taken-over beacon fort |
| `tower-round` | Sørholmen watchtower, guarding the strait |
| `tower-slim` | Herøy kyrkje's stave silhouette |
| `sentinel-statue` ×2 | Flanking the summit approach |
| `pillar-stone` ×6 | The barrow field alignment; two at the church |
| `archway` | The open barrow mouth; the churchyard gate |
| `rock-drawings` | *Helleristninger* at Gravfeltet — the thirty-boats clue |
| `citadel-crystal` | Far skyline, unreachable. The main-quest seed |
| `citadel-crimson` | Reserved. Not placed in this build |

---

## 5. Props, loot and equipment

| Asset | Role |
|---|---|
| `treasure` | Loot containers — barrow chamber, hall, bandit camp |
| `barrel` | Quay clutter, inn and store interiors, breakable/lootable |
| `sword-iron` | The smith's stock, town guard sidearm |
| `sword-slim` | Bandit weapon |
| `dagger-flamewing` | Named weapon, barrow chamber reward |
| `ring-amber` | Quest reward |
| `mask-owl` | Seterdalen — the huldra's price |

---

## 6. Characters

Now that exports carry outfits, the cast maps to roles directly:

| Asset | Role | Where |
|---|---|---|
| `charles` | Fish-buyer, opening quest | Bryggja, the quay |
| `mildrid` | Apothecary, healer | Apotekaren |
| `maple` | Innkeeper | The Fork & Net |
| `haggar` | Smith | Smithy, Main Street |
| `ember` | Town authority | Kvitsalen |
| `cedar` | Ranking outsider | Kvitsalen / arriving by boat |
| `miriam` | Priest | Herøy kyrkje |
| `woodland-druid` / `-huldra` | The seter pair | Seterdalen |
| `prisoner` | Held at the watchtower | Sørholmen |
| `lilly-raider` | Bandit captain | Vardefjell |
| `snader`, `makal`, `charles` (reused) | Fishermen, guards, farmhands | Generic townsfolk |

**Generic NPC variation:** the same model is reused for background villagers with
per-instance skin shade, hair style and hair colour varied at spawn. The shared
morph library means every one of them can still talk.

---

## 7. What is genuinely missing

**I can build these myself** (primitives + existing textures), and will unless
told otherwise:
- Doors, hearths, beds, shelves, benches — interior fittings
- Piers and jetties — plank decks on posts, from the timber texture
- Fish-drying racks (*hjell*) — the signature Norwegian coastal silhouette
- Stone walls and field boundaries
- Rowing boats — simple hull, needed at 44-pier density

**I would rather have from you, in priority order:**
1. **Granite / bedrock texture** — the single biggest visual gap. Norway is bare
   scoured rock wherever soil isn't, and `CobbleStone` is laid cobbles, not stone.
   The mountain and shoreline currently have nothing truthful to wear.
2. **Weathered timber planking** + **falu red painted board** — the quay,
   boathouses and every wall. Without these the buildings can't be re-tinted
   convincingly.
3. **Birch and low pine/scrub** — for the sheltered hollows. Not many needed.
4. Turf/sod roof — very Norwegian, and the roofline is what sells the village.

**Not needed:** more building meshes. Six is enough given tint and scale variation.
