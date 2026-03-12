# Next Steps Review — Performance, Layout, UI, Refactoring, Mechanics

A full review of where the Slay-the-Spire-like project stands and what to tackle next. Based on the current codebase (combat canvas, engine, services, docs).

---

## Done (implemented)

- **1.1** Idle-only update path: `updatePlayerAndEnemyTexturesOnly()`, sprite refs via `onPlayerSpriteCreated` / `onEnemySpriteCreated`.
- **1.2** One redraw per frame: `redrawScheduled` + `requestAnimationFrame` in `redraw()`.
- **1.3** Map/encounter preload: `getEnemyIdsForNextPossibleEncounters()`, preload kicked off when on map with next nodes.
- **2.1** Hand layout in settings: `handLayout` (default/compact), `reducedMotion`, `HandLayoutOptions` in `getHandLayout`, settings UI.
- **2.2** Safe areas: `env(safe-area-inset-*)` on `.canvas-wrap`.
- **3.1** Overlay panels: card art thumbnails and descriptions in reward/rest/shop.
- **3.2** Combat header: per-potion `getPotionIconUrl`, header collapse at max-height 640px.
- **3.3** Focus indicators, reduced-motion timing, high-contrast theme class.
- **3.4** Card tooltips in combat (hover popover with name + description).
- **4.2** Combat context grouped into `hand`, `player`, `enemies` sub-objects (optional; flat props kept for compatibility).
- **4.3** `hasAnimatedIdle(characterId)` and `animatedIdle` in character defs.
- **5.1** New encounters (e.g. sts_double_fungi, sts_three_small_slimes, sts_cultist_louse) in act1 pool.
- **5.2** Run seed in `GameState`, `getRunSeed()`, seed display in header, `startRun(characterId, seed?)`.
- **5.3** Intent `addStatus` in intent label; draw/discard preview (Deck X/Y + tooltip with top card).
- **6.1** effectRunner.spec.ts and run.spec.ts.
- **6.2** Performance subsection in architecture.md.

---

## 1. Performance

### 1.1 Combat redraw every frame (high impact)

**Current:** When the character is chibi or gungirl, the ticker sets `changed = true` every frame and the “full redraw” branch runs. That means:

- `doRedrawBody()` runs every frame in combat
- `stage.removeChildren()` + full `drawCombatView()` every tick
- All cards, player, enemies, hand layout, floating numbers, etc. are recreated each frame

**Impact:** Heavier than necessary for idle animation. The only thing that must update every frame is the **player texture** (idle frame index from time) and **enemy idle textures**. Everything else (cards, layout, overlays) is static until interaction.

**Next step:** Add a lightweight path that updates only what changes over time:

- **Option A:** `updatePlayerAndEnemyTexturesOnly()` — keep existing stage tree, walk to player sprite and each enemy sprite, update `.texture` from `getPlayerTexture(now)` / `getEnemyAnimationTexture(..., 'idle', now)`.
- **Option B:** Keep one full redraw per frame but make it cheaper: reuse card containers and only update transforms (like `updateHandHoverOnly()`), and only replace the player/enemy sprite textures instead of rebuilding the whole combat scene.

Recommendation: implement **Option A** so that when the only “change” is time (idle animations), the ticker calls this lightweight update instead of `redraw()`. Full redraw stays for hand size change, hover, drag, returning card, VFX, etc.

### 1.2 Redraw coalescing and async

**Current:** `redraw()` is coalesced (re-entrant guard + `redrawAgain`), and `doRedrawBody()` is async (e.g. `await loadCombatAssets`). Multiple rapid triggers (e.g. hover + ticker) can still schedule many `doRedraw()` runs.

**Next step:** Ensure at most one redraw per frame (e.g. `requestAnimationFrame` + a single “pending redraw” flag) so that during heavy interaction you don’t run multiple full redraws in one frame.

### 1.3 Map and asset loading

**Current:** Map textures load asynchronously; combat assets load before combat draw. No obvious waste, but preloading or caching of commonly used assets (e.g. next encounter’s enemies) could reduce hitches when entering combat.

**Next step:** Lower priority. Consider preloading next node’s encounter when the player is one step away, or after combat win before showing reward.

---

## 2. Layout

### 2.1 Hand layout (recently improved)

**Current:** Arc-based hand with `getHandLayout`, tighter fan when fewer cards (`cardCountScale`), hover spread, and lerped positions. Layout constants live in `combat-layout.constants.ts` and `hand-layout.ts`.

**Possible tweaks:**

- Expose hand constants (e.g. `hoverLift`, `baseFanAngleDeg`) to game settings for accessibility (e.g. “reduced motion” or “compact hand”).
- Very small screens: ensure minimum touch targets and that the hand doesn’t clip (already responsive via `w`, `h`).

