/**
 * Arc-based hand layout for combat cards. Single source of truth for card positions,
 * rotations, and optional neighbor spread when a card is hovered.
 */
import { COMBAT_LAYOUT } from './combat-layout.constants';

export interface HandCardPosition {
  x: number;
  y: number;
  rotation: number;
  /** Extra x offset when neighbor spread is applied (hover). */
  spreadOffsetX?: number;
}

export interface HandLayoutResult {
  positions: HandCardPosition[];
  centerX: number;
  baseY: number;
  /** For compatibility: startX and cardSpacing if needed for enemy layout. */
  startX: number;
  cardSpacing: number;
  handLength: number;
  center: number;
  handY: number;
  arcAmplitude: number;
  hoverLift: number;
}

const L = COMBAT_LAYOUT;

/**
 * Clamp value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns arc-based positions for each card in the hand. For large hands,
 * the fan angle is reduced so cards don't spread too far.
 */
export function getHandLayout(
  cardCount: number,
  w: number,
  h: number,
  hoveredIndex: number | null
): HandLayoutResult {
  const playerY = h - L.playerYOffsetFromBottom;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const handY = playerY - cardHeight + (L.handYOffset ?? 0);
  const centerX = w / 2;
  const baseY = handY;

  if (cardCount <= 0) {
    const cardSpacing = cardWidth * L.overlapRatio;
    const totalHandWidth = 0;
    const startX = centerX - totalHandWidth / 2 + cardWidth / 2;
    return {
      positions: [],
      centerX,
      baseY,
      startX,
      cardSpacing,
      handLength: 0,
      center: 0,
      handY,
      arcAmplitude: L.arcAmplitude,
      hoverLift: L.hoverLift,
    };
  }

  const middle = (cardCount - 1) / 2;
  const baseFanAngleRad = (L.baseFanAngleDeg ?? 35) * (Math.PI / 180);
  const maxFanAngleRad = baseFanAngleRad * clamp(7 / cardCount, 0.5, 1);
  const angleStep = cardCount > 1 ? maxFanAngleRad / (cardCount - 1) : 0;
  const fanRadius = L.fanRadius ?? 750;
  const arcVertical = (L as { fanArcVerticalExtent?: number }).fanArcVerticalExtent ?? 80;
  const rotationMultiplier = L.rotationMultiplier ?? 1.2;

  const positions: HandCardPosition[] = [];
  for (let i = 0; i < cardCount; i++) {
    const angle = (i - middle) * angleStep;
    const x = centerX + Math.sin(angle) * fanRadius;
    const y = baseY - Math.cos(angle) * arcVertical;
    const rotation = angle * rotationMultiplier;

    let spreadOffsetX = 0;
    if (hoveredIndex != null) {
      const dist = Math.abs(i - hoveredIndex);
      if (dist === 1) spreadOffsetX = i > hoveredIndex ? 20 : -20;
      else if (dist === 2) spreadOffsetX = i > hoveredIndex ? 10 : -10;
    }

    positions.push({ x, y, rotation, spreadOffsetX });
  }

  const cardSpacing = cardWidth * L.overlapRatio;
  const totalHandWidth = (cardCount - 1) * cardSpacing + cardWidth;
  const startX = centerX - totalHandWidth / 2 + cardWidth / 2;

  return {
    positions,
    centerX,
    baseY,
    startX,
    cardSpacing,
    handLength: cardCount,
    center: middle,
    handY,
    arcAmplitude: L.arcAmplitude,
    hoverLift: L.hoverLift,
  };
}
