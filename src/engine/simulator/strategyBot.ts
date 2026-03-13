import type { GameState, EnemyState } from '../types';
import type { ArchetypeContext } from './archetypes';
import type { CardDef, CardEffect } from '../cardDef';
import type { EnemyDef } from '../loadData';
import { playCard, endTurn } from '../combat';
import { createSeededRng } from '../rng';

export type BotAction =
  | { type: 'play'; cardId: string; targetIndex: number }
  | { type: 'endTurn' };

export interface CandidateAction {
  action: BotAction;
  /** Index into state.hand for the played card; -1 for endTurn. */
  cardIndexInHand: number;
  /** Enemy index for the target; -1 for non-targeted cards or endTurn. */
  targetIndex: number;
}

function cardNeedsEnemyTarget(card: CardDef): boolean {
  return card.effects.some(
    (e) => e.target === 'enemy' && e.type !== 'damageAll' && e.type !== 'vulnerableAll'
  );
}

function cardHasEffectType(card: CardDef, effectType: CardEffect['type']): boolean {
  return card.effects.some((e) => e.type === effectType);
}

export function cardBlockValue(card: CardDef): number {
  return card.effects.filter((e) => e.type === 'block').reduce((s, e) => s + e.value, 0);
}

export function cardDamageValue(card: CardDef, state: GameState): number {
  let total = 0;
  for (const e of card.effects) {
    if (e.type === 'damage' && e.target === 'enemy') {
      total += e.value + (e.strengthScale ?? 0) * (state.strengthStacks ?? 0);
    }
    if (e.type === 'multiHit' && e.target === 'enemy') {
      total += (e.value ?? 0) * (e.times ?? 1);
    }
    if (e.type === 'damageAll') {
      total += e.value * Math.max(1, state.enemies.filter((x) => x.hp > 0).length);
    }
  }
  return total;
}

/** Total attack damage incoming this turn from enemy intents. */
function incomingAttackDamage(state: GameState): number {
  let total = 0;
  for (const e of state.enemies) {
    if (e.hp <= 0 || !e.intent || e.intent.type !== 'attack') continue;
    total += e.intent.value;
  }
  return total;
}

/** Index of alive enemy with lowest HP (for kill order). */
function lowestHpAliveEnemyIndex(state: GameState): number {
  let idx = -1;
  let minHp = Infinity;
  state.enemies.forEach((e, i) => {
    if (e.hp > 0 && e.hp < minHp) {
      minHp = e.hp;
      idx = i;
    }
  });
  return idx;
}

export function enumerateCandidateActions(
  state: GameState,
  cardsMap: Map<string, CardDef>
): CandidateAction[] {
  if (state.phase !== 'player' || state.combatResult || !state.enemies.length) {
    return [{ action: { type: 'endTurn' }, cardIndexInHand: -1, targetIndex: -1 }];
  }

  const aliveIndices = state.enemies
    .map((e, i) => (e.hp > 0 ? i : -1))
    .filter((i) => i >= 0);

  const candidates: CandidateAction[] = [];

  for (let hi = 0; hi < state.hand.length; hi++) {
    const cardId = state.hand[hi];
    const card = cardsMap.get(cardId);
    if (!card || card.cost > state.energy) continue;

    const needsTarget = cardNeedsEnemyTarget(card);
    const targets = needsTarget ? aliveIndices : [0];
    if (needsTarget && aliveIndices.length === 0) continue;

    for (const targetIndex of targets) {
      candidates.push({
        action: { type: 'play', cardId, targetIndex },
        cardIndexInHand: hi,
        targetIndex,
      });
    }
  }

  if (candidates.length === 0) {
    candidates.push({ action: { type: 'endTurn' }, cardIndexInHand: -1, targetIndex: -1 });
  } else {
    candidates.push({ action: { type: 'endTurn' }, cardIndexInHand: -1, targetIndex: -1 });
  }

  return candidates;
}

