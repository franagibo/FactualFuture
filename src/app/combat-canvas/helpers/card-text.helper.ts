import type { CardDef, CardEffect } from '../../../engine/cardDef';

/**
 * Formats a single card effect for display (e.g. "Deal 6 damage", "Gain 5 block").
 * Used for card tooltip/description text only.
 */
export function formatEffect(e: CardEffect): string {
  switch (e.type) {
    case 'damage':
      return e.strengthScale
        ? `Deal ${e.value} damage (+${e.strengthScale} per Strength)`
        : `Deal ${e.value} damage`;
    case 'block': return `Gain ${e.value} block`;
    case 'heal': return `Heal ${e.value}`;
    case 'draw': return e.value === 1 ? 'Draw 1 card' : `Draw ${e.value} cards`;
    case 'vulnerable': return `Apply ${e.value} Vulnerable`;
    case 'weak': return `Apply ${e.value} Weak`;
    case 'frail': return `Apply ${e.value} Frail`;
    case 'damageEqualToBlock': return 'Damage equal to your block';
    case 'energy': return `Gain ${e.value} energy`;
    case 'strength': return `Gain ${e.value} Strength`;
    case 'damageAll': return `Deal ${e.value} damage to ALL enemies`;
    case 'vulnerableAll': return `Apply ${e.value} Vulnerable to ALL enemies`;
    case 'weakAll': return `Apply ${e.value} Weak to ALL enemies`;
    case 'exhaustRandom': return `Exhaust ${e.value} random card(s) from your hand`;
    case 'exhaustHand': return 'Exhaust your hand';
    case 'exhaustHandNonAttack': return 'Exhaust all non-Attack cards in your hand';
    case 'exhaustHandNonAttackGainBlock': return `Exhaust all non-Attack in hand. Gain ${e.value} block per card.`;
    case 'exhaustHandDealDamage': return `Exhaust your hand. Deal ${e.value} damage per card to an enemy.`;
    case 'exhume': return `Put ${e.value} card(s) from exhaust into your hand`;
    case 'addCopyToDiscard': return 'Add a copy of this card to your discard pile';
    case 'addCardToDiscard': return 'Add a card to your discard pile';
    case 'loseHp': return `Lose ${e.value} HP`;
    case 'multiHit': return `Deal ${e.value} damage ${e.times ?? 2} times`;
    case 'doubleBlock': return 'Double your block';
    case 'summon_plant': return e.value > 0 ? `Summon a Seedling (${e.value} HP)` : 'Summon a Seedling';
    case 'grow_plant': {
      const n = e.value || 1;
      const target = (e as CardEffect & { plantTarget?: string }).plantTarget;
      const targetStr = target === 'all' ? ' all plants' : target === 'first' ? ' the first plant' : '';
      return n === 1 ? `Grow${targetStr} 1` : `Grow${targetStr} ${n}`;
    }
    case 'plant_mode': {
      const mode = (e as CardEffect & { mode?: string }).mode ?? 'defense';
      const target = (e as CardEffect & { plantTarget?: string }).plantTarget;
      const targetStr = target === 'all' ? ' all plants' : target === 'first' ? ' first plant' : ' plant(s)';
      return `Set${targetStr} to ${mode} mode`;
    }
    case 'blockToPlant': return `Plants gain ${e.value} block`;
    case 'sacrifice_plant': return e.value <= 1 ? 'Sacrifice a plant' : `Sacrifice ${e.value} plant(s)`;
    case 'evolve_plant': return e.value <= 1 ? 'Evolve a plant' : `Evolve ${e.value} plant(s)`;
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
