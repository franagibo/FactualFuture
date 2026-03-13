/**
 * Computes z-order priority per card: dragged > hovered > newly drawn > hand index.
 * Used to set container.zIndex so the right card appears on top.
 */
import type { CardPresentation } from '../models/card-presentation.model';

const DRAGGING_BONUS = 200;
const HOVERED_BONUS = 100;
const NEW_BONUS = 50;

/**
 * Set zPriority on each presentation based on flags. handIndex is the index in hand (for stable ordering).
 */
export function updateZOrder(
  presentations: CardPresentation[],
  hoveredIndex: number | null,
  draggedIndex: number | null,
  isNewByIndex: (i: number) => boolean
): void {
  for (let i = 0; i < presentations.length; i++) {
    const p = presentations[i];
    let priority = i;
    if (draggedIndex === i) priority += DRAGGING_BONUS;
    else if (hoveredIndex === i) priority += HOVERED_BONUS;
    else if (isNewByIndex(i)) priority += NEW_BONUS;
    p.zPriority = priority;
  }
}
