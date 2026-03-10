/**
 * Pure TypeScript game engine types. No Angular or Electron imports.
 */

export type Phase = 'player' | 'enemy';

export type CombatResult = null | 'win' | 'lose';

/** Run-level phase: map, combat, reward, rest, shop, event, actComplete (next act), victory (run complete). */
export type RunPhase = 'map' | 'combat' | 'reward' | 'rest' | 'shop' | 'event' | 'actComplete' | 'victory';

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

/** Status cards added to player deck/discard when this intent is resolved (e.g. Sentry Bolt → Dazed). */
export interface IntentAddStatus {
  cardId: string;
  count: number;
  to: 'draw' | 'discard';
}

export interface EnemyIntent {
  type: 'attack' | 'block' | 'debuff' | 'vulnerable' | 'none';
  value: number;
  /** When set, resolving this intent adds these status cards to the player's draw or discard pile. */
  addStatus?: IntentAddStatus[];
}

export interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  intent: EnemyIntent | null;
  /** B17: Vulnerable stacks; damage taken multiplied by 1.5, decay by 1 per turn. */
  vulnerableStacks?: number;
  /** Weak stacks; damage taken multiplied by 1 + 0.25*stacks, decay by 1 per turn. */
  weakStacks?: number;
  /** Display scale: small (0.8), medium (1), large (1.2). From EnemyDef. */
  size?: 'small' | 'medium' | 'large';
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
  /** Cards removed for the rest of this combat (exhaust mechanic). */
  exhaustPile?: string[];
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
  /** Shop screen: offered cards/relics and prices. */
  shopState?: {
    cardIds: string[];
    relicIds: string[];
    cardPrices: Record<string, number>;
    relicPrices: Record<string, number>;
  };
  /** Event screen: one event with choices. */
  eventState?: {
    eventId: string;
    text: string;
    choices: { text: string; outcome: unknown }[];
  };
  /** Current act (1-based). Used for multi-act runs. */
  act?: number;
  /** Playable character id for this run (e.g. "gunboy"). Drives starter deck and card pools. */
  characterId?: string;
  /** Potion IDs (max 3). One-time use in combat. */
  potions?: string[];
  /** Frail stacks on player; damage taken multiplied by 1 + 0.25*stacks, decay by 1 per turn. */
  frailStacks?: number;
  /** Strength: extra damage per stack when dealing attack damage (per combat). */
  strengthStacks?: number;
  /** Weak on player: attack damage taken multiplied by 1 + 0.25*stacks, decay by 1 per turn. */
  playerWeakStacks?: number;
  /** Vulnerable on player: damage taken multiplied by 1.5, decay by 1 per turn. */
  playerVulnerableStacks?: number;
}

/** Meta progression (unlocks) and run statistics, stored separately from run. */
export interface MetaState {
  unlockedCards: string[];
  unlockedRelics: string[];
  highestActReached: number;
  /** Lifetime / aggregate stats (optional). */
  runStats?: {
    combatsWon: number;
    goldSpent: number;
  };
}
