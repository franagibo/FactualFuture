/**
 * Balance simulation script. Run with:
 *   npx vitest run src/engine/simulator/run-balance-sim.spec.ts
 * Or: npm run sim
 *
 * Optional env or args: SIM_CHARACTER, SIM_N, SIM_SEED (via env), or pass no args for defaults.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runSimulation } from './runSimulator';
import type { SimulatorOptions } from './runSimulator';
import { loadCards, loadEnemies, loadEncounters, loadCharacters, loadRelics, loadEvents } from '../loadData';
import type { CardDef } from '../cardDef';
import type { EnemyDef, EncounterDef, EventDef, RelicDef } from '../loadData';
import type { CharacterDef } from '../loadData';

const dataDir = path.join(process.cwd(), 'src', 'engine', 'data');

function loadJson<T>(file: string): T {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing data file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

describe('run-balance-sim (script)', () => {
  it('runs simulation with real data and logs metrics', () => {
    const characterId = process.env.SIM_CHARACTER ?? 'gungirl';
    const N = Math.max(1, parseInt(process.env.SIM_N ?? '100', 10));
    // Use random seed base when SIM_SEED not set so each script run gets different results
    const seedBase =
      process.env.SIM_SEED !== undefined && process.env.SIM_SEED !== ''
        ? parseInt(process.env.SIM_SEED, 10)
        : Math.floor(Math.random() * 0x7fffffff);

    const cardsData = loadJson<CardDef[]>('cards.json');
    const enemiesData = loadJson<EnemyDef[]>('enemies.json');
    const encountersData = loadJson<EncounterDef[]>('encounters.json');
    const charactersData = loadJson<CharacterDef[]>('characters.json');
    const mapConfigData = loadJson<Record<string, unknown>>('mapConfig.json');
    let relicsData: RelicDef[] = [];
    let eventsData: EventDef[] = [];
    try {
      relicsData = loadJson<RelicDef[]>('relics.json');
    } catch {
      // optional
    }
    try {
      eventsData = loadJson<EventDef[]>('events.json');
    } catch {
      // optional
    }

    const cardsMap = loadCards(cardsData);
    const enemyDefs = loadEnemies(enemiesData);
    const encountersMap = loadEncounters(encountersData);
    const charactersMap = loadCharacters(charactersData);
    const relicDefs = loadRelics(relicsData);
    const eventPool = loadEvents(eventsData);

    const character = charactersMap.get(characterId);
    const poolIds = character?.cardPoolIds?.filter((id) => cardsMap.has(id));
    const rewardCardPool = poolIds?.length ? poolIds : Array.from(cardsMap.keys()).slice(0, 30);

    const mapConfig = {
      act1: mapConfigData.act1 as SimulatorOptions['mapConfig']['act1'],
      act2: mapConfigData.act2 as SimulatorOptions['mapConfig']['act2'],
      act3: mapConfigData.act3 as SimulatorOptions['mapConfig']['act3'],
    };

    console.log(`\nRunning ${N} simulations for "${characterId}" (seeds ${seedBase}..${seedBase + N - 1})...\n`);

    const start = Date.now();
    const { runs, winRate, avgFloorReached, avgHpAfterFirstCombat } = runSimulation(
      {
        characterId,
        charactersMap,
        mapConfig,
        cardsMap,
        enemyDefs,
        encountersMap,
        relicDefs: relicDefs.size ? relicDefs : undefined,
        eventPool,
        rewardCardPool,
      },
      N,
      seedBase
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const wins = runs.filter((r) => r.result === 'win').length;
    const losses = N - wins;
    const avgCombats = runs.reduce((s, r) => s + r.combats.length, 0) / N;
    const deathsByFloor: Record<number, number> = {};
    runs.filter((r) => r.result === 'lose').forEach((r) => {
      const f = r.floorReached ?? 0;
      deathsByFloor[f] = (deathsByFloor[f] ?? 0) + 1;
    });

    console.log('--- Results ---');
    console.log(`Win rate:        ${(winRate * 100).toFixed(1)}% (${wins} wins, ${losses} losses)`);
    console.log(`Avg floor:       ${avgFloorReached.toFixed(1)}`);
    console.log(`Avg HP after 1st combat: ${avgHpAfterFirstCombat.toFixed(1)}`);
    console.log(`Avg combats/run: ${avgCombats.toFixed(1)}`);
    if (Object.keys(deathsByFloor).length > 0) {
      console.log('Deaths by floor:', JSON.stringify(deathsByFloor));
    }
    console.log(`\nCompleted in ${elapsed}s\n`);

    expect(winRate).toBeGreaterThanOrEqual(0);
    expect(winRate).toBeLessThanOrEqual(1);
    expect(runs.length).toBe(N);
  });
});
