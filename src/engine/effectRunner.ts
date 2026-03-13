import type { GameState, EnemyState, PlantState } from './types';
import type { CardDef } from './cardDef';
import { rngRandomInt, rngShuffle } from './rng';
import { defaultRng } from './rng';
import {
  MAX_PLANTS,
  GROWTH_TO_EVOLVE,
  PLANT_HP_BY_STAGE,
  SEEDLING_DEFAULT_HP,
  isPlantCharacter,
  createSeedling,
  evolvePlant,
  getAlivePlants,
} from './plantConfig';

function isAttackCard(cardId: string, cardsMap: Map<string, CardDef>): boolean {
  const def = cardsMap.get(cardId);
  if (!def) return false;
  return def.effects.some((e) => (e.type === 'damage' || e.type === 'damageAll' || e.type === 'multiHit') && e.target === 'enemy');
}

export function drawOne(state: GameState): GameState {
  if (state.hand.length >= 10) return state; // max hand size
  const rng = state._simRng ?? defaultRng;
  let deck = [...state.deck];
  let discard = [...state.discard];
  if (deck.length === 0) {
    deck = rngShuffle(discard, rng);
    discard = [];
  }
  if (deck.length === 0) return { ...state, deck, discard };
  const [drawn, ...restDeck] = deck;
  const hand = [...state.hand, drawn];
  return { ...state, deck: restDeck, discard, hand };
}

