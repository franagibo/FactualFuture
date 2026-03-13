import type { CardUiState } from './card-state';

/**
 * Current and target transforms for one card. Animation system lerps current toward target.
 */
export interface CardPresentation {
  /** Current position (anchor at bottom-center for hand cards). */
  currentX: number;
  currentY: number;
  currentRotation: number;
  currentScale: number;
  /** Target position/rotation/scale. */
  targetX: number;
  targetY: number;
  targetRotation: number;
  targetScale: number;
  /** Z-order priority (higher = on top). */
  zPriority: number;
  /** Visual state for hover/drag/transition effects. */
  uiState: CardUiState;
  /** Spread offset X (neighbor nudge from hover). */
  spreadOffsetX: number;
}

const DEFAULT_SCALE = 1;

/**
 * Create a new CardPresentation with current and target at the same value.
 */
export function createCardPresentation(
  x: number,
  y: number,
  rotation: number,
  scale: number = DEFAULT_SCALE
): CardPresentation {
  return {
    currentX: x,
    currentY: y,
    currentRotation: rotation,
    currentScale: scale,
    targetX: x,
    targetY: y,
    targetRotation: rotation,
    targetScale: scale,
    zPriority: 0,
    uiState: 'IN_HAND',
    spreadOffsetX: 0,
  };
}

/**
 * Set targets from layout position (e.g. from HandLayoutSystem).
 * x is the final x (base + spread already applied by caller if needed).
 */
export function setTargetsFromLayout(
  p: CardPresentation,
  x: number,
  y: number,
  rotation: number,
  scale: number = DEFAULT_SCALE,
  spreadOffsetX: number = 0
): void {
  p.targetX = x;
  p.targetY = y;
  p.targetRotation = rotation;
  p.targetScale = scale;
  p.spreadOffsetX = spreadOffsetX;
}

/**
 * Apply hover override: lift, scale up, rotation 0.
 */
export function applyHoverOverride(
  p: CardPresentation,
  liftY: number,
  hoverScale: number
): void {
  p.targetY = p.targetY - liftY;
  p.targetRotation = 0;
  p.targetScale = hoverScale;
}

/**
 * Apply drag override: position and scale (caller sets target to mouse position).
 */
export function applyDragOverride(p: CardPresentation, dragScale: number): void {
  p.targetRotation = 0;
  p.targetScale = dragScale;
}
