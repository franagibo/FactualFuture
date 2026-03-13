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

  it('detects plant_swarm for Verdant Machinist with multiple summon cards', () => {
    const cards: CardDef[] = [
      { id: 'seed_pod', name: 'Seed Pod', cost: 1, effects: [{ type: 'summon_plant', value: 9 }] },
      {
        id: 'rapid_germination',
        name: 'Rapid Germination',
        cost: 2,
        effects: [{ type: 'summon_plant', value: 9 }, { type: 'summon_plant', value: 9 }],
      },
      { id: 'thorn_volley', name: 'Thorn Volley', cost: 2, effects: [{ type: 'damageAll', value: 6 }] },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['seed_pod', 'rapid_germination', 'thorn_volley'], map, [], 'verdant_machinist');
    expect(ctx.primary).toBe('plant_swarm');
  });

  it('detects plant_evolution for Verdant Machinist with grow/evolve cards', () => {
    const cards: CardDef[] = [
      {
        id: 'accelerated_evolution',
        name: 'Accelerated Evolution',
        cost: 2,
        effects: [{ type: 'grow_plant', value: 2, plantTarget: 'all' }],
      },
      { id: 'genetic_rewrite', name: 'Genetic Rewrite', cost: 1, effects: [{ type: 'evolve_plant', value: 1 }] },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['accelerated_evolution', 'genetic_rewrite'], map, [], 'verdant_machinist');
    expect(ctx.primary).toBe('plant_evolution');
  });

  it('detects plant_defense for Verdant Machinist with Root Guard and block', () => {
    const cards: CardDef[] = [
      {
        id: 'root_guard',
        name: 'Root Guard',
        cost: 1,
        effects: [
          { type: 'plant_mode', value: 0, mode: 'defense', plantTarget: 'first' },
          { type: 'block', value: 6, target: 'player' },
        ],
      },
      {
        id: 'living_fortress',
        name: 'Living Fortress',
        cost: 2,
        effects: [
          { type: 'plant_mode', value: 0, mode: 'defense', plantTarget: 'all' },
          { type: 'block', value: 12, target: 'player' },
        ],
      },
    ];
    const map = makeCards(cards);
    const ctx = detectArchetypes(['root_guard', 'living_fortress'], map, [], 'verdant_machinist');
    expect(ctx.primary).toBe('plant_defense');
  });
});

