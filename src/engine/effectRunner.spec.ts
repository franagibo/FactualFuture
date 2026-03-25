import { describe, it, expect } from 'vitest';
import { runEffects, drawOne, drawCards } from './effectRunner';
import type { GameState } from './types';
import type { CardDef } from './cardDef';

function minimalState(overrides: Partial<GameState> = {}): GameState {
  return {
    playerHp: 70,
    playerMaxHp: 70,
    playerBlock: 0,
    currentEncounter: null,
    phase: 'player',
    deck: ['a', 'b', 'c'],
    hand: [],
    discard: [],
    energy: 3,
    maxEnergy: 3,
    turnNumber: 1,
    enemies: [
      { id: 'e1', name: 'E1', hp: 20, maxHp: 20, block: 0, intent: null },
      { id: 'e2', name: 'E2', hp: 15, maxHp: 15, block: 5, intent: null },
    ],
    combatResult: null,
    ...overrides,
  };
}

const cardsMap = new Map<string, CardDef>([
  [
    'strike',
    {
      id: 'strike',
      name: 'Strike',
      cost: 1,
      effects: [{ type: 'damage', value: 6, target: 'enemy' }],
    },
  ],
  [
    'defend',
    {
      id: 'defend',
      name: 'Defend',
      cost: 1,
      effects: [{ type: 'block', value: 5, target: 'player' }],
    },
  ],
  [
    'draw2',
    {
      id: 'draw2',
      name: 'Draw2',
      cost: 0,
      effects: [{ type: 'draw', value: 2, target: 'player' }],
    },
  ],
  [
    'vuln',
    {
      id: 'vuln',
      name: 'Vuln',
      cost: 1,
      effects: [{ type: 'vulnerable', value: 2, target: 'enemy' }],
    },
  ],
  [
    'multi',
    {
      id: 'multi',
      name: 'Multi',
      cost: 1,
      effects: [
        { type: 'damage', value: 6, target: 'enemy' },
        { type: 'block', value: 4, target: 'player' },
      ],
    },
  ],
  [
    'seed_pod',
    {
      id: 'seed_pod',
      name: 'Seed Pod',
      cost: 1,
      effects: [{ type: 'summon_plant', value: 9 }],
    },
  ],
  [
    'transfer',
    {
      id: 'transfer',
      name: 'Transfer',
      cost: 1,
      effects: [{ type: 'blockToPlant', value: 10, target: 'plant' }],
    },
  ],
  [
    'sac',
    {
      id: 'sac',
      name: 'Sac',
      cost: 1,
      effects: [{ type: 'sacrifice_plant', value: 0, target: 'plant' }],
    },
  ],
]);

describe('effectRunner', () => {
  it('runEffects damage reduces enemy HP', () => {
    const state = minimalState();
    const after = runEffects(cardsMap.get('strike')!, state, 0, cardsMap);
    expect(after.enemies[0].hp).toBe(14);
    expect(after.enemies[1].hp).toBe(15);
  });

  it('runEffects block increases player block', () => {
    const state = minimalState();
    const after = runEffects(cardsMap.get('defend')!, state, null, cardsMap);
    expect(after.playerBlock).toBe(5);
  });

  it('runEffects draw adds cards from deck to hand', () => {
    const state = minimalState({ hand: ['strike'] });
    const after = runEffects(cardsMap.get('draw2')!, state, null, cardsMap);
    expect(after.hand.length).toBe(3);
    expect(after.deck.length).toBe(1);
  });

  it('runEffects vulnerable adds stacks to enemy', () => {
    const state = minimalState();
    const after = runEffects(cardsMap.get('vuln')!, state, 0, cardsMap);
    expect((after.enemies[0] as { vulnerableStacks?: number }).vulnerableStacks).toBe(2);
  });

  it('runEffects multi-effect applies damage and block', () => {
    const state = minimalState();
    const after = runEffects(cardsMap.get('multi')!, state, 0, cardsMap);
    expect(after.enemies[0].hp).toBe(14);
    expect(after.playerBlock).toBe(4);
  });

  it('drawOne moves one card from deck to hand', () => {
    const state = minimalState({ hand: [] });
    const after = drawOne(state);
    expect(after.hand.length).toBe(1);
    expect(after.deck.length).toBe(2);
  });

  it('drawCards draws N cards', () => {
    const state = minimalState({ hand: [] });
    const after = drawCards(state, 2);
    expect(after.hand.length).toBe(2);
    expect(after.deck.length).toBe(1);
  });

  it('Quick Germination gives first summon +1 growth', () => {
    const state = minimalState({
      characterId: 'verdant_machinist',
      plants: [],
      talentTreeId: 'verdant_machinist',
      talentsSelected: ['quickGermination'],
      talentQuickGerminationUsedCombat: false,
    });
    const after = runEffects(cardsMap.get('seed_pod')!, state, null, cardsMap);
    expect(after.plants?.[0].growth).toBe(1);
    expect(after.talentQuickGerminationUsedCombat).toBe(true);
  });

  it('Rooted Bulwark increases blockToPlant by 20%', () => {
    const state = minimalState({
      characterId: 'verdant_machinist',
      plants: [{ id: 'p0', hp: 9, maxHp: 9, block: 0, growth: 0, growthStage: 1, mode: 'defense', turnsAlive: 0 }],
      talentTreeId: 'verdant_machinist',
      talentsSelected: ['rootedBulwark'],
    });
    const after = runEffects(cardsMap.get('transfer')!, state, null, cardsMap);
    expect(after.plants?.[0].block).toBe(12);
  });

  it('Cannibal Reactor and Apex Protocol trigger on sacrifice', () => {
    const state = minimalState({
      characterId: 'verdant_machinist',
      turnNumber: 2,
      plants: [{ id: 'p0', hp: 9, maxHp: 9, block: 0, growth: 0, growthStage: 3, mode: 'attack', turnsAlive: 0 }],
      deck: [],
      talentTreeId: 'verdant_machinist',
      talentsSelected: ['cannibalReactor', 'apexProtocol', 'toxicRecursion'],
      talentEnergyNextTurn: 0,
      talentApexProtocolCharges: 0,
    });
    const after = runEffects(cardsMap.get('sac')!, state, null, cardsMap);
    expect(after.talentEnergyNextTurn).toBe(1);
    expect(after.talentApexProtocolCharges).toBe(1);
    expect(after.deck.includes('thorn_jab')).toBe(true);
  });
});
