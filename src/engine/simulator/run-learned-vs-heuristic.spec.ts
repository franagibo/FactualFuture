/**
 * Compare heuristic vs learned policy bots on identical seeds.
 *
 * Run with:
 *   npx vitest run src/engine/simulator/run-learned-vs-heuristic.spec.ts
 *
 * Optional env:
 *   SIM_CHARACTER  (default "gungirl")
 *   SIM_N          (default 100)
 *   SIM_SEED       (default random)
 *   SIM_SEED_FILE  (path to JSON array of seeds for reproducible comparison)
 *   POLICY_JSON    (default "bot-training/learned-policy-gungirl.json")
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

describe('run-learned-vs-heuristic (script)', () => {
  it('runs heuristic vs learned policy and logs metrics', () => {
    const env = process.env as Record<string, string | undefined>;
    const seedList = loadSeedList();

    const characterId = env['SIM_CHARACTER'] ?? 'gungirl';
    const N = seedList
      ? seedList.length
      : Math.max(1, parseInt(env['SIM_N'] ?? '100', 10));
    const seedBase =
      env['SIM_SEED'] !== undefined && env['SIM_SEED'] !== ''
        ? parseInt(env['SIM_SEED'], 10)
        : Math.floor(Math.random() * 0x7fffffff);

    const policyJsonPath =
      env['POLICY_JSON'] && env['POLICY_JSON'].trim().length > 0
        ? path.resolve(process.cwd(), env['POLICY_JSON'])
        : path.resolve(process.cwd(), 'bot-training', `learned-policy-${characterId}.json`);

    if (!fs.existsSync(policyJsonPath)) {
      throw new Error(
        `Learned policy JSON not found at ${policyJsonPath}. Run bot-training/export_weights.py first.`
      );
    }
    // This should match LearnedPolicyConfig shape: { weights: { W1, b1, ... } }
    const learnedPolicyConfig = JSON.parse(fs.readFileSync(policyJsonPath, 'utf-8'));

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

    console.log(
      seedList
        ? `\nRunning ${N} simulations for "${characterId}" (seeds from ${env['SIM_SEED_FILE']}) with heuristic vs learned bots...\n`
        : `\nRunning ${N} simulations for "${characterId}" (seeds ${seedBase}..${seedBase + N - 1}) with heuristic vs learned bots...\n`
    );

    const baseOptions: SimulatorOptions = {
      characterId,
      charactersMap,
      mapConfig,
      cardsMap,
      enemyDefs,
      encountersMap,
      relicDefs: relicDefs.size ? relicDefs : undefined,
      eventPool,
      rewardCardPool,
    };

    const startHeuristic = Date.now();
    const heuristicResult = runSimulation(
      baseOptions,
      N,
      seedBase,
      undefined,
      seedList ?? undefined
    );
    const heuristicElapsed = ((Date.now() - startHeuristic) / 1000).toFixed(1);

    const startLearned = Date.now();
    const learnedResult = runSimulation(
      {
        ...baseOptions,
        useLearnedPolicyBot: true,
        learnedPolicyConfig,
      },
      N,
      seedBase,
      undefined,
      seedList ?? undefined
    );
    const learnedElapsed = ((Date.now() - startLearned) / 1000).toFixed(1);

    const heuristicWins = heuristicResult.runs.filter((r) => r.result === 'win').length;
    const learnedWins = learnedResult.runs.filter((r) => r.result === 'win').length;

    console.log('--- Heuristic bot ---');
    console.log(
      `Win rate:        ${(heuristicResult.winRate * 100).toFixed(1)}% (${heuristicWins} wins, ${
        N - heuristicWins
      } losses)`
    );
    console.log(`Avg floor:       ${heuristicResult.avgFloorReached.toFixed(1)}`);
    console.log(
      `Avg HP after 1st combat: ${heuristicResult.avgHpAfterFirstCombat.toFixed(1)}`
    );
    console.log(`Elapsed:         ${heuristicElapsed}s`);

    console.log('\n--- Learned bot ---');
    console.log(
      `Win rate:        ${(learnedResult.winRate * 100).toFixed(1)}% (${learnedWins} wins, ${
        N - learnedWins
      } losses)`
    );
    console.log(`Avg floor:       ${learnedResult.avgFloorReached.toFixed(1)}`);
    console.log(
      `Avg HP after 1st combat: ${learnedResult.avgHpAfterFirstCombat.toFixed(1)}`
    );
    console.log(`Elapsed:         ${learnedElapsed}s`);

    console.log('\n--- Delta (learned - heuristic) ---');
    console.log(
      `Win rate delta (pp): ${(learnedResult.winRate - heuristicResult.winRate) * 100}`
    );
    console.log(
      `Avg floor delta:     ${
        learnedResult.avgFloorReached - heuristicResult.avgFloorReached
      }`
    );
    console.log(
      `Avg HP after 1st combat delta: ${
        learnedResult.avgHpAfterFirstCombat - heuristicResult.avgHpAfterFirstCombat
      }\n`
    );

    // Basic sanity assertions: both runs arrays should be N long.
    expect(heuristicResult.runs.length).toBe(N);
    expect(learnedResult.runs.length).toBe(N);
  });
});

