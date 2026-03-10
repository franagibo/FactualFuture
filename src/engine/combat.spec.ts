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
    const after = playCard(state, 'strike', 0, cardsMap);
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
});
