export interface CardEffect {
  type: 'damage' | 'block' | 'heal' | 'draw' | 'vulnerable' | 'damageEqualToBlock';
  value: number;
  target?: 'player' | 'enemy';
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  effects: CardEffect[];
}
