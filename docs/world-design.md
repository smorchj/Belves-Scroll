# Belve's Scroll — World Design

**Site:** Herøy, Nordland (Helgeland coast, 66°N)
**Terrain:** real Kartverket DTM, `nhm_dtm_topo_25833`, 4096m tile at 377700E 7325000N
**Layout grammar:** measured from 1142 real building footprints and 517 roads (OSM)

Nothing in this document is invented where real data exists. The landform is the
actual coastline; the settlement rules are measured, not guessed.

---

## 1. What the real place taught us

Two surveys drove every decision below.

**Terrain** (`survey.mjs`, real DTM):

| | |
|---|---|
| Elevation | 0 – 286 m |
| Sea | 46% of the tile |
| Buildable (land, <60m, slope <0.18) | 31.5% |
| Composition | massif in the NE, flat shelf W and centre, channel between, open sea S |

**Settlement** (`survey-osm.mjs`, real footprints):

| measurement | value | what it means for us |
|---|---|---|
| village cores (21+ bldgs) | 6 | one real core, not a sprawl |
| core footprint | 628 × 1491 m, 266 × 753 m, 166 × 381 m | **every core is a ribbon, ~1:2.5** |
| hamlets (6–20) | 36 | small satellite clusters |
| farmsteads (2–5) | 77 | the dominant unit of the landscape |
| isolated farms | 58 | single buildings, far apart |
| nearest-neighbour spacing | p10 **10.8 m**, median **19.6 m**, p90 43.8 m | tight in core, loose outside |
| distance to nearest road | median **41 m** | buildings hug the road |
| piers | 44 | the waterfront is *working*, not scenic |

**The single most important fact:** a Norwegian coastal settlement is a **ribbon
along the water**, one road deep, not a radial town with a market square. Getting
this wrong is what made the previous attempt read as scattered props.

---

## 2. HAVNSTAD — the town

A fishing settlement of ~40 buildings strung 620 m along the north shore of a
strait, backed by the massif. Sheltered from the open sea to the south by the
headland; the strait is the only safe anchorage for a day's sail.

```
                    ▲ VARDEFJELL (286 m)  — POI 3
                   ▲▲▲
                 ▲▲▲▲▲▲                        old cart track ↑
   ═══════════════════════════════════════════════════  UPPER ROAD
      🏠  🏠   ⛪         🏛️        🏠  🏠   🏠       (farms + church + hall)
   ─────────────────────────────────────────────────  MAIN STREET (620 m)
    🏠 🏠 🏚️ 🏠  🧪  🏠 🏠 🏠 🏠  🏠 🏠 🏠  🏠 🏠
   ═════════════════════════════════════════════════  QUAY
     ║  ║   ║      ║    ║   ║     ║  ║    ║          (piers)
   ~~~~~~~~~~~ H E R Ø Y S U N D E T ~~~~~~~~~~~~~~~  strait
                    ╬ BRIDGE ╬
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        SØRHOLMEN (south islet)  🗼      ⚓ boathouses
```

### Three terraces, because the ground rises

The town is read in **three horizontal bands**, which is what gives it structure
and verticality without needing interiors:

**1. The Quay (0–3 m).** Working waterfront. Piers, upturned boats, drying racks
(*hjell*) hung with stockfish, barrels, nets. Always busy in the morning. This is
where the player arrives and where the fish-buyer, the boatwright and the smugglers
are found.

**2. Main Street (4–12 m).** One road, buildings on both sides, 15–25 m apart —
the measured core spacing. Gable ends face the water (real Norwegian practice: the
short wall takes the weather). Contains the trade buildings.

**3. The Upper Road (18–35 m).** Where the church and hall sit, looking down over
the roofs. Farms spread out behind, spacing widening to 40–80 m as the ribbon
dissolves into the fields — exactly the p90 falloff in the data.

### Buildings, mapped to assets we own

