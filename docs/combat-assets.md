## Combat assets and slots

For adding new **cards**, **relics**, or **enemies** (data + assets), see **[data-pipelines.md](data-pipelines.md)**.

This project uses a **slots model** for the combat scene: the layout (positions/sizes) is fixed, and we swap sprites/PNGs in and out of those slots by id (character, enemy, card, etc.).

The authoritative layout lives in:

- `src/app/combat-canvas/constants/combat-layout.constants.ts`
  - `COMBAT_LAYOUT` – base ratios/sizes for player, enemies, hand/cards.
  - `getCombatSlotBounds(slotId, w, h)` – named slots for background, player, and HP text.
  - `getCardArtRect(cardWidth, cardHeight)` – shared rect for card art on every card.

The combat renderer (`combat-view.renderer.ts`) uses these helpers so that **all placement comes from one place**.

---

## Paths and naming

All asset paths are relative to `src/assets`.

| Asset type        | Path pattern                                           | Notes |
| ----------------- | ------------------------------------------------------ | ----- |
| Combat background | `/assets/combat/combat-bg.jpg`                         | One per environment/act (currently a single texture). |
| Player character  | `/assets/characters/{characterId}/{characterId}_idle.png` | Idle / default pose; same baseline as shield/shooting sheets. |
| Player animations | `/assets/characters/{characterId}/{characterId}_shield.png`, `_shooting.png` | 6×6 sprite sheets; frame 0 is used as static pose. |
| Enemies           | `/assets/combat/enemies/{enemyId}.png`                 | One PNG per enemy id; all are drawn into the same slot rect. |
| **Card art**      | `/assets/cards/{cardId}.png`                           | One image per card id; drawn into the shared card art rect. |
| Map nodes         | `/assets/map/nodes/{type}.svg`                         | Used by the map view (combat, elite, rest, shop, event, boss). |
| Map background    | `/assets/map/map-bg.svg`                               | Used behind the map nodes/paths. |

The combat assets service (`CombatAssetsService`) is responsible for loading:

- `combat-bg.jpg`
- Character sheets (shield/shooting)
- Enemy textures
- Card art textures (`/assets/cards/{cardId}.png`)

---

## Slot definitions (combat view)

Slots are **logical regions** in the combat view:

| Slot ID         | Purpose                | Notes |
| --------------- | ---------------------- | ----- |
| `combatBg`      | Full-screen background | Entire Pixi screen. |
| `player`        | Player character       | Left side; width/height from `COMBAT_LAYOUT`. |
| `hpBlockEnergy` | HP/Block/Energy text   | Centered below the player. |

Per-enemy and per-card positions (enemy rectangles, hand arc, card positions) are computed in the renderer from `COMBAT_LAYOUT` so that:

- All enemies share the same width/height and spacing.
- The hand is always centered and laid out as an arc.

For card art there is a single shared rect:

- `getCardArtRect(cardWidth, cardHeight)` returns `{ x, y, width, height }` for the art area.
- The renderer draws a solid background for this rect and then (if available) a sprite from `getCardArtTexture(cardId)`.

---

## Recommended dimensions and anchors

These sizes are *guidelines*; textures will be scaled to fit slots, but sticking to them keeps everything crisp and consistent.

- **Player/enemy characters**
  - Recommended: **240×310 px** (matches `playerPlaceholderW/H` and `enemyPlaceholderW/H`).
  - Anchor point: **bottom-center** for characters (the renderer positions sprites so the “feet” sit on the same baseline).

- **Card art**
  - Rect is roughly: `x = 8`, `y = 48`, `width = cardWidth - 16`, `height ≈ 50` (see `getCardArtRect`).
  - Recommended source size: **84×50 px** (or any 5:3-ish ratio). The renderer scales to the slot.
  - Keep important details inside a **safe zone** with some padding so rounded corners don’t clip them.

---

## Adding new assets

### New enemy

1. Add the enemy to `data/enemies.json` with a unique `id`, e.g. `laser_drone`.
2. Create `src/assets/combat/enemies/laser_drone.png` (≈240×310, bottom-centered).
3. No code changes required: the combat renderer calls `getEnemyTexture(id)` and will draw the sprite in the enemy slot if the texture exists; otherwise it falls back to a procedural placeholder.

### New card (with art)

1. Add the card definition to `data/cards.json` with id `my_new_card`.
2. Create `src/assets/cards/my_new_card.png` (≈84×50 or similar ratio).
3. The combat view will:
   - Draw the usual card background, cost, and name.
   - Draw the shared art rect and then your `my_new_card.png` inside it if present.

### New character

1. Add a character to `data/characters.json` with `id`, `starterDeck`, `cardPoolIds`, etc.
2. Add:
   - `/assets/characters/{id}/{id}_shield.png`
   - `/assets/characters/{id}/{id}_shooting.png`
3. The first frame from the shield sheet is used as the idle pose; future work can add explicit `{id}_idle.png`.

---

## Future extensions

The layout and assets are ready for:

- **Intent icons** – Replace the procedural intent graphics with small sprites under `/assets/combat/intents/` positioned where intent text is currently drawn.
- **Status icons** – Replace the text-based “Vuln/Weak” pills with small icons under `/assets/combat/status/` in the same slot.
- **VFX** – Add sprite-based projectiles and hit flashes using origin/target positions derived from the `player` and enemy slots in `COMBAT_LAYOUT`.

