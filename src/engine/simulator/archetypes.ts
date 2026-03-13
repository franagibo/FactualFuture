import type { GameState } from '../types';
import type { CardDef } from '../cardDef';

export type ArchetypeId =
  | 'strength'
  | 'block_barricade'
  | 'exhaust'
  | 'vulnerable_loop'
  | 'aoe_finisher'
  | 'plant_swarm'
  | 'plant_evolution'
  | 'plant_sacrifice'
  | 'plant_defense'
  | 'generic';

export interface ArchetypeContext {
  primary: ArchetypeId;
  secondary: ArchetypeId | null;
  scores: Record<ArchetypeId, number>;
}

const GUNGIRL_ARCHETYPES: ArchetypeId[] = [
  'strength',
  'block_barricade',
  'exhaust',
  'vulnerable_loop',
  'aoe_finisher',
];

const PLANT_ARCHETYPES: ArchetypeId[] = [
  'plant_swarm',
  'plant_evolution',
  'plant_sacrifice',
  'plant_defense',
];

/** Key card IDs that strongly signal each Verdant Machinist archetype. */
const PLANT_ARCHETYPE_KEY_CARDS: Partial<Record<ArchetypeId, string[]>> = {
  plant_swarm: ['rapid_germination', 'seed_storm', 'thorn_volley'],
  plant_evolution: ['genetic_rewrite', 'accelerated_evolution', 'hypergrowth'],
  plant_sacrifice: ['exploding_seed', 'biomass_conversion', 'spore_reactor'],
  plant_defense: ['root_guard', 'living_fortress', 'root_network'],
};

function effArrayHasType(effects: CardDef['effects'], type: CardDef['effects'][number]['type']): boolean {
  return effects.some((e) => e.type === type);
}

export function detectArchetypesFromState(
  state: GameState,
  cardsMap: Map<string, CardDef>
): ArchetypeContext {
  return detectArchetypes(state.deck ?? [], cardsMap, state.relics ?? [], state.characterId);
}

export function detectArchetypes(
  deck: string[],
  cardsMap: Map<string, CardDef>,
  relics: string[] = [],
  characterId?: string
): ArchetypeContext {
  const scores: Record<ArchetypeId, number> = {
    strength: 0,
    block_barricade: 0,
    exhaust: 0,
    vulnerable_loop: 0,
    aoe_finisher: 0,
    plant_swarm: 0,
    plant_evolution: 0,
    plant_sacrifice: 0,
    plant_defense: 0,
    generic: 0,
  };

  const isVerdantMachinist = characterId === 'verdant_machinist';

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

    // Verdant Machinist archetypes (only when character is VM).
    if (isVerdantMachinist && card) {
      const summonCount = card.effects.filter((e) => e.type === 'summon_plant').length;
      const hasGrow = effArrayHasType(card.effects, 'grow_plant');
      const hasEvolve = effArrayHasType(card.effects, 'evolve_plant');
      const hasSacrifice = effArrayHasType(card.effects, 'sacrifice_plant');
      const hasBlockToPlant = effArrayHasType(card.effects, 'blockToPlant');
      const hasDefenseMode = card.effects.some(
        (e) => e.type === 'plant_mode' && (e as { mode?: string }).mode === 'defense'
      );
      if (summonCount >= 1) {
        scores.plant_swarm += summonCount * 2 + (hasGrow ? 0 : 1);
      }
      if (effArrayHasType(card.effects, 'damageAll')) {
        scores.plant_swarm += 2;
      }
      if (hasGrow || hasEvolve) {
        scores.plant_evolution += hasEvolve ? 3 : 1;
        const growEffect = card.effects.find((e) => e.type === 'grow_plant') as { value?: number } | undefined;
        if (hasGrow && growEffect != null && (growEffect.value ?? 0) >= 2) {
          scores.plant_evolution += 1;
        }
      }
      if (hasSacrifice) {
        scores.plant_sacrifice += 3;
        if (hasDamage || effArrayHasType(card.effects, 'energy') || effArrayHasType(card.effects, 'draw')) {
          scores.plant_sacrifice += 1;
        }
      }
      if (hasBlockToPlant || hasDefenseMode || (hasBlock && (hasDefenseMode || hasBlockToPlant))) {
        scores.plant_defense += hasBlockToPlant ? 2 : 1;
        if (hasDefenseMode) scores.plant_defense += 1;
      }
      if (hasBlock && (id === 'root_guard' || id === 'living_fortress' || id === 'root_network')) {
        scores.plant_defense += 2;
      }
      for (const [arch, keyCardIds] of Object.entries(PLANT_ARCHETYPE_KEY_CARDS)) {
        if (keyCardIds?.includes(id)) {
          scores[arch as ArchetypeId] += 2;
        }
      }
    }
  }

  // Future: relic-based modifiers can be added here using `relics`.
  void relics;

  // Determine primary and secondary archetypes from the appropriate set.
  const archetypeSet = isVerdantMachinist ? PLANT_ARCHETYPES : GUNGIRL_ARCHETYPES;
  let primary: ArchetypeId = 'generic';
  let secondary: ArchetypeId | null = null;
  let primaryScore = 0;
  let secondaryScore = 0;

  for (const id of archetypeSet) {
    const s = scores[id] ?? 0;
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