| Place | Asset | Terrace | Who | Why it matters |
|---|---|---|---|---|
| **Kvitsalen** (the hall) | `guild-hall` | Upper | Ember | Seat of the town's authority; meetings, the winter feast, quest board |
| **Herøy kyrkje** | `tower-slim` + `archway` | Upper | Miriam | Stave-church silhouette; the graveyard is a POI in itself |
| **Apotekaren** | `potion-house` | Main | Mildrid | Alchemist and the only healer; buys reagents |
| **Bryggja** (fish house) | `farmstead` ×2 | Quay | Charles | Buys catch, employs half the town |
| **The Fork & Net** (inn) | `farmstead` | Main | Maple | Rumours, beds, the drunk who saw something |
| **Smithy** | `farmstead` (small) | Main | Haggar | Repairs, upgrades, sells the iron sword |
| **Boathouses** ×6 | `ruins-timber` scaled | Quay | — | *Naust* — red, low, gable to water |
| **Farms** ×5 | `farmstead` | Upper/behind | Snader, Cedar | Spaced 40–80 m, each with an outbuilding |
| **The burnt house** | `ruins-timber` | Main | — | A gap in the ribbon. Someone died. Quest hook. |
| **Watchtower** | `tower-round` | Sørholmen | Makal | Watches the strait approach |

### What makes it feel alive

- **The strait is the town's reason to exist.** Everything faces it. The bridge is
  the only crossing for 15 km — so everyone passes it, and it's the natural place
  to be stopped, taxed, or ambushed.
- **Vertical readability.** From the quay you look *up* at the church; from the
  church you look *down* on the whole town and out to sea. Both are good views,
  which is what makes a place memorable.
- **Working props, not decoration.** Fish racks that fill and empty with the
  season. Boats that leave at dawn and return at dusk with the fishermen aboard.
- **The gap.** One burnt plot in the middle of the ribbon that nobody rebuilds.

---

## 3. Three wilderness points of interest

Placed on real terrain features from the DTM, each a different *kind* of place —
one social, one vertical, one buried.

### POI 1 — GRAVFELTET, the barrow field (SW headland, 15 m, 700 m from town)

Nine burial mounds on the seaward heath, in a line pointing at the midsummer
sunset. Bronze-age *helleristninger* — rock carvings of boats — on the flat slabs
between them. One mound is open: a slumped entrance under a leaning stone arch.

- **Assets:** `rock-drawings`, `archway`, `pillar-stone` ×6, `stump-mossy`
- **Type:** dungeon. Descends into a stone chamber under the largest mound.
- **The hook:** the carvings show *thirty* boats. The town has records of twenty-nine.
- **Why it's here:** real Norwegian coastal heath is dense with bronze-age grave
  fields and rock art, always on the seaward side. This is the most authentic
  possible dungeon for this coast.

### POI 2 — VARDEFJELL, the beacon mountain (NE massif, 0 → 286 m, 1.2 km from town)

The massif behind the town. A cart track climbs to a *varde* (stone beacon cairn)
on the summit — the old warning-fire system that ran the length of the coast. The
beacon has been rebuilt by people who are not the town's.

- **Assets:** `castle-keep` (ruined, partial), `tower-round`, `sentinel-statue` ×2,
  `pillar-stone`
- **Type:** bandit outpost, taken over. Lilly Raider commands it.
- **The hook:** if they light it, the coast's beacon chain carries a false alarm
  180 km. That's not banditry, that's a signal to someone.
- **Why it's here:** 286 m of real relief directly behind the town. The climb is
  the content — the town shrinks below you as you ascend, and the summit shows
  you the whole map. Best view in the game, earned on foot.

### POI 3 — SETERDALEN, the hanging valley (N, 120 m, 2 km from town)

A *seter* — a summer mountain farm — in a hanging valley behind the massif, reached
by a stream gorge. Abandoned for two generations. The birch wood around it has
grown strange: a hollow tree big enough to stand inside, and a stand of trees that
tick.

- **Assets:** `tree-hollow`, `treehouse`, `clockwork-grove`, `ruins-timber`,
  `stump-mossy` ×dense
