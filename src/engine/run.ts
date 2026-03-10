import type { GameState, MapState, RunPhase } from './types';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef } from './loadData';
import { generateMap, type ActConfig } from './map/mapGenerator';
import { startCombatFromRunState } from './combat';

const INITIAL_PLAYER_HP = 70;
const INITIAL_MAX_ENERGY = 3;

/** Initial run deck: 5 Strike, 4 Defend, 1 Bash (same as Phase 1). */
const INITIAL_RUN_DECK = [
  'strike', 'strike', 'strike', 'strike', 'strike',
  'defend', 'defend', 'defend', 'defend',
  'bash',
];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const copy = [...arr];
  shuffle(copy);
  return copy.slice(0, Math.min(count, copy.length));
}

/**
 * Create initial run state: map generated, runPhase='map', deck shuffled, at map start.
 */
export function startRun(
  seed: number,
  actConfig: ActConfig
): GameState {
  const map = generateMap(seed, actConfig);
  const deck = shuffle([...INITIAL_RUN_DECK]);

  return {
    playerHp: INITIAL_PLAYER_HP,
    playerMaxHp: INITIAL_PLAYER_HP,
    playerBlock: 0,
    currentEncounter: null,
    phase: 'player',
    deck,
    hand: [],
    discard: [],
    energy: 0,
    maxEnergy: INITIAL_MAX_ENERGY,
    turnNumber: 0,
    enemies: [],
    combatResult: null,
    runPhase: 'map',
    map,
    currentNodeId: null,
    gold: 0,
    relics: [],
    floor: 0,
  };
}

/**
 * Node IDs the player can move to from the current position.
 * - At start (currentNodeId null): all nodes on the bottom floor with no incoming edges (2+ choices).
 * - When at a node: only immediate successors via edges (next floor along chosen path).
 */
export function getAvailableNextNodes(state: GameState): string[] {
  const map = state.map;
  if (!map || map.nodes.length === 0) return [];

  if (state.currentNodeId == null) {
    const hasIncoming = new Set<string>();
    for (const [, to] of map.edges) hasIncoming.add(to);
    const roots = map.nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
    return roots.length > 0 ? roots : [map.nodes[0].id];
  }

  return map.edges
    .filter(([from]) => from === state.currentNodeId)
    .map(([, to]) => to);
}

function getNodeById(map: MapState, id: string) {
  return map.nodes.find((n) => n.id === id);
}

/**
 * Choose a node to move to. Validates adjacency, then starts combat/rest/etc.
 */
export function chooseNode(
  state: GameState,
  nodeId: string,
  encounterId: string | null,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>
): GameState {
  if (state.runPhase !== 'map' || !state.map) return state;

  const available = getAvailableNextNodes(state);
  if (!available.includes(nodeId)) return state;

  const node = getNodeById(state.map, nodeId);
  if (!node) return state;

  const next: GameState = {
    ...state,
    currentNodeId: nodeId,
    floor: (state.floor ?? 0) + 1,
  };

  switch (node.type) {
    case 'combat':
    case 'elite':
    case 'boss':
      if (encounterId) {
        return startCombatFromRunState(next, encounterId, cardsMap, enemyDefs, encountersMap);
      }
      return next;
    case 'rest':
      return { ...next, runPhase: 'rest' };
    case 'shop':
    case 'event':
      return next;
    default:
      return next;
  }
}

const GOLD_PER_COMBAT = 10;
const REWARD_CARD_COUNT = 3;

/**
 * After combat win: add gold, set runPhase to 'reward', pick 3 card choices from pool.
 */
export function afterCombatWin(
  state: GameState,
  rewardCardPool: string[]
): GameState {
  const choices = pickRandom(rewardCardPool, REWARD_CARD_COUNT);
  return {
    ...state,
    runPhase: 'reward',
    rewardCardChoices: choices,
    gold: (state.gold ?? 0) + GOLD_PER_COMBAT,
    currentEncounter: null,
    enemies: [],
    combatResult: null,
  };
}

/**
 * Pick one card from reward; add to deck, return to map.
 */
export function chooseCardReward(state: GameState, cardId: string): GameState {
  if (state.runPhase !== 'reward' || !state.rewardCardChoices?.includes(cardId)) return state;

  const deck = [...(state.deck ?? []), cardId];
  return {
    ...state,
    runPhase: 'map',
    rewardCardChoices: undefined,
    deck,
  };
}

const REST_HEAL_PERCENT = 0.3;

/**
 * Rest site: heal 30% max HP, then return to map.
 */
export function restHeal(state: GameState): GameState {
  if (state.runPhase !== 'rest') return state;
  const heal = Math.floor((state.playerMaxHp ?? state.playerHp) * REST_HEAL_PERCENT);
  const playerHp = Math.min(state.playerMaxHp ?? state.playerHp, state.playerHp + heal);
  return {
    ...state,
    runPhase: 'map',
    playerHp,
  };
}

/**
 * Rest site: remove one copy of cardId from deck, then return to map.
 */
export function restRemoveCard(state: GameState, cardId: string): GameState {
  if (state.runPhase !== 'rest') return state;
  const idx = state.deck.indexOf(cardId);
  if (idx === -1) return state;
  const deck = [...state.deck];
  deck.splice(idx, 1);
  return {
    ...state,
    runPhase: 'map',
    deck,
  };
}
