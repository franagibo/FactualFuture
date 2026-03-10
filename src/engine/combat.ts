import type { GameState, EnemyState, EnemyIntent } from './types';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef } from './loadData';
import { runEffects, discardHandAndDraw } from './effectRunner';

const INITIAL_PLAYER_HP = 70;
const INITIAL_MAX_ENERGY = 3;
const HAND_SIZE_START = 5;
const DRAW_PER_TURN = 5;

/** Initial deck: 5 Strike, 4 Defend, 1 Bash */
const INITIAL_DECK_IDS = [
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

function pickIntent(def: EnemyDef): EnemyIntent {
  const total = def.intents.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const { weight, intent } of def.intents) {
    r -= weight;
    if (r <= 0) {
      return { type: intent.type as EnemyIntent['type'], value: intent.value };
    }
  }
  const last = def.intents[def.intents.length - 1];
  return { type: last.intent.type as EnemyIntent['type'], value: last.intent.value };
}

function setEnemyIntents(
  enemies: EnemyState[],
  enemyDefs: Map<string, EnemyDef>
): EnemyState[] {
  return enemies.map((e) => {
    const def = enemyDefs.get(e.id);
    if (!def) return e;
    return { ...e, intent: pickIntent(def) };
  });
}

export function createInitialState(
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>,
  encounterId: string
): GameState {
  const encounter = encountersMap.get(encounterId);
  if (!encounter) {
    return {
      playerHp: INITIAL_PLAYER_HP,
      playerMaxHp: INITIAL_PLAYER_HP,
      playerBlock: 0,
      currentEncounter: null,
      phase: 'player',
      deck: [],
      hand: [],
      discard: [],
      energy: 0,
      maxEnergy: INITIAL_MAX_ENERGY,
      turnNumber: 0,
      enemies: [],
      combatResult: null,
    };
  }

  const deck = shuffle([...INITIAL_DECK_IDS]);
  const hand: string[] = [];
  const restDeck = [...deck];
  for (let i = 0; i < HAND_SIZE_START && restDeck.length > 0; i++) {
    hand.push(restDeck.shift()!);
  }

  const enemies: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    const intent = pickIntent(def);
    return {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent,
    };
  });

  return {
    playerHp: INITIAL_PLAYER_HP,
    playerMaxHp: INITIAL_PLAYER_HP,
    playerBlock: 0,
    currentEncounter: encounterId,
    phase: 'player',
    deck: restDeck,
    hand,
    discard: [],
    energy: INITIAL_MAX_ENERGY,
    maxEnergy: INITIAL_MAX_ENERGY,
    turnNumber: 1,
    enemies,
    combatResult: null,
  };
}

/**
 * Start combat from run state: merge deck+hand+discard, shuffle, draw 5, set enemies.
 * Sets runPhase to 'combat'. Used when entering a combat/elite/boss node.
 */
export function startCombatFromRunState(
  state: GameState,
  encounterId: string,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>
): GameState {
  const encounter = encountersMap.get(encounterId);
  if (!encounter) return state;

  const fullDeck = shuffle([...state.deck, ...state.discard, ...state.hand]);
  const hand: string[] = [];
  const restDeck = [...fullDeck];
  for (let i = 0; i < HAND_SIZE_START && restDeck.length > 0; i++) {
    hand.push(restDeck.shift()!);
  }

  const enemies: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    const intent = pickIntent(def);
    return {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent,
    };
  });

  return {
    ...state,
    deck: restDeck,
    hand,
    discard: [],
    currentEncounter: encounterId,
    phase: 'player',
    energy: state.maxEnergy,
    maxEnergy: state.maxEnergy,
    turnNumber: 1,
    enemies,
    combatResult: null,
    runPhase: 'combat',
  };
}

export function playCard(
  state: GameState,
  cardId: string,
  targetEnemyIndex: number | null,
  cardsMap: Map<string, CardDef>
): GameState {
  if (state.phase !== 'player' || state.combatResult) return state;
  const card = cardsMap.get(cardId);
  if (!card) return state;
  const handIndex = state.hand.indexOf(cardId);
  if (handIndex === -1) return state;
  if (state.energy < card.cost) return state;

  const newHand = state.hand.filter((_, i) => i !== handIndex);
  const newDiscard = [...state.discard, cardId];
  let next: GameState = {
    ...state,
    hand: newHand,
    discard: newDiscard,
    energy: state.energy - card.cost,
  };
  next = runEffects(card, next, targetEnemyIndex);

  // Check combat result
  const allDead = next.enemies.every((e) => e.hp <= 0);
  if (allDead) next = { ...next, combatResult: 'win' };
  if (next.playerHp <= 0) next = { ...next, combatResult: 'lose' };

  return next;
}

export function endTurn(
  state: GameState,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>
): GameState {
  if (state.phase !== 'player' || state.combatResult) return state;

  // Resolve enemy intents
  let next: GameState = { ...state, playerBlock: state.playerBlock, phase: 'enemy' };
  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    const intent = enemy.intent;
    if (!intent) continue;
    if (intent.type === 'attack') {
      let dmg = intent.value;
      if (next.playerBlock > 0) {
        const blockReduce = Math.min(next.playerBlock, dmg);
        next = { ...next, playerBlock: next.playerBlock - blockReduce };
        dmg -= blockReduce;
      }
      if (dmg > 0) next = { ...next, playerHp: Math.max(0, next.playerHp - dmg) };
    }
    if (intent.type === 'block') {
      const idx = next.enemies.findIndex((e) => e.id === enemy.id);
      if (idx >= 0) {
        const en = [...next.enemies];
        en[idx] = { ...en[idx], block: (en[idx].block || 0) + intent.value };
        next = { ...next, enemies: en };
      }
    }
  }

  next = { ...next, playerBlock: 0 };

  if (next.playerHp <= 0) return { ...next, combatResult: 'lose' };

  // Next turn: discard hand, draw 5, refill energy, decay statuses, new intents
  next = discardHandAndDraw(next, DRAW_PER_TURN);
  const decayedEnemies = next.enemies.map((e) => ({
    ...e,
    vulnerableStacks: Math.max(0, (e.vulnerableStacks ?? 0) - 1),
  }));
  next = {
    ...next,
    phase: 'player',
    energy: next.maxEnergy,
    turnNumber: next.turnNumber + 1,
    enemies: setEnemyIntents(decayedEnemies, enemyDefs),
  };
  return next;
}
