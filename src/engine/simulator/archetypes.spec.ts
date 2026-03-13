import { describe, it, expect } from 'vitest';
import { detectArchetypes } from './archetypes';
import type { CardDef } from '../cardDef';

function makeCards(defs: CardDef[]): Map<string, CardDef> {
  return new Map(defs.map((c) => [c.id, c]));
}

describe('archetypes', () => {
  it('detects strength archetype for strength-heavy deck', () => {
    const cards: CardDef[] = [
      {
        id: 'str_buff',
        name: 'Strength Buff',
        cost: 1,
        effects: [{ type: 'strength', value: 2, target: 'player' }],
      },
      {
        id: 'scale_attack',
        name: 'Scaling Attack',
        cost: 2,
        effects: [{ type: 'damage', value: 6, strengthScale: 2, target: 'enemy' }],
      },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['str_buff', 'scale_attack'], map);
    expect(ctx.primary).toBe('strength');
  });

  it('detects block_barricade archetype when deck is block focused', () => {
    const cards: CardDef[] = [
      {
        id: 'big_block',
        name: 'Big Block',
        cost: 1,
        effects: [{ type: 'block', value: 12, target: 'player' }],
      },
      {
        id: 'block_hit',
        name: 'Block Hit',
        cost: 2,
        effects: [{ type: 'damageEqualToBlock', value: 0, target: 'enemy' }],
      },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['big_block', 'block_hit'], map);
    expect(ctx.primary).toBe('block_barricade');
  });

  it('returns generic for mixed low-signal deck', () => {
    const cards: CardDef[] = [
      {
        id: 'light_attack',
        name: 'Light Attack',
        cost: 1,
        effects: [{ type: 'damage', value: 4, target: 'enemy' }],
      },
      {
        id: 'light_block',
        name: 'Light Block',
        cost: 1,
        effects: [{ type: 'block', value: 5, target: 'player' }],
      },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['light_attack', 'light_block'], map);
    expect(ctx.primary === 'generic' || ctx.scores[ctx.primary] < 4).toBe(true);
  });
});

