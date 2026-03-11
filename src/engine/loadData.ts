import type { CardDef } from './cardDef';

/** Trigger when enemy HP falls at or below a percentage of maxHp. */
export interface EnemyHpTrigger {
  trigger: 'hp_below_percent';
  value: number;
  action: 'split';
  spawnEnemyId: string;
  spawnCount: number;
}

/** Future: other trigger types (e.g. 'on_death', 'turn_start') can be added to this union. */
export type EnemyTrigger = EnemyHpTrigger;

/** Optional status cards added when this intent is resolved (e.g. Slimed to discard). */
export interface IntentAddStatusDef {
  cardId: string;
  count: number;
  to: 'draw' | 'discard';
}

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  intents: { weight: number; intent: { type: string; value: number; addStatus?: IntentAddStatusDef[] } }[];
  /** Optional size for display scale: small (0.8), medium (1), large (1.2). Default medium. */
  size?: 'small' | 'medium' | 'large';
  /** Optional triggers (e.g. split at 50% HP). Processed after damage is applied. */
  triggers?: EnemyTrigger[];
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
  /** Optional act numbers where this relic can appear in shop; when absent, all acts. */
  acts?: number[];
}

export type PotionRarity = 'common' | 'uncommon' | 'rare';

export interface PotionDef {
  id: string;
  name: string;
  description: string;
  /** common 65%, uncommon 25%, rare 10% when offered. */
  rarity: PotionRarity;
  effect: { type: string; value: number; value2?: number };
}

/** Playable character: owns starter deck and optional card pool for rewards/shops. */
export interface CharacterDef {
  id: string;
  name: string;
  description?: string;
  /** Card IDs for the initial deck (e.g. 5 strike, 4 defend, 1 bash). */
  starterDeck: string[];
  /** If set, only these card IDs can appear in rewards and shops for this character. If null/absent, all non-curse cards are allowed. */
  cardPoolIds: string[] | null;
}

export function loadPotions(data: PotionDef[]): Map<string, PotionDef> {
  const map = new Map<string, PotionDef>();
  for (const p of data) map.set(p.id, p);
  return map;
}

export function loadCharacters(data: CharacterDef[]): Map<string, CharacterDef> {
  const map = new Map<string, CharacterDef>();
  for (const c of data) map.set(c.id, c);
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
