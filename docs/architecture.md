# Architecture overview

## Engine vs app

- **Engine** (`src/engine/`): Pure TypeScript. No Angular, no DOM. Handles run state, combat turns, card effects, map generation, encounters, rewards, shop, and events. Uses seeded RNG where relevant. Entry points: `run.ts`, `combat.ts`, `effectRunner.ts`, `map/mapGenerator.ts`, `loadData.ts`.
- **App** (`src/app/`): Angular 19 + PixiJS 8. Renders the main menu, the game view (combat and map), and overlays. Manages user input and calls the engine via `GameBridgeService`.

## Game state and bridge

- **GameBridgeService** (`src/app/services/game-bridge.service.ts`): Holds the current `GameState`, loads data (cards, enemies, encounters, map config, events, relics, potions, characters), and exposes methods that delegate to the engine (`startRun`, `playCard`, `endTurn`, `chooseNode`, `chooseReward`, etc.). Components never touch the engine directly.
- State is updated synchronously in the bridge; the UI subscribes via signals or getters and triggers redraws when needed.

## Combat and map rendering

- **CombatCanvasComponent** owns the PixiJS `Application`, resize, and the main game loop (ticker). It does not draw directly; it builds a **context** and calls:
  - **CombatViewRenderer** (`combat-view.renderer.ts`) for combat: player, hand, enemies, targeting arrow, floating numbers, banners.
  - **MapViewRenderer** (`map-view.renderer.ts`) for the run map: nodes, paths, selection.
- **Layout constants** live in `combat-canvas/constants/`: `combat-layout.constants.ts` (slots, hand arc, neon borders, etc.), `combat-timing.constants.ts` (durations, timeouts), `map-layout.constants.ts` (node size, path inset, spacing). A single **EnemyLayout** helper (`getEnemyLayout`) centralizes enemy positions for both renderers and the component.

## Where things live

| Concern | Location |
|--------|----------|
| Run/combat/map logic | `src/engine/` |
| State and engine API | `GameBridgeService` |
| Combat layout (positions, sizes) | `combat-layout.constants.ts`, `hand-layout.ts` |
| Map layout | `map-layout.constants.ts` |
| Combat drawing | `combat-view.renderer.ts` |
| Map drawing | `map-view.renderer.ts` |
| Asset loading (textures, VFX) | `CombatAssetsService`, `MapAssetsService`, `CardVfxService` |
| Audio | `SoundService` |
| User settings | `GameSettingsService`, `SettingsModalComponent` |

## Data and assets

- **Data** (cards, enemies, encounters, map config, etc.) is loaded from `src/engine/data/` (or `assets/data/`) via `loadData.ts` and the bridge’s `ensureDataLoaded()`.
- **Assets** (images, VFX, sounds) are under `src/assets/` and loaded on demand by the asset services. Map and combat backgrounds can be switched via config (e.g. per encounter).

## Performance (combat redraw)

- **Full redraw** runs when hand size changes, card hover/drag/return, active VFX, shield/shooting/slashing, or enemy hurt/dying animations. It clears the stage and calls `drawCombatView()` again.
- **Idle-only path:** When the only change is time (player and enemy idle animations), the ticker calls `updatePlayerAndEnemyTexturesOnly()` instead of a full redraw. The renderer passes sprite refs via `onPlayerSpriteCreated` and `onEnemySpriteCreated`; the component updates only `.texture` on those sprites. This keeps frame cost low during idle combat.
- **Coalescing:** At most one `doRedrawBody()` runs per animation frame. `redraw()` schedules a single `requestAnimationFrame`; further calls within the same frame set `redrawAgain` so one more pass runs after the current one finishes.

## Theming and localization

- **Theming:** Combat canvas uses CSS variables on the host: `--game-text-scale`, `--color-primary`, `--color-bg`, `--border-width`. Apply `theme-high-contrast` on the host for stronger borders and higher contrast. Additional theme classes can override these variables.
- **Localization:** User-facing strings are currently hardcoded in templates. To add i18n later, introduce a single layer (e.g. `{{ 'reward.title' | i18n }}` with a pipe or service that reads from locale JSON) and replace copy gradually.
