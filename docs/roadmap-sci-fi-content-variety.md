# Roadmap: Sci-Fi Theme, Content & Variety, Multi-Mob Fights

**Vision:** "Journey to the end of space" — fight monsters and aliens with guns. Futuristic / sci-fi / cyberpunk tone. No classic fantasy weapons (swords, shields, knives) unless reimagined with a sci-fi look and name.

**Scope:** Short-term focus: theme rebrand, content & variety, multi-mob encounters. Keep this doc as the single source of truth for implementation order.

---

## Part 1: Theme & Naming Principles

- **Setting:** Space / sci-fi / cyberpunk. Player is a futuristic soldier (e.g. Gunboy); enemies are aliens, creatures, drones, or corrupted entities.
- **Weapons / defense:** Prefer guns, plasma, energy, tech. If something is like a "sword" or "shield," it must have a sci-fi name and flavor (e.g. "Plasma Blade," "Energy Barrier," "Kinetic Shield").
- **Cards:** Names and (future) descriptions should match the tone: "Strike" → keep (gun shot); "Defend" → "Barrier" or "Hardened Plating"; "Bash" → "Concussion Shot"; "Block" → "Shield Matrix" or "Reactive Armor"; etc.
- **Enemies:** Aliens, drones, beasts, hybrids — not "Jaw Worm" or "Guardian" unless renamed (e.g. "Xenomorph Grunt," "Guardian Drone").
- **Events / relics / locations:** Space stations, derelict ships, alien flora, cybernetic upgrades, data chips, energy cores.

**Rule of thumb:** If it sounds like medieval fantasy, rename or reframe it to sci-fi/space/tech.

---

## Part 2: Content & Variety — Overview

1. **Cards:** Rebrand existing + add new sci-fi cards (attack, block, draw, debuff).
2. **Enemies:** New roster with sci-fi names and tuned stats/intents; small (weak), medium, large (elite/boss).
3. **Encounters:** Single-enemy + **multi-mob** (2 big, 1 big + 2–3 small); assign to act pools.
4. **Events:** New events with sci-fi flavor and outcomes (heal, gold, card, relic, curse, max HP).
5. **Relics:** Rebrand + new relics (energy, block, damage, draw, on-kill, etc.).
6. **Map:** Act encounter pools and (optional) names/lore for node types.

---

## Part 3: Multi-Mob Fights — Design

### 3.1 Goals

- **2 big mobs:** Two tougher enemies (e.g. high HP, strong attacks or blocks).
- **1 big + 2–3 small:** One "leader" or heavy unit plus several weaker adds.

Engine and UI already support multiple enemies per encounter; we only need new **enemy definitions** and **encounter definitions**.

### 3.2 Encounter Patterns (to implement)

| Pattern        | Example composition      | Use case                    |
|----------------|---------------------------|-----------------------------|
| Single         | 1 medium                  | Easy / intro               |
| Double         | 2 medium                  | Standard                   |
| Triple         | 3 small                   | Swarm                      |
| Boss + adds    | 1 big + 2 small           | Hard / mini-boss           |
| Dual heavy     | 2 big                     | Elite / hard               |

### 3.3 Balance Notes

- **Total HP / damage budget:** Multi-mob encounters should not be trivial; total enemy HP and damage per round can exceed a single-enemy fight but not make the fight unwinnable with a starter deck.
- **Intent clarity:** UI already shows intents per enemy; ensure intents are readable when 3–4 enemies are on screen (layout already supports it).
- **Optional later:** Enemy "size" (e.g. `"size": "small" | "medium" | "large"`) for different placeholder scales and positioning; not required for first pass.

---

## Part 4: Implementation Plan (Phased)

### Phase 1: Theme rebrand — Cards

**Goal:** All card names (and later descriptions) are sci-fi aligned. No swords/shields/knives in name unless sci-fi (e.g. Plasma Blade, Shield Matrix).

| Task ID | Task | Details |
|--------|------|--------|
| 1.1 | Rebrand `cards.json` | Rename cards; keep same `id` for save compatibility or add migration. Suggested renames: Defend → Barrier (or Hardened Plating), Block → Shield Matrix, Bash → Concussion Shot, Heavy Strike → Overcharge, Clash → Point Blank, Pommel Strike → Double Tap, Iron Wave → Suppressing Fire, Shrug It Off → Coolant Flush, Body Slam → Ram. |
| 1.2 | Update display names in UI | Ensure card hand, reward, shop, and events use the new names (likely from `cards.json` name field). |
| 1.3 | (Optional) Add 2–3 new sci-fi cards | e.g. "Plasma Shot" (damage), "Reactive Plating" (block), "Overclock" (draw + energy). Add to `cards.json` and any card pools. |

**Files:** `src/engine/data/cards.json`, any hardcoded card names in `src/app` or `src/engine`.

---

### Phase 2: Theme rebrand — Enemies & encounters (single)