### 2.2 Combat and map layout

**Current:** Single source of truth in layout constants; `getEnemyLayout`, `getCombatSlotBounds`, `getHandLayout` keep positions consistent. Map layout in `map-layout.constants.ts`.

**Next step:** No urgent layout refactor. If you add new UI (e.g. discard pile preview, potion bar in combat), add new constants and reuse the same pattern (layout helpers + renderer reads from them).

### 2.3 Responsiveness and safe areas

**Current:** Layout uses ratios and `app.screen.width` / `height`. No explicit safe-area or notches handling.

**Next step:** If you target mobile or odd aspect ratios, consider safe-area insets and/or max dimensions so the hand and header don’t sit under notches or system UI.

---

## 3. UI

### 3.1 Overlay panels (reward, rest, shop, event)

**Current:** Overlays are in `combat-canvas.component.html` with `@if (runPhaseSignal() === 'reward')` etc. Styling in `combat-canvas.component.scss`. Functional but fairly minimal (e.g. reward is a list of card names/buttons).

**Improvements:**

- **Reward panel:** Show card art thumbnails and short description/tooltip (reuse `getCardEffectDescription` / tooltip pattern) so the choice is clearer.
- **Shop:** Same idea: card/relic art and clearer pricing; optional “sell” or “leave” emphasis.
- **Rest panel:** Same: card list with tooltips; optional “heal amount” display.
- **Events:** Text + choices are there; could add simple illustrations or icons per event.

### 3.2 Combat header and potions

**Current:** Header shows character name, HP, gold, potions (same icon for all), level. Potion use is a button per slot with tooltip.

**Improvements:**

- Potion icons: use per-potion art from data (e.g. `potions.json` + asset path) instead of a single icon.
- Header on small height: consider collapsing to icons + numbers or a single row to avoid overlapping the canvas.

### 3.3 Feedback and accessibility

**Current:** `feedbackMessage` toast, `aria-label` on buttons, `role="img"` and `aria-label` on canvas. No formal “reduced motion” or high-contrast mode.

**Next steps:**

- Ensure all interactive elements (cards, nodes, buttons) have focusable and visible focus indicators.
- Optional: respect `prefers-reduced-motion` (e.g. disable or shorten card fly, floating numbers, map reveal).
- Optional: high-contrast or “simple” theme (e.g. stronger borders, less glow).

### 3.4 Card tooltips and descriptions

**Current:** `getCardTooltip(cardId)` and `getCardEffectDescription` exist; tooltips are `title` and likely used in reward/shop/rest. In-hand card text is drawn in Pixi (combat-view.renderer).

**Next step:** If card text in combat is hard to read (e.g. small font, low contrast), consider a dedicated tooltip popover on hover (HTML overlay) with full description, or increase font size / contrast in Pixi.

---

## 4. Refactoring

### 4.1 CombatCanvasComponent size (~1466 lines)

**Current:** One large component owns: Pixi init/resize, game state sync, map/combat phase branching, redraw scheduling, hover/drag/return state, card play flow, floating numbers, overlay signals, and all user callbacks. It’s the single place that knows about both map and combat.

**Next steps:**

- **Extract “combat controller”:** Move combat-only state and logic (e.g. `cardInteractionState`, `hoveredCardIndex`, `spreadLerp`, `hoverLerp`, `resolveHover`, `onCardPointerDown`, `runCardFlyThenPlay`, returning card, floating numbers) into a dedicated service or a small “combat state” class. The component would delegate to it and only own “which phase” and “when to redraw.”
- **Extract “map controller”:** Similarly, move map-specific state (e.g. `hoveredNodeId`, `mapContentHeight`, `mapReady`, node choice) into a service or helper. Component stays the single owner of the Pixi `Application` and the decision “map vs combat vs overlay.”
- **Keep renderers as-is:** `CombatViewRenderer` and `MapViewRenderer` are already separate; they can keep receiving a context from the component (or from the new controllers). The gain is in shrinking the component and clarifying responsibilities.

### 4.2 Combat view context and buildCombatContext

**Current:** `buildCombatContext` is a large object literal with many callbacks and getters. Any new combat feature tends to add more fields.

**Next step:** Group related fields into sub-objects (e.g. `hand: { hoveredCardIndex, cardInteractionState, getHandLayout, spreadLerp, hoverLerp, ... }`, `player: { getPlayerTexture, ... }`, `enemies: { ... }`) so the context shape is easier to extend and the renderer’s parameter list is clearer.

### 4.3 Duplication and constants

**Current:** Some magic numbers or repeated logic (e.g. “is chibi or gungirl” in a couple of places). Layout and timing are already centralized in constants.

