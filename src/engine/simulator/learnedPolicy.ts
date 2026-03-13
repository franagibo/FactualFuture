import type { GameState } from '../types';
import type { CardDef } from '../cardDef';
import type { EnemyDef } from '../loadData';
import type { ArchetypeContext } from './archetypes';
import type { BotAction } from './strategyBot';
import { enumerateCandidateActions } from './strategyBot';
import { encodeStateFeatures, encodeActionFeatures } from './features';

export interface LearnedPolicyWeights {
  /** Row-major [hidden_dim, input_dim] */
  W1: number[][];
  b1: number[];
  /** Row-major [hidden_dim2, hidden_dim] */
  W2: number[][];
  b2: number[];
  /** Row-major [1, hidden_dim2] */
  W3: number[][];
  b3: number[];
}

export interface LearnedPolicyConfig {
  weights: LearnedPolicyWeights;
}

let cachedPolicy: LearnedPolicyConfig | null = null;

export function setLearnedPolicy(config: LearnedPolicyConfig | null): void {
  cachedPolicy = config;
}

function relu(v: number): number {
  return v > 0 ? v : 0;
}

function matVec(W: number[][], x: number[], b: number[]): number[] {
  const out = new Array(W.length).fill(0);
  for (let i = 0; i < W.length; i++) {
    const row = W[i];
    let sum = 0;
    const len = Math.min(row.length, x.length);
    for (let j = 0; j < len; j++) {
      sum += row[j] * x[j];
    }
    out[i] = sum + (b[i] ?? 0);
  }
  return out;
}

function forward(features: number[], cfg: LearnedPolicyConfig): number {
  const { W1, b1, W2, b2, W3, b3 } = cfg.weights;
  const h1 = matVec(W1, features, b1).map(relu);
  const h2 = matVec(W2, h1, b2).map(relu);
  const out = matVec(W3, h2, b3);
  return out[0] ?? 0;
}

export function pickActionLearned(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  archetypeContext: ArchetypeContext
): BotAction {
  if (!cachedPolicy) {
    // Fallback: use existing heuristic via strategy bot.
    // To avoid a circular import, we throw here and let callers provide a fallback.
    throw new Error('Learned policy not configured. Call setLearnedPolicy() first.');
  }

  if (state.phase !== 'player' || state.combatResult || !state.enemies.length) {
    return { type: 'endTurn' };
  }

  const candidates = enumerateCandidateActions(state, cardsMap);
  if (!candidates.length) {
    return { type: 'endTurn' };
  }

  const stateFeatures = encodeStateFeatures(state, cardsMap, enemyDefs, archetypeContext);

  let bestScore = -Infinity;
  let bestAction: BotAction = { type: 'endTurn' };

  for (const c of candidates) {
    const actionFeatures = encodeActionFeatures(
      state,
      c.action,
      c.cardIndexInHand,
      c.targetIndex,
      cardsMap
    );
    const input = [...stateFeatures, ...actionFeatures];
    const score = forward(input, cachedPolicy);
    if (score > bestScore) {
      bestScore = score;
      bestAction = c.action;
    }
  }

  return bestAction;
}

