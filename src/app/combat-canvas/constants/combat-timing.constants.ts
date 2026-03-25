/**
 * Combat and overlay timing constants (ms).
 * Single place to tune animation and feedback delays.
 */
export const COMBAT_TIMING = {
  /** Floating number (damage/block) display duration before removal. */
  floatingNumberTtlMs: 700,
  /** Card return-to-hand animation duration. */
  returnDurationMs: 260,
  /** Hover lift/scale lerp: exponential decay coefficient (higher = snappier). ~10 gives a fluid ~6–8 frame settle. */
  hoverLerpSpeed: 18,
  /** Neighbor spread lerp: exponential decay coefficient. Slightly slower than hover for a staggered feel. */
  spreadLerpSpeed: 14,
  /** Delay before calling endTurn() after "Enemy turn" banner. */
  enemyTurnBannerDelayMs: 1200,
  /** Delay before transitioning after reward selection feedback. */
  rewardFeedbackDelayMs: 480,
  /** Delay before redraw() after floating numbers / card fly completes. */
  redrawAfterFloatMs: 750,
  /** Map load timeout; on expiry show error and Retry. */
  mapLoadTimeoutMs: 10_000,
  /** Card position/rotation/scale lerp per second (exponential decay). Higher = snappier hand relaxation. */
  cardLerpSpeed: 18,
} as const;

/** Enemy placeholder (Zombie_Villager) animation timing. Same folder names (Idle, Hurt, Dying) used for future per-enemy folders. */
export const ENEMY_ANIMATION_TIMING = {
  frameMs: 55,
  idleFrameCount: 18,
  hurtFrameCount: 12,
  dyingFrameCount: 15,
  get hurtDurationMs(): number {
    return this.hurtFrameCount * this.frameMs;
  },
  get dyingDurationMs(): number {
    return this.dyingFrameCount * this.frameMs;
  },
} as const;