/** Baseline bot: prioritize block when under attack, otherwise attack. */
export function pickActionAlwaysBlockFirst(
  state: GameState,
  cardsMap: Map<string, CardDef>
): BotAction {
  if (state.phase !== 'player' || state.combatResult || !state.enemies.length) {
    return { type: 'endTurn' };
  }

  const incoming = incomingAttackDamage(state);
  const aliveIndices = state.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const lowestHpIdx = aliveIndices.length ? aliveIndices.reduce((best, i) =>
    state.enemies[i].hp < state.enemies[best].hp ? i : best, aliveIndices[0]) : -1;

  const playable = state.hand
    .map((id) => cardsMap.get(id))
    .filter((c): c is CardDef => !!c && c.cost <= state.energy);

  if (!playable.length) return { type: 'endTurn' };

  let chosen: CardDef | null = null;
  if (incoming > 0) {
    // Pick highest block card when there is incoming damage.
    chosen = playable
      .filter((c) => cardBlockValue(c) > 0)
      .sort((a, b) => cardBlockValue(b) - cardBlockValue(a))[0] ?? null;
  }

  if (!chosen) {
    // Otherwise, pick highest damage card.
    chosen = playable
      .sort((a, b) => cardDamageValue(b, state) - cardDamageValue(a, state))[0] ?? null;
  }

  if (!chosen) return { type: 'endTurn' };

  const needsTarget = cardNeedsEnemyTarget(chosen);
  const targetIndex = needsTarget
    ? lowestHpIdx >= 0
      ? lowestHpIdx
      : aliveIndices[0] ?? 0
    : 0;

  return { type: 'play', cardId: chosen.id, targetIndex };
}

/** Baseline bot: always prioritize attacking (highest damage into lowest-HP enemy). */
export function pickActionAlwaysAttackFirst(
  state: GameState,
  cardsMap: Map<string, CardDef>
): BotAction {
  if (state.phase !== 'player' || state.combatResult || !state.enemies.length) {
    return { type: 'endTurn' };
  }

  const aliveIndices = state.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const lowestHpIdx = aliveIndices.length ? aliveIndices.reduce((best, i) =>
    state.enemies[i].hp < state.enemies[best].hp ? i : best, aliveIndices[0]) : -1;

  const playable = state.hand
    .map((id) => cardsMap.get(id))
    .filter((c): c is CardDef => !!c && c.cost <= state.energy);

  if (!playable.length) return { type: 'endTurn' };

  const chosen = playable
    .sort((a, b) => cardDamageValue(b, state) - cardDamageValue(a, state))[0] ?? null;

  if (!chosen) return { type: 'endTurn' };

  const needsTarget = cardNeedsEnemyTarget(chosen);
  const targetIndex = needsTarget
    ? lowestHpIdx >= 0
      ? lowestHpIdx
      : aliveIndices[0] ?? 0
    : 0;

  return { type: 'play', cardId: chosen.id, targetIndex };
}

interface SimulatedOutcome {
  projectedPlayerHp: number;
  projectedEnemies: EnemyState[];
  died: boolean;
}

/**
 * Simulate playing one action plus an enemy turn, returning projected HP and enemy state.
 * Uses a derived seeded RNG so the lookahead is deterministic without mutating the run's RNG.
 */
function simulateTurnOutcome(
  state: GameState,
  action: BotAction,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  candidateIndex: number
): SimulatedOutcome {
  // Clone shallowly; enemy/hand/deck arrays are copied below when mutated by combat helpers.
  const seedBase = state.seed ?? 0;
  const derivedSeed =
    seedBase * 1000003 +
    (state.floor ?? 0) * 10007 +
    (state.turnNumber ?? 0) * 97 +
    candidateIndex;
  const simRng = createSeededRng(derivedSeed);

  let simState: GameState = {
    ...state,
    // Use separate RNG for simulation so we don't affect the main run's RNG sequence.
    _simRng: simRng,
    enemies: state.enemies.map((e) => ({ ...e })),
    hand: [...state.hand],
    deck: [...state.deck],
    discard: [...state.discard],
    exhaustPile: [...(state.exhaustPile ?? [])],
  };

  if (action.type === 'play') {
    simState = playCard(simState, action.cardId, action.targetIndex, cardsMap, enemyDefs);
  }

  if (simState.combatResult === 'lose') {
    return { projectedPlayerHp: 0, projectedEnemies: simState.enemies, died: true };
  }

  // Run enemy turn once.
  simState = endTurn(simState, cardsMap, enemyDefs);

  return {
    projectedPlayerHp: simState.playerHp,
    projectedEnemies: simState.enemies.map((e) => ({ ...e })),
    died: simState.combatResult === 'lose',
  };
}

