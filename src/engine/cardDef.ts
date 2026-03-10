export interface CardEffect {
  type: 'damage' | 'block' | 'heal' | 'draw' | 'vulnerable' | 'weak' | 'frail' | 'damageEqualToBlock' | 'energy';
  value: number;
  target?: 'player' | 'enemy';
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  effects: CardEffect[];
  /** When true, card is a curse; exclude from reward/shop pools. */
  isCurse?: boolean;
}
