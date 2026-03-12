import { describe, it, expect } from 'vitest';
import { getAvailableNextNodes, startRun, getNodeById } from './run';
import type { GameState, MapState } from './types';

const minimalActConfig = {
  combat: 4,
  elite: 1,
  rest: 2,
  shop: 1,
  event: 1,
  boss: 1,
  floorCount: 10,
  typeWeights: { combat: 1, elite: 1, rest: 1, shop: 1, event: 1, boss: 1 },
};

describe('run', () => {
  it('startRun returns state with seed', () => {
    const seed = 12345;
    const state = startRun(seed, minimalActConfig);
    expect(state.seed).toBe(seed);
    expect(state.runPhase).toBe('map');
    expect(state.map).toBeDefined();
    expect(state.deck.length).toBeGreaterThan(0);
  });

  it('getAvailableNextNodes at start returns root nodes (no incoming edges)', () => {
    const map: MapState = {
      nodes: [
        { id: 'a', type: 'combat', floor: 0 },
        { id: 'b', type: 'combat', floor: 0 },
        { id: 'c', type: 'rest', floor: 1 },
      ],
      edges: [
        ['a', 'c'],
        ['b', 'c'],
      ],
    };
    const state: GameState = {
      playerHp: 70,
      playerMaxHp: 70,
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
      map,
      currentNodeId: null,
    };
    const next = getAvailableNextNodes(state);
    expect(next).toContain('a');
    expect(next).toContain('b');
    expect(next).not.toContain('c');
    expect(next.length).toBe(2);
  });

  it('getAvailableNextNodes when at node returns successors', () => {
    const map: MapState = {
      nodes: [
        { id: 'a', type: 'combat', floor: 0 },
        { id: 'b', type: 'combat', floor: 0 },
        { id: 'c', type: 'rest', floor: 1 },
      ],
      edges: [
        ['a', 'c'],
        ['b', 'c'],
      ],
    };
    const state: GameState = {
      playerHp: 70,
      playerMaxHp: 70,
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
      map,
      currentNodeId: 'a',
    };
    const next = getAvailableNextNodes(state);
    expect(next).toEqual(['c']);
  });

  it('getNodeById returns node by id', () => {
    const map: MapState = {
      nodes: [
        { id: 'a', type: 'combat', floor: 0 },
        { id: 'b', type: 'rest', floor: 1 },
      ],
      edges: [['a', 'b']],
    };
    expect(getNodeById(map, 'a')?.type).toBe('combat');
    expect(getNodeById(map, 'b')?.type).toBe('rest');
    expect(getNodeById(map, 'c')).toBeUndefined();
  });
});
