import { describe, expect, it } from 'vitest';
import type { GameState, TalentTreeDef } from './types';
import { canSelectTalent, spendTalentPoint } from './talents';

const tree: TalentTreeDef = {
  id: 'verdant_machinist',
  characterId: 'verdant_machinist',
  nodes: [
    { id: 'a', name: 'A', description: '', tier: 1, branch: 'seed_swarm' },
    { id: 'a2', name: 'A2', description: '', tier: 1, branch: 'ironbloom_bastion' },
    { id: 'b', name: 'B', description: '', tier: 2, branch: 'seed_swarm', minSpent: 1, requires: ['a'] },
    { id: 'c', name: 'C', description: '', tier: 2, branch: 'utility', minSpent: 1, requiresAny: ['a', 'a2'] },
    { id: 'k1', name: 'K1', description: '', tier: 5, branch: 'seed_swarm', minSpent: 2, requires: ['b'], keystone: true },
    { id: 'k2', name: 'K2', description: '', tier: 5, branch: 'ironbloom_bastion', minSpent: 2, requires: ['b'], keystone: true },
  ],
};

function state(overrides: Partial<GameState> = {}): GameState {
  return {
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
    talentPoints: 3,
    talentsSelected: [],
    talentTreeId: 'verdant_machinist',
    ...overrides,
  };
}

describe('talents', () => {
  it('requires points and prerequisites', () => {
    const noPoints = canSelectTalent(state({ talentPoints: 0 }), tree, 'a');
    expect(noPoints.ok).toBe(false);
    const noPrereq = canSelectTalent(state(), tree, 'b');
    expect(noPrereq.ok).toBe(false);
    const ok = canSelectTalent(state(), tree, 'a');
    expect(ok.ok).toBe(true);
  });

  it('spendTalentPoint consumes point and appends selected', () => {
    const first = spendTalentPoint(state(), tree, 'a');
    expect(first.result.ok).toBe(true);
    expect(first.state.talentPoints).toBe(2);
    expect(first.state.talentsSelected).toEqual(['a']);
  });

  it('supports requiresAny links', () => {
    const locked = canSelectTalent(state(), tree, 'c');
    expect(locked.ok).toBe(false);
    const okFromA = canSelectTalent(state({ talentsSelected: ['a'] }), tree, 'c');
    expect(okFromA.ok).toBe(true);
    const okFromA2 = canSelectTalent(state({ talentsSelected: ['a2'] }), tree, 'c');
    expect(okFromA2.ok).toBe(true);
  });

  it('enforces one keystone per run', () => {
    const withKeystone = state({ talentsSelected: ['a', 'b', 'k1'], talentPoints: 1 });
    const attempt = canSelectTalent(withKeystone, tree, 'k2');
    expect(attempt.ok).toBe(false);
  });
});
