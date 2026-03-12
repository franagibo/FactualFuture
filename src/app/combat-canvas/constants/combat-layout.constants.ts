/**
 * Combat scene layout constants: player left, enemies right, hand in arc.
 * Ratios (e.g. playerZoneXRatio) are multiplied by screen w/h to get pixel values.
 * Single place to tweak layout without magic numbers in component or renderer.
 *
 * This file is also the single source of truth for named "slots" in the combat view
 * (player, enemies, HP text, etc.) via getCombatSlotBounds().
 */
export const COMBAT_LAYOUT = {
  playerZoneXRatio: 0.28,
  enemyZoneStartRatio: 0.44,
  /** Baseline for player/enemy slots (0–1). Higher = lower on screen. Raised ~20% to lower characters. */
  baselineBottomRatio: 0.72,
  playerYOffsetFromBottom: 28,
  playerPlaceholderW: 320,
  playerPlaceholderH: 410,
  enemyPlaceholderW: 240,
  enemyPlaceholderH: 310,
  enemyGap: 28,
  cardWidth: 200,
  cardHeight: 280,
  overlapRatio: 0.62,
  arcAmplitude: 90,
  cardRotationRad: 0.02,
  hoverLift: 60,
  hoverScale: 1.08,
  /** Arc-based hand: max fan angle in degrees (narrowed for large hands). */
  baseFanAngleDeg: 35,
  /** Horizontal spread of the fan (px). */
  fanRadius: 750,
  /** Vertical extent of the arc (px). Small value keeps the hand at the bottom. */
  fanArcVerticalExtent: 80,
  rotationMultiplier: 1.2,
  /** Magnetic hover: radius to consider card hovered (ratio of card width). */
  hoverRadiusRatio: 0.6,
  /** Magnetic hover: radius to release hover lock (ratio of card width). */
  hoverReleaseRadiusRatio: 0.8,
  /** Pixels of movement before entering Dragging from Pressed. */
  dragThreshold: 12,
  /** Hand vertical offset from (playerY - cardHeight). Positive = hand lower on screen. */
  handYOffset: 268,
  /** Horizontal padding on both sides of the scene. */
  padding: 20,
  costRadius: 36,
  shadowOffset: 12,
  cardCornerRadius: 30,
  enemyCornerRadius: 10,
  /** Neon border when card is hovered (Slay the Spire style). */
  neonBorderHoverColor: 0xa0ddff,
  neonBorderHoverWidths: [10, 5, 2],
  neonBorderHoverAlphas: [0.2, 0.5, 0.95],
  /** Horizontal inset (px each side) so neon border width matches card frame; height unchanged. */
  neonBorderWidthInset: 6,
  /** Larger, different color when card is selected (ready to play/drop). */
  neonBorderSelectedColor: 0xffdd44,
  neonBorderSelectedWidths: [14, 7, 3],
  neonBorderSelectedAlphas: [0.35, 0.6, 1],
  /** Y ratio (0–1) for non-target card play line: drop above this line to play (e.g. 0.55 = higher from hand). */
  nonTargetPlayLineRatio: 0.55,
  /** Intent icon size (px) next to enemy placeholder. */
  intentIconSize: 16,
  /** HP/Block/Energy icon size (px) under player. */
  hpBlockEnergyIconSize: 48,
  /** Gap between HP/Block/Energy icons (px). */
  hpBlockEnergyGap: 56,
  /** Offset from cost circle center for cost text (costCenter = costRadius + costCenterOffset). */
  costCenterOffset: 18,
  /** Enemy target border (when dragging a targeting card): valid target. */
  enemyTargetBorderColor: 0xc9a227,
  enemyTargetBorderWidths: [6, 3, 1.5],
  enemyTargetBorderAlphas: [0.2, 0.45, 0.9],
  /** Enemy target border: hovered (ready to release). */
  enemyTargetBorderHoverColor: 0xffe066,
  enemyTargetBorderHoverWidths: [10, 5, 2],
  enemyTargetBorderHoverAlphas: [0.28, 0.55, 0.98],
  /** Intent icon X position relative to enemy placeholder. */
  intentPosX: 8,
  /** Intent icon Y position relative to enemy placeholder. */
  intentPosY: 46,
  /** Intent value label offset from icon (px). */
  intentLabelOffset: 4,
  /** Card name/description horizontal padding for word wrap width. */
  cardTextPadding: 48,
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

/** Result of getEnemyLayout: single source for enemy positions used by renderer and component. */
export interface EnemyLayout {
  startY: number;
  placeholderW: number;
  placeholderH: number;
  /** Center X of first enemy (same spacing for rest). */
  firstCenterX: number;
  gap: number;
  getCenter(index: number): { x: number; y: number };
  getLeft(index: number): number;
}

/** Single helper for enemy layout. Use in renderer and runCardFlyThenPlay to avoid duplicated formulas. */
export function getEnemyLayout(w: number, h: number, enemyCount: number): EnemyLayout {
  const L = COMBAT_LAYOUT;
  const baselineBottom = h * L.baselineBottomRatio;
  const enemyZoneStart = w * L.enemyZoneStartRatio;
  const enemyPlaceholderW = L.enemyPlaceholderW;
  const enemyPlaceholderH = L.enemyPlaceholderH;
  const enemyGap = L.enemyGap;
  const padding = L.padding;
  const startY = baselineBottom - enemyPlaceholderH;
  const totalEnemyWidth = enemyCount * enemyPlaceholderW + (enemyCount - 1) * enemyGap;
  const firstCenterX = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;
  return {
    startY,
    placeholderW: enemyPlaceholderW,
    placeholderH: enemyPlaceholderH,
    firstCenterX,
    gap: enemyGap,
    getCenter(index: number) {
      return {
        x: firstCenterX + index * (enemyPlaceholderW + enemyGap),
        y: startY + enemyPlaceholderH / 2,
      };
    },
    getLeft(index: number) {
      return firstCenterX + index * (enemyPlaceholderW + enemyGap) - enemyPlaceholderW / 2;
    },
  };
}

/** Center point for an enemy at the given index (0-based) given the number of enemies. */
export function getEnemyCenter(index: number, enemyCount: number, w: number, h: number): { x: number; y: number } {
  return getEnemyLayout(w, h, enemyCount).getCenter(index);
}

/** Index of the enemy under stage point (x,y), or null. Uses same layout as renderer for hit-test during drag. */
export function getEnemyIndexAtPoint(stageX: number, stageY: number, enemyCount: number, w: number, h: number): number | null {
  if (enemyCount <= 0) return null;
  const layout = getEnemyLayout(w, h, enemyCount);
  for (let i = 0; i < enemyCount; i++) {
    const left = layout.getLeft(i);
    const top = layout.startY;
    if (stageX >= left && stageX <= left + layout.placeholderW && stageY >= top && stageY <= top + layout.placeholderH) {
      return i;
    }
  }
  return null;
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

