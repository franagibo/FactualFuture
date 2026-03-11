/**
 * Shared types for combat view (component and renderer).
 */

/** Floating number shown on screen (damage/block) with position and optional expiry. */
export interface FloatingNumber {
  type: 'damage' | 'block';
  value: number;
  x: number;
  y: number;
  enemyIndex?: number;
  /** Timestamp when added for expiry (ms). */
  addedAt?: number;
}
