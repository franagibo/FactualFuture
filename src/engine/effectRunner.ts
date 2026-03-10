import type { GameState, EnemyState } from './types';
import type { CardDef } from './cardDef';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawOne(state: GameState): GameState {
  if (state.hand.length >= 10) return state; // max hand size
  let deck = [...state.deck];
  let discard = [...state.discard];
  if (deck.length === 0) {
    deck = shuffle(discard);
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
  targetEnemyIndex: number | null
): GameState {
  let next = { ...state };
  const enemies = next.enemies.map((e) => ({ ...e }));

  for (const effect of card.effects) {
    switch (effect.type) {
      case 'damage': {
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const enemy = enemies[targetEnemyIndex];
          let dmg = effect.value;
          if ((enemy.vulnerableStacks ?? 0) > 0) dmg = Math.ceil(dmg * 1.5);
          dmg = Math.min(dmg, enemy.block + enemy.hp);
          let remain = dmg;
          if (enemy.block > 0) {
            const blockReduce = Math.min(enemy.block, remain);
            enemy.block -= blockReduce;
            remain -= blockReduce;
          }
          if (remain > 0) enemy.hp = Math.max(0, enemy.hp - remain);
          if ((enemy.vulnerableStacks ?? 0) > 0) enemy.vulnerableStacks = Math.max(0, (enemy.vulnerableStacks ?? 0) - 1);
        }
        break;
      }
      case 'damageEqualToBlock': {
        let dmg = next.playerBlock;
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const enemy = enemies[targetEnemyIndex];
          if ((enemy.vulnerableStacks ?? 0) > 0) dmg = Math.ceil(dmg * 1.5);
          let remain = dmg;
          if (enemy.block > 0) {
            const blockReduce = Math.min(enemy.block, remain);
            enemy.block -= blockReduce;
            remain -= blockReduce;
          }
          if (remain > 0) enemy.hp = Math.max(0, enemy.hp - remain);
          if ((enemy.vulnerableStacks ?? 0) > 0) enemy.vulnerableStacks = Math.max(0, (enemy.vulnerableStacks ?? 0) - 1);
        }
        break;
      }
      case 'block':
        if (effect.target === 'player') {
          next = { ...next, playerBlock: next.playerBlock + effect.value };
        }
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
      case 'vulnerable':
        if (effect.target === 'enemy' && targetEnemyIndex != null && enemies[targetEnemyIndex]) {
          const enemy = enemies[targetEnemyIndex];
          enemy.vulnerableStacks = (enemy.vulnerableStacks ?? 0) + effect.value;
        }
        break;
    }
  }

  return { ...next, enemies };
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
