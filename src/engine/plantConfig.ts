import type { PlantState, PlantMode } from './types';

/** Max plants for Verdant Machinist. */
export const MAX_PLANTS = 3;

/** Growth required to evolve (advance stage). */
export const GROWTH_TO_EVOLVE = 3;

/** Base max HP by growth stage (Seedling, Sprout, Mature). */
export const PLANT_HP_BY_STAGE: Record<1 | 2 | 3, number> = {
  1: 9,
  2: 11,
  3: 13,
};

/** End-of-turn: Attack mode damage by stage (Sprout, Mature). Seedling has no ability. */
export const PLANT_ATTACK_DAMAGE: Record<2 | 3, number> = {
  2: 4,
  3: 6,
};

/** Mature Attack mode hits twice. */
export const PLANT_ATTACK_HITS_MATURE = 2;

/** End-of-turn: Defense mode block to player by stage. */
export const PLANT_DEFENSE_PLAYER_BLOCK: Record<2 | 3, number> = {
  2: 2,
  3: 6,
};

/** End-of-turn: Defense mode block to plant (Sprout). Mature uses intercept (Rooted Guard) — simplified to block here. */
export const PLANT_DEFENSE_PLANT_BLOCK: Record<2 | 3, number> = {
  2: 2,
  3: 0,
};

/** End-of-turn: Support mode — Weak stacks applied to random enemy (Sprout). */
export const PLANT_SUPPORT_WEAK = 1;

/** End-of-turn: Support mode — block to player (Sprout). */
export const PLANT_SUPPORT_PLAYER_BLOCK = 2;

/** Support Mature: give player 1 Energy every 2 turns (track via turnsAlive % 2). */
export const PLANT_SUPPORT_ENERGY_EVERY_N_TURNS = 2;

/** Default HP for a newly summoned Seedling. */
export const SEEDLING_DEFAULT_HP = 9;

/** Character id that uses the plant mechanic. */
export const PLANT_CHARACTER_ID = 'verdant_machinist';

export function getAlivePlants(plants: PlantState[] | undefined): PlantState[] {
  if (!plants?.length) return [];
  return plants.filter((p) => p.hp > 0);
}

export function isPlantCharacter(characterId: string | undefined): boolean {
  return characterId === PLANT_CHARACTER_ID;
}

/** Create a new Seedling (stage 1). */
export function createSeedling(
  id: string,
  hp: number = SEEDLING_DEFAULT_HP,
  mode: PlantMode = 'defense'
): PlantState {
  return {
    id,
    hp,
    maxHp: hp,
    block: 0,
    growth: 0,
    growthStage: 1,
    mode,
    turnsAlive: 0,
  };
}

/** Evolve plant to next stage (1→2→3), reset growth, set maxHp. */
export function evolvePlant(plant: PlantState): PlantState {
  const nextStage = Math.min(3, plant.growthStage + 1) as 1 | 2 | 3;
  const maxHp = PLANT_HP_BY_STAGE[nextStage];
  return {
    ...plant,
    growth: 0,
    growthStage: nextStage as 1 | 2 | 3,
    maxHp,
    hp: Math.min(plant.hp, maxHp),
  };
}