**Goal:** Sci-fi enemy roster and single-enemy encounters for Act 1 (and baseline for Act 2).

| Task ID | Task | Details |
|--------|------|--------|
| 2.1 | Rebrand / add enemies in `enemies.json` | Replace or add: e.g. "Jaw Worm" → "Xenomorph Grub" or "Drone Scout"; "Guardian" (boss) → "Guardian Drone" or "Hive Guardian." Add 2–3 new: e.g. "Spore Crawler" (low HP, debuff), "Assault Drone" (attack-focused), "Shield Drone" (block). Define `id`, `name`, `maxHp`, `intents`. |
| 2.2 | Add single-enemy encounters in `encounters.json` | e.g. `solo_scout`, `solo_drone`, `solo_crawler`, `solo_assault`, `solo_shield`. Keep `tutorial` or rename to `first_contact`. |
| 2.3 | Update `mapConfig.json` encounter pools | Act 1 `encounterPool`: use new encounter ids (e.g. 2–3 solo encounters). Boss encounter stays or is renamed (e.g. `boss_act1` → same id, enemy def renamed). |

**Files:** `src/engine/data/enemies.json`, `src/engine/data/encounters.json`, `src/engine/data/mapConfig.json`.

---

### Phase 3: Multi-mob encounters

**Goal:** Add encounters with 2 or 3+ enemies; support "2 big" and "1 big + 2–3 small."

| Task ID | Task | Details |
|--------|------|--------|
| 3.1 | Define "small" enemies | In `enemies.json`, add 1–2 low-HP, low-damage enemies (e.g. "Swarm Larva," "Probe"). Used as adds in multi-mob. |
| 3.2 | Define "big" enemies | Add or tag 1–2 higher-HP enemies (e.g. "Heavy Drone," "Alpha Xenomorph") for "2 big" or "1 big + adds" fights. |
| 3.3 | Add multi-mob encounters | In `encounters.json`: e.g. `double_drones` (2x medium), `swarm` (3x small), `leader_and_adds` (1 big + 2 small), `dual_heavy` (2 big). |
| 3.4 | Add to map encounter pools | In `mapConfig.json`, add new encounter ids to `encounterPool` for Act 1 (and Act 2) so multi-mob can appear. Optionally weight or separate "elite" pool later. |
| 3.5 | Verify combat & UI | Run fights with 2 and 3 enemies; confirm targeting, intents, HP, and layout. Adjust `enemyGap` or placeholder size in `combat-layout.constants.ts` if needed for 3–4 enemies. |

**Files:** `src/engine/data/enemies.json`, `src/engine/data/encounters.json`, `src/engine/data/mapConfig.json`, `src/app/combat-canvas/constants/combat-layout.constants.ts` (if layout tweaks needed).

---

### Phase 4: Events & relics (sci-fi flavor)

**Goal:** Events and relics feel like space/sci-fi; more variety.

| Task ID | Task | Details |
|--------|------|--------|
| 4.1 | Rebrand events in `events.json` | Replace fantasy flavor with sci-fi: e.g. "stranger tends wounds" → "Med bay terminal" or "Friendly drone offers repair"; "cache of coins" → "Salvage" or "Credits"; "merchant offers card" → "Data chip" or "Loadout terminal." Keep same outcome types (`heal`, `gold`, `addCard`, etc.). |
| 4.2 | Add 2–3 new events | e.g. "Derelict ship" (risk/reward), "Alien hive" (fight or avoid), "Upgrade station" (max HP or card upgrade). Implement outcomes in `run.ts` / event handler if new outcome types are needed. |
| 4.3 | Rebrand relics in `relics.json` | e.g. "Test Relic" → "Energy Cell" or "Reactor Core"; "Energy Stone" already fits. Ensure names/descriptions are sci-fi. |
| 4.4 | Add 2–3 new relics | e.g. on-combat-start block, on-kill heal, on-card-play draw, etc. Wire new trigger/effect types in `relicRunner.ts` and engine if needed. |

**Files:** `src/engine/data/events.json`, `src/engine/data/relics.json`, `src/engine/run.ts`, `src/engine/relicRunner.ts`, `src/app/services/game-bridge.service.ts`.

---

### Phase 5: Content variety & balance

**Goal:** More cards in pools, more encounters per act, simple balance pass.

| Task ID | Task | Details |
|--------|------|--------|
| 5.1 | Expand card pool for rewards/shop | Ensure new/rebranded cards appear in reward choices and shop. Update `shopPools.json` and any reward logic to include new card ids. |
| 5.2 | Act 2 encounter pool | Differentiate Act 2: harder or different encounters (e.g. add Act 2–only enemies/encounters), update `mapConfig.json` act2 `encounterPool`. |
| 5.3 | Balance pass | Tune enemy HP/damage and card values so single, double, and multi-mob fights feel fair. Document intended difficulty bands (e.g. "solo = easy, dual = medium, 1 big + 2 small = hard"). |

