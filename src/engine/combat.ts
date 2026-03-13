import type { GameState, EnemyState, EnemyIntent, PlantState } from './types';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef, EnemyTrigger } from './loadData';
import { runEffects, discardHandAndDraw } from './effectRunner';
import { rngShuffle } from './rng';
import type { Rng } from './rng';
import { defaultRng } from './rng';
import {
  isPlantCharacter,
  getAlivePlants,
  createSeedling,
  SEEDLING_DEFAULT_HP,
  PLANT_ATTACK_DAMAGE,
  PLANT_ATTACK_HITS_MATURE,
  PLANT_DEFENSE_PLAYER_BLOCK,
  PLANT_DEFENSE_PLANT_BLOCK,
  PLANT_SUPPORT_WEAK,
  PLANT_SUPPORT_PLAYER_BLOCK,
  PLANT_SUPPORT_ENERGY_EVERY_N_TURNS,
} from './plantConfig';

const INITIAL_PLAYER_HP = 70;
const INITIAL_MAX_ENERGY = 3;
const HAND_SIZE_START = 5;
const DRAW_PER_TURN = 5;

/** Default deck when no starter deck is provided (e.g. tests). */
const DEFAULT_STARTER_DECK_IDS = [
  'strike', 'strike', 'strike', 'strike', 'strike',
  'defend', 'defend', 'defend', 'defend',
  'bash',
];

function pickIntent(def: EnemyDef, rng: Rng = defaultRng): EnemyIntent {
  const total = def.intents.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const { weight, intent } of def.intents) {
    r -= weight;
    if (r <= 0) {
      return {
        type: intent.type as EnemyIntent['type'],
        value: intent.value,
        addStatus: intent.addStatus,
      };
    }
  }
  const last = def.intents[def.intents.length - 1];
  const intent = last.intent;
  return {
    type: intent.type as EnemyIntent['type'],
    value: intent.value,
    addStatus: intent.addStatus,
  };
}

function setEnemyIntents(
  enemies: EnemyState[],
  enemyDefs: Map<string, EnemyDef>,
  rng: Rng = defaultRng
): EnemyState[] {
  return enemies.map((e) => {
    const def = enemyDefs.get(e.id);
    if (!def) return e;
    return { ...e, intent: pickIntent(def, rng) };
  });
}

/** Get attack target for enemy intent: Defense plants first, then any plant, then player. */
function getAttackTarget(
  state: GameState,
  rng: Rng = defaultRng
): { target: 'player' } | { target: 'plant'; plantIndex: number } {
  if (!isPlantCharacter(state.characterId) || !state.plants?.length) return { target: 'player' };
  const alive = getAlivePlants(state.plants);
  if (alive.length === 0) return { target: 'player' };
  const defensePlants = alive.filter((p) => p.mode === 'defense');
  const pool = defensePlants.length > 0 ? defensePlants : alive;
  const pick = pool[Math.floor(rng() * pool.length)];
  const plantIndex = state.plants!.findIndex((p) => p.id === pick.id);
  return { target: 'plant', plantIndex };
}

/**
 * Run plant end-of-turn actions (Verdant Machinist): Attack/Defense/Support effects, then increment turnsAlive.
 * Call at start of enemy phase before resolving intents.
 */
