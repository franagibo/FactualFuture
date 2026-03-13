/** Plant mode for plant_mode effect (Verdant Machinist). */
export type PlantModeEffect = 'defense' | 'attack' | 'support';

/** Target for plant effects: which plant(s) to apply to. */
export type PlantEffectTarget = 'all' | 'first' | 'random';

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
    | 'doubleBlock'
    | 'summon_plant'
    | 'grow_plant'
    | 'plant_mode'
    | 'sacrifice_plant'
    | 'evolve_plant'
    | 'blockToPlant';
  value: number;
  /** For multiHit: number of hits (each hit = value damage). */
  times?: number;
  /** For damage: extra damage per Strength stack (e.g. Heavy Blade = 3). */
  strengthScale?: number;
  /** For addCardToDiscard: card id to add (e.g. injury). */
  cardId?: string;
  target?: 'player' | 'enemy' | 'plant';
  /** For grow_plant / plant_mode: 'all' | 'first' | 'random'. */
  plantTarget?: PlantEffectTarget;
  /** For plant_mode: which mode to set. */
  mode?: PlantModeEffect;
}

/** Rarity for reward/shop weighting (e.g. common 70%, uncommon 25%, rare 5%). Optional; when absent, card is treated as common. */
export type CardRarity = 'common' | 'uncommon' | 'rare';

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
  /** Optional rarity for pool weighting. Future: bias reward/shop offers by rarity. */
  rarity?: CardRarity;
  /** Optional archetype tag (e.g. "attack", "block", "synergy") for filtering or themed pools. */
  archetype?: string;
  /** Optional act numbers (e.g. [1, 2]) where this card can appear in rewards/shop; when absent, all acts. */
  acts?: number[];
}
