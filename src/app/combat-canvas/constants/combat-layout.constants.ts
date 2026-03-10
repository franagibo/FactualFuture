/**
 * Combat scene layout constants: player left, enemies right, hand in arc.
 * Ratios (e.g. playerZoneXRatio) are multiplied by screen w/h to get pixel values.
 * Single place to tweak layout without magic numbers in component or renderer.
 */
export const COMBAT_LAYOUT = {
  playerZoneXRatio: 0.18,
  enemyZoneStartRatio: 0.52,
  baselineBottomRatio: 0.6,
  playerYOffsetFromBottom: 28,
  playerPlaceholderW: 100,
  playerPlaceholderH: 130,
  enemyPlaceholderW: 100,
  enemyPlaceholderH: 110,
  enemyGap: 28,
  cardWidth: 100,
  cardHeight: 140,
  overlapRatio: 0.45,
  arcAmplitude: 30,
  cardRotationRad: 0.03,
  hoverLift: 20,
  hoverScale: 1.08,
  padding: 20,
  costRadius: 12,
  shadowOffset: 4,
  cardCornerRadius: 10,
  enemyCornerRadius: 10,
} as const;