export function runPlantTurnActions(state: GameState, rng: Rng = defaultRng): GameState {
  if (!isPlantCharacter(state.characterId) || !state.plants?.length) return state;
  let next = { ...state, plants: state.plants.map((p) => ({ ...p })) };
  const plants = next.plants!;
  const enemies = next.enemies.map((e) => ({ ...e }));

  for (let i = 0; i < plants.length; i++) {
    const p = plants[i];
    if (p.hp <= 0) continue;
    if (p.growthStage >= 2) {
      if (p.mode === 'attack') {
        const dmg = PLANT_ATTACK_DAMAGE[p.growthStage as 2 | 3];
        const hits = p.growthStage === 3 ? PLANT_ATTACK_HITS_MATURE : 1;
        const aliveEnemies = enemies.filter((e) => e.hp > 0);
        for (let h = 0; h < hits && aliveEnemies.length > 0; h++) {
          const idx = Math.floor(rng() * aliveEnemies.length);
          const target = aliveEnemies[idx];
          const ei = next.enemies.findIndex((e) => e.id === target.id);
          if (ei >= 0) {
            let remain = dmg;
            if (target.block > 0) {
              const blockReduce = Math.min(target.block, remain);
              target.block -= blockReduce;
              remain -= blockReduce;
            }
            if (remain > 0) target.hp = Math.max(0, target.hp - remain);
            next = { ...next, enemies };
          }
          // refresh alive list for next hit
          aliveEnemies.length = 0;
          enemies.forEach((e) => e.hp > 0 && aliveEnemies.push(e));
        }
      }
      if (p.mode === 'defense') {
        next = { ...next, playerBlock: next.playerBlock + PLANT_DEFENSE_PLAYER_BLOCK[p.growthStage as 2 | 3] };
        const plantBlock = PLANT_DEFENSE_PLANT_BLOCK[p.growthStage as 2 | 3];
        if (plantBlock > 0) plants[i] = { ...p, block: (p.block ?? 0) + plantBlock };
      }
      if (p.mode === 'support') {
        if (p.growthStage === 2) {
          next = { ...next, playerBlock: next.playerBlock + PLANT_SUPPORT_PLAYER_BLOCK };
          const aliveEnemies = enemies.filter((e) => e.hp > 0);
          if (aliveEnemies.length > 0) {
            const target = aliveEnemies[Math.floor(rng() * aliveEnemies.length)];
            target.weakStacks = (target.weakStacks ?? 0) + PLANT_SUPPORT_WEAK;
            next = { ...next, enemies };
          }
        } else {
          if (p.turnsAlive > 0 && (p.turnsAlive + 1) % PLANT_SUPPORT_ENERGY_EVERY_N_TURNS === 0) {
            next = { ...next, energy: next.energy + 1 };
          }
        }
      }
    }
    plants[i] = { ...plants[i], turnsAlive: (plants[i].turnsAlive ?? 0) + 1 };
  }

  next = { ...next, plants: plants.filter((p) => p.hp > 0) };
  return next;
}

/**
 * Process HP-based triggers (e.g. split at 50%). When an enemy's HP is at or below the trigger
 * threshold, the trigger action runs (e.g. replace with spawns). Spawned enemies get intent 'none'
 * for the rest of the current turn. Extensible for future trigger types.
 */
export function processHpThresholdTriggers(
  state: GameState,
  enemyDefs: Map<string, EnemyDef>
): GameState {
  const triggers = state.enemies.flatMap((e) => {
    const def = enemyDefs.get(e.id);
    if (!def?.triggers?.length || e.hp <= 0) return [];
    return def.triggers.filter(
      (t): t is EnemyTrigger => t.trigger === 'hp_below_percent' && (e.hp / e.maxHp) * 100 <= t.value
    ).map((t) => ({ enemy: e, def, trigger: t }));
  });
  if (triggers.length === 0) return state;

  const newEnemies: EnemyState[] = [];
  const replaced = new Set(triggers.map(({ enemy }) => enemy));
  for (const e of state.enemies) {
    if (!replaced.has(e)) {
      newEnemies.push(e);
      continue;
    }
    const t = triggers.find((x) => x.enemy === e);
    if (!t || t.trigger.action !== 'split') {
      newEnemies.push(e);
      continue;
    }
    const spawnDef = enemyDefs.get(t.trigger.spawnEnemyId);
    if (!spawnDef) {
      newEnemies.push(e);
      continue;
    }
    for (let i = 0; i < t.trigger.spawnCount; i++) {
      newEnemies.push({
        id: spawnDef.id,
        name: spawnDef.name,
        hp: e.hp,
        maxHp: spawnDef.maxHp,
        block: 0,
        intent: { type: 'none', value: 0 },
        size: spawnDef.size,
      });
    }
  }
  return { ...state, enemies: newEnemies };
}

