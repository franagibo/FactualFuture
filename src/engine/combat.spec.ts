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

  it('Cultist: turn 1 ritual (Incantation), turn 2 attack uses gained strength', () => {
    const cultistDefs = loadEnemies([
      { id: 'cultist', name: 'Cultist', maxHp: 48, intents: [
        { weight: 1, intent: { type: 'ritual', value: 3, firstTurnOnly: true } },
        { weight: 1, intent: { type: 'attack', value: 6 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'c', enemies: ['cultist'] }]);
    const state = createInitialState(cardsMap, cultistDefs, enc, 'c', undefined, () => 0);
    expect(state.enemies[0].intent?.type).toBe('ritual');
    const afterTurn1 = endTurn(state, cardsMap, cultistDefs);
    expect(afterTurn1.enemies[0].ritualStacks).toBe(3);
    expect(afterTurn1.enemies[0].strengthStacks ?? 0).toBe(0);
    expect(afterTurn1.turnNumber).toBe(2);
    expect(afterTurn1.enemies[0].intent?.type).toBe('attack');
    const afterTurn2 = endTurn(afterTurn1, cardsMap, cultistDefs);
    expect(afterTurn2.playerHp).toBe(70 - 9);
  });

  it('Jaw Worm: bellow (buff) gives strength and block; block cleared at end of turn', () => {
    const jawDefs = loadEnemies([
      { id: 'jaw_worm', name: 'Jaw Worm', maxHp: 40, intents: [
        { weight: 1, intent: { type: 'buff', value: 0, strength: 3, block: 6 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'j', enemies: ['jaw_worm'] }]);
    const state = createInitialState(cardsMap, jawDefs, enc, 'j', undefined, () => 0);
    state.enemies[0].intent = { type: 'buff', value: 0, strength: 3, block: 6 };
    const after = endTurn({ ...state, enemies: [{ ...state.enemies[0], intent: { type: 'buff', value: 0, strength: 3, block: 6 } }] }, cardsMap, jawDefs);
    expect(after.enemies[0].strengthStacks).toBe(3);
    expect(after.enemies[0].block).toBe(0);
  });

  it('Byrd: attack_multi deals 5 hits of 1 damage', () => {
    const byrdDefs = loadEnemies([
      { id: 'byrd', name: 'Byrd', maxHp: 12, intents: [
        { weight: 1, intent: { type: 'attack_multi', value: 1, times: 5 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'b', enemies: ['byrd'] }]);
    const state = createInitialState(cardsMap, byrdDefs, enc, 'b', undefined, () => 0);
    state.enemies[0].intent = { type: 'attack_multi', value: 1, times: 5 };
    const after = endTurn({ ...state, enemies: [{ ...state.enemies[0], intent: { type: 'attack_multi', value: 1, times: 5 } }] }, cardsMap, byrdDefs);
    expect(after.playerHp).toBe(70 - 5);
  });

  it('Transient: damage scales by turn (30 turn 1, 40 turn 2)', () => {
    const transDefs = loadEnemies([
      { id: 'transient', name: 'Transient', maxHp: 999, intents: [{ weight: 1, intent: { type: 'attack', value: 30 } }] },
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 't', enemies: ['transient'] }]);
    const state = createInitialState(cardsMap, transDefs, enc, 't', undefined, () => 0);
    expect(state.enemies[0].intent?.value).toBe(30);
    const after1 = endTurn(state, cardsMap, transDefs);
    expect(after1.playerHp).toBe(70 - 30);
    const after2 = endTurn(after1, cardsMap, transDefs);
    expect(after2.playerHp).toBe(70 - 30 - 40);
  });

  it('Gremlin Wizard: charges 2 turns then attacks', () => {
    const wizardDefs = loadEnemies([
      { id: 'gremlin_wizard', name: 'Gremlin Wizard', maxHp: 23, intents: [
        { weight: 1, intent: { type: 'none', value: 0 } },
        { weight: 1, intent: { type: 'attack', value: 25 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'gw', enemies: ['gremlin_wizard'] }]);
    const state = createInitialState(cardsMap, wizardDefs, enc, 'gw', undefined, () => 0);
    expect(state.enemies[0].intent?.type).toBe('none');
    const after1 = endTurn(state, cardsMap, wizardDefs);
    expect(after1.enemies[0].chargeTurns).toBe(1);
    const after2 = endTurn(after1, cardsMap, wizardDefs);
    expect(after2.enemies[0].chargeTurns).toBe(2);
    const after3 = endTurn(after2, cardsMap, wizardDefs);
    expect(after3.playerHp).toBe(70 - 25);
  });
});
