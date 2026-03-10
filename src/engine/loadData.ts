import type { CardDef } from './cardDef';

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  intents: { weight: number; intent: { type: string; value: number } }[];
  /** Optional size for display scale: small (0.8), medium (1), large (1.2). Default medium. */
  size?: 'small' | 'medium' | 'large';
}

export interface EncounterDef {
  id: string;
  enemies: string[];
}

export interface EventDef {
  id: string;
  text: string;
  choices: { text: string; outcome: unknown }[];
  /** If set, event only appears in this act. */
  act?: number;
}

export interface RelicDef {
  id: string;
  name: string;
  description: string;
  triggers: { when: string; effect: { type: string; value?: number } }[];
}

export interface PotionDef {
  id: string;
  name: string;
  description: string;
  effect: { type: string; value: number };
}

export function loadPotions(data: PotionDef[]): Map<string, PotionDef> {
  const map = new Map<string, PotionDef>();
  for (const p of data) map.set(p.id, p);
  return map;
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

export function loadEvents(data: EventDef[]): EventDef[] {
  return [...data];
}

export function loadRelics(data: RelicDef[]): Map<string, RelicDef> {
  const map = new Map<string, RelicDef>();
  for (const r of data) map.set(r.id, r);
  return map;
}
