# Data pipelines: adding cards, relics, and enemies

This doc describes how to add new content (cards, relics, enemies) and how it flows into rewards, shops, and combat. No UI or engine wiring changes are required when adding data-driven content.

---

## Adding a new card

### 1. Define the card in JSON

Add an entry to `src/engine/data/cards.json`:

```json
{
  "id": "my_new_card",
  "name": "Display Name",
  "cost": 1,
  "effects": [
    { "type": "damage", "value": 10, "target": "enemy" }
  ]
}
```

- **id**: Unique string; used in deck, rewards, and assets.
- **effects**: Array of effect objects. See existing cards and `src/engine/effectRunner.ts` for supported types (`damage`, `block`, `draw`, `vulnerable`, etc.).
- Optional: `rarity` (`"common"` | `"uncommon"` | `"rare"`), `archetype` (string), `acts` (array of act numbers) for future pool weighting and act-gating.
- Set `isCurse: true` or `isStatus: true` for curses/status cards; they are excluded from reward/shop pools.

### 2. Add to character pool (rewards / shop)

For a character like Gunboy to see the card in **rewards** and **shops**:

- Add the card id to `src/engine/data/characters.json` under that character’s `cardPoolIds` array.

Optionally, for **act-specific shop** availability, add the id to `src/engine/data/shopPools.json` under the act’s `cards` array (shop pool is merged with character pool; see GameBridgeService).

### 3. Card art (optional)

- Add an image at `src/assets/cards/{cardId}.png` (recommended ~84×50 px or similar ratio).
- The combat view uses this for the card art slot; if missing, a placeholder is shown.

### 4. Effect logic

If the card uses a new **effect type** (e.g. a new keyword), add handling in `src/engine/effectRunner.ts` in `runEffects`. Card definitions are data-only; effect behavior is implemented in the engine.

---

## Adding a new relic

### 1. Define the relic in JSON

Add an entry to `src/engine/data/relics.json`:

```json
{
  "id": "my_relic",
  "name": "My Relic",
  "description": "What it does.",
  "triggers": [
    { "when": "onCombatStart", "effect": { "type": "block", "value": 4 } }
  ]
}
```

- **triggers**: List of `{ when, effect }`. Supported `when` values are implemented in the engine (e.g. `onCombatStart`, `onTurnStart`). Add new trigger types in the relic runner if needed.
- Optional: `acts` (array of act numbers) to restrict the relic to certain acts in the shop.

### 2. Add to shop pool

Add the relic id to `src/engine/data/shopPools.json` under the desired act’s `relics` array. Prices are set per act via `relicPriceMin` / `relicPriceMax`.

### 3. Meta unlocks (optional)

To gate the relic behind progression, add it to `meta.unlockedRelics` when the unlock condition is met (e.g. in an event outcome or after a boss). The bridge merges `unlockedRelics` with the act’s shop relics.

---

## Adding a new enemy

### 1. Define the enemy in JSON

Add an entry to `src/engine/data/enemies.json`:

```json
{
  "id": "my_enemy",
  "name": "My Enemy",
  "maxHp": 40,
  "size": "medium",
  "intents": [
    { "weight": 1, "intent": { "type": "attack", "value": 8 } },
    { "weight": 1, "intent": { "type": "block", "value": 6 } }
  ]
}
```

- **intents**: Weighted list. Intent types (e.g. `attack`, `block`, `debuff`, `vulnerable`) are resolved in combat; see enemy intent resolution in the codebase.
- Optional: `triggers` for behaviors like split-at-HP (see existing slime definitions).
- **size**: `"small"` | `"medium"` | `"large"` affects display scale only.

### 2. Create an encounter

Add an entry to `src/engine/data/encounters.json` that references one or more enemy ids:

```json
{ "id": "my_encounter", "enemies": ["my_enemy", "my_enemy"] }
```

### 3. Add encounter to act pool

In `src/engine/data/mapConfig.json`, add the encounter id to the act’s `encounterPool` (and optionally `encounterWeights`). For elites, add to `eliteEncounterPool` (and `eliteEncounterWeights` if used).

### 4. Enemy art (optional)

Add an image at `src/assets/combat/enemies/{enemyId}.png` (recommended ~240×310 px, bottom-centered). If missing, a procedural placeholder is used.

---

## Summary

| Content   | Data file(s)           | Pools / usage                                      |
|----------|------------------------|----------------------------------------------------|
| Card     | cards.json             | character.cardPoolIds, shopPools.act*.cards        |
| Relic    | relics.json            | shopPools.act*.relics, meta.unlockedRelics         |
| Enemy    | enemies.json           | —                                                  |
| Encounter| encounters.json        | mapConfig.act*.encounterPool, eliteEncounterPool   |

Reward and shop pools are **data-driven**: add ids to the right JSON arrays and ensure definitions exist; the bridge and engine use them without code changes. For new **effect types** or **relic trigger types**, implement the behavior once in the engine; then any number of cards/relics can use them via JSON.
