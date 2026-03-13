import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runSimulation, type DecisionSampleHook, type CombatEndHook } from './runSimulator';
import type { SimulatorOptions } from './runSimulator';
import { loadCards, loadEnemies, loadEncounters, loadCharacters, loadRelics, loadEvents } from '../loadData';
import type { CardDef } from '../cardDef';
import type { EnemyDef, EncounterDef, EventDef, RelicDef } from '../loadData';
import type { CharacterDef } from '../loadData';
import { encodeStateFeatures, encodeActionFeatures } from './features';

const dataDir = path.join(process.cwd(), 'src', 'engine', 'data');

function loadJson<T>(file: string): T {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing data file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

interface ImitationSample {
  state: number[];
  actions: number[][];
  chosenIndex: number;
  /** True if this decision was in a combat that the player won. Used to weight training toward winning play. */
  combatWon?: boolean;
}

describe('collect-imitation-data (script)', () => {
  it('generates offline imitation-learning dataset', () => {
    const env = process.env as Record<string, string | undefined>;

    const characterId = env['SIM_CHARACTER'] ?? 'gungirl';
    const N = Math.max(1, parseInt(env['SIM_N'] ?? '50', 10));
    const seedBase =
      env['SIM_SEED'] !== undefined && env['SIM_SEED'] !== ''
        ? parseInt(env['SIM_SEED'] as string, 10)
        : 123456;

    const outDirEnv = env['IL_OUT_DIR'];
    const outDir = outDirEnv && outDirEnv.trim().length > 0
      ? outDirEnv
      : path.join(process.cwd(), 'data', 'imitation');
    const outFile = path.join(
      outDir,
      `imitation-${characterId}-seed${seedBase}-N${N}.ndjson`
    );

    fs.mkdirSync(outDir, { recursive: true });

    const stream = fs.createWriteStream(outFile, { flags: 'w' });

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
      act1: (mapConfigData as SimulatorOptions['mapConfig'])['act1'],
      act2: (mapConfigData as SimulatorOptions['mapConfig'])['act2'],
      act3: (mapConfigData as SimulatorOptions['mapConfig'])['act3'],
    };

    let sampleCount = 0;
    const combatBuffer: ImitationSample[] = [];

    const onDecision: DecisionSampleHook = ({
      state,
      cardsMap,
      enemyDefs,
      archetypeContext,
      candidates,
      chosenIndex,
    }) => {
      const stateFeatures = encodeStateFeatures(state, cardsMap, enemyDefs, archetypeContext);
      const actionFeatures: number[][] = candidates.map((c) =>
        encodeActionFeatures(
          state,
          c.action,
          c.cardIndexInHand,
          c.targetIndex,
          cardsMap
        )
      );

      combatBuffer.push({
        state: stateFeatures,
        actions: actionFeatures,
        chosenIndex,
      });
    };

    const onCombatEnd: CombatEndHook = (combatWon) => {
      for (const s of combatBuffer) {
        stream.write(`${JSON.stringify({ ...s, combatWon })}\n`);
        sampleCount += 1;
      }
      combatBuffer.length = 0;
    };

    console.log(
      `\nCollecting imitation-learning data for "${characterId}" (runs=${N}, seeds ${seedBase}..${
        seedBase + N - 1
      })...\n`
    );

    const start = Date.now();
    const { runs } = runSimulation(
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
      seedBase,
      { onDecision, onCombatEnd }
    );
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    stream.end();

    const totalCombats = runs.reduce((s, r) => s + r.combats.length, 0);

    console.log('--- Imitation data collection ---');
    console.log(`Runs simulated:         ${runs.length}`);
    console.log(`Total combats:          ${totalCombats}`);
    console.log(`Total decision samples: ${sampleCount}`);
    console.log(`Output file:            ${outFile}`);
    console.log(`Completed in ${elapsed}s\n`);

    expect(sampleCount).toBeGreaterThan(0);
  });
});
