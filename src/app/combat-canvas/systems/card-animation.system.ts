/**
 * Lerps each card's current position/rotation/scale toward target.
 * Frame-rate independent; run every frame when hand is visible.
 */
import type { CardPresentation } from '../models/card-presentation.model';
import { COMBAT_TIMING } from '../constants/combat-timing.constants';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Update presentation.current* toward presentation.target* with exponential decay.
 * dt is in seconds (e.g. deltaTime/60).
 */
export function updateCardAnimations(
  presentations: CardPresentation[],
  dt: number
): void {
  const speed = COMBAT_TIMING.cardLerpSpeed;
  const factor = 1 - Math.exp(-speed * dt);
  for (const p of presentations) {
    p.currentX = lerp(p.currentX, p.targetX, factor);
    p.currentY = lerp(p.currentY, p.targetY, factor);
    p.currentRotation = lerp(p.currentRotation, p.targetRotation, factor);
    p.currentScale = lerp(p.currentScale, p.targetScale, factor);
  }
}