export function runEffects(
  card: CardDef,
  state: GameState,
  targetEnemyIndex: number | null,
  cardsMap?: Map<string, CardDef>,
  targetPlantIndex?: number | null
): GameState {
  const map = cardsMap ?? new Map<string, CardDef>();
  let next = { ...state };
  const enemies = next.enemies.map((e) => ({ ...e }));
  const plants = next.plants ? next.plants.map((p) => ({ ...p })) : [];
  next = { ...next, plants };
  const exhaustPile = () => next.exhaustPile ?? [];

  const applyDamageToEnemy = (enemy: EnemyState, dmg: number, addStrength = true): void => {
    let total = dmg + (addStrength ? (next.strengthStacks ?? 0) : 0);
    if ((enemy.vulnerableStacks ?? 0) > 0) total = Math.ceil(total * 1.5);
    const weak = (enemy.weakStacks ?? 0) > 0 ? 1 + 0.25 * (enemy.weakStacks ?? 0) : 1;
    total = Math.ceil(total * weak);
    total = Math.min(total, enemy.block + enemy.hp);
    let remain = total;
    if (enemy.block > 0) {
      const blockReduce = Math.min(enemy.block, remain);
      enemy.block -= blockReduce;
      remain -= blockReduce;
    }
    if (remain > 0) enemy.hp = Math.max(0, enemy.hp - remain);
    if ((enemy.vulnerableStacks ?? 0) > 0) enemy.vulnerableStacks = Math.max(0, (enemy.vulnerableStacks ?? 0) - 1);
  };

  for (const effect of card.effects) {
    switch (effect.type) {
      case 'damage': {
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const base = effect.value + (effect.strengthScale ?? 0) * (next.strengthStacks ?? 0);
          applyDamageToEnemy(enemies[targetEnemyIndex], base, true);
        }
        break;
      }
      case 'multiHit': {
        const times = effect.times ?? 1;
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          for (let i = 0; i < times; i++) {
            applyDamageToEnemy(enemies[targetEnemyIndex], effect.value);
          }
        }
        break;
      }
      case 'damageAll': {
        const dmg = effect.value + (next.strengthStacks ?? 0);
        for (const enemy of enemies) {
          if (enemy.hp <= 0) continue;
          applyDamageToEnemy(enemy, dmg, true);
        }
        break;
      }
      case 'damageEqualToBlock': {
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          applyDamageToEnemy(enemies[targetEnemyIndex], next.playerBlock, false);
        }
        break;
      }
      case 'block':
        if (effect.target === 'player') {
          // Verdant Machinist "Barrier" (defend): add block to lowest-HP plant if any, else to player
          if (card.id === 'defend' && isPlantCharacter(next.characterId) && next.plants?.length) {
            const alive = next.plants.filter((p) => p.hp > 0);
            if (alive.length > 0) {
              let minHp = Infinity;
              let lowestIdx = -1;
              next.plants.forEach((p, i) => {
                if (p.hp > 0 && p.hp < minHp) {
                  minHp = p.hp;
                  lowestIdx = i;
                }
              });
              if (lowestIdx >= 0) {
                const newPlants = next.plants.map((p, i) =>
                  i === lowestIdx ? { ...p, block: (p.block ?? 0) + effect.value } : p
                );
                next = { ...next, plants: newPlants };
                break;
              }
            }
          }
          next = { ...next, playerBlock: next.playerBlock + effect.value };
        }
        break;
      case 'doubleBlock':
        next = { ...next, playerBlock: next.playerBlock * 2 };
        break;
      case 'heal':
        if (effect.target === 'player') {
          next = { ...next, playerHp: Math.min(next.playerMaxHp, next.playerHp + effect.value) };
        }
        break;
      case 'draw':
        for (let i = 0; i < effect.value; i++) {
          next = drawOne(next);
        }
        break;
      case 'energy':
        if (effect.target === 'player' && effect.value != null) {
          next = { ...next, energy: next.energy + effect.value };
        }
        break;
      case 'strength':
        next = { ...next, strengthStacks: (next.strengthStacks ?? 0) + effect.value };
        break;
      case 'loseHp':
        next = { ...next, playerHp: Math.max(0, next.playerHp - effect.value) };
        break;
      case 'vulnerable':
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const enemy = enemies[targetEnemyIndex];
          enemy.vulnerableStacks = (enemy.vulnerableStacks ?? 0) + effect.value;
        }
        break;
      case 'vulnerableAll':
        for (const enemy of enemies) {
          if (enemy.hp > 0) enemy.vulnerableStacks = (enemy.vulnerableStacks ?? 0) + effect.value;
        }
        break;
      case 'weak':
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const enemy = enemies[targetEnemyIndex];
          enemy.weakStacks = (enemy.weakStacks ?? 0) + effect.value;
        }
        break;
      case 'weakAll':
        for (const enemy of enemies) {
          if (enemy.hp > 0) enemy.weakStacks = (enemy.weakStacks ?? 0) + effect.value;
        }
        break;
      case 'frail':
        if (effect.target === 'player') {
          next = { ...next, frailStacks: (next.frailStacks ?? 0) + effect.value };
        }
        break;
      case 'exhaustRandom': {
        const count = Math.min(effect.value, next.hand.length);
        if (count <= 0) break;
        const rng = next._simRng ?? defaultRng;
        const indices = new Set<number>();
        while (indices.size < count) {
          indices.add(rngRandomInt(0, next.hand.length - 1, rng));
        }
        const toExhaust = [...indices].map((i) => next.hand[i]);
        const newHand = next.hand.filter((_, i) => !indices.has(i));
        next = { ...next, hand: newHand, exhaustPile: [...exhaustPile(), ...toExhaust] };
        break;
      }
      case 'exhaustHand': {
        next = { ...next, exhaustPile: [...exhaustPile(), ...next.hand], hand: [] };
        break;
      }
      case 'exhaustHandDealDamage': {
        const count = next.hand.length;
        next = { ...next, exhaustPile: [...exhaustPile(), ...next.hand], hand: [] };
        const dmgPerCard = effect.value;
        if (targetEnemyIndex != null && enemies[targetEnemyIndex] && count > 0) {
          for (let i = 0; i < count; i++) {
            applyDamageToEnemy(enemies[targetEnemyIndex], dmgPerCard);
          }
        }
        break;
      }
      case 'exhaustHandNonAttack': {
        const nonAttack = next.hand.filter((id) => !isAttackCard(id, map));
        const newHand = next.hand.filter((id) => isAttackCard(id, map));
        next = { ...next, hand: newHand, exhaustPile: [...exhaustPile(), ...nonAttack] };
        break;
      }
      case 'exhaustHandNonAttackGainBlock': {
        const nonAttack = next.hand.filter((id) => !isAttackCard(id, map));
        const newHand = next.hand.filter((id) => isAttackCard(id, map));
        const blockGain = nonAttack.length * effect.value;
        next = {
          ...next,
          hand: newHand,
          exhaustPile: [...exhaustPile(), ...nonAttack],
          playerBlock: next.playerBlock + blockGain,
        };
        break;
      }
      case 'exhume': {
        const pile = exhaustPile();
        const take = Math.min(effect.value, pile.length);
        if (take <= 0) break;
        const restored = pile.slice(-take);
        const newExhaust = pile.slice(0, -take);
        next = { ...next, exhaustPile: newExhaust, hand: [...next.hand, ...restored] };
        break;
      }
      case 'addCopyToDiscard':
        next = { ...next, discard: [...next.discard, card.id] };
        break;
      case 'addCardToDiscard':
        if (effect.cardId) next = { ...next, discard: [...next.discard, effect.cardId] };
        break;
      case 'summon_plant': {
        if (!isPlantCharacter(next.characterId) || (next.plants?.length ?? 0) >= MAX_PLANTS) break;
        const hp = effect.value > 0 ? effect.value : SEEDLING_DEFAULT_HP;
        const plantId = `plant_${next.plants?.length ?? 0}`;
        const seedling = createSeedling(plantId, hp, (effect as { mode?: 'defense' | 'attack' | 'support' }).mode ?? 'defense');
        next = { ...next, plants: [...(next.plants ?? []), seedling] };
        break;
      }
      case 'grow_plant': {
        if (!isPlantCharacter(next.characterId) || !next.plants?.length) break;
        const amount = effect.value || 1;
        const plantTarget = (effect as { plantTarget?: 'all' | 'first' | 'random' }).plantTarget ?? 'first';
        const rng = next._simRng ?? defaultRng;
        let indices: number[] = [];
        if (plantTarget === 'all') indices = next.plants!.map((_, i) => i);
        else if (plantTarget === 'first') indices = next.plants!.length > 0 ? [0] : [];
        else {
          if (targetPlantIndex != null && targetPlantIndex >= 0 && targetPlantIndex < next.plants!.length) indices = [targetPlantIndex];
          else if (next.plants!.length > 0) indices = [rngRandomInt(0, next.plants!.length - 1, rng)];
        }
        for (const i of indices) {
          const p = next.plants![i];
          if (p.hp <= 0) continue;
          let growth = p.growth + amount;
          let stage = p.growthStage;
          let maxHp = p.maxHp;
          while (growth >= GROWTH_TO_EVOLVE && stage < 3) {
            growth -= GROWTH_TO_EVOLVE;
            stage = (stage + 1) as 1 | 2 | 3;
            maxHp = PLANT_HP_BY_STAGE[stage];
          }
          const updated = { ...p, growth, growthStage: stage, maxHp, hp: Math.min(p.hp, maxHp) };
          const newPlants = [...next.plants!];
          newPlants[i] = updated;
          next = { ...next, plants: newPlants };
        }
        break;
      }
      case 'plant_mode': {
        if (!isPlantCharacter(next.characterId) || !next.plants?.length) break;
        const mode = (effect as { mode?: 'defense' | 'attack' | 'support' }).mode;
        if (!mode) break;
        const plantTarget = (effect as { plantTarget?: 'all' | 'first' | 'random' }).plantTarget ?? 'first';
        const rng = next._simRng ?? defaultRng;
        let indices: number[] = [];
        if (plantTarget === 'all') indices = next.plants.map((_, i) => i);
        else if (plantTarget === 'first') indices = next.plants.length > 0 ? [0] : [];
        else {
          if (targetPlantIndex != null && targetPlantIndex >= 0 && targetPlantIndex < next.plants.length) indices = [targetPlantIndex];
          else if (next.plants.length > 0) indices = [rngRandomInt(0, next.plants.length - 1, rng)];
        }
        const newPlants = next.plants.map((p, i) => (indices.includes(i) && p.hp > 0 ? { ...p, mode } : p));
        next = { ...next, plants: newPlants };
        break;
      }
      case 'sacrifice_plant': {
        if (!isPlantCharacter(next.characterId) || !next.plants?.length) break;
        const alive = getAlivePlants(next.plants);
        if (alive.length === 0) break;
        let idx: number;
        if (targetPlantIndex != null && targetPlantIndex >= 0 && targetPlantIndex < next.plants.length && next.plants[targetPlantIndex].hp > 0) {
          idx = targetPlantIndex;
        } else {
          idx = next.plants.findIndex((p) => p.hp > 0);
        }
        if (idx < 0) break;
        const newPlants = next.plants.filter((_, i) => i !== idx);
        next = { ...next, plants: newPlants.length ? newPlants : undefined };
        break;
      }
      case 'evolve_plant': {
        if (!isPlantCharacter(next.characterId) || !next.plants?.length) break;
        let idx: number;
        if (targetPlantIndex != null && targetPlantIndex >= 0 && targetPlantIndex < next.plants.length && next.plants[targetPlantIndex].hp > 0) {
          idx = targetPlantIndex;
        } else {
          idx = next.plants.findIndex((p) => p.hp > 0);
        }
        if (idx < 0) break;
        const p = next.plants[idx];
        if (p.growthStage >= 3) break;
        const evolved = evolvePlant(p);
        const newPlants = [...next.plants];
        newPlants[idx] = evolved;
        next = { ...next, plants: newPlants };
        break;
      }
      case 'blockToPlant': {
        if (!isPlantCharacter(next.characterId) || !next.plants?.length) break;
        const plantTarget = (effect as { plantTarget?: 'all' | 'first' | 'random' }).plantTarget ?? 'first';
        const indices: number[] = [];
        if (plantTarget === 'all') {
          next.plants!.forEach((p, i) => p.hp > 0 && indices.push(i));
        } else if (plantTarget === 'first') {
          const idx = next.plants!.findIndex((p) => p.hp > 0);
          if (idx >= 0) indices.push(idx);
        } else {
          const idx = targetPlantIndex != null && targetPlantIndex >= 0 && targetPlantIndex < next.plants!.length && next.plants![targetPlantIndex].hp > 0
            ? targetPlantIndex
            : next.plants!.findIndex((p) => p.hp > 0);
          if (idx >= 0) indices.push(idx);
        }
        const newPlants = next.plants!.map((p, i) =>
          indices.includes(i) ? { ...p, block: (p.block ?? 0) + effect.value } : p
        );
        next = { ...next, plants: newPlants };
        break;
      }
    }
  }

  return { ...next, enemies, plants: next.plants };
}

export function drawCards(state: GameState, count: number): GameState {
  let next = state;
  for (let i = 0; i < count; i++) {
    next = drawOne(next);
  }
  return next;
}

/** Discard entire hand to discard pile, then draw drawCount cards (shuffles discard into deck when deck is empty). */
export function discardHandAndDraw(state: GameState, drawCount: number): GameState {
  const newDiscard = [...state.discard, ...state.hand];
  let next: GameState = { ...state, hand: [], discard: newDiscard };
  for (let i = 0; i < drawCount; i++) {
    next = drawOne(next);
  }
  return next;
}