**Next step:** If you add more characters with idle animations, replace ad-hoc `state.characterId === 'chibi' || state.characterId === 'gungirl'` with a small helper (e.g. `hasAnimatedIdle(characterId)`) or a flag on character definitions, so the ticker and redraw logic don’t depend on explicit IDs.

---

## 5. Game mechanics

### 5.1 Engine and content

**Current:** Engine supports multi-enemy encounters, intents, status effects (weak, vulnerable, etc.), relics, potions, events, map, acts. Data-driven cards, enemies, encounters, events. Good base for variety.

**Next steps (from roadmap and data):**

- **Encounters:** Add more encounter definitions (multi-mob, boss + adds) in `encounters.json` and assign them to act pools so runs feel more varied.
- **Balance:** Tune numbers in `game-balance.constants.ts` and in data (e.g. potion drop chance, card rewards, shop prices). Consider per-act scaling (e.g. enemy HP/damage by floor).
- **New cards/relics/potions:** Add a few at a time; ensure they’re in the right pools (reward, shop, unlocks) and that effect types in `effectRunner` support them.

### 5.2 Run progression and meta

**Current:** Unlocks (Act 2, victory), run save, meta (unlocks, stats). Gold and shop work.

**Next steps:**

- **Save/load:** If not already robust, add tests or manual checks for: save at map, at combat, at reward/shop/event; load and resume correctly; no duplicate state or stuck phase.
- **Seeded runs:** Engine uses RNG; if you want “daily run” or shareable seeds, expose seed in UI and pass it through `startRun` and map generation so the run is reproducible.

### 5.3 Missing or partial mechanics

**Current:** Exhaust, draw, discard, block, damage, intents, multi-enemy, relics, potions are in. Some StS-like mechanics may be missing or simplified.

**Ideas (optional):**

- **Draw pile / discard pile preview:** Button or hover to show “next card” or “discard pile count” (engine already has the state; only UI).
- **Intent clarification:** Some intents already show value; ensure “add status” intents (e.g. “add Dazed to draw”) are visible in intent UI if you want that clarity.
- **Boss mechanics:** If bosses have special behavior, encode it in enemy defs or a small “boss phase” in combat and reflect it in the UI.

---

## 6. Other

### 6.1 Tests

**Current:** `combat.spec.ts` and `mapGenerator.spec.ts` in the engine. No tests for the Angular app or the combat canvas.

**Next steps:**

- Add a few engine tests for `effectRunner` (e.g. damage, block, strength, weak, vulnerable) and for `run.ts` (e.g. `chooseNode`, `afterCombatWin`, reward, shop) so refactors don’t break core logic.
- Optional: integration or E2E test that starts a run, plays a card, ends turn, and checks state (e.g. enemy HP). Heavy to maintain but useful for big changes.

### 6.2 Docs and roadmap

**Current:** `architecture.md`, `combat-assets.md`, `card-hand-ui-plan.md`, `roadmap-sci-fi-content-variety.md`, `difficulty-bands.md`, `data-pipelines.md`. Good for onboarding and content planning.

**Next step:** After doing the “idle-only” performance path, add a short note in `architecture.md` or a `performance.md` describing: full redraw vs lightweight texture-only update, and when each runs.

### 6.3 Tooling and build

**Current:** Angular 19, PixiJS 8, Electron; engine built separately; Vitest for engine.

**Next step:** If you add more engine tests or app tests, ensure CI runs them (e.g. GitHub Actions) and that `npm run build:ng` and `npm run build:engine` both pass before release.

### 6.4 Localization and theming

**Current:** Copy and labels are in English; theme is sci-fi (neon, blue/orange, etc.) in SCSS and layout.

**Next step:** If you ever need i18n, keep user-facing strings in a single layer (e.g. keys in template + JSON per language). Theming can be done via CSS variables (you already have `--game-text-scale`); you could add more variables for colors and switch a “theme” class.

---

## Suggested priority order

1. **Performance (idle-only update)** — Implement a texture-only update path so combat doesn’t full-redraw every frame for idle animations. High impact, contained change.
2. **Refactor (combat state)** — Extract combat interaction and animation state from `CombatCanvasComponent` into a dedicated service or controller. Makes the next features easier.
3. **UI (reward/shop/rest)** — Add card/relic art and clearer descriptions in overlays so choices are easier to understand.
4. **Game mechanics (content)** — Add encounters and balance passes; optional new cards/relics; ensure save/load and seeds if you care about replayability.
5. **Accessibility and polish** — Focus states, optional reduced motion, potion icons, tooltips.
6. **Tests and CI** — More engine tests and, if needed, one simple E2E flow.

Use this as a living checklist: tick items as you go and add new items under the same sections when you discover them.
