import { describe, it, expect } from 'vitest';
import { runSimulation, singleRun } from './runSimulator';
import type { SimulatorOptions } from './runSimulator';
import { loadCards, loadEnemies, loadEncounters, loadCharacters } from '../loadData';
import type { CardDef } from '../cardDef';
import type { EnemyDef, EncounterDef } from '../loadData';
import { pickActionAlwaysAttackFirst, pickActionAlwaysBlockFirst } from './strategyBot';

const minimalCards: CardDef[] = [
  { id: 'strike', name: 'Strike', cost: 1, effects: [{ type: 'damage', value: 6, target: 'enemy' }] },
  { id: 'defend', name: 'Defend', cost: 1, effects: [{ type: 'block', value: 5, target: 'player' }] },
  { id: 'bash', name: 'Bash', cost: 2, effects: [{ type: 'damage', value: 8, target: 'enemy' }, { type: 'vulnerable', value: 2, target: 'enemy' }] },
];
const minimalEnemies: EnemyDef[] = [
  { id: 'e1', name: 'E1', maxHp: 12, intents: [{ weight: 1, intent: { type: 'attack', value: 5 } }] },
];
const minimalEncounters: EncounterDef[] = [
  { id: 'enc1', enemies: ['e1'] },
  { id: 'boss1', enemies: ['e1'] },
];

const minimalMapConfig = {
  act1: {
    combat: 2,
    elite: 0,
    rest: 1,
    shop: 0,
    event: 0,
    boss: 1,
    floorCount: 5,
    typeWeights: { combat: 1, rest: 1, boss: 1 },
    encounterPool: ['enc1'],
    encounterWeights: { enc1: 1 },
    bossEncounter: 'boss1',
    firstThreeEncounterPool: ['enc1'],
    firstThreeEncounterWeights: { enc1: 1 },
  },
};

function buildMinimalOptions(): SimulatorOptions {
  const cardsMap = loadCards(minimalCards);
  const enemyDefs = loadEnemies(minimalEnemies);
  const encountersMap = loadEncounters(minimalEncounters);
  return {
    starterDeck: ['strike', 'strike', 'defend', 'defend', 'bash'],
    startingMaxHp: 80,
    mapConfig: minimalMapConfig as SimulatorOptions['mapConfig'],
    cardsMap,
    enemyDefs,
    encountersMap,
    rewardCardPool: ['strike', 'defend'],
  };
}

describe('runSimulator', () => {
  it('runSimulation returns N runs and aggregates', () => {
    const opts = buildMinimalOptions();
    const { runs, winRate, avgFloorReached, avgHpAfterFirstCombat } = runSimulation(opts, 5, 100);
    expect(runs.length).toBe(5);
    expect(winRate).toBeGreaterThanOrEqual(0);
    expect(winRate).toBeLessThanOrEqual(1);
    expect(avgFloorReached).toBeGreaterThanOrEqual(0);
    expect(avgHpAfterFirstCombat).toBeGreaterThanOrEqual(0);
    runs.forEach((r) => {
      expect(r.result).toMatch(/^(win|lose)$/);
      expect(r.seed).toBeDefined();
      expect(Array.isArray(r.combats)).toBe(true);
    });
  });

  it('same seed produces same run result (determinism)', () => {
    const opts = buildMinimalOptions();
    const run1 = singleRun(42, opts);
    const run2 = singleRun(42, opts);
    expect(run1.result).toBe(run2.result);
    expect(run1.floorReached).toBe(run2.floorReached);
    expect(run1.combats.length).toBe(run2.combats.length);
    if (run1.combats.length > 0 && run2.combats.length > 0) {
      expect(run1.combats[0].hpEnd).toBe(run2.combats[0].hpEnd);
      expect(run1.combats[0].win).toBe(run2.combats[0].win);
    }
  });

  it('baseline bots do not produce drastically more floor-1 deaths than heuristic bot', () => {
    const opts = buildMinimalOptions();

    const runsHeuristic = runSimulation({ ...opts }, 20, 200);
    const runsBlockFirst = runSimulation({ ...opts, bot: pickActionAlwaysBlockFirst }, 20, 200);
    const runsAttackFirst = runSimulation({ ...opts, bot: pickActionAlwaysAttackFirst }, 20, 200);

    const floor1Deaths = (res: ReturnType<typeof runSimulation>) =>
      res.runs.filter((r) => r.result === 'lose' && (r.floorReached ?? 0) <= 1).length;

    const h = floor1Deaths(runsHeuristic);
    const b = floor1Deaths(runsBlockFirst);
    const a = floor1Deaths(runsAttackFirst);

    // Heuristic bot should be within a reasonable band of simple baselines on early deaths.
    const maxBaseline = Math.max(b, a);
    expect(h).toBeLessThanOrEqual(maxBaseline + 3);
  });
});
