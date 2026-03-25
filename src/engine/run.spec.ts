import { describe, it, expect } from 'vitest';
import { getAvailableNextNodes, startRun, getNodeById, chooseNode, grantAct1BossTalentBonus } from './run';
import type { GameState, MapState } from './types';
import { loadCards, loadEnemies, loadEncounters } from './loadData';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef } from './loadData';

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

  it('chooseNode grants +1 talent point on node entry during act 1', () => {
    const map: MapState = {
      nodes: [{ id: 'root', type: 'rest', floor: 0 }],
      edges: [],
    };
    const cards = loadCards([] as CardDef[]);
    const enemies = loadEnemies([] as EnemyDef[]);
    const encounters = loadEncounters([] as EncounterDef[]);
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
      act: 1,
      floor: 0,
      talentPoints: 0,
      talentsSelected: [],
    };
    const next = chooseNode(
      state,
      'root',
      null,
      cards,
      enemies,
      encounters,
      [],
      undefined,
      []
    );
    expect(next.talentPoints).toBe(1);
  });

  it('grantAct1BossTalentBonus grants only once in act 1', () => {
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
      runPhase: 'combat',
      act: 1,
      talentPoints: 5,
      talentAct1BossBonusGranted: false,
    };
    const once = grantAct1BossTalentBonus(state);
    expect(once.talentPoints).toBe(6);
    expect(once.talentAct1BossBonusGranted).toBe(true);
    const twice = grantAct1BossTalentBonus(once);
    expect(twice.talentPoints).toBe(6);
  });
});
