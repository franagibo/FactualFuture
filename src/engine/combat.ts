import type { GameState, EnemyState, EnemyIntent, PlantState } from './types';
import type { CardDef } from './cardDef';
import type { EnemyDef, EncounterDef, EnemyTrigger, IntentDef } from './loadData';
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
import { hasTalent, isPlantCard } from './talents';

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

export interface PickIntentContext {
  turnNumber: number;
  enemy: EnemyState;
  allEnemies: EnemyState[];
}

function buildIntentFromDef(intent: IntentDef): EnemyIntent {
  return {
    type: intent.type as EnemyIntent['type'],
    value: intent.value,
    addStatus: intent.addStatus,
    times: intent.times,
    value2: intent.value2,
    strength: intent.strength,
    block: intent.block,
  };
}

function pickIntent(
  def: EnemyDef,
  rng: Rng,
  context: PickIntentContext
): EnemyIntent {
  const { turnNumber, enemy, allEnemies } = context;
  let pool = def.intents.map((x) => ({ ...x }));

  if (turnNumber === 1) {
    const firstOnly = pool.filter((x) => (x.intent as IntentDef & { firstTurnOnly?: boolean }).firstTurnOnly);
    if (firstOnly.length > 0) {
      const pick = firstOnly[Math.floor(rng() * firstOnly.length)];
      return buildIntentFromDef(pick.intent);
    }
  } else {
    pool = pool.filter((x) => !(x.intent as IntentDef & { firstTurnOnly?: boolean }).firstTurnOnly);
  }

  if (def.id === 'chosen' && turnNumber === 2) {
    const hexDef = pool.find((x) => x.intent.type === 'hex');
    if (hexDef) return buildIntentFromDef(hexDef.intent);
  }

  if (def.id === 'spheric_guardian' && turnNumber === 2) {
    const frailDef = pool.find((x) => x.intent.type === 'attack_frail');
    if (frailDef) return buildIntentFromDef(frailDef.intent);
  }

  if (def.id === 'gremlin_wizard') {
    const chargeTurns = enemy.chargeTurns ?? 0;
    if (chargeTurns < 2) {
      return { type: 'none', value: 0 };
    }
    const attackDef = pool.find((x) => x.intent.type === 'attack');
    if (attackDef) return buildIntentFromDef(attackDef.intent);
  }

  if (def.id === 'shield_gremlin') {
    const aliveAllies = allEnemies.filter((e) => e.id !== enemy.id && e.hp > 0);
    if (aliveAllies.length > 0) {
      const blockAllyDef = pool.find((x) => x.intent.type === 'block_ally');
      if (blockAllyDef) return buildIntentFromDef(blockAllyDef.intent);
    }
  }

  if (def.id === 'transient') {
    const attackDef = pool.find((x) => x.intent.type === 'attack');
    if (attackDef) {
      const base = 30 + (turnNumber - 1) * 10;
      return { ...buildIntentFromDef(attackDef.intent), value: base };
    }
  }

  const lastType = enemy.lastIntentType;
  if (lastType) {
    pool = pool.filter((x) => x.intent.type !== lastType);
  }
  if (pool.length === 0) {
    pool = def.intents.map((x) => ({ ...x }));
  }

  const total = pool.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const { weight, intent } of pool) {
    r -= weight;
    if (r <= 0) return buildIntentFromDef(intent);
  }
  const last = pool[pool.length - 1];
  return buildIntentFromDef(last.intent);
}