/**
 * Create combat state for an encounter.
 * @param starterDeck - Optional card IDs for initial deck; if omitted, DEFAULT_STARTER_DECK_IDS is used.
 * @param rng - Optional RNG for reproducible sim; used for deck shuffle and enemy intents.
 */
export function createInitialState(
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>,
  encounterId: string,
  starterDeck?: string[],
  rng: Rng = defaultRng
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
      exhaustPile: [],
      energy: 0,
      maxEnergy: INITIAL_MAX_ENERGY,
      turnNumber: 0,
      enemies: [],
      combatResult: null,
    };
  }

  const deckIds = starterDeck?.length ? starterDeck : DEFAULT_STARTER_DECK_IDS;
  const deck = rngShuffle([...deckIds], rng);
  const hand: string[] = [];
  const restDeck = [...deck];
  for (let i = 0; i < HAND_SIZE_START && restDeck.length > 0; i++) {
    hand.push(restDeck.shift()!);
  }

  const enemies: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    const intent = pickIntent(def, rng);
    return {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent,
      size: def.size,
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
    exhaustPile: [],
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
 * @param rng - Optional RNG for reproducible sim; defaults to state._simRng or Math.random.
 */
export function startCombatFromRunState(
  state: GameState,
  encounterId: string,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  encountersMap: Map<string, EncounterDef>,
  rng?: Rng
): GameState {
  const encounter = encountersMap.get(encounterId);
  if (!encounter) return state;

  const simRng = rng ?? state._simRng ?? defaultRng;
  const fullDeck = rngShuffle([...state.deck, ...state.discard, ...state.hand], simRng);
  const hand: string[] = [];
  const restDeck = [...fullDeck];
  for (let i = 0; i < HAND_SIZE_START && restDeck.length > 0; i++) {
    hand.push(restDeck.shift()!);
  }

  const enemies: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    const intent = pickIntent(def, simRng);
    return {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent,
      size: def.size,
    };
  });

  let plants: PlantState[] | undefined;
  if (state.characterId === 'verdant_machinist') {
    plants = [];
    const hasCoreSeed = state.relics?.includes('core_seed_reactor');
    if (hasCoreSeed) {
      plants.push(createSeedling('plant_0', SEEDLING_DEFAULT_HP, 'defense'));
    }
  }

  return {
    ...state,
    deck: restDeck,
    hand,
    discard: [],
    exhaustPile: [],
    strengthStacks: 0,
    currentEncounter: encounterId,
    phase: 'player',
    energy: state.maxEnergy,
    maxEnergy: state.maxEnergy,
    turnNumber: 1,
    enemies,
    combatResult: null,
    runPhase: 'combat',
    ...(plants !== undefined && { plants }),
  };
}