- **Type:** the Woodland Druid and Huldra live here. Non-hostile, deeply odd.
- **The hook:** the *huldra* is real Norwegian folklore — a forest woman, beautiful
  from the front, hollow as a rotted trunk from behind, who lures men into the
  mountain. Ours keeps the old seter and will trade, but the price is never money.
- **Why it's here:** every good RPG needs one place that is not hostile but is not
  safe. The valley is the counterweight to the mountain.

### The fourth thing, deliberately not a POI

**Krystallborga** — `citadel-crystal` — is placed on the far skyline across the
water, at the limit of draw distance, on an island the player cannot reach in this
build. It is always visible from the quay and from Vardefjell's summit. It is the
answer to "what's out there" and the seed of the main quest. Never approachable,
always present.

---

## 4. Getting from town to POI

Distances are deliberately short — 700 m to 2 km — so the world is *dense*, not
empty. Real Herøy has a farmstead every few hundred metres; that's the density to
match. Between the four locations:

- The **shore path** west to the barrow field, past three isolated farms
  (matching the 58 real singletons), one of them occupied by someone hostile.
- The **cart track** east then north up Vardefjell, switchbacking — with the
  ruined *støl* (herder's hut) at the halfway point as a rest/ambush node.
- The **stream gorge** north into Seterdalen, the only route not visible from
  the mountain.

---

## 5. Textures needed

Everything below is a **tileable PBR set** (albedo + normal + roughness, 2K is
plenty). Listed in priority order — the first five carry ~90% of the visible
world.

### Essential

| # | Texture | Where it's used | Notes |
|---|---|---|---|
| 1 | **Coastal grass / heath** | The entire land surface | Short, wind-flattened, with heather and moss patches. The single most-seen texture in the game. |
| 2 | **Wet granite / coastal bedrock** | Shoreline, mountain, barrows | Grey, glacially smoothed, lichen-blotched. Norway is bare rock wherever soil isn't. |
| 3 | **Beach shingle / pebble** | The whole waterline | Rounded grey stones, not sand — this coast has no sand. |
| 4 | **Weathered timber planking** | Quay, piers, boathouse walls | Grey-silvered, vertical board-and-batten. |
| 5 | **Falu red painted board** | Boathouses, barns | *The* Norwegian colour. Oxide red, peeling to bare wood. |

### Strongly wanted

| # | Texture | Where |
|---|---|---|
| 6 | **Turf / sod roof** | Farm and boathouse roofs — grass growing on the roof, very Norwegian |
| 7 | **Slate roof tile** | Church, hall |
| 8 | **Dirt / gravel track** | Roads, worn paths |
| 9 | **Mountain scree** | Above ~180 m on Vardefjell |
| 10 | **Peat / bog** | The wet ground between town and barrows |

### Nice to have

| # | Texture | Where |
|---|---|---|
| 11 | Birch bark | The Seterdalen wood |
| 12 | Snow / névé | Summit, and for winter |
| 13 | Lichen decal (alpha) | Overlay on rock to break up tiling |
| 14 | Water normal map | The strait — tight, choppy, cold-sea detail |

**Format:** any of PNG/JPG/KTX2, seamless, 2048². If they come as ORM-packed
(occlusion/roughness/metallic in RGB) that's ideal. Albedo alone is workable for
1–5 if that's what's available.

**One thing I can generate myself if needed:** the lichen and moss *decals*, and a
detail-noise overlay. Those are procedural-friendly. The base surfaces (1–5) really
do want to be photographic — that's the difference between "good graphics" and
what was there before.

---

## 6. What gets built, in order

1. Real DTM terrain from the Kartverket tile, with the sea, the strait and the massif.
2. Ground materials — the five essential textures, splatted by height and slope.
3. Havnstad's three terraces: quay, main street, upper road. Buildings placed by
   the measured grammar (20 m spacing, 40 m from road, gable to water).
4. The three POIs.
5. Repopulate NPCs onto the new layout, with their schedules bound to the terraces.

No props are placed until the terrain and the town's road/terrace skeleton exist.
That skeleton is what was missing before.
