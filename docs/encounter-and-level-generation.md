# Encounter and level generation

This document describes how the run map and monster encounters are generated, aligned with [Slay the Spire](https://slay-the-spire.fandom.com/wiki/Monsters#First_3_encounters) behaviour where applicable.

---

## Map generation (summary)

- **Grid:** 7 lanes × 15 floors (configurable per act via `floorCount` in `mapConfig.json`). Implemented in `src/engine/map/mapGenerator.ts`.
- **Paths:** Six independent paths are generated from floor 0 to the top. Each path picks one of the 3 closest lanes on the next floor (lane−1, lane, lane+1, clamped); the first two paths start on different lanes; paths do not cross.
- **Prune:** Only (floor, lane) slots reached by at least one path become nodes; pathless slots are removed.
- **Fixed floors:**
  - Floor 0 (F1): all nodes → **Combat (Monsters)**
  - Floor 8 (F9): all nodes → **Treasure**
  - Top floor (F15): all nodes → **Rest**
- **Boss:** One boss node is added after the top floor; every top-floor node connects to it.
- **Override rules** for assigning types on non-fixed nodes:
  1. Elite and Rest only from floor 6 onward.
  2. No consecutive Elite / Merchant / Rest along any edge.
  3. Crossroads (2+ outgoing edges): destination node types must all be different.
  4. No Rest on floor 13 (second-to-top).

---

## Encounter selection (StS-aligned)

Monster (combat) encounters use **debut pools** for the first N fights per act, then the **remaining** pool. The same encounter cannot appear in the next two monster fights (three consecutive monster fights are always three different encounters).

### Act I

| Encounter index | Pool name   | Encounters in pool                                                                 | Weights / notes                                      |
|-----------------|------------|-------------------------------------------------------------------------------------|------------------------------------------------------|
| 1–3             | First 3    | Cultist, Jaw Worm, 2 Louses, Small Slimes (M+S variants: ma_sa, ma_ss, ms_sa, ms_ss) | Cultist 25%, Jaw Worm 25%, 2 Louses 25%, Slimes 25%  |
| 4+              | Remaining  | Gremlin Gang, Large Slimes, Lots of Slimes, Slavers, 3 Louses, 2 Fungi, etc.       | See `encounterWeights` in `mapConfig.json` act1       |

### Act II

| Encounter index | Pool name   | Encounters in pool                                              | Weights / notes              |
|-----------------|------------|------------------------------------------------------------------|------------------------------|
| 1–2             | First 2    | Spheric Guardian, Chosen, Shelled Parasite, 3 Byrds, 2 Thieves   | 20% each                     |
| 3+              | Remaining  | Chosen+Byrd, Cultist+Chosen, Sentry+Guardian, Snake Plant, etc.  | See `encounterWeights` act2  |

### Act III

| Encounter index | Pool name   | Encounters in pool        | Weights / notes     |
|-----------------|------------|----------------------------|---------------------|
| 1–2             | First 2    | 3 Darklings, Orb Walker, 3 Shapes | ~33% each       |
| 3+              | Remaining  | 4 Shapes, Maw, Writhing Mass, etc. | See `encounterWeights` act3 |

### Rule: no repeat in three consecutive

- The same monster encounter ID cannot appear again in the **next two** monster encounters.
- When picking the next encounter, IDs in `lastMonsterEncounterIds` (at most 2) are excluded from the candidate pool. If the pool would be empty, the exclusion is skipped.
- On monster combat win (non-elite, non-boss), the current encounter ID is appended to `lastMonsterEncounterIds` and only the last 2 are kept.

---

## Flow (encounter selection)

1. **On entering a combat node:**  
   `encounterIndex = monsterEncountersCompletedThisAct + 1`. Choose pool and weights from first-N (Act 1: index ≤3; Act 2/3: index ≤2) or remaining. Filter out `lastMonsterEncounterIds` from the pool. Weighted pick from the (possibly filtered) pool.

2. **On monster combat win:**  
   Increment `monsterEncountersCompletedThisAct`. Append current encounter ID to `lastMonsterEncounterIds` and keep only the last 2. (Elite and boss wins do not update these.)

3. **On new act:**  
   `monsterEncountersCompletedThisAct` and `lastMonsterEncounterIds` are reset to 0 and [].

---

## Config reference

- **Map:** `src/engine/data/mapConfig.json` — `floorCount` per act; map generator uses it in `src/engine/map/mapGenerator.ts`.
- **Encounters:** `mapConfig.json` per act:
  - `encounterPool` / `encounterWeights` — remaining (and full) monster pool.
  - `firstThreeEncounterPool` / `firstThreeEncounterWeights` — Act 1 first 3 fights.
  - `firstTwoEncounterPool` / `firstTwoEncounterWeights` — Act 2 and Act 3 first 2 fights.
  - `eliteEncounterPool` / `eliteEncounterWeights` — elite nodes.
  - `bossEncounter` — boss node.

Encounter definitions (enemies per encounter) live in `src/engine/data/encounters.json`.
