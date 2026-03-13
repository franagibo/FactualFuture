import { describe, it, expect } from 'vitest';
import { createInitialState, startCombatFromRunState, playCard, endTurn } from './combat';
import { loadCards, loadEnemies, loadEncounters } from './loadData';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef } from './loadData';
import type { GameState, EnemyState } from './types';

const mockCards: CardDef[] = [
  { id: 'strike', name: 'Strike', cost: 1, effects: [{ type: 'damage', value: 6, target: 'enemy' }] },
  { id: 'defend', name: 'Defend', cost: 1, effects: [{ type: 'block', value: 5, target: 'player' }] },
  { id: 'bash', name: 'Bash', cost: 2, effects: [{ type: 'damage', value: 8, target: 'enemy' }] },
  { id: 'seed_pod', name: 'Seed Pod', cost: 1, effects: [{ type: 'summon_plant', value: 9 }] },
];
const mockEnemies: EnemyDef[] = [
  { id: 'test_enemy', name: 'Test', maxHp: 20, intents: [{ weight: 1, intent: { type: 'attack', value: 5 } }] },
];
const mockEncounters: EncounterDef[] = [
  { id: 'test', enemies: ['test_enemy'] },
];

const cardsMap = loadCards(mockCards);
const enemyDefs = loadEnemies(mockEnemies);
const encountersMap = loadEncounters(mockEncounters);

describe('combat', () => {
  it('createInitialState sets up combat with hand and enemies', () => {
    const state = createInitialState(cardsMap, enemyDefs, encountersMap, 'test');
    expect(state.enemies.length).toBe(1);
    expect(state.enemies[0].hp).toBe(20);
    expect(state.hand.length).toBe(5);
    expect(state.phase).toBe('player');
  });

  it('playCard reduces enemy HP', () => {
    const state = createInitialState(cardsMap, enemyDefs, encountersMap, 'test');
    const after = playCard(state, 'strike', 0, cardsMap, enemyDefs);
    expect(after.enemies[0].hp).toBe(14);
  });

  it('endTurn resolves enemy intent, discards hand, draws 5, and starts next turn', () => {
    const state = createInitialState(cardsMap, enemyDefs, encountersMap, 'test');
    expect(state.hand.length).toBe(5);
    const after = endTurn(state, cardsMap, enemyDefs);
    expect(after.phase).toBe('player');
    expect(after.turnNumber).toBe(2);
    expect(after.hand.length).toBe(5);
  });

  it('large slime splits into two medium slimes when HP drops to 50% or below', () => {
    const splitEnemies: EnemyDef[] = [
      { id: 'acid_slime_m', name: 'Acid Slime (M)', maxHp: 28, intents: [{ weight: 1, intent: { type: 'attack', value: 10 } }] },
      {
        id: 'acid_slime_l',
        name: 'Acid Slime (L)',
        maxHp: 65,
        intents: [{ weight: 1, intent: { type: 'attack', value: 16 } }],
        triggers: [{ trigger: 'hp_below_percent', value: 50, action: 'split', spawnEnemyId: 'acid_slime_m', spawnCount: 2 }],
      },
    ];
    const splitEncounters: EncounterDef[] = [{ id: 'split_test', enemies: ['acid_slime_l'] }];
    const heavyHit = [{ id: 'heavy', name: 'Heavy', cost: 1, effects: [{ type: 'damage', value: 40, target: 'enemy' }] }];
    const sCards = loadCards(heavyHit as CardDef[]);
    const sEnemyDefs = loadEnemies(splitEnemies);
    const sEncounters = loadEncounters(splitEncounters);
    const state = createInitialState(sCards, sEnemyDefs, sEncounters, 'split_test', ['heavy', 'heavy', 'heavy', 'heavy', 'heavy']);
    expect(state.enemies.length).toBe(1);
    expect(state.enemies[0].id).toBe('acid_slime_l');
    expect(state.enemies[0].hp).toBe(65);
    const after = playCard(state, 'heavy', 0, sCards, sEnemyDefs);
    expect(after.enemies.length).toBe(2);
    expect(after.enemies[0].id).toBe('acid_slime_m');
    expect(after.enemies[1].id).toBe('acid_slime_m');
    expect(after.enemies[0].hp).toBe(25);
    expect(after.enemies[1].hp).toBe(25);
    expect(after.enemies[0].intent?.type).toBe('none');
  });

  it('Verdant Machinist: startCombatFromRunState with core_seed_reactor starts with one plant', () => {
    const runState: GameState = {
      playerHp: 72,
      playerMaxHp: 72,
      playerBlock: 0,
      deck: ['strike', 'defend', 'seed_pod'],
      hand: [],
      discard: [],
      energy: 0,
      maxEnergy: 3,
      turnNumber: 0,
      enemies: [] as EnemyState[],
      combatResult: null,
      phase: 'player',
      currentEncounter: null,
      characterId: 'verdant_machinist',
      relics: ['core_seed_reactor'],
    };
    const state = startCombatFromRunState(
      runState,
      'test',
      cardsMap,
      enemyDefs,
      encountersMap
    );
    expect(state.plants).toBeDefined();
    expect(state.plants!.length).toBe(1);
    expect(state.plants![0].hp).toBe(9);
    expect(state.plants![0].growthStage).toBe(1);
    expect(state.plants![0].mode).toBe('defense');
  });

  it('Verdant Machinist: summon_plant adds plant when under 3', () => {
    const runState: GameState = {
      playerHp: 72,
      playerMaxHp: 72,
      playerBlock: 0,
      deck: ['strike', 'defend'],
      hand: ['seed_pod', 'strike', 'strike', 'strike', 'strike'],
      discard: [],
      energy: 3,
      maxEnergy: 3,
      turnNumber: 1,
      enemies: [{ id: 'test_enemy', name: 'Test', hp: 20, maxHp: 20, block: 0, intent: { type: 'attack', value: 5 } }],
      combatResult: null,
      phase: 'player',
      currentEncounter: 'test',
      characterId: 'verdant_machinist',
      plants: [],
    };
    const state = startCombatFromRunState(
      runState,
      'test',
      cardsMap,
      enemyDefs,
      encountersMap
    );
    const after = playCard(state, 'seed_pod', null, cardsMap, enemyDefs);
    expect(after.plants?.length).toBe(1);
    expect(after.plants![0].hp).toBe(9);
    expect(after.plants![0].growth).toBe(0);
  });
});
