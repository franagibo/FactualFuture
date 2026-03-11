## Combat assets and slots

For adding new **cards**, **relics**, or **enemies** (data + assets), see **[data-pipelines.md](data-pipelines.md)**.

This project uses a **slots model** for the combat scene: the layout (positions/sizes) is fixed, and we swap sprites/PNGs in and out of those slots by id (character, enemy, card, etc.).

The authoritative layout lives in:

- `src/app/combat-canvas/constants/combat-layout.constants.ts`
  - `COMBAT_LAYOUT` – base ratios/sizes for player, enemies, hand/cards.
  - `getCombatSlotBounds(slotId, w, h)` – named slots for background, player, and HP text.

The combat renderer (`combat-view.renderer.ts`) uses these helpers so that **all placement comes from one place**.

---

## Paths and naming

All asset paths are relative to `src/assets`.

| Asset type        | Path pattern                                           | Notes |
| ----------------- | ------------------------------------------------------ | ----- |
| Combat background | `/assets/fight-location/{filename}`                     | Full-screen; recommend **1920×1080 px** (16∶9). Default: `background_fight2.png`. Per-enemy: add `"enemyId": "filename.png"` to `src/assets/data/fight-location.json`. |
| Player character (static) | `/assets/characters/{characterId}/{characterId}_static.png` | Default idle pose; used when not playing shield/shooting. If missing, first frame of shield sheet is used. |
| Player animations | `/assets/characters/{characterId}/{characterId}_shield.png`, `_shooting.png` | 6×6 sprite sheets for block and strike animations. |
| Enemies           | `/assets/combat/enemies/{enemyId}.png`                 | One PNG per enemy id; all are drawn into the same slot rect. |
| **Card image**    | `/assets/cards/{cardId}.png`                           | **Full card** (300×420 px display size). Name, cost, and effect text are overlaid. **Fallback:** `empty_card_template.png`. |
| **Card impact VFX** | `/assets/vfx/{vfxId}/spritesheet.png`                 | Optional. Horizontal strip spritesheet; one VFX per card when played (e.g. strike → explosion on enemy). See **Card VFX** below. |
| Map nodes         | `/assets/map/nodes/{type}.svg`                         | Used by the map view (combat, elite, rest, shop, event, boss). |
| Map background    | `/assets/map/map-bg.svg`                               | Used behind the map nodes/paths. |

The combat assets service (`CombatAssetsService`) is responsible for loading:

- **Fight backgrounds:** Config in `src/assets/data/fight-location.json` — `"default": "background_fight2.png"` and optional `"enemyId": "background_xyz.png"`. First enemy in the encounter is used as key; assets live under `/assets/fight-location/`. Cached per key.
- Character sheets (shield/shooting)
- Enemy textures
- Card art textures (`/assets/cards/{cardId}.png`)

**Card VFX** (impact effects when a card is played, e.g. on the enemy) are handled by `CardVfxService` and are fully data-driven:

- **Mapping:** `src/assets/data/card-vfx.json` — `{ "cardId": "vfxId" }`. Add an entry to give a card an impact VFX when played.
- **Manifest:** `src/assets/data/vfx-manifest.json` — for each `vfxId`: `frameCount`, `frameW`, `frameH`, `frameMs`, optional `scale`. Asset path is `/assets/vfx/{vfxId}/spritesheet.png` (horizontal strip).
- To add a new card VFX: (1) add the spritesheet under `src/assets/vfx/{vfxId}/spritesheet.png`, (2) add the entry to `vfx-manifest.json`, (3) add `"cardId": "vfxId"` to `card-vfx.json`. No code changes required.

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

The card image is the full card; the renderer draws it at card size and overlays cost, name, and effect text via `getCardArtTexture(cardId)` (or the empty_card_template fallback).

---

## Recommended dimensions and anchors

These sizes are *guidelines*; textures will be scaled to fit slots, but sticking to them keeps everything crisp and consistent.

- **Player/enemy characters**
  - Recommended: **240×310 px** (matches `playerPlaceholderW/H` and `enemyPlaceholderW/H`).
  - Anchor point: **bottom-center** for characters (the renderer positions sprites so the “feet” sit on the same baseline).

- **Card image**
  - The card image is the **full card** (display size: **300×420 px**). Name, cost, and effect text are drawn on top.
  - Recommended source size: **300×420 px** (or same aspect ratio). Leave space for cost (top-left), name, and effect text, or use full-bleed with good text contrast.
  - Reserve space in your template for overlaid text (cost, name, effect).

---

## Adding new assets

### New enemy

1. Add the enemy to `data/enemies.json` with a unique `id`, e.g. `laser_drone`.
2. Create `src/assets/combat/enemies/laser_drone.png` (≈240×310, bottom-centered).
3. No code changes required: the combat renderer calls `getEnemyTexture(id)` and will draw the sprite in the enemy slot if the texture exists; otherwise it falls back to a procedural placeholder.

### New card (with art)

1. Add the card definition to `data/cards.json` with id `my_new_card`.
2. Create `src/assets/cards/my_new_card.png` (recommended 300×420 px). The image is the full card; cost, name, and effect text are drawn on top.

### New character

1. Add a character to `data/characters.json` with `id`, `starterDeck`, `cardPoolIds`, etc.
2. Add:
   - `/assets/characters/{id}/{id}_shield.png`
   - `/assets/characters/{id}/{id}_shooting.png`
3. Use `{id}_static.png` for the default idle pose (recommended); otherwise the first frame of the shield sheet is used.

---

## Future extensions

The layout and assets are ready for:

- **Intent icons** – Replace the procedural intent graphics with small sprites under `/assets/combat/intents/` positioned where intent text is currently drawn.
- **Status icons** – Replace the text-based “Vuln/Weak” pills with small icons under `/assets/combat/status/` in the same slot.
- **VFX** – Add sprite-based projectiles and hit flashes using origin/target positions derived from the `player` and enemy slots in `COMBAT_LAYOUT`.

