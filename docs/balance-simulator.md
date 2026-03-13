# Balance Simulator

The engine includes a **run simulator** that plays many runs with a **strategy bot** and **seeded RNG** to produce consistent, reproducible metrics. Use it to check balance (e.g. win rate, HP curve) and to validate new characters.

## What it does

- **Deterministic runs**: Same character + seed always gives the same outcome (map, encounters, deck order, enemy intents).
- **Strategy-aware bot**: The bot prefers blocking when enemies attack, applying vulnerable before big attacks, and focusing the lowest-HP enemy.
- **Metrics**: Per run (win/lose, floor reached, HP and damage per combat) and aggregates (win rate, average floor, average HP after first combat).

## How to run it

### Script (recommended)

From the project root:

```bash
npm run sim
```

This runs 100 simulations for **gungirl** with a **random seed base** each time, so repeated runs give different (more realistic) results.

**Custom character, run count, or seed:** set env vars before running:

```bash
# 50 runs for gunboy, seeds starting at 1000
SIM_CHARACTER=gunboy SIM_N=50 SIM_SEED=1000 npm run sim

# Reproducible run (same seeds every time)
SIM_SEED=42 npm run sim
```

Or run the spec file directly with vitest:

```bash
npx vitest run src/engine/simulator/run-balance-sim.spec.ts --reporter=verbose
```

### From code

```ts
import { runSimulation, singleRun } from './engine/simulator/runSimulator';
import { loadCards, loadEnemies, loadEncounters, loadCharacters } from './engine/loadData';
// Load your mapConfig, cards, enemies, encounters, characters (e.g. from JSON).

const options = {
  characterId: 'gungirl',
  charactersMap,
  mapConfig,   // Record<string, ActConfigEncounter & ActConfig>
  cardsMap,
  enemyDefs,
  encountersMap,
  relicDefs,   // optional
  rewardCardPool: [...],  // e.g. character card pool
  eventPool: [],
  shopPool: undefined,
};

const { runs, winRate, avgFloorReached, avgHpAfterFirstCombat } = runSimulation(options, 100, 0);
console.log('Win rate', winRate, 'Avg floor', avgFloorReached, 'Avg HP after 1st combat', avgHpAfterFirstCombat);
```

### Single run (reproducible)

```ts
const metrics = singleRun(seed, options);
// metrics.result === 'win' | 'lose', metrics.combats[], metrics.finalHp, metrics.floorReached
```

## Options

- **characterId** + **charactersMap**: Load starter deck, starting HP, and starter relic from the character definition.
- Or pass **starterDeck**, **startingMaxHp**, **starterRelicId** explicitly (e.g. for testing or custom builds).
- **mapConfig**: Must have `act1` (and optionally `act2`) with `floorCount`, `typeWeights`, `encounterPool`, `encounterWeights`, `bossEncounter`, `firstThreeEncounterPool`, `firstThreeEncounterWeights`, etc. (same shape as `mapConfig.json`).
- **rewardCardPool**: Card IDs offered after combat (and at treasure). Use the character’s card pool for realistic runs.

## Interpreting metrics

- **Win rate**: Fraction of runs that reach victory. Use as a high-level balance check (e.g. aim for a band like 0.4–0.7 for Act 1 if you tune for that).
- **Avg HP after first combat**: If this is too low, early encounters or player HP might need tuning; if too high, early game might be too easy.
- **Per-run combats**: Each `CombatMetrics` has `encounterId`, `win`, `turns`, `hpStart`, `hpEnd`, `damageTaken`. Use to spot encounters that are too harsh or too easy.

## New characters

1. Add the character to `characters.json` (starter deck, `startingMaxHp`, `starterRelicId` if any).
2. Run the simulator with `characterId: 'new_char'` and `charactersMap` loaded from `characters.json`.
3. Compare win rate and HP curve to a baseline (e.g. gungirl). Adjust starter deck, HP, or encounter data until metrics sit in the desired range.

## Balance testing (before/after build comparison)

To compare balance **before and after** card or encounter changes, use a **fixed seed list** so both runs use the same seeds.

1. **Reproducible baseline**
   - Use the provided seed file: `scripts/balance-seeds.json` (500 seeds).
   - Run the sim with that file and record metrics:
     ```bash
     SIM_SEED_FILE=scripts/balance-seeds.json npm run sim
     ```
   - With `SIM_SEED_FILE` set, `SIM_N` is ignored and the number of runs equals the length of the seed array (e.g. 500). Record **win rate** and **avg floor** (and optionally avg HP after first combat).

2. **After a change**
   - Make your card/balance changes, then run the **same** command:
     ```bash
     SIM_SEED_FILE=scripts/balance-seeds.json npm run sim
     ```
   - Compare win rate and avg floor to the baseline. Same seeds → comparable stats.

3. **Learned bot for balance**
   - If you use the learned policy bot for balance testing (`npm run sim:learned` or `useLearnedPolicyBot: true`), **retrain** the model after card or balance changes so the policy matches the new game. For before/after comparison, use either the same heuristic bot for both runs or the same trained policy for both.

4. **Optional baseline snapshot (learned bot)**
   - Run `npm run balance:baseline` to run the sim with the **learned bot** on the fixed seed file and write results to `data/balance-baseline.json` (win rate, avg floor, timestamp). This reflects how the tuned policy performs on the build. Run `npm run bot:full` first to train and export the learned policy. After card/balance changes, retrain if needed, then run `balance:baseline` again and compare the file.

## Seeded RNG

The simulator uses `createSeededRng(seed)` from `engine/rng`. When you pass `rng` in `startRun` options (or rely on `state._simRng`), all randomness in that run (deck shuffle, encounter pick, enemy intents, draw order) is deterministic. Normal play does not set `_simRng`, so the live game is unchanged.
