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
  it('Jaw Worm: always uses Chomp (attack 11) on turn 1', () => {
    const jawDefs = loadEnemies([
      { id: 'jaw_worm', name: 'Jaw Worm', maxHp: 40, intents: [
        { weight: 25, intent: { type: 'attack', value: 11, firstTurnOnly: true } },
        { weight: 25, intent: { type: 'attack', value: 11 } },
        { weight: 30, intent: { type: 'attack_and_block', value: 7, value2: 5 } },
        { weight: 45, intent: { type: 'buff', value: 0, strength: 3, block: 6 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'jaw', enemies: ['jaw_worm'] }]);
    // rng always returns 0.99 — without firstTurnOnly the high weight of 'buff' (45/100) would be picked;
    // with firstTurnOnly, only the Chomp is eligible on turn 1 regardless of rng.
    const state = createInitialState(cardsMap, jawDefs, enc, 'jaw', undefined, () => 0.99);
    expect(state.enemies[0].intent?.type).toBe('attack');
    expect(state.enemies[0].intent?.value).toBe(11);
  });
  it('Chosen: always uses Poke (attack_multi 1×5) on turn 1, Hex on turn 2', () => {
    const chosenDefs = loadEnemies([
      { id: 'chosen', name: 'Chosen', maxHp: 72, intents: [
        { weight: 1, intent: { type: 'attack_multi', value: 1, times: 5, firstTurnOnly: true } },
        { weight: 1, intent: { type: 'attack_multi', value: 1, times: 5 } },
        { weight: 1, intent: { type: 'hex', value: 0 } },
        { weight: 1, intent: { type: 'attack_vulnerable', value: 7, value2: 2 } },
        { weight: 1, intent: { type: 'drain', value: 2, value2: 2 } },
        { weight: 1, intent: { type: 'attack', value: 10 } },
      ]},
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'ch', enemies: ['chosen'] }]);
    // rng returning 0.99 would skip to the last intent without firstTurnOnly guard.
    const state = createInitialState(cardsMap, chosenDefs, enc, 'ch', undefined, () => 0.99);
    expect(state.enemies[0].intent?.type).toBe('attack_multi');
    expect(state.enemies[0].intent?.times).toBe(5);
    // After turn 1, turn 2 should always be Hex (hardcoded in pickIntent).
    const after1 = endTurn(state, cardsMap, chosenDefs);
    expect(after1.enemies[0].intent?.type).toBe('hex');
  });
  it('Enemy Vulnerable: stacks do not decrement per-hit (multi-hit attack preserves bonus for all hits)', () => {
    const multiHitCard: CardDef = { id: 'rapid', name: 'Rapid', cost: 1, effects: [{ type: 'multiHit', value: 4, target: 'enemy', times: 3 }] };
    const cMap = loadCards([multiHitCard]);
    const vulnEnemyDefs = loadEnemies([{ id: 'vuln_enemy', name: 'Vuln', maxHp: 40, intents: [{ weight: 1, intent: { type: 'none', value: 0 } }] }]);
    const vulnEnc = loadEncounters([{ id: 'v', enemies: ['vuln_enemy'] }]);
    const state = createInitialState(cMap, vulnEnemyDefs, vulnEnc, 'v', ['rapid', 'rapid', 'rapid', 'rapid', 'rapid']);
    // Manually give the enemy 1 vulnerable stack.
    const stateWithVuln = { ...state, enemies: [{ ...state.enemies[0], vulnerableStacks: 1 }] };
    // Play rapid: 3 hits × 4 base × 1.5 vuln = 6 per hit (Math.ceil(4 * 1.5) = 6), total 18 damage.
    const after = playCard(stateWithVuln, 'rapid', 0, cMap, vulnEnemyDefs);
    // Vulnerable should apply to ALL 3 hits (stacks don't decrement per-hit).
    expect(after.enemies[0].hp).toBe(40 - 18);
    // Vulnerable stack is still 1 (only decays at end of turn).
    expect(after.enemies[0].vulnerableStacks).toBe(1);
  });
  it('Enemy Weak: reduces enemy outgoing attack damage by 25%', () => {
    const weakEnemyDefs = loadEnemies([
      { id: 'weak_enemy', name: 'Weak', maxHp: 20, intents: [{ weight: 1, intent: { type: 'attack', value: 12 } }] },
    ] as EnemyDef[]);
    const enc = loadEncounters([{ id: 'we', enemies: ['weak_enemy'] }]);
    const state = createInitialState(cardsMap, weakEnemyDefs, enc, 'we', undefined, () => 0);
    // Give enemy 1 Weak stack; attack 12 × 0.75 = floor(9).
    const stateWithWeak = { ...state, enemies: [{ ...state.enemies[0], weakStacks: 1, intent: { type: 'attack' as const, value: 12 } }] };
    const after = endTurn(stateWithWeak, cardsMap, weakEnemyDefs);
    expect(after.playerHp).toBe(70 - 9);
  });
  it('Player Frail: reduces block gain by 25% (floor), does NOT increase incoming damage', () => {
    const defCard: CardDef = { id: 'def_card', name: 'Def', cost: 1, effects: [{ type: 'block', value: 8, target: 'player' }] };
    const cMap = loadCards([defCard]);
    const enc = loadEncounters([{ id: 'f', enemies: ['test_enemy'] }]);
    const state = createInitialState(cMap, enemyDefs, enc, 'f', ['def_card', 'def_card', 'def_card', 'def_card', 'def_card']);
    // With 1 frail stack, block 8 → Math.floor(8 * 0.75) = 6.
    const stateWithFrail = { ...state, frailStacks: 1 };
    const after = playCard(stateWithFrail, 'def_card', null, cMap, enemyDefs);
    expect(after.playerBlock).toBe(6);
  });
  it('Player Weak: reduces player outgoing attack damage by 25% (floor)', () => {
    const state = createInitialState(cardsMap, enemyDefs, encountersMap, 'test');
    // strike deals 6 dmg base. With 1 playerWeak: Math.floor(6 * 0.75) = 4.
    const stateWithWeak = { ...state, playerWeakStacks: 1 };
    const after = playCard(stateWithWeak, 'strike', 0, cardsMap, enemyDefs);
    expect(after.enemies[0].hp).toBe(20 - 4);
  });
  it('Player Weak + enemy Vulnerable: both modifiers stack correctly', () => {
    const vulnEnemyDefs = loadEnemies([{ id: 'vuln_enemy', name: 'Vuln', maxHp: 40, intents: [{ weight: 1, intent: { type: 'none', value: 0 } }] }]);
    const enc = loadEncounters([{ id: 'combo', enemies: ['vuln_enemy'] }]);
    const state = createInitialState(cardsMap, vulnEnemyDefs, enc, 'combo', ['strike', 'strike', 'strike', 'strike', 'strike']);
    // strike=6, player weak → floor(6 × 0.75) = 4, then enemy vuln → ceil(4 × 1.5) = 6.
    const stateWithBoth = { ...state, playerWeakStacks: 1, enemies: [{ ...state.enemies[0], vulnerableStacks: 1 }] };
    const after = playCard(stateWithBoth, 'strike', 0, cardsMap, vulnEnemyDefs);
    expect(after.enemies[0].hp).toBe(40 - 6);
  });
});
