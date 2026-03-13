import type { GameState, EnemyState } from '../types';
import type { CardDef } from '../cardDef';
import type { EnemyDef } from '../loadData';
import type { ArchetypeContext } from './archetypes';
import type { BotAction } from './strategyBot';

/**
 * Fixed limits used for feature encoding.
 * These are deliberately small to keep the feature vector compact and stable.
 */
const MAX_ENEMIES = 3;
const MAX_HAND_SIZE = 10;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function oneHot(value: number, size: number): number[] {
  const arr = new Array(size).fill(0);
  if (value >= 0 && value < size) {
    arr[value] = 1;
  }
  return arr;
}

function encodeEnemyIntent(enemy: EnemyState | null): number[] {
  if (!enemy || !enemy.intent) {
    return [...oneHot(4, 5), 0]; // type none + value 0
  }

  const typeIndex =
    enemy.intent.type === 'attack'
      ? 0
      : enemy.intent.type === 'block'
      ? 1
      : enemy.intent.type === 'debuff'
      ? 2
      : enemy.intent.type === 'vulnerable'
      ? 3
      : 4;

  const valueNorm = clamp(enemy.intent.value / Math.max(1, enemy.maxHp), 0, 1);

  return [...oneHot(typeIndex, 5), valueNorm];
}

function encodeEnemy(enemy: EnemyState | null): number[] {
  if (!enemy) {
    // Empty slot.
    return [
      0, // hp%
      0, // block norm
      0, // vulnerable
      0, // weak
      ...encodeEnemyIntent(null),
    ];
  }

  const hpPct = enemy.maxHp > 0 ? clamp(enemy.hp / enemy.maxHp, 0, 1) : 0;
  const blockNorm = clamp(enemy.block / Math.max(1, enemy.maxHp), 0, 1);
  const vuln = clamp((enemy.vulnerableStacks ?? 0) / 5, 0, 1);
  const weak = clamp((enemy.weakStacks ?? 0) / 5, 0, 1);

  return [hpPct, blockNorm, vuln, weak, ...encodeEnemyIntent(enemy)];
}

function encodePlayer(state: GameState): number[] {
  const hpPct =
    state.playerMaxHp > 0 ? clamp(state.playerHp / state.playerMaxHp, 0, 1) : 0;
  const blockNorm = clamp(
    (state.playerBlock ?? 0) / Math.max(1, state.playerMaxHp),
    0,
    1
  );
  const turnNorm = clamp((state.turnNumber ?? 1) / 20, 0, 1);

  const strength = clamp((state.strengthStacks ?? 0) / 10, 0, 1);
  const frail = clamp((state.frailStacks ?? 0) / 5, 0, 1);
  const weak = clamp((state.playerWeakStacks ?? 0) / 5, 0, 1);
  const vulnerable = clamp((state.playerVulnerableStacks ?? 0) / 5, 0, 1);
  const thorns = clamp((state.playerThorns ?? 0) / 10, 0, 1);
  const healPerTurn = clamp((state.playerHealAtEndOfTurn ?? 0) / 20, 0, 1);
  const blockPerTurn = clamp((state.playerBlockPerTurn ?? 0) / 30, 0, 1);
  const strengthPerTurn = clamp((state.playerStrengthPerTurn ?? 0) / 5, 0, 1);

  return [
    hpPct,
    blockNorm,
    turnNorm,
    strength,
    frail,
    weak,
    vulnerable,
    thorns,
    healPerTurn,
    blockPerTurn,
    strengthPerTurn,
  ];
}

function encodeArchetype(archetype: ArchetypeContext | null | undefined): number[] {
  if (!archetype) {
    // primary/secondary one-hot (6 options) + raw scores (6).
    return [
      ...new Array(6).fill(0),
      ...new Array(6).fill(0),
    ];
  }

  const archetypes: ArchetypeContext['primary'][] = [
    'strength',
    'block_barricade',
    'exhaust',
    'vulnerable_loop',
    'aoe_finisher',
    'generic',
  ];

  const primaryIndex = archetypes.indexOf(archetype.primary);
  const secondaryIndex =
    archetype.secondary != null ? archetypes.indexOf(archetype.secondary) : -1;

  const primaryOneHot = oneHot(primaryIndex, archetypes.length);
  const secondaryOneHot = oneHot(secondaryIndex, archetypes.length);

  const scoreValues = archetypes.map((id) =>
    clamp((archetype.scores[id] ?? 0) / 10, 0, 1)
  );

  return [...primaryOneHot, ...secondaryOneHot, ...scoreValues];
}

