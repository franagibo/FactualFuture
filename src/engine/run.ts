import type { GameState, MapState, RunPhase } from './types';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef, EventDef, PotionDef } from './loadData';
import { generateMap, type ActConfig } from './map/mapGenerator';
import { startCombatFromRunState } from './combat';
import { drawCards } from './effectRunner';

const INITIAL_PLAYER_HP = 70;
const INITIAL_MAX_ENERGY = 3;

/** Default starter deck when no character is specified (backward compat). */
const DEFAULT_STARTER_DECK = [
  'strike', 'strike', 'strike', 'strike', 'strike',
  'defend', 'defend', 'defend', 'defend',
  'bash',
];

export interface StartRunOptions {
  /** Starter deck card IDs. If omitted, DEFAULT_STARTER_DECK is used. */
  starterDeck?: string[];
  /** Character id for this run (stored in state for UI/persistence). */
  characterId?: string;
}

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
 * @param options.starterDeck - Card IDs for initial deck (default: Gunboy-style starter).
 * @param options.characterId - Character id stored in state for UI and persistence.
 */
export function startRun(
  seed: number,
  actConfig: ActConfig,
  options?: StartRunOptions
): GameState {
  const map = generateMap(seed, actConfig);
  const starterDeck = options?.starterDeck?.length ? options.starterDeck : DEFAULT_STARTER_DECK;
  const deck = shuffle([...starterDeck]);

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
    potions: [],
    floor: 0,
    act: 1,
    characterId: options?.characterId,
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

export function getNodeById(map: MapState, id: string) {
  return map.nodes.find((n) => n.id === id);
}

/** True if the current node is a boss (used to treat boss win as run victory). */
export function isBossNode(state: GameState): boolean {
  if (!state.map || state.currentNodeId == null) return false;
  const node = getNodeById(state.map, state.currentNodeId);
  return node?.type === 'boss';
}

export interface ShopPoolConfig {
  cards: string[];
  relics: string[];
  cardPriceMin: number;
  cardPriceMax: number;
  relicPriceMin: number;
  relicPriceMax: number;
  cardCount: number;
  relicCount: number;
}

function randomInRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Enter shop: set runPhase to 'shop'. If pool provided, fill shopState with random cards/relics and prices. */
export function enterShop(state: GameState, pool?: ShopPoolConfig): GameState {
  const shopState: GameState['shopState'] = {
    cardIds: [],
    relicIds: [],
    cardPrices: {},
    relicPrices: {},
  };
  if (pool) {
    const cards = pickRandom(pool.cards, Math.min(pool.cardCount, pool.cards.length));
    const relics = pickRandom(pool.relics, Math.min(pool.relicCount, pool.relics.length));
    for (const id of cards) {
      shopState.cardIds.push(id);
      shopState.cardPrices[id] = randomInRange(pool.cardPriceMin, pool.cardPriceMax);
    }
    for (const id of relics) {
      shopState.relicIds.push(id);
      shopState.relicPrices[id] = randomInRange(pool.relicPriceMin, pool.relicPriceMax);
    }
  }
  return {
    ...state,
    runPhase: 'shop',
    shopState,
  };
}

/** Purchase a card from shop: spend gold, add to deck, remove from shop offerings. */
export function purchaseCard(state: GameState, cardId: string): GameState {
  if (state.runPhase !== 'shop' || !state.shopState) return state;
  const price = state.shopState.cardPrices[cardId];
  if (price == null || (state.gold ?? 0) < price) return state;
  const idx = state.shopState.cardIds.indexOf(cardId);
  if (idx === -1) return state;
  const cardIds = state.shopState.cardIds.filter((_, i) => i !== idx);
  const cardPrices = { ...state.shopState.cardPrices };
  delete cardPrices[cardId];
  return {
    ...state,
    gold: (state.gold ?? 0) - price,
    deck: [...(state.deck ?? []), cardId],
    shopState: {
      ...state.shopState,
      cardIds,
      cardPrices,
    },
  };
}

/** Purchase a relic from shop: spend gold, add to relics, remove from shop offerings. */
export function purchaseRelic(state: GameState, relicId: string): GameState {
  if (state.runPhase !== 'shop' || !state.shopState) return state;
  const price = state.shopState.relicPrices[relicId];
  if (price == null || (state.gold ?? 0) < price) return state;
  const idx = state.shopState.relicIds.indexOf(relicId);
  if (idx === -1) return state;
  const relicIds = state.shopState.relicIds.filter((_, i) => i !== idx);
  const relicPrices = { ...state.shopState.relicPrices };
  delete relicPrices[relicId];
  return {
    ...state,
    gold: (state.gold ?? 0) - price,
    relics: [...(state.relics ?? []), relicId],
    shopState: {
      ...state.shopState,
      relicIds,
      relicPrices,
    },
  };
}

/** Leave shop: return to map, clear shopState. */
export function leaveShop(state: GameState): GameState {
  if (state.runPhase !== 'shop') return state;
  return {
    ...state,
    runPhase: 'map',
    shopState: undefined,
  };
}

const STUB_EVENT: EventDef = {
  id: 'stub',
  text: 'You rest here briefly. Nothing much happens.',
  choices: [{ text: 'Continue', outcome: { type: 'nothing' } }],
};

/** Enter event: pick one event from pool (or stub), set runPhase and eventState. */
export function enterEvent(state: GameState, eventPool: EventDef[]): GameState {
  const pool = eventPool.length > 0 ? eventPool : [STUB_EVENT];
  const event = pickRandom(pool, 1)[0];
  return {
    ...state,
    runPhase: 'event',
    eventState: {
      eventId: event.id,
      text: event.text,
      choices: event.choices.map((c) => ({ text: c.text, outcome: c.outcome })),
    },
  };
}

export interface EventOutcome {
  type: string;
  cardId?: string;
  amount?: number;
  relicId?: string;
  potionId?: string;
}

const MAX_POTIONS = 3;

function applyEventOutcome(state: GameState, outcome: unknown): GameState {
  if (outcome == null || typeof outcome !== 'object' || !('type' in outcome)) return state;
  const o = outcome as EventOutcome;
  let next = { ...state };
  switch (o.type) {
    case 'addCard':
      if (o.cardId) next = { ...next, deck: [...(next.deck ?? []), o.cardId] };
      break;
    case 'loseCard':
      if (o.cardId) {
        const idx = next.deck.indexOf(o.cardId);
        if (idx !== -1) {
          const deck = [...next.deck];
          deck.splice(idx, 1);
          next = { ...next, deck };
        }
      }
      break;
    case 'heal':
      if (o.amount != null) {
        const maxHp = next.playerMaxHp ?? next.playerHp;
        next = { ...next, playerHp: Math.min(maxHp, next.playerHp + o.amount) };
      }
      break;
    case 'gold':
      if (o.amount != null) next = { ...next, gold: (next.gold ?? 0) + o.amount };
      break;
    case 'obtainRelic':
      if (o.relicId) next = { ...next, relics: [...(next.relics ?? []), o.relicId] };
      break;
    case 'curse':
      if (o.cardId) next = { ...next, deck: [...(next.deck ?? []), o.cardId] };
      break;
    case 'addPotion':
      if (o.potionId) {
        const current = next.potions ?? [];
        if (current.length < MAX_POTIONS) next = { ...next, potions: [...current, o.potionId] };
      }
      break;
    case 'nothing':
    default:
      break;
  }
  return next;
}

/** Execute event choice: apply outcome, return to map, clear eventState. */
export function executeEventChoice(state: GameState, choiceIndex: number): GameState {
  if (state.runPhase !== 'event' || !state.eventState) return state;
  const choice = state.eventState.choices[choiceIndex];
  if (!choice) return state;
  const next = applyEventOutcome(state, choice.outcome);
  return {
    ...next,
    runPhase: 'map',
    eventState: undefined,
  };
}

const MAX_ACT = 2;

/** After boss win: if more acts remain, set runPhase to 'actComplete'; else 'victory'. */
export function getRunPhaseAfterBossWin(state: GameState): RunPhase {
  const act = state.act ?? 1;
  return act >= MAX_ACT ? 'victory' : 'actComplete';
}

/** Advance to next act: new map, act++, runPhase map, currentNodeId null. */
export function advanceToNextAct(
  state: GameState,
  actConfigs: Record<string, ActConfig & Record<string, unknown>>
): GameState {
  const nextAct = (state.act ?? 1) + 1;
  const key = `act${nextAct}`;
  const raw = actConfigs[key];
  if (!raw) return state;
  const actConfig: ActConfig = {
    combat: raw.combat,
    elite: raw.elite,
    rest: raw.rest,
    shop: raw.shop,
    event: raw.event,
    boss: raw.boss,
  };
  const seed = (state.floor ?? 0) * 1000 + nextAct * 12345 + (state.turnNumber ?? 0);
  const map = generateMap(seed, actConfig);
  return {
    ...state,
    act: nextAct,
    map,
    currentNodeId: null,
    runPhase: 'map',
    floor: 0,
    currentEncounter: null,
    enemies: [],
    combatResult: null,
    rewardCardChoices: undefined,
  };
}

/**
 * Choose a node to move to. Validates adjacency, then starts combat/rest/etc.
 * eventPool: for event nodes. shopPool: for shop nodes (cards/relics and prices).
 */
export function chooseNode(
  state: GameState,
  nodeId: string,
  encounterId: string | null,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>,
  eventPool: EventDef[] = [],
  shopPool?: ShopPoolConfig
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
      return enterShop(next, shopPool);
    case 'event':
      return enterEvent(next, eventPool);
    default:
      return next;
  }
}