export function playCard(
  state: GameState,
  cardId: string,
  targetEnemyIndex: number | null,
  cardsMap: Map<string, CardDef>,
  enemyDefs: Map<string, EnemyDef>,
  handIndexOverride?: number,
  targetPlantIndex?: number | null
): GameState {
  if (state.phase !== 'player' || state.combatResult) return state;
  const card = cardsMap.get(cardId);
  if (!card) return state;
  const handIndex =
    handIndexOverride != null && handIndexOverride >= 0 && handIndexOverride < state.hand.length && state.hand[handIndexOverride] === cardId
      ? handIndexOverride
      : state.hand.indexOf(cardId);
  if (handIndex === -1) return state;
  if (state.energy < card.cost) return state;

  const newHand = state.hand.filter((_, i) => i !== handIndex);
  const exhaustPile = state.exhaustPile ?? [];
  const newDiscard = card.exhaust ? state.discard : [...state.discard, cardId];
  const newExhaustPile = card.exhaust ? [...exhaustPile, cardId] : exhaustPile;
  let next: GameState = {
    ...state,
    hand: newHand,
    discard: newDiscard,
    exhaustPile: newExhaustPile,
    energy: state.energy - card.cost,
  };
  next = runEffects(card, next, targetEnemyIndex, cardsMap, targetPlantIndex ?? null);
  if (next.playerNextCardPlayedTwice) {
    next = { ...next, playerNextCardPlayedTwice: false };
    next = runEffects(card, next, targetEnemyIndex, cardsMap, targetPlantIndex ?? null);
  }
  next = processHpThresholdTriggers(next, enemyDefs);

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

  // Plant turn actions (Verdant Machinist) then resolve enemy intents
  let next: GameState = { ...state, playerBlock: state.playerBlock, phase: 'enemy' };
  next = runPlantTurnActions(next, next._simRng ?? defaultRng);

  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    const intent = enemy.intent;
    if (!intent) continue;
    if (intent.type === 'attack') {
      let dmg = intent.value;
      const frail = (next.frailStacks ?? 0) > 0 ? 1 + 0.25 * (next.frailStacks ?? 0) : 1;
      const weak = (next.playerWeakStacks ?? 0) > 0 ? 1 + 0.25 * (next.playerWeakStacks ?? 0) : 1;
      const vuln = (next.playerVulnerableStacks ?? 0) > 0 ? 1.5 : 1;
      dmg = Math.ceil(dmg * frail * weak * vuln);
      const attackTarget = getAttackTarget(next, next._simRng ?? defaultRng);
      let applyDamageToPlayer = attackTarget.target === 'player';
      if (attackTarget.target === 'plant') {
        const plants = (next.plants ?? []).map((p) => ({ ...p }));
        const aliveIndices = plants.map((p, i) => (p.hp > 0 ? i : -1)).filter((i) => i >= 0);
        if (aliveIndices.length === 0) {
          applyDamageToPlayer = true;
        } else {
          // Phase 1: combined plant shield — drain damage from total plant block (order: by array index)
          let remain = dmg;
          for (let i = 0; i < plants.length && remain > 0; i++) {
            if (plants[i].hp <= 0) continue;
            const blockHere = Math.min(plants[i].block ?? 0, remain);
            if (blockHere > 0) {
              plants[i].block = (plants[i].block ?? 0) - blockHere;
              remain -= blockHere;
            }
          }
          next = { ...next, plants };
          // Phase 2: remaining damage to plant HP using same targeting (defense first, then any plant)
          if (remain > 0) {
            const hpTarget = getAttackTarget(next, next._simRng ?? defaultRng);
            if (hpTarget.target === 'plant' && next.plants?.[hpTarget.plantIndex] && next.plants[hpTarget.plantIndex].hp > 0) {
              const updated = next.plants.map((p, i) =>
                i === hpTarget.plantIndex ? { ...p, hp: Math.max(0, p.hp - remain) } : p
              );
              next = { ...next, plants: updated.filter((x) => x.hp > 0) };
            }
          } else {
            next = { ...next, plants: plants.filter((x) => x.hp > 0) };
          }
        }
      }
      if (applyDamageToPlayer) {
        if (next.playerBlock > 0) {
          const blockReduce = Math.min(next.playerBlock, dmg);
          next = { ...next, playerBlock: next.playerBlock - blockReduce };
          dmg -= blockReduce;
        }
        if (dmg > 0) {
          next = { ...next, playerHp: Math.max(0, next.playerHp - dmg) };
          const thorns = next.playerThorns ?? 0;
          if (thorns > 0) {
            const ei = next.enemies.findIndex((e) => e.id === enemy.id);
            if (ei >= 0 && next.enemies[ei].hp > 0) {
              const en = [...next.enemies];
              const targetEn = en[ei];
              const blockReduce = Math.min(targetEn.block, thorns);
              en[ei] = { ...targetEn, block: targetEn.block - blockReduce, hp: Math.max(0, targetEn.hp - (thorns - blockReduce)) };
              next = { ...next, enemies: en };
            }
          }
        }
      }
    }
    if (intent.type === 'block') {
      const idx = next.enemies.findIndex((e) => e.id === enemy.id);
      if (idx >= 0) {
        const en = [...next.enemies];
        en[idx] = { ...en[idx], block: (en[idx].block || 0) + intent.value };
        next = { ...next, enemies: en };
      }
    }
    if (intent.type === 'debuff') {
      const artifact = next.playerArtifactStacks ?? 0;
      const absorb = Math.min(artifact, intent.value);
      next = { ...next, playerArtifactStacks: Math.max(0, artifact - absorb), playerWeakStacks: (next.playerWeakStacks ?? 0) + intent.value - absorb };
    }
    if (intent.type === 'vulnerable') {
      const artifact = next.playerArtifactStacks ?? 0;
      const absorb = Math.min(artifact, intent.value);
      next = { ...next, playerArtifactStacks: Math.max(0, artifact - absorb), playerVulnerableStacks: (next.playerVulnerableStacks ?? 0) + intent.value - absorb };
    }
    if (intent.addStatus?.length) {
      for (const { cardId, count, to } of intent.addStatus) {
        const cards = Array.from({ length: count }, () => cardId);
        if (to === 'draw') next = { ...next, deck: [...next.deck, ...cards] };
        else next = { ...next, discard: [...next.discard, ...cards] };
      }
    }
  }

  // Burn: at end of turn, take 2 damage per Burn in hand (before discarding)
  const burnCount = next.hand.filter((id) => id === 'burn').length;
  if (burnCount > 0) next = { ...next, playerHp: Math.max(0, next.playerHp - burnCount * 2) };
  if (next.playerHp <= 0) return { ...next, combatResult: 'lose' };

  next = { ...next, playerBlock: 0 };

  if (next.playerHp <= 0) return { ...next, combatResult: 'lose' };

  // Next turn: discard hand, draw 5, refill energy, decay statuses, new intents
  next = discardHandAndDraw(next, DRAW_PER_TURN);
  const voidCount = next.hand.filter((id) => id === 'void').length;
  const decayedEnemies = next.enemies.map((e) => ({
    ...e,
    vulnerableStacks: Math.max(0, (e.vulnerableStacks ?? 0) - 1),
    weakStacks: Math.max(0, (e.weakStacks ?? 0) - 1),
  }));
  const decayStrength = next.playerStrengthDecayAtEnd ?? 0;
  const healEnd = next.playerHealAtEndOfTurn ?? 0;
  const blockPerTurn = next.playerBlockPerTurn ?? 0;
  const strPerTurn = next.playerStrengthPerTurn ?? 0;
  next = {
    ...next,
    phase: 'player',
    energy: Math.max(0, next.maxEnergy - voidCount),
    turnNumber: next.turnNumber + 1,
    strengthStacks: Math.max(0, (next.strengthStacks ?? 0) - decayStrength) + strPerTurn,
    playerStrengthDecayAtEnd: 0,
    playerHealAtEndOfTurn: 0,
    playerBlock: next.playerBlock + blockPerTurn,
    playerHp: Math.min(next.playerMaxHp ?? next.playerHp, next.playerHp + healEnd),
    frailStacks: Math.max(0, (next.frailStacks ?? 0) - 1),
    playerWeakStacks: Math.max(0, (next.playerWeakStacks ?? 0) - 1),
    playerVulnerableStacks: Math.max(0, (next.playerVulnerableStacks ?? 0) - 1),
    enemies: setEnemyIntents(decayedEnemies, enemyDefs, next._simRng ?? defaultRng),
  };
  return next;
}
