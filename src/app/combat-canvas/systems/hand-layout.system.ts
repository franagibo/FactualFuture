/**
 * Wraps getHandLayout to produce target positions keyed by hand index.
 * When a card is dragged (excludedIndex), layout is computed for the remaining cards only.
 */
import { getHandLayout, type HandLayoutOptions, type HandLayoutResult } from '../constants/hand-layout';
import { COMBAT_LAYOUT } from '../constants/combat-layout.constants';

export interface HandLayoutTarget {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  spreadOffsetX: number;
}

/**
 * Returns target positions for each hand index. For excludedIndex (e.g. dragged card),
 * the slot is skipped in layout so remaining cards reflow; caller should set that card's target separately.
 */
export function getHandLayoutTargets(
  handCount: number,
  hoveredIndex: number | null,
  excludedIndex: number | null,
  w: number,
  h: number,
  options?: HandLayoutOptions
): (HandLayoutTarget | null)[] {
  if (handCount <= 0) return [];
  const layoutCount = excludedIndex != null ? handCount - 1 : handCount;
  const layoutHoveredIndex =
    excludedIndex != null
      ? hoveredIndex === excludedIndex
        ? null
        : hoveredIndex == null
          ? null
          : hoveredIndex < excludedIndex
            ? hoveredIndex
            : hoveredIndex - 1
      : hoveredIndex;
  const layout: HandLayoutResult = getHandLayout(layoutCount, w, h, layoutHoveredIndex, options);
  const result: (HandLayoutTarget | null)[] = [];
  const hoverLift = layout.hoverLift;
  const hoverScale = COMBAT_LAYOUT.hoverScale;
  const cardHeight = COMBAT_LAYOUT.cardHeight;
  const peek = (COMBAT_LAYOUT as { handPeekHeight?: number }).handPeekHeight ?? Math.round(cardHeight * 0.5);
  const hiddenAtRest = Math.max(0, cardHeight - peek);

  for (let i = 0; i < handCount; i++) {
    if (i === excludedIndex) {
      result.push(null);
      continue;
    }
    const layoutIdx = excludedIndex == null ? i : i < excludedIndex ? i : i - 1;
    const pos = layout.positions[layoutIdx];
    if (!pos) {
      result.push(null);
      continue;
    }
    const spreadOffsetX = pos.spreadOffsetX ?? 0;
    const isHovered = hoveredIndex === i;
    // Reveal the full card when hovered: lift by the hidden portion so the bottom pivot reaches the screen edge.
    // Add only a small extra lift so the card still feels anchored to the bottom (STS-like).
    const revealLift = hiddenAtRest + hoverLift * 0.25;
    const y = pos.y - (isHovered ? revealLift : 0);
    const scale = isHovered ? hoverScale : 1;
    result.push({
      x: pos.x + spreadOffsetX,
      y,
      rotation: isHovered ? 0 : pos.rotation,
      scale,
      spreadOffsetX,
    });
  }
  return result;
}
