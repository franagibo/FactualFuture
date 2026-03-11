/**
 * Combat scene layout constants: player left, enemies right, hand in arc.
 * Ratios (e.g. playerZoneXRatio) are multiplied by screen w/h to get pixel values.
 * Single place to tweak layout without magic numbers in component or renderer.
 *
 * This file is also the single source of truth for named "slots" in the combat view
 * (player, enemies, HP text, etc.) via getCombatSlotBounds().
 */
export const COMBAT_LAYOUT = {
  playerZoneXRatio: 0.18,
  enemyZoneStartRatio: 0.52,
  baselineBottomRatio: 0.6,
  playerYOffsetFromBottom: 28,
  playerPlaceholderW: 240,
  playerPlaceholderH: 310,
  enemyPlaceholderW: 240,
  enemyPlaceholderH: 310,
  enemyGap: 28,
  cardWidth: 100,
  cardHeight: 140,
  overlapRatio: 0.45,
  arcAmplitude: 30,
  cardRotationRad: 0.03,
  hoverLift: 20,
  hoverScale: 1.08,
  /** Horizontal padding on both sides of the scene. */
  padding: 20,
  costRadius: 12,
  shadowOffset: 4,
  cardCornerRadius: 10,
  enemyCornerRadius: 10,
} as const;

/** Named slots used by the combat renderer for placement and z-order. */
export type CombatSlotId = 'combatBg' | 'player' | 'hpBlockEnergy';

export interface CombatSlotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the bounds for a named combat slot, derived from layout ratios and screen size.
 * Indexed elements (per-enemy, per-card) still compute their positions in the renderer
 * using COMBAT_LAYOUT so that all layout logic stays centralized here.
 */
export function getCombatSlotBounds(slotId: CombatSlotId, w: number, h: number): CombatSlotBounds {
  const L = COMBAT_LAYOUT;
  switch (slotId) {
    case 'combatBg':
      return { x: 0, y: 0, width: w, height: h };
    case 'player': {
      const x = w * L.playerZoneXRatio - L.playerPlaceholderW / 2;
      const baselineBottom = h * L.baselineBottomRatio;
      const y = baselineBottom - L.playerPlaceholderH;
      return { x, y, width: L.playerPlaceholderW, height: L.playerPlaceholderH };
    }
    case 'hpBlockEnergy': {
      const x = w * L.playerZoneXRatio;
      const baselineBottom = h * L.baselineBottomRatio;
      const y = baselineBottom + 8;
      return { x, y, width: 0, height: 0 };
    }
    default:
      // Fallback to full-screen; should not normally be hit.
      return { x: 0, y: 0, width: w, height: h };
  }
}

/** Center point of the player slot (used for VFX, floating numbers, etc.). */
export function getPlayerCenter(w: number, h: number): { x: number; y: number } {
  const bounds = getCombatSlotBounds('player', w, h);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Center point for an enemy at the given index (0-based) given the number of enemies. */
export function getEnemyCenter(index: number, enemyCount: number, w: number, h: number): { x: number; y: number } {
  const L = COMBAT_LAYOUT;
  const baselineBottom = h * L.baselineBottomRatio;
  const enemyZoneStart = w * L.enemyZoneStartRatio;
  const enemyPlaceholderW = L.enemyPlaceholderW;
  const enemyPlaceholderH = L.enemyPlaceholderH;
  const enemyGap = L.enemyGap;
  const padding = L.padding;
  const enemyStartY = baselineBottom - enemyPlaceholderH;
  const totalEnemyWidth = enemyCount * enemyPlaceholderW + (enemyCount - 1) * enemyGap;
  const ex = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;
  return {
    x: ex + index * (enemyPlaceholderW + enemyGap),
    y: enemyStartY + enemyPlaceholderH / 2,
  };
}

/**
 * Fixed card art area inside a card, relative to card dimensions.
 * Used by the combat renderer so all cards share the same art slot.
 */
export function getCardArtRect(cardWidth: number, cardHeight: number): { x: number; y: number; width: number; height: number } {
  const paddingX = 8;
  const artTop = 48;
  const artHeight = 50;
  const width = cardWidth - paddingX * 2;
  return { x: paddingX, y: artTop, width, height: artHeight };
}

