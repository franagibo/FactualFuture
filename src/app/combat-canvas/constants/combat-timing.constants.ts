/**
 * Combat and overlay timing constants (ms).
 * Single place to tune animation and feedback delays.
 */
export const COMBAT_TIMING = {
  /** Floating number (damage/block) display duration before removal. */
  floatingNumberTtlMs: 700,
  /** Card return-to-hand animation duration. */
  returnDurationMs: 200,
  /** Delay before calling endTurn() after "Enemy turn" banner. */
  enemyTurnBannerDelayMs: 1200,
  /** Delay before transitioning after reward selection feedback. */
  rewardFeedbackDelayMs: 480,
  /** Delay before redraw() after floating numbers / card fly completes. */
  redrawAfterFloatMs: 750,
  /** Map load timeout; on expiry show error and Retry. */
  mapLoadTimeoutMs: 10_000,
} as const;