function setEnemyIntents(
  enemies: EnemyState[],
  enemyDefs: Map<string, EnemyDef>,
  turnNumber: number,
  rng: Rng = defaultRng
): EnemyState[] {
  return enemies.map((e) => {
    const def = enemyDefs.get(e.id);
    if (!def) return e;
    const intent = pickIntent(def, rng, { turnNumber, enemy: e, allEnemies: enemies });
    return { ...e, intent };
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
 * Apply one hit of attack damage from an enemy to the player/plants. Damage flows through plants in order
 * (defense first, then by index): each plant absorbs with block then HP; when a plant dies, remainder
 * goes to the next plant; when no plants left, remainder goes to player block then HP.
 * Returns updated state. Used for attack and each hit of attack_multi.
 */
function applyEnemyAttackHit(
  next: GameState,
  enemy: EnemyState,
  dmg: number,
  rng: Rng = defaultRng
): GameState {
  dmg += enemy.strengthStacks ?? 0;
  // Enemy Weak reduces that enemy's attack damage by 25% (STS: flat 0.75, floor).
  if ((enemy.weakStacks ?? 0) > 0) dmg = Math.floor(dmg * 0.75);
  // Player Vulnerable increases incoming attack damage by 50% (STS: 1.5×, ceil).
  const vuln = (next.playerVulnerableStacks ?? 0) > 0 ? 1.5 : 1;
  dmg = Math.ceil(dmg * vuln);
  // Note: player Frail reduces block *gain* (handled in effectRunner block case), not incoming damage.
  // Note: player Weak reduces the player's *outgoing* damage (handled in effectRunner applyDamageToEnemy).
  let remain = dmg;

  const plants = (next.plants ?? []).map((p) => ({ ...p }));
  if (plants.length > 0 && isPlantCharacter(next.characterId)) {
    const aliveIndices = plants
      .map((p, i) => (p.hp > 0 ? i : -1))
      .filter((i) => i >= 0);
    const defenseFirst = [...aliveIndices].sort((a, b) => {
      const aDef = plants[a].mode === 'defense' ? 1 : 0;
      const bDef = plants[b].mode === 'defense' ? 1 : 0;
      if (bDef !== aDef) return bDef - aDef;
      return a - b;
    });
    for (const i of defenseFirst) {
      if (remain <= 0) break;
      const p = plants[i];
      if (p.hp <= 0) continue;
      const blockHere = Math.min(p.block ?? 0, remain);
      if (blockHere > 0) {
        p.block = (p.block ?? 0) - blockHere;
        remain -= blockHere;
      }
      if (remain > 0) {
        const hpDmg = Math.min(p.hp, remain);
        p.hp = Math.max(0, p.hp - hpDmg);
        remain -= hpDmg;
        if (p.hp <= 0 && hasTalent(next, 'citadelGrove') && next.talentCitadelGroveTurn !== next.turnNumber) {
          p.hp = 1;
          next = {
            ...next,
            playerArtifactStacks: (next.playerArtifactStacks ?? 0) + 1,
            talentCitadelGroveTurn: next.turnNumber,
          };
        }
        if (p.hp <= 0 && hasTalent(next, 'cannibalReactor') && next.talentCannibalAwardTurn !== next.turnNumber) {
          next = {
            ...next,
            talentEnergyNextTurn: (next.talentEnergyNextTurn ?? 0) + 1,
            talentCannibalAwardTurn: next.turnNumber,
          };
        }
      }
    }
    next = { ...next, plants: plants.filter((x) => x.hp > 0) };
  }

  if (remain > 0) {
    if (next.playerBlock > 0) {
      const blockReduce = Math.min(next.playerBlock, remain);
      next = { ...next, playerBlock: next.playerBlock - blockReduce };
      remain -= blockReduce;
    }
    if (remain > 0) {
      next = { ...next, playerHp: Math.max(0, next.playerHp - remain) };
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
  return next;
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
    if (p.mode === 'attack') {
      const aliveCountBonus = hasTalent(next, 'colonyInstinct') ? getAlivePlants(plants).length : 0;
      const bonusAttack = p.bonusAttack ?? 0;
      const dmg = PLANT_ATTACK_DAMAGE[p.growthStage] + aliveCountBonus + bonusAttack;
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
      if (bonusAttack > 0) plants[i] = { ...plants[i], bonusAttack: 0 };
    }
    if (p.growthStage >= 2) {
      if (p.mode === 'defense') {
        next = { ...next, playerBlock: next.playerBlock + PLANT_DEFENSE_PLAYER_BLOCK[p.growthStage as 2 | 3] };
        const plantBlock = PLANT_DEFENSE_PLANT_BLOCK[p.growthStage as 2 | 3];
        if (plantBlock > 0) plants[i] = { ...p, block: (p.block ?? 0) + plantBlock };
      }
      if (p.mode === 'support') {
        if (p.growthStage === 2) {
          next = { ...next, playerBlock: next.playerBlock + PLANT_SUPPORT_PLAYER_BLOCK };
          const heal = hasTalent(next, 'photosyntheticRepair') ? 1 : 0;
          if (heal > 0) {
            plants[i] = { ...plants[i], hp: Math.min(plants[i].maxHp, plants[i].hp + heal) };
          }
          const aliveEnemies = enemies.filter((e) => e.hp > 0);
          if (aliveEnemies.length > 0) {
            const target = aliveEnemies[Math.floor(rng() * aliveEnemies.length)];
            target.weakStacks = (target.weakStacks ?? 0) + PLANT_SUPPORT_WEAK;
            next = { ...next, enemies };
          }
          if (hasTalent(next, 'mycorrhizalNetwork')) {
            const attackPlants = plants
              .map((pl, idx) => ({ pl, idx }))
              .filter(({ pl }) => pl.hp > 0 && pl.mode === 'attack');
            if (attackPlants.length > 0) {
              const pick = attackPlants[Math.floor(rng() * attackPlants.length)];
              plants[pick.idx] = { ...plants[pick.idx], bonusAttack: (plants[pick.idx].bonusAttack ?? 0) + 1 };
            }
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
  if (hasTalent(next, 'verdantLegion')) {
    const alive = getAlivePlants(next.plants ?? []);
    if (alive.length >= 3) {
      const pulsedPlants = (next.plants ?? []).map((p) => ({ ...p, block: (p.block ?? 0) + 2 }));
      next = { ...next, playerBlock: next.playerBlock + 3, plants: pulsedPlants };
    }
  }
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
        blockRetains: spawnDef.blockRetains,
        artifactStacks: spawnDef.artifactStacks,
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

  const enemiesBase: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    let stateEnemy: EnemyState = {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent: null,
      size: def.size,
      blockRetains: def.blockRetains,
      artifactStacks: def.artifactStacks,
    };
    if (def.id === 'red_louse' || def.id === 'green_louse') {
      stateEnemy = { ...stateEnemy, biteDamage: 5 + Math.floor(rng() * 3) };
    }
    return stateEnemy;
  });
  const enemies: EnemyState[] = enemiesBase.map((e) => {
    const def = enemyDefs.get(e.id);
    if (!def) return e;
    const intent = pickIntent(def, rng, { turnNumber: 1, enemy: e, allEnemies: enemiesBase });
    return { ...e, intent };
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

  const enemiesBase: EnemyState[] = encounter.enemies.map((id) => {
    const def = enemyDefs.get(id);
    if (!def) return { id, name: id, hp: 1, maxHp: 1, block: 0, intent: null };
    let stateEnemy: EnemyState = {
      id: def.id,
      name: def.name,
      hp: def.maxHp,
      maxHp: def.maxHp,
      block: 0,
      intent: null,
      size: def.size,
      blockRetains: def.blockRetains,
      artifactStacks: def.artifactStacks,
    };
    if (def.id === 'red_louse' || def.id === 'green_louse') {
      stateEnemy = { ...stateEnemy, biteDamage: 5 + Math.floor(simRng() * 3) };
    }
    return stateEnemy;
  });
  const enemies: EnemyState[] = enemiesBase.map((e) => {
    const def = enemyDefs.get(e.id);
    if (!def) return e;
    const intent = pickIntent(def, simRng, { turnNumber: 1, enemy: e, allEnemies: enemiesBase });
    return { ...e, intent };
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
    talentApexProtocolCharges: 0,
    talentSeedArchiveUsedCombat: false,
    talentQuickGerminationUsedCombat: false,
    talentPredatoryRootsTurn: undefined,
    talentCitadelGroveTurn: undefined,
    talentCannibalAwardTurn: undefined,
    talentEvolvedTurn: undefined,
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
  const isPlantTypedCard = isPlantCard(card.effects);
  const seedArchiveDiscount =
    hasTalent(state, 'seedArchive') &&
    isPlantTypedCard &&
    !state.talentSeedArchiveUsedCombat
      ? 1
      : 0;
  const effectiveCost = Math.max(0, card.cost - seedArchiveDiscount);
  if (state.energy < effectiveCost) return state;

  const newHand = state.hand.filter((_, i) => i !== handIndex);
  const exhaustPile = state.exhaustPile ?? [];
  const newDiscard = card.exhaust ? state.discard : [...state.discard, cardId];
  const newExhaustPile = card.exhaust ? [...exhaustPile, cardId] : exhaustPile;
  let next: GameState = {
    ...state,
    hand: newHand,
    discard: newDiscard,
    exhaustPile: newExhaustPile,
    energy: state.energy - effectiveCost,
    talentSeedArchiveUsedCombat: state.talentSeedArchiveUsedCombat || seedArchiveDiscount > 0,
  };
  next = runEffects(card, next, targetEnemyIndex, cardsMap, targetPlantIndex ?? null);
  if (next.playerNextCardPlayedTwice) {
    next = { ...next, playerNextCardPlayedTwice: false };
    next = runEffects(card, next, targetEnemyIndex, cardsMap, targetPlantIndex ?? null);
  }
  if (isPlantTypedCard && (next.talentApexProtocolCharges ?? 0) > 0) {
    next = {
      ...next,
      talentApexProtocolCharges: Math.max(0, (next.talentApexProtocolCharges ?? 0) - 1),
    };
    next = runEffects(card, next, targetEnemyIndex, cardsMap, targetPlantIndex ?? null);
  }
  if (cardId === 'hex') {
    next = { ...next, discard: [...next.discard, 'hex'] };
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

  // Ritual tick: at start of enemy phase, each alive enemy gains strength equal to ritualStacks
  const rng = next._simRng ?? defaultRng;
  next = {
    ...next,
    enemies: next.enemies.map((e) => {
      if (e.hp <= 0 || (e.ritualStacks ?? 0) <= 0) return e;
      return { ...e, strengthStacks: (e.strengthStacks ?? 0) + (e.ritualStacks ?? 0) };
    }),
  };

  const attackTypes = ['attack', 'attack_multi', 'attack_frail', 'attack_vulnerable', 'attack_and_block'];
  for (const enemy of next.enemies) {
    if (enemy.hp <= 0) continue;
    const intent = enemy.intent;
    if (!intent) continue;

    const ei = next.enemies.findIndex((e) => e.id === enemy.id);
    if (ei < 0) continue;
    const currentEnemy = next.enemies[ei];

    if (intent.type === 'ritual') {
      const en = [...next.enemies];
      en[ei] = { ...currentEnemy, ritualStacks: (currentEnemy.ritualStacks ?? 0) + intent.value };
      next = { ...next, enemies: en };
    }
    if (intent.type === 'buff') {
      const en = [...next.enemies];
      en[ei] = {
        ...currentEnemy,
        strengthStacks: (currentEnemy.strengthStacks ?? 0) + (intent.strength ?? 0),
        block: (currentEnemy.block ?? 0) + (intent.block ?? 0),
      };
      next = { ...next, enemies: en };
    }
    if (attackTypes.includes(intent.type)) {
      let dmg = intent.value;
      if (currentEnemy.id === 'transient') {
        dmg = 30 + (next.turnNumber - 1) * 10;
      } else if (currentEnemy.biteDamage != null && (currentEnemy.id === 'red_louse' || currentEnemy.id === 'green_louse')) {
        dmg = currentEnemy.biteDamage;
      }
      const times = intent.times ?? 1;
      for (let h = 0; h < times; h++) {
        next = applyEnemyAttackHit(next, next.enemies[ei], dmg, rng);
      }
      if (currentEnemy.id === 'gremlin_wizard') {
        const en = [...next.enemies];
        en[ei] = { ...next.enemies[ei], chargeTurns: 0 };
        next = { ...next, enemies: en };
      }
    }
    if (intent.type === 'block') {
      const en = [...next.enemies];
      en[ei] = { ...currentEnemy, block: (currentEnemy.block || 0) + intent.value };
      next = { ...next, enemies: en };
    }
    if (intent.type === 'block_ally') {
      const aliveAllies = next.enemies.filter((e) => e.hp > 0);
      const blockAmount = intent.strength ?? intent.value;
      if (aliveAllies.length > 0) {
        const target = aliveAllies[Math.floor(rng() * aliveAllies.length)];
        const ti = next.enemies.findIndex((e) => e.id === target.id);
        if (ti >= 0) {
          const en = [...next.enemies];
          en[ti] = { ...en[ti], block: (en[ti].block ?? 0) + blockAmount };
          next = { ...next, enemies: en };
        }
      } else {
        const en = [...next.enemies];
        en[ei] = { ...currentEnemy, block: (currentEnemy.block ?? 0) + blockAmount };
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
    if (intent.type === 'attack_frail' && intent.value2) {
      const artifact = next.playerArtifactStacks ?? 0;
      const absorb = Math.min(artifact, intent.value2);
      next = { ...next, playerArtifactStacks: Math.max(0, artifact - absorb), frailStacks: (next.frailStacks ?? 0) + intent.value2 - absorb };
    }
    if (intent.type === 'attack_vulnerable' && intent.value2) {
      const artifact = next.playerArtifactStacks ?? 0;
      const absorb = Math.min(artifact, intent.value2);
      next = { ...next, playerArtifactStacks: Math.max(0, artifact - absorb), playerVulnerableStacks: (next.playerVulnerableStacks ?? 0) + intent.value2 - absorb };
    }
    if (intent.type === 'drain') {
      const weakAmount = intent.value;
      const strAmount = intent.value2 ?? 0;
      const artifact = next.playerArtifactStacks ?? 0;
      const absorb = Math.min(artifact, weakAmount);
      next = { ...next, playerArtifactStacks: Math.max(0, artifact - absorb), playerWeakStacks: (next.playerWeakStacks ?? 0) + weakAmount - absorb };
      const en = [...next.enemies];
      en[ei] = { ...next.enemies[ei], strengthStacks: (next.enemies[ei].strengthStacks ?? 0) + strAmount };
      next = { ...next, enemies: en };
    }
    if (intent.type === 'hex') {
      next = { ...next, discard: [...next.discard, 'hex'] };
    }
    if (intent.type === 'none' && currentEnemy.id === 'gremlin_wizard') {
      const en = [...next.enemies];
      en[ei] = { ...currentEnemy, chargeTurns: (currentEnemy.chargeTurns ?? 0) + 1 };
      next = { ...next, enemies: en };
    }
    if (intent.addStatus?.length) {
      for (const { cardId, count, to } of intent.addStatus) {
        const cards = Array.from({ length: count }, () => cardId);
        if (to === 'draw') next = { ...next, deck: [...next.deck, ...cards] };
        else next = { ...next, discard: [...next.discard, ...cards] };
      }
    }

    const en = [...next.enemies];
    en[ei] = { ...en[ei], lastIntentType: intent.type };
    next = { ...next, enemies: en };
  }

  // Burn: at end of turn, take 2 damage per Burn in hand (before discarding)
  const burnCount = next.hand.filter((id) => id === 'burn').length;
  if (burnCount > 0) next = { ...next, playerHp: Math.max(0, next.playerHp - burnCount * 2) };
  if (next.playerHp <= 0) return { ...next, combatResult: 'lose' };

  next = { ...next, playerBlock: 0 };

  if (next.playerHp <= 0) return { ...next, combatResult: 'lose' };

  // Next turn: discard hand, draw 5, refill energy, decay statuses, clear non-retained block, new intents
  next = discardHandAndDraw(next, DRAW_PER_TURN);
  const voidCount = next.hand.filter((id) => id === 'void').length;
  const decayedEnemies = next.enemies.map((e) => {
    const decayed = {
      ...e,
      vulnerableStacks: Math.max(0, (e.vulnerableStacks ?? 0) - 1),
      weakStacks: Math.max(0, (e.weakStacks ?? 0) - 1),
      ...(e.blockRetains ? {} : { block: 0 }),
    };
    return decayed;
  });
  const decayStrength = next.playerStrengthDecayAtEnd ?? 0;
  const healEnd = next.playerHealAtEndOfTurn ?? 0;
  const blockPerTurn = next.playerBlockPerTurn ?? 0;
  const strPerTurn = next.playerStrengthPerTurn ?? 0;
  next = {
    ...next,
    phase: 'player',
    energy: Math.max(0, next.maxEnergy - voidCount) + (next.talentEnergyNextTurn ?? 0),
    turnNumber: next.turnNumber + 1,
    strengthStacks: Math.max(0, (next.strengthStacks ?? 0) - decayStrength) + strPerTurn,
    playerStrengthDecayAtEnd: 0,
    playerHealAtEndOfTurn: 0,
    playerBlock: next.playerBlock + blockPerTurn,
    playerHp: Math.min(next.playerMaxHp ?? next.playerHp, next.playerHp + healEnd),
    frailStacks: Math.max(0, (next.frailStacks ?? 0) - 1),
    playerWeakStacks: Math.max(0, (next.playerWeakStacks ?? 0) - 1),
    playerVulnerableStacks: Math.max(0, (next.playerVulnerableStacks ?? 0) - 1),
    enemies: setEnemyIntents(decayedEnemies, enemyDefs, next.turnNumber + 1, next._simRng ?? defaultRng),
    talentEnergyNextTurn: 0,
    talentApexProtocolCharges: 0,
  };
  return next;
}
