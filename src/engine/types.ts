/**
 * Pure TypeScript game engine types. No Angular or Electron imports.
 */

export type Phase = 'player' | 'enemy';

export type CombatResult = null | 'win' | 'lose';

/** Run-level phase: map, combat, reward, rest, shop, event, actComplete (next act), victory (run complete). */
export type RunPhase = 'map' | 'combat' | 'reward' | 'rest' | 'shop' | 'event' | 'actComplete' | 'victory';

export type MapNodeType = 'combat' | 'elite' | 'rest' | 'shop' | 'event' | 'treasure' | 'boss';

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

export type EnemyIntentType =
  | 'attack'
  | 'block'
  | 'debuff'
  | 'vulnerable'
  | 'none'
  | 'ritual'
  | 'buff'
  | 'attack_multi'
  | 'attack_frail'
  | 'attack_vulnerable'
  | 'attack_and_block'
  | 'drain'
  | 'hex'
  | 'block_ally';

export interface EnemyIntent {
  type: EnemyIntentType;
  value: number;
  /** When set, resolving this intent adds these status cards to the player's draw or discard pile. */
  addStatus?: IntentAddStatus[];
  /** For attack_multi: number of hits. */
  times?: number;
  /** For attack_frail: frail stacks. For attack_vulnerable: vulnerable stacks. For drain: value=weak, value2=strength. */
  value2?: number;
  /** For buff/drain: strength to gain. For block_ally: block to give. */
  strength?: number;
  /** For buff: block to gain (self). */
  block?: number;
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
  /** Enemy strength: adds to attack damage (per combat). */
  strengthStacks?: number;
  /** Ritual: at start of enemy turn, gain this much strength (each stack = +1 strength per turn). */
  ritualStacks?: number;
  /** Gremlin Wizard: turns spent charging before attack. */
  chargeTurns?: number;
  /** Red/Green Louse: per-combat attack value (roll 5–7). */
  biteDamage?: number;
  /** For intent patterns that cannot repeat (e.g. Jaw Worm). */
  lastIntentType?: string;
  /** Barricade: block is not removed at start of player turn. */
  blockRetains?: boolean;
  /** Artifact: negate this many debuff applications on this enemy. */
  artifactStacks?: number;
}

/** Plant mode: determines end-of-turn action (Verdant Machinist). */
export type PlantMode = 'defense' | 'attack' | 'support';

/** Plant minion state (Verdant Machinist). Max 3 plants. 3 Growth → evolve. */
export interface PlantState {
  id: string;
  hp: number;
  maxHp: number;
  block: number;
  /** 0–3; at 3 Growth the plant evolves (advance stage, reset growth). */
  growth: number;
  /** 1=Seedling, 2=Sprout, 3=Mature. */
  growthStage: 1 | 2 | 3;
  mode: PlantMode;
  turnsAlive: number;
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
  /** Number of monster (non-elite, non-boss) combats completed this act. Used for first-N encounter pool selection. */
  monsterEncountersCompletedThisAct?: number;
  /** Last 2 monster encounter IDs (no same encounter in next 2 fights). */
  lastMonsterEncounterIds?: string[];
  /** Playable character id for this run (e.g. "gunboy"). Drives starter deck and card pools. */
  characterId?: string;
  /** Run seed used for map generation and initial deck shuffle; enables reproducible runs. */
  seed?: number;
  /** Potion IDs (max 3). One-time use in combat. */
  potions?: string[];
  /** Frail stacks on player; damage taken multiplied by 1 + 0.25*stacks, decay by 1 per turn. */
  frailStacks?: number;
  /** Strength: extra damage per stack when dealing attack damage (per combat). */
  strengthStacks?: number;
  /** Strength to subtract at end of current turn (e.g. Flex potion). */
  playerStrengthDecayAtEnd?: number;
  /** Weak on player: attack damage taken multiplied by 1 + 0.25*stacks, decay by 1 per turn. */
  playerWeakStacks?: number;
  /** Vulnerable on player: damage taken multiplied by 1.5, decay by 1 per turn. */
  playerVulnerableStacks?: number;
  /** Thorns: when you take attack damage, deal this much damage back to the attacking enemy. */
  playerThorns?: number;
  /** Heal this much at end of your turn (e.g. Nanite Paste). */
  playerHealAtEndOfTurn?: number;
  /** Gain this much Block at start of each turn (e.g. Armor Weave). */
  playerBlockPerTurn?: number;
  /** Gain this much Strength at start of each turn (e.g. Ritual Amp). */
  playerStrengthPerTurn?: number;
  /** Artifact: negate this many debuff applications (Weak/Vulnerable/Frail). */
  playerArtifactStacks?: number;
  /** Next card you play is resolved twice (e.g. Twin Dose). */
  playerNextCardPlayedTwice?: boolean;
  /** Optional RNG for simulator; same seed => reproducible run. Do not set in normal play. */
  _simRng?: () => number;
  /** Verdant Machinist: up to 3 plant minions. Present only when character uses plant mechanic. */
  plants?: PlantState[];
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
