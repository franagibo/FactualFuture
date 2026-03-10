import { describe, it, expect } from 'vitest';
import { createInitialState, playCard, endTurn } from './combat';
import { loadCards, loadEnemies, loadEncounters } from './loadData';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef } from './loadData';

const mockCards: CardDef[] = [
  { id: 'strike', name: 'Strike', cost: 1, effects: [{ type: 'damage', value: 6, target: 'enemy' }] },
  { id: 'defend', name: 'Defend', cost: 1, effects: [{ type: 'block', value: 5, target: 'player' }] },
  { id: 'bash', name: 'Bash', cost: 2, effects: [{ type: 'damage', value: 8, target: 'enemy' }] },
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
});