function encodeCardSummary(card: CardDef | undefined): number[] {
  if (!card) {
    // Empty hand slot.
    return [
      0, // type attack
      0, // type block/defense
      0, // type power/other
      0, // cost norm
      0, // base damage norm
      0, // base block norm
      0, // strength scaling
      0, // aoe
      0, // vulnerable applying
      0, // exhaust synergy / exhaust
      0, // draw/energy utility
    ];
  }

  const effects = card.effects ?? [];

  const hasDamage = effects.some(
    (e) =>
      e.type === 'damage' ||
      e.type === 'multiHit' ||
      e.type === 'damageAll' ||
      e.type === 'damageEqualToBlock'
  );
  const hasBlock = effects.some(
    (e) =>
      e.type === 'block' ||
      e.type === 'doubleBlock' ||
      e.type === 'exhaustHandNonAttackGainBlock'
  );
  const isPower =
    card.type === 'power' ||
    (!hasDamage && !hasBlock && effects.length > 0 && card.type !== 'status');

  const costNorm = clamp((card.cost ?? 0) / 3, 0, 1);

  let baseDmg = 0;
  let baseBlock = 0;
  let strengthScale = 0;
  let hasAoe = false;
  let hasVuln = false;
  let hasExhaustSynergy = false;
  let hasUtility = false;

  for (const e of effects) {
    if (e.type === 'damage' && e.value != null) {
      baseDmg += e.value;
    }
    if (e.type === 'multiHit') {
      baseDmg += (e.value ?? 0) * (e.times ?? 1);
    }
    if (e.type === 'damageAll') {
      baseDmg += e.value ?? 0;
      hasAoe = true;
    }
    if (e.type === 'damageEqualToBlock') {
      hasAoe = true;
    }
    if (e.type === 'block') {
      baseBlock += e.value ?? 0;
    }
    if (e.type === 'doubleBlock') {
      baseBlock += (e.value ?? 0) * 2;
    }
    if (e.type === 'exhaustHandNonAttackGainBlock') {
      baseBlock += e.value ?? 0;
    }
    if (e.strengthScale && e.strengthScale > 0) {
      strengthScale = Math.max(strengthScale, e.strengthScale);
    }
    if (e.type === 'vulnerable' || e.type === 'vulnerableAll') {
      hasVuln = true;
    }
    if (
      e.type === 'exhaustRandom' ||
      e.type === 'exhaustHand' ||
      e.type === 'exhaustHandNonAttack' ||
      e.type === 'exhaustHandNonAttackGainBlock' ||
      e.type === 'exhaustHandDealDamage' ||
      e.type === 'exhume'
    ) {
      hasExhaustSynergy = true;
    }
    if (
      e.type === 'draw' ||
      e.type === 'drawUpTo' ||
      e.type === 'gainEnergy' ||
      e.type === 'scry'
    ) {
      hasUtility = true;
    }
  }

  if (card.exhaust) {
    hasExhaustSynergy = true;
  }

  const dmgNorm = clamp(baseDmg / 40, 0, 1);
  const blockNorm = clamp(baseBlock / 40, 0, 1);
  const strengthNorm = clamp(strengthScale / 3, 0, 1);

  return [
    hasDamage ? 1 : 0,
    hasBlock ? 1 : 0,
    isPower ? 1 : 0,
    costNorm,
    dmgNorm,
    blockNorm,
    strengthNorm,
    hasAoe ? 1 : 0,
    hasVuln ? 1 : 0,
    hasExhaustSynergy ? 1 : 0,
    hasUtility ? 1 : 0,
  ];
}

export function encodeStateFeatures(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  archetype: ArchetypeContext | null | undefined
): number[] {
  void enemyDefs;

  const playerFeat = encodePlayer(state);

  const enemiesFeat: number[] = [];
  for (let i = 0; i < MAX_ENEMIES; i++) {
    const enemy: EnemyState | null = state.enemies[i] ?? null;
    enemiesFeat.push(...encodeEnemy(enemy));
  }

  const handFeat: number[] = [];
  for (let i = 0; i < MAX_HAND_SIZE; i++) {
    const cardId = state.hand[i];
    const card = cardId ? cardsMap.get(cardId) : undefined;
    handFeat.push(...encodeCardSummary(card));
  }

  const archetypeFeat = encodeArchetype(archetype);

  return [...playerFeat, ...enemiesFeat, ...handFeat, ...archetypeFeat];
}

export interface EncodedAction {
  action: BotAction;
  cardIndexInHand: number;
  targetIndex: number;
  features: number[];
}

export function encodeActionFeatures(
  state: GameState,
  action: BotAction,
  cardIndexInHand: number,
  targetIndex: number,
  cardsMap: Map<string, CardDef>
): number[] {
  const isEndTurn = action.type === 'endTurn' ? 1 : 0;
  const card =
    action.type === 'play'
      ? cardsMap.get(action.cardId)
      : undefined;

  const cardSummary = encodeCardSummary(card);

  const energyNorm = clamp(state.energy / Math.max(1, state.maxEnergy || 3), 0, 1);
  const handIndexNorm = clamp(cardIndexInHand / Math.max(1, MAX_HAND_SIZE - 1), 0, 1);
  const targetNorm = clamp(targetIndex / Math.max(1, MAX_ENEMIES - 1), 0, 1);

  return [
    isEndTurn,
    energyNorm,
    handIndexNorm,
    targetNorm,
    ...cardSummary,
  ];
}