/** Whether we have a high-damage card in hand (for vulnerable-first heuristic). */
function hasDamageInHand(state: GameState, cardsMap: Map<string, CardDef>, excludeCardId: string): boolean {
  return state.hand.some((id) => {
    if (id === excludeCardId) return false;
    const card = cardsMap.get(id);
    return card && card.cost <= state.energy && (cardHasEffectType(card, 'damage') || cardHasEffectType(card, 'multiHit') || cardHasEffectType(card, 'damageAll'));
  });
}

/** True if we can still afford at least one attack card with the given remaining energy. */
function hasPlayableAttackWithEnergy(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  remainingEnergy: number,
  excludeCardId?: string
): boolean {
  if (remainingEnergy <= 0) return false;
  return state.hand.some((id) => {
    if (excludeCardId && id === excludeCardId) return false;
    const card = cardsMap.get(id);
    if (!card || card.cost > remainingEnergy) return false;
    return cardHasEffectType(card, 'damage') || cardHasEffectType(card, 'multiHit') || cardHasEffectType(card, 'damageAll');
  });
}

/**
 * Pick one action: play a card (with target) or end turn.
 * Uses heuristics: block when enemy attacks, vulnerable before big attack, focus lowest-HP enemy.
 */
export function pickAction(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  archetypeContext?: ArchetypeContext
): BotAction {
  if (state.phase !== 'player' || state.combatResult || !state.enemies.length) {
    return { type: 'endTurn' };
  }

  const aliveIndices = state.enemies.map((e, i) => (e.hp > 0 ? i : -1)).filter((i) => i >= 0);
  const incoming = incomingAttackDamage(state);
  const currentBlock = state.playerBlock ?? 0;
  const lowestHpIdx = lowestHpAliveEnemyIndex(state);

  const primaryArchetype = archetypeContext?.primary ?? 'generic';

  const candidates = enumerateCandidateActions(state, cardsMap).map((c) => ({
    cardId: c.action.type === 'play' ? c.action.cardId : '',
    targetIndex: c.targetIndex,
    action: c.action,
    score: 0,
  }));

  if (candidates.length === 0) {
    return { type: 'endTurn' };
  }

  const lowHpThreshold = Math.max(10, Math.floor((state.playerMaxHp ?? 80) * 0.25));

  // Heuristic scoring (survival, block, strength, vulnerable, damage, lethal) before lookahead.
  for (const c of candidates) {
    if (c.action.type === 'endTurn') {
      c.score += 0;
      continue;
    }
    const card = cardsMap.get(c.cardId);
    if (!card) continue;

    const targetEnemy = state.enemies[c.targetIndex] ?? null;
    const dmg = cardDamageValue(card, state);
    const blockVal = cardBlockValue(card);
    const remainingEnergy = state.energy - card.cost;

    // Prefer playing over ending turn when we have playable cards.
    c.score += 20;

    // Survival: approximate HP after enemy turn.
    const totalBlockAfter = currentBlock + blockVal;
    const missingDamage = Math.max(0, incoming - totalBlockAfter);
    const projectedHpAfterTurn = state.playerHp - missingDamage;
    c.score += -missingDamage * 4;
    if (projectedHpAfterTurn < lowHpThreshold) {
      c.score -= (lowHpThreshold - projectedHpAfterTurn) * 3;
    }

    // Block: reward covering ~50% of incoming when enemy attacks; low priority when no incoming.
    if (cardHasEffectType(card, 'block')) {
      if (incoming > 0) {
        const desiredBlock = incoming * 0.5;
        const beforeBlock = currentBlock;
        const afterBlock = currentBlock + blockVal;
        const distBefore = Math.abs(beforeBlock - desiredBlock);
        const distAfter = Math.abs(afterBlock - desiredBlock);
        const improvement = distBefore - distAfter;
        c.score += improvement * 4;
        if (afterBlock < desiredBlock) {
          c.score += (afterBlock / Math.max(1, desiredBlock)) * 6;
        } else {
          c.score += 5;
        }
      } else {
        c.score += 1;
      }
    }

    // Strength before attacks: high priority if we can follow up with an attack.
    if (cardHasEffectType(card, 'strength')) {
      const hasFollowupAttack = hasPlayableAttackWithEnergy(state, cardsMap, remainingEnergy, c.cardId);
      const strengthBase = primaryArchetype === 'strength' ? 90 : 70;
      if (hasFollowupAttack) {
        c.score += strengthBase;
      } else {
        c.score += primaryArchetype === 'strength' ? 40 : 25;
      }
    }

    // Vulnerable before attacks: good if we have damage in hand and enemy isn't already vulnerable.
    if (cardHasEffectType(card, 'vulnerable') || cardHasEffectType(card, 'vulnerableAll')) {
      const alreadyVuln = (targetEnemy?.vulnerableStacks ?? 0) > 0;
      if (!alreadyVuln && hasPlayableAttackWithEnergy(state, cardsMap, remainingEnergy, c.cardId)) {
        c.score += primaryArchetype === 'vulnerable_loop' ? 80 : 60;
      } else if (!alreadyVuln) {
        c.score += primaryArchetype === 'vulnerable_loop' ? 35 : 20;
      }
    }

    // Damage: base score, lethal bonus, focus lowest-HP target.
    if (
      cardHasEffectType(card, 'damage') ||
      cardHasEffectType(card, 'multiHit') ||
      cardHasEffectType(card, 'damageAll') ||
      cardHasEffectType(card, 'damageEqualToBlock')
    ) {
      const targetEffectiveHp = targetEnemy ? targetEnemy.hp + targetEnemy.block : Infinity;
      const dmgBase = primaryArchetype === 'strength' ? 30 : 20;
      c.score += dmgBase + dmg;
      if (targetEnemy && dmg >= targetEffectiveHp) {
        if (projectedHpAfterTurn >= lowHpThreshold) {
          c.score += 80;
        } else {
          c.score += 30;
        }
      }
      if (c.targetIndex === lowestHpIdx && lowestHpIdx >= 0) {
        c.score += 25;
      }
    }

    if (card.exhaust) c.score -= 2;
  }

  // One-turn lookahead: simulate each candidate and add a lookahead term to the score.
  const baseHp = state.playerHp;
  const lookaheadWeightHp = 3; // impact of preserving HP
  const lookaheadWeightEnemy = 0.2; // impact of reducing enemy HP
  const deathPenalty = 200; // strong penalty for lines that die next turn

  candidates.forEach((c, idx) => {
    const outcome = simulateTurnOutcome(state, c.action, cardsMap, enemyDefs, idx + 1);
    const enemyEffectiveHp = outcome.projectedEnemies
      .filter((e) => e.hp > 0)
      .reduce((s, e) => s + e.hp + e.block, 0);
    const currentEnemyEffectiveHp = state.enemies
      .filter((e) => e.hp > 0)
      .reduce((s, e) => s + e.hp + e.block, 0);

    const hpDelta = outcome.projectedPlayerHp - baseHp;
    const enemyDelta = currentEnemyEffectiveHp - enemyEffectiveHp;

    let lookaheadScore = 0;
    lookaheadScore += hpDelta * lookaheadWeightHp;
    lookaheadScore += enemyDelta * lookaheadWeightEnemy;
    if (outcome.died) lookaheadScore -= deathPenalty;

    c.score += lookaheadScore;
  });

  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  return best.action;
}