**Files:** `src/engine/data/shopPools.json`, `src/engine/data/mapConfig.json`, `src/engine/data/enemies.json`, `src/engine/data/cards.json`.

---

### Phase 6: Polish & consistency

**Goal:** No leftover fantasy text; optional UX improvements for multi-mob.

| Task ID | Task | Details |
|--------|------|--------|
| 6.1 | Global copy pass | Replace any remaining "medieval" or fantasy strings in UI (buttons, titles, tooltips). |
| 6.2 | Strike / Defend animation triggers | Ensure "Strike" (or renamed card id) still triggers shooting animation; block cards still trigger shield animation. If card ids changed, update `cardIsStrike` and `cardHasBlockEffect` in combat-canvas component. |
| 6.3 | (Optional) Enemy size/scale | If desired, add `size` or `scale` to enemy definitions and use in renderer to scale placeholder (e.g. small = 0.8, large = 1.2). |

**Files:** `src/app/combat-canvas/combat-canvas.component.ts`, `src/app/combat-canvas/renderers/combat-view.renderer.ts`, `src/engine/data/enemies.json`.

---

## Part 5: File Change Summary

| File | Phases | Changes |
|------|--------|--------|
| `src/engine/data/cards.json` | 1, 5 | Rebrand names; add new cards |
| `src/engine/data/enemies.json` | 2, 3, 5 | New/rebrand enemies; small/big roles |
| `src/engine/data/encounters.json` | 2, 3 | Single + multi-mob encounter definitions |
| `src/engine/data/mapConfig.json` | 2, 3, 5 | Encounter pools per act |
| `src/engine/data/events.json` | 4 | Rebrand + new events |
| `src/engine/data/relics.json` | 4 | Rebrand + new relics |
| `src/engine/data/shopPools.json` | 5 | Include new card ids |
| `src/engine/run.ts` | 4 | New event outcomes if needed |
| `src/engine/relicRunner.ts` | 4 | New relic effects/triggers if needed |
| `src/app/combat-canvas/combat-canvas.component.ts` | 6 | Strike/block card id checks |
| `src/app/combat-canvas/constants/combat-layout.constants.ts` | 3 | Optional layout for 3–4 enemies |

---

## Part 6: Suggested Implementation Order

1. **Phase 1** — Card rebrand (and optional new cards).
2. **Phase 2** — Enemy rebrand + single-enemy encounters + map pools.
3. **Phase 3** — Multi-mob: small/big enemies, multi-enemy encounters, add to pools, verify.
4. **Phase 4** — Events & relics rebrand + new content.
5. **Phase 5** — Variety (shop/reward pools, Act 2 pool, balance).
6. **Phase 6** — Copy pass, animation triggers, optional enemy scale.

**Dependency note:** Phase 3 can start as soon as Phase 2 enemy definitions exist. Phase 4 can run in parallel with 3 if desired.

---

## Part 7: Card ID Compatibility (Save/Strike/Block)

- If **card ids stay the same** (e.g. `strike`, `defend`, `block`): No code change for animations or saves; only `name` in JSON changes.
- If **card ids are renamed** (e.g. `strike` → `plasma_shot`): Update `cardIsStrike(cardId)` and `cardHasBlockEffect` to use new ids (or check by effect type). Consider a one-time save migration for deck/hand/discard if needed.

Recommendation: keep `strike` and `defend`/`block` ids for compatibility; rename others as needed. Add new cards with new ids.

---

## Part 8: Next steps (post–Phase 6)

**Completed beyond original phases:** Phase 6.3 (enemy size/scale), meta unlocks (reward + shop pools, unlock on Act 2 advance and on victory), Phase 6.1 (global copy pass — sci-fi UI strings).

Suggested implementation order for continued development:

| Priority | Area | Tasks |
|----------|------|--------|
| 1 | **Polish** | Phase 6.1 done. Optional: card/relic tooltips, “Credits” in all copy, map node tooltips (e.g. “Repair bay”, “Shop”). |
| 2 | **Balance & docs** | Document difficulty bands (solo / dual / multi-mob). Tune enemy HP/damage and card values from playtests. Optional: separate elite encounter pool. |
| 3 | **New mechanics** | Potions (one-time use in combat). Status effects (weak, frail, etc.) and card/relic interactions. Curse cards and event outcomes. |
| 4 | **Content** | More cards, enemies, and encounters per act. Act 2–only events. Optional: Act 3 and final boss. |
| 5 | **Audio / VFX** | Combat sounds, UI feedback, victory/defeat jingles. Hit/damage/block VFX. |

**Files to touch (typical):** `src/engine/data/*.json`, `src/engine/run.ts`, `src/engine/effectRunner.ts`, `src/app/combat-canvas/*`, new services for potions/status if added.

---

*Document version: 1.1. Part 8 added for next steps; Phases 1–6 and optional 6.3 complete.*
