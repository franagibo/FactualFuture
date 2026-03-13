import type { GameState } from '../types';
import type { CardDef } from '../cardDef';

export type ArchetypeId =
  | 'strength'
  | 'block_barricade'
  | 'exhaust'
  | 'vulnerable_loop'
  | 'aoe_finisher'
  | 'generic';

export interface ArchetypeContext {
  primary: ArchetypeId;
  secondary: ArchetypeId | null;
  scores: Record<ArchetypeId, number>;
}

const ARCHETYPES: ArchetypeId[] = [
  'strength',
  'block_barricade',
  'exhaust',
  'vulnerable_loop',
  'aoe_finisher',
];

function effArrayHasType(effects: CardDef['effects'], type: CardDef['effects'][number]['type']): boolean {
  return effects.some((e) => e.type === type);
}

export function detectArchetypesFromState(
  state: GameState,
  cardsMap: Map<string, CardDef>
): ArchetypeContext {
  return detectArchetypes(state.deck ?? [], cardsMap, state.relics ?? []);
}

export function detectArchetypes(
  deck: string[],
  cardsMap: Map<string, CardDef>,
  relics: string[] = []
): ArchetypeContext {
  const scores: Record<ArchetypeId, number> = {
    strength: 0,
    block_barricade: 0,
    exhaust: 0,
    vulnerable_loop: 0,
    aoe_finisher: 0,
    generic: 0,
  };

  for (const id of deck) {
    const card = cardsMap.get(id);
    if (!card || card.isCurse || card.isStatus) continue;

    let hasDamage = false;
    let hasBlock = false;
    let hasStrengthEffect = false;
    let hasVulnerableEffect = false;
    let hasAoe = false;
    let hasExhaustEffect = false;

    for (const eff of card.effects) {
      if (eff.type === 'damage' || eff.type === 'multiHit' || eff.type === 'damageEqualToBlock') {
        hasDamage = true;
      }
      if (eff.type === 'block' || eff.type === 'doubleBlock' || eff.type === 'exhaustHandNonAttackGainBlock') {
        hasBlock = true;
      }
      if (eff.type === 'strength') {
        hasStrengthEffect = true;
      }
      if (eff.type === 'vulnerable' || eff.type === 'vulnerableAll') {
        hasVulnerableEffect = true;
      }
      if (eff.type === 'damageAll') {
        hasAoe = true;
      }
      if (
        eff.type === 'exhaustRandom' ||
        eff.type === 'exhaustHand' ||
        eff.type === 'exhaustHandNonAttack' ||
        eff.type === 'exhaustHandNonAttackGainBlock' ||
        eff.type === 'exhaustHandDealDamage' ||
        eff.type === 'exhume'
      ) {
        hasExhaustEffect = true;
      }
      if (eff.strengthScale && eff.strengthScale > 0) {
        hasStrengthEffect = true;
      }
    }

    const exhaustFlag = card.exhaust === true;
    hasExhaustEffect = hasExhaustEffect || exhaustFlag;

    // Strength archetype: any Strength source or Strength-scaling attack.
    if (hasStrengthEffect) {
      scores.strength += 3;
      if (hasDamage) scores.strength += 1;
    }

    // Block/Barricade archetype: heavy block and block-based damage.
    if (hasBlock) {
      scores.block_barricade += 2;
      if (hasDamage) scores.block_barricade += 1;
    }
    if (effArrayHasType(card.effects, 'damageEqualToBlock')) {
      scores.block_barricade += 2;
    }

    // Exhaust archetype: anything that exhausts or interacts with exhaust.
    if (hasExhaustEffect) {
      scores.exhaust += 2;
      if (hasBlock || hasDamage) scores.exhaust += 1;
    }

    // Vulnerable loop archetype.
    if (hasVulnerableEffect) {
      scores.vulnerable_loop += 2;
      if (hasDamage) scores.vulnerable_loop += 1;
    }

    // AoE / finisher archetype.
    if (hasAoe) {
      scores.aoe_finisher += 3;
      if (hasDamage) scores.aoe_finisher += 1;
    }
  }

  // Future: relic-based modifiers can be added here using `relics`.
  void relics;

  // Determine primary and secondary archetypes.
  let primary: ArchetypeId = 'generic';
  let secondary: ArchetypeId | null = null;
  let primaryScore = 0;
  let secondaryScore = 0;

  for (const id of ARCHETYPES) {
    const s = scores[id];
    if (s > primaryScore) {
      secondary = primary;
      secondaryScore = primaryScore;
      primary = id;
      primaryScore = s;
    } else if (s > secondaryScore) {
      secondary = id;
      secondaryScore = s;
    }
  }

  const MIN_PRIMARY = 4;
  if (primaryScore < MIN_PRIMARY) {
    primary = 'generic';
    secondary = null;
  }

  return {
    primary,
    secondary,
    scores,
  };
}

