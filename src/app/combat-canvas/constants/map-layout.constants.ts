/**
 * Map view layout constants: node size, spacing, path inset, arrow size.
 * Single place to tweak map rendering without magic numbers in the renderer.
 */
export const MAP_LAYOUT = {
  /** Radius of normal map nodes (px). */
  nodeRadius: 28,
  /** Icon size for normal nodes (px). */
  nodeIconSize: 80,
  /** Icon size for boss node (px). */
  bossIconSize: 92,
  /** Vertical spacing between floors (px). */
  floorSpacing: 240,
  /** Bottom margin below last floor (px). */
  bottomMargin: 130,
  /** Padding at bottom of scrollable content (px). */
  contentBottomPadding: 60,
  /** Horizontal jitter range for node position (-1..1 scaled by this). */
  jitterX: 28,
  /** Vertical jitter range for node position. */
  jitterY: 16,
  /** Path line inset from node center so paths don't overlap node visuals (px). */
  pathInsetExtra: 6,
  /** Arrow head half-length on path (px). */
  arrowLen: 12,
  /** Lane count for layout (used for lane jitter). */
  laneCount: 7,
  /** Max horizontal gap between nodes in a row (px). */
  maxGapX: 140,
  /** Horizontal padding for row bounds (px). */
  rowPadH: 88,
  /** Vertical padding for row bounds (px). */
  rowPadV: 42,
  /** Dash segment length for path (px). */
  dashLen: 10,
  /** Gap between dashes (px). */
  gapLen: 6,
  /** Path border width (px). */
  pathBorderWidth: 6,
  /** Path stroke width (px). */
  pathStrokeWidth: 2.5,
  /** Distance from path end to arrow base (px). */
  arrowBaseOffset: 16,
} as const;

/** Path inset from node center: max(nodeRadius + extra, bossIconSize/2 + 8). */
export function getPathInset(): number {
  const L = MAP_LAYOUT;
  return Math.max(L.nodeRadius + L.pathInsetExtra, L.bossIconSize / 2 + 8);
}
