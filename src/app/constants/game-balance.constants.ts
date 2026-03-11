/**
 * Game balance constants: potion cap, drop chance, etc.
 * Tune here or move to data config (e.g. JSON) for per-act balance.
 */
export const GAME_BALANCE = {
  /** Max potions the player can carry. */
  maxPotions: 3,
  /** Chance (0–1) to grant a potion after winning a combat. */
  potionDropChance: 0.4,
} as const;
