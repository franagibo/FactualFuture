/**
 * Pure TypeScript game engine types. No Angular or Electron imports.
 */

export type Phase = 'player' | 'enemy';

export type CombatResult = null | 'win' | 'lose';

/** Run-level phase: map (choose node), combat, reward (pick card), rest (heal/remove card). */
export type RunPhase = 'map' | 'combat' | 'reward' | 'rest';

export type MapNodeType = 'combat' | 'elite' | 'rest' | 'shop' | 'event' | 'boss';

export interface MapNode {
  id: string;
  type: MapNodeType;
  /** Vertical level (0 = bottom, higher = toward top). Used for layout and pathing. */
  floor: number;
  /** Optional horizontal lane index for layout (0..LANE_COUNT-1). */
  lane?: number;
}

export interface MapState {
  nodes: MapNode[];
  /** Edges: [fromId, toId]. */
  edges: [string, string][];
}

export interface EnemyIntent {
  type: 'attack' | 'block' | 'debuff' | 'none';
  value: number;
}

export interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  intent: EnemyIntent | null;
}

export interface GameState {
  playerHp: number;
  playerMaxHp: number;
  playerBlock: number;
  currentEncounter: string | null;
  phase: Phase;
  deck: string[];
  hand: string[];
  discard: string[];
  energy: number;
  maxEnergy: number;
  turnNumber: number;
  enemies: EnemyState[];
  combatResult: CombatResult;
  /** Run structure (Phase 2). When undefined, single-combat mode. */
  runPhase?: RunPhase;
  map?: MapState | null;
  currentNodeId?: string | null;
  gold?: number;
  relics?: string[];
  floor?: number;
  /** Three card IDs to choose one after combat win. */
  rewardCardChoices?: string[];
}
