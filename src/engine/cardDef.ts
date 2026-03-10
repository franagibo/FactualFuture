export interface CardEffect {
  type:
    | 'damage'
    | 'block'
    | 'heal'
    | 'draw'
    | 'vulnerable'
    | 'weak'
    | 'frail'
    | 'damageEqualToBlock'
    | 'energy'
    | 'strength'
    | 'damageAll'
    | 'vulnerableAll'
    | 'weakAll'
    | 'exhaustRandom'
    | 'exhaustHand'
    | 'exhaustHandNonAttack'
    | 'exhaustHandNonAttackGainBlock'
    | 'exhaustHandDealDamage'
    | 'exhume'
    | 'addCopyToDiscard'
    | 'addCardToDiscard'
    | 'loseHp'
    | 'multiHit'
    | 'doubleBlock';
  value: number;
  /** For multiHit: number of hits (each hit = value damage). */
  times?: number;
  /** For damage: extra damage per Strength stack (e.g. Heavy Blade = 3). */
  strengthScale?: number;
  /** For addCardToDiscard: card id to add (e.g. injury). */
  cardId?: string;
  target?: 'player' | 'enemy';
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  effects: CardEffect[];
  /** When true, card is a curse; exclude from reward/shop pools. */
  isCurse?: boolean;
  /** When true, this card is exhausted (removed for rest of combat) when played. */
  exhaust?: boolean;
  /** When true, card is a status (added by monsters/effects); removed from deck at end of combat. */
  isStatus?: boolean;
}
