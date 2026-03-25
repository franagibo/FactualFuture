import type { GameState, TalentTreeDef } from './types';

export interface TalentSelectionResult {
  ok: boolean;
  reason?: string;
}

export function hasTalent(state: GameState, talentId: string): boolean {
  return (state.talentsSelected ?? []).includes(talentId);
}

export function isPlantCard(cardEffects: { type: string }[]): boolean {
  return cardEffects.some((e) =>
    e.type === 'summon_plant' ||
    e.type === 'grow_plant' ||
    e.type === 'plant_mode' ||
    e.type === 'sacrifice_plant' ||
    e.type === 'evolve_plant' ||
    e.type === 'blockToPlant'
  );
}

export function getMaxPlants(state: GameState, baseMax: number): number {
  return hasTalent(state, 'sproutingSockets') ? baseMax + 1 : baseMax;
}

export function canSelectTalent(
  state: GameState,
  tree: TalentTreeDef,
  talentId: string
): TalentSelectionResult {
  const node = tree.nodes.find((n) => n.id === talentId);
  if (!node) return { ok: false, reason: 'Talent not found in tree.' };
  const selected = state.talentsSelected ?? [];
  const points = state.talentPoints ?? 0;
  if (selected.includes(talentId)) return { ok: false, reason: 'Talent already selected.' };
  if (points <= 0) return { ok: false, reason: 'No talent points available.' };
  if ((state.talentTreeId ?? tree.id) !== tree.id) return { ok: false, reason: 'Wrong talent tree for this run.' };

  const spent = selected.length;
  const minSpent = node.minSpent ?? 0;
  if (spent < minSpent) return { ok: false, reason: `Requires ${minSpent} points spent first.` };

  const requires = node.requires ?? [];
  for (const req of requires) {
    if (!selected.includes(req)) return { ok: false, reason: 'Missing prerequisite talent.' };
  }

  const requiresAny = node.requiresAny ?? [];
  if (requiresAny.length > 0 && !requiresAny.some((req) => selected.includes(req))) {
    return { ok: false, reason: 'Missing linked prerequisite talent.' };
  }

  if (node.keystone) {
    const existingKeystone = tree.nodes.find((n) => n.keystone && selected.includes(n.id));
    if (existingKeystone) return { ok: false, reason: 'Only one keystone can be selected per run.' };
  }

  if (node.exclusiveGroup) {
    const conflicting = tree.nodes.find(
      (n) => n.id !== node.id && n.exclusiveGroup === node.exclusiveGroup && selected.includes(n.id)
    );
    if (conflicting) {
      return { ok: false, reason: `Choice locked by ${conflicting.name}.` };
    }
  }

  return { ok: true };
}

export function spendTalentPoint(
  state: GameState,
  tree: TalentTreeDef,
  talentId: string
): { state: GameState; result: TalentSelectionResult } {
  const result = canSelectTalent(state, tree, talentId);
  if (!result.ok) return { state, result };
  const next: GameState = {
    ...state,
    talentPoints: Math.max(0, (state.talentPoints ?? 0) - 1),
    talentsSelected: [...(state.talentsSelected ?? []), talentId],
    talentTreeId: state.talentTreeId ?? tree.id,
  };
  return { state: next, result };
}