const GOLD_PER_COMBAT = 10;
const REWARD_CARD_COUNT = 3;

/** Rarity weights when offering a potion: common 65%, uncommon 25%, rare 10%. */
const POTION_RARITY_WEIGHTS = { common: 65, uncommon: 25, rare: 10 } as const;

/**
 * Pick one potion id at random using rarity distribution (65% common, 25% uncommon, 10% rare).
 * Returns null if no potions defined.
 */
export function pickRandomPotionByRarity(potions: Map<string, PotionDef>): string | null {
  const list = Array.from(potions.values());
  if (list.length === 0) return null;
  const byRarity = { common: list.filter((p) => p.rarity === 'common'), uncommon: list.filter((p) => p.rarity === 'uncommon'), rare: list.filter((p) => p.rarity === 'rare') };
  const r = Math.random() * 100;
  let pool: PotionDef[] = byRarity.rare;
  if (r < POTION_RARITY_WEIGHTS.common) pool = byRarity.common;
  else if (r < POTION_RARITY_WEIGHTS.common + POTION_RARITY_WEIGHTS.uncommon) pool = byRarity.uncommon;
  if (pool.length === 0) pool = list;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

/** Remove all status cards (Burn, Dazed, etc.) from deck, hand, and discard. Status cards are combat-only. */
export function stripStatusCards(state: GameState, cardsMap: Map<string, CardDef>): GameState {
  const isStatus = (id: string) => cardsMap.get(id)?.isStatus === true;
  return {
    ...state,
    deck: state.deck.filter((id) => !isStatus(id)),
    hand: state.hand.filter((id) => !isStatus(id)),
    discard: state.discard.filter((id) => !isStatus(id)),
  };
}

/**
 * After combat win: strip status cards, add gold, set runPhase to 'reward', pick 3 card choices from pool.
 */
export function afterCombatWin(
  state: GameState,
  rewardCardPool: string[],
  cardsMap: Map<string, CardDef>
): GameState {
  const stripped = stripStatusCards(state, cardsMap);
  const choices = pickRandom(rewardCardPool, REWARD_CARD_COUNT);
  return {
    ...stripped,
    runPhase: 'reward',
    rewardCardChoices: choices,
    gold: (stripped.gold ?? 0) + GOLD_PER_COMBAT,
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

/** Potion def for usePotion (effect only). */
export interface PotionEffectDef {
  effect: { type: string; value: number; value2?: number };
}

function applyDamageToEnemyInRun(enemy: GameState['enemies'][0], dmg: number): { block: number; hp: number } {
  const vuln = (enemy as { vulnerableStacks?: number }).vulnerableStacks ?? 0;
  const total = Math.floor(dmg * (vuln > 0 ? 1.5 : 1));
  const blockReduce = Math.min(enemy.block, total);
  const hpReduce = Math.min(enemy.hp, total - blockReduce);
  return { block: enemy.block - blockReduce, hp: Math.max(0, enemy.hp - hpReduce) };
}

/**
 * Use one potion in combat: apply effect, remove one instance from potions.
 * For single-target damage potions, targetEnemyIndex must be a valid alive enemy.
 */
export function usePotion(
  state: GameState,
  potionId: string,
  targetEnemyIndex: number | null,
  potionDef: PotionEffectDef | undefined
): GameState {
  if (state.runPhase !== 'combat' || state.phase !== 'player' || state.combatResult) return state;
  const list = state.potions ?? [];
  const idx = list.indexOf(potionId);
  if (idx === -1 || !potionDef) return state;

  const effect = potionDef.effect;
  let next: GameState = { ...state, potions: list.filter((_, i) => i !== idx) };

  if (effect.type === 'heal') {
    const maxHp = next.playerMaxHp ?? next.playerHp;
    next = { ...next, playerHp: Math.min(maxHp, next.playerHp + effect.value) };
  } else if (effect.type === 'block') {
    next = { ...next, playerBlock: next.playerBlock + effect.value };
  } else if (effect.type === 'damage' && targetEnemyIndex != null && next.enemies[targetEnemyIndex]?.hp > 0) {
    const enemy = next.enemies[targetEnemyIndex];
    const dmg = effect.value;
    const { block, hp } = applyDamageToEnemyInRun(enemy, dmg);
    const enemies = [...next.enemies];
    enemies[targetEnemyIndex] = { ...enemy, block, hp };
    next = { ...next, enemies };
    if (enemies.every((e) => e.hp <= 0)) next = { ...next, combatResult: 'win' };
  } else if (effect.type === 'damageAll') {
    const enemies = next.enemies.map((e) => (e.hp <= 0 ? e : { ...e, ...applyDamageToEnemyInRun(e, effect.value) }));
    next = { ...next, enemies };
    if (enemies.every((e) => e.hp <= 0)) next = { ...next, combatResult: 'win' };
  } else if (effect.type === 'energy') {
    next = { ...next, energy: next.energy + effect.value };
  } else if (effect.type === 'strength') {
    next = { ...next, strengthStacks: (next.strengthStacks ?? 0) + effect.value };
  } else if (effect.type === 'strengthWithDecay') {
    const gain = effect.value;
    const decay = effect.value2 ?? effect.value;
    next = { ...next, strengthStacks: (next.strengthStacks ?? 0) + gain, playerStrengthDecayAtEnd: (next.playerStrengthDecayAtEnd ?? 0) + decay };
  } else if (effect.type === 'draw') {
    next = drawCards(next, effect.value);
  } else if (effect.type === 'vulnerableAll') {
    const enemies = next.enemies.map((e) => (e.hp <= 0 ? e : { ...e, vulnerableStacks: (e.vulnerableStacks ?? 0) + effect.value }));
    next = { ...next, enemies };
  } else if (effect.type === 'weakAll') {
    const enemies = next.enemies.map((e) => (e.hp <= 0 ? e : { ...e, weakStacks: (e.weakStacks ?? 0) + effect.value }));
    next = { ...next, enemies };
  } else if (effect.type === 'maxHp') {
    const add = effect.value;
    next = { ...next, playerMaxHp: (next.playerMaxHp ?? next.playerHp) + add, playerHp: next.playerHp + add };
  } else if (effect.type === 'escape') {
    next = { ...next, combatResult: 'win', runPhase: 'map', currentEncounter: null, enemies: [] };
  }

  return next;
}
