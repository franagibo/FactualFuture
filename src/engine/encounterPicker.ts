import type { GameState } from './types';
import { getNodeById } from './run';
import type { Rng } from './rng';
import { defaultRng } from './rng';

/** Act config shape for encounter selection: encounter pools and weights per act. */
export interface ActConfigEncounter {
  encounterPool?: string[];
  eliteEncounterPool?: string[];
  bossEncounter?: string;
  encounterWeights?: Record<string, number>;
  eliteEncounterWeights?: Record<string, number>;
  firstThreeEncounterPool?: string[];
  firstThreeEncounterWeights?: Record<string, number>;
  firstTwoEncounterPool?: string[];
  firstTwoEncounterWeights?: Record<string, number>;
}

function pickFromPool(
  pool: string[],
  weights: Record<string, number> | undefined,
  rng: Rng
): string {
  if (!pool.length) return '';
  if (weights && Object.keys(weights).length > 0) {
    let total = 0;
    for (const id of pool) total += weights[id] ?? 0;
    if (total <= 0) return pool[Math.floor(rng() * pool.length)];
    let r = rng() * total;
    for (const id of pool) {
      const w = weights[id] ?? 0;
      if (r < w) return id;
      r -= w;
    }
  }
  return pool[Math.floor(rng() * pool.length)];
}

function getMonsterPoolAndWeights(
  actConfig: ActConfigEncounter,
  act: number,
  encounterIndex: number
): { pool: string[]; weights?: Record<string, number> } {
  if (act === 1 && actConfig.firstThreeEncounterPool?.length && encounterIndex <= 3) {
    return {
      pool: actConfig.firstThreeEncounterPool,
      weights: actConfig.firstThreeEncounterWeights,
    };
  }
  if ((act === 2 || act === 3) && actConfig.firstTwoEncounterPool?.length && encounterIndex <= 2) {
    return {
      pool: actConfig.firstTwoEncounterPool,
      weights: actConfig.firstTwoEncounterWeights,
    };
  }
  return {
    pool: actConfig.encounterPool ?? [],
    weights: actConfig.encounterWeights,
  };
}

/**
 * Pick encounter ID for a map node (boss / elite / combat). Mirrors game-bridge logic:
 * boss → bossEncounter; elite → weighted from eliteEncounterPool; combat → first-N or main pool,
 * excluding lastMonsterEncounterIds. Uses state._simRng when present for reproducible sims.
 */
export function pickEncounterForNode(
  state: GameState,
  nodeId: string,
  actConfig: ActConfigEncounter,
  rng: Rng = defaultRng
): string | null {
  const map = state.map;
  if (!map) return null;

  const node = getNodeById(map, nodeId);
  if (!node) return null;

  if (node.type === 'boss' && actConfig.bossEncounter) {
    return actConfig.bossEncounter;
  }

  if (node.type === 'elite' && actConfig.eliteEncounterPool?.length) {
    return pickFromPool(
      actConfig.eliteEncounterPool,
      actConfig.eliteEncounterWeights,
      rng
    );
  }

  if (node.type === 'combat' && actConfig.encounterPool?.length) {
    const encounterIndex = (state.monsterEncountersCompletedThisAct ?? 0) + 1;
    const { pool, weights } = getMonsterPoolAndWeights(actConfig, state.act ?? 1, encounterIndex);
    const exclude = new Set(state.lastMonsterEncounterIds ?? []);
    const filtered = pool.filter((id) => !exclude.has(id));
    const usePool = filtered.length > 0 ? filtered : pool;
    return pickFromPool(usePool, weights, rng);
  }

  return null;
}
