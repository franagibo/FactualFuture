import type { CardDef } from './cardDef';

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  intents: { weight: number; intent: { type: string; value: number } }[];
}

export interface EncounterDef {
  id: string;
  enemies: string[];
}

export function loadCards(data: CardDef[]): Map<string, CardDef> {
  const map = new Map<string, CardDef>();
  for (const card of data) map.set(card.id, card);
  return map;
}

export function loadEnemies(data: EnemyDef[]): Map<string, EnemyDef> {
  const map = new Map<string, EnemyDef>();
  for (const e of data) map.set(e.id, e);
  return map;
}

export function loadEncounters(data: EncounterDef[]): Map<string, EncounterDef> {
  const map = new Map<string, EncounterDef>();
  for (const e of data) map.set(e.id, e);
  return map;
}
