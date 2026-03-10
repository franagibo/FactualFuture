import type { CardDef, CardEffect } from '../../../engine/cardDef';

/**
 * Formats a single card effect for display (e.g. "Deal 6 damage", "Gain 5 block").
 * Used for card tooltip/description text only.
 */
export function formatEffect(e: CardEffect): string {
  switch (e.type) {
    case 'damage': return `Deal ${e.value} damage`;
    case 'block': return `Gain ${e.value} block`;
    case 'heal': return `Heal ${e.value}`;
    case 'draw': return e.value === 1 ? 'Draw 1 card' : `Draw ${e.value} cards`;
    case 'vulnerable': return `Apply ${e.value} Vulnerable`;
    case 'weak': return `Apply ${e.value} Weak`;
    case 'frail': return `Apply ${e.value} Frail`;
    case 'damageEqualToBlock': return 'Damage equal to block';
    case 'energy': return `Gain ${e.value} energy`;
    default: return '';
  }
}

/**
 * Returns a short description string for a card's effects (e.g. "Deal 6 damage • Gain 5 block").
 * @param cardId - Card definition id
 * @param getCardDef - Lookup for card definition by id
 */
export function getCardEffectDescription(
  cardId: string,
  getCardDef: (id: string) => CardDef | undefined
): string {
  const def = getCardDef(cardId);
  if (!def?.effects?.length) return '';
  return def.effects.map((e) => formatEffect(e)).filter(Boolean).join(' • ') || '';
}
