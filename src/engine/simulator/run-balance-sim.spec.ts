/**
 * Balance simulation script. Run with:
 *   npx vitest run src/engine/simulator/run-balance-sim.spec.ts
 * Or: npm run sim
 *
 * Optional env: SIM_CHARACTER, SIM_N, SIM_SEED, SIM_SEED_FILE, BALANCE_BASELINE_OUT.
 * If SIM_SEED_FILE is set (path to JSON array of seeds), use those seeds for reproducible balance runs.
 * If BALANCE_BASELINE_OUT is set, run with the learned bot (tuned policy) and write results there;
 *   run "npm run bot:full" first to train and export the learned policy.
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

function loadSeedList(): number[] | null {
  const seedFile = process.env['SIM_SEED_FILE'];
  if (!seedFile || !seedFile.trim()) return null;
  const filePath = path.isAbsolute(seedFile) ? seedFile : path.join(process.cwd(), seedFile);
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Array.isArray(data) ? (data as number[]) : null;
}

describe('run-balance-sim (script)', () => {
  it('runs simulation with real data and logs metrics', () => {
    const seedList = loadSeedList();
    const characterId = process.env['SIM_CHARACTER'] ?? 'gungirl';
    const N = seedList
      ? seedList.length
      : Math.max(1, parseInt(process.env['SIM_N'] ?? '100', 10));
    const seedBase =
      process.env['SIM_SEED'] !== undefined && process.env['SIM_SEED'] !== ''
        ? parseInt(process.env['SIM_SEED'], 10)
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
      act1: mapConfigData['act1'] as SimulatorOptions['mapConfig']['act1'],
      act2: mapConfigData['act2'] as SimulatorOptions['mapConfig']['act2'],
      act3: mapConfigData['act3'] as SimulatorOptions['mapConfig']['act3'],
    };

    const baselineOut = process.env['BALANCE_BASELINE_OUT'];
    const useLearnedBotForBaseline = Boolean(baselineOut && baselineOut.trim());
    let learnedPolicyConfig: SimulatorOptions['learnedPolicyConfig'];

    if (useLearnedBotForBaseline) {
      const characterIdForPolicy = process.env['SIM_CHARACTER'] ?? 'gungirl';
      const policyJsonPath =
        process.env['POLICY_JSON'] && process.env['POLICY_JSON'].trim().length > 0
          ? path.resolve(process.cwd(), process.env['POLICY_JSON'])
          : path.resolve(process.cwd(), 'bot-training', `learned-policy-${characterIdForPolicy}.json`);
      if (!fs.existsSync(policyJsonPath)) {
        throw new Error(
          `Learned policy not found at ${policyJsonPath}. Run "npm run bot:full" first to train and export the policy, then run balance:baseline.`
        );
      }
      learnedPolicyConfig = JSON.parse(fs.readFileSync(policyJsonPath, 'utf-8'));
      console.log(`\nBaseline will use learned bot (policy: ${path.basename(policyJsonPath)}).\n`);
    }

    const simOptions: SimulatorOptions = {
      characterId,
      charactersMap,
      mapConfig,
      cardsMap,
      enemyDefs,
      encountersMap,
      relicDefs: relicDefs.size ? relicDefs : undefined,
      eventPool,
      rewardCardPool,
      ...(useLearnedBotForBaseline && learnedPolicyConfig
        ? { useLearnedPolicyBot: true, learnedPolicyConfig }
        : {}),
    };

    console.log(
      seedList
        ? `\nRunning ${N} simulations for "${characterId}" (seeds from ${process.env['SIM_SEED_FILE']})...\n`
        : `\nRunning ${N} simulations for "${characterId}" (seeds ${seedBase}..${seedBase + N - 1})...\n`
    );

    const start = Date.now();
    const { runs, winRate, avgFloorReached, avgHpAfterFirstCombat } = runSimulation(
      simOptions,
      N,
      seedBase,
      undefined,
      seedList ?? undefined
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

    if (baselineOut && baselineOut.trim()) {
      const outPath = path.isAbsolute(baselineOut) ? baselineOut : path.join(process.cwd(), baselineOut);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            bot: 'learned',
            winRate,
            avgFloorReached,
            avgHpAfterFirstCombat,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
      console.log(`Baseline snapshot (learned bot) written to ${outPath}\n`);
    }

    expect(winRate).toBeGreaterThanOrEqual(0);
    expect(winRate).toBeLessThanOrEqual(1);
    expect(runs.length).toBe(N);
  });
});
