# Slay the Spire Like

A Slay-the-Spire–style deck-builder: run-based map, combat, rewards, and shop. Built with **Angular 19**, **PixiJS 8**, and **Electron**.

## Run the game

- **Browser:** `npm run start:ng` then open the URL (e.g. http://localhost:4200).
- **Electron:** `npm run electron:dev` (builds Angular in watch mode and launches the desktop app).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:ng` | Serve the Angular app in the browser |
| `npm run build:ng` | Build the Angular app |
| `npm run build:engine` | Build the pure TypeScript game engine |
| `npm run test:engine` | Run engine tests (Vitest) |
| `npm run electron:dev` | Run Electron app with Angular watch |
| `npm run build:electron` | Full build for Electron distribution |

## Project layout

- **`src/engine/`** – Pure TypeScript game logic (no Angular): run state, combat, effects, map generation, data loading.
- **`src/app/`** – Angular UI: main menu, combat/map canvas (PixiJS), settings, services.
- **`docs/`** – Design notes, roadmaps, and asset documentation.

See [docs/architecture.md](docs/architecture.md) for a short architecture overview.
