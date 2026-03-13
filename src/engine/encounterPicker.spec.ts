import { describe, it, expect } from 'vitest';
import { pickEncounterForNode } from './encounterPicker';
import type { GameState } from './types';
import type { ActConfigEncounter } from './encounterPicker';
import { createSeededRng } from './rng';

const actConfig: ActConfigEncounter = {
  encounterPool: ['enc_a', 'enc_b'],
  encounterWeights: { enc_a: 1, enc_b: 1 },
  eliteEncounterPool: ['elite_1'],
  bossEncounter: 'boss_1',
  firstThreeEncounterPool: ['enc_a'],
  firstThreeEncounterWeights: { enc_a: 1 },
};

function stateWithMap(currentNodeId: string | null, act = 1, monsterCount = 0, lastIds: string[] = []): GameState {
  return {
    playerHp: 80,
    playerMaxHp: 80,
    playerBlock: 0,
    currentEncounter: null,
    phase: 'player',
    deck: [],
    hand: [],
    discard: [],
    energy: 3,
    maxEnergy: 3,
    turnNumber: 1,
    enemies: [],
    combatResult: null,
    runPhase: 'map',
    map: {
      nodes: [
        { id: 'n_combat', type: 'combat', floor: 0 },
        { id: 'n_elite', type: 'elite', floor: 0 },
        { id: 'n_boss', type: 'boss', floor: 1 },
      ],
      edges: [],
    },
    currentNodeId: currentNodeId,
    act,
    monsterEncountersCompletedThisAct: monsterCount,
    lastMonsterEncounterIds: lastIds,
  } as GameState;
}

describe('encounterPicker', () => {
  it('returns bossEncounter for boss node', () => {
    const state = stateWithMap('n_boss');
    expect(pickEncounterForNode(state, 'n_boss', actConfig)).toBe('boss_1');
  });

  it('returns one of eliteEncounterPool for elite node', () => {
    const state = stateWithMap('n_elite');
    const rng = createSeededRng(99);
    const enc = pickEncounterForNode(state, 'n_elite', actConfig, rng);
    expect(actConfig.eliteEncounterPool).toContain(enc);
  });

  it('returns one of encounterPool for combat node', () => {
    const state = stateWithMap('n_combat');
    const rng = createSeededRng(1);
    const enc = pickEncounterForNode(state, 'n_combat', actConfig, rng);
    expect(actConfig.encounterPool).toContain(enc);
  });

  it('same seed gives same encounter for combat node', () => {
    const state = stateWithMap('n_combat');
    const rng = createSeededRng(42);
    const a = pickEncounterForNode(state, 'n_combat', actConfig, rng);
    const rng2 = createSeededRng(42);
    const b = pickEncounterForNode(state, 'n_combat', actConfig, rng2);
    expect(a).toBe(b);
  });
});
