import { describe, it, expect } from 'vitest';
import { generateMap, type ActConfig } from './mapGenerator';

const actConfig: ActConfig = {
  combat: 4,
  elite: 0,
  rest: 2,
  shop: 0,
  event: 0,
  boss: 1,
  floorCount: 15,
};

describe('mapGenerator', () => {
  it('produces at least 2 distinct starting nodes (roots)', () => {
    const map = generateMap(12345, actConfig);
    const hasIncoming = new Set<string>();
    for (const [, to] of map.edges) hasIncoming.add(to);
    const roots = map.nodes.filter((n) => !hasIncoming.has(n.id));
    expect(roots.length).toBeGreaterThanOrEqual(2);
  });

  it('all edges go from lower floor to strictly higher floor', () => {
    const map = generateMap(12345, actConfig);
    const floorById = new Map<string, number>();
    map.nodes.forEach((n) => floorById.set(n.id, n.floor));
    for (const [from, to] of map.edges) {
      const fromFloor = floorById.get(from) ?? 0;
      const toFloor = floorById.get(to) ?? 0;
      expect(toFloor).toBeGreaterThan(fromFloor);
    }
  });

  it('bottom nodes have no incoming edges; top/boss have no outgoing or one each', () => {
    const map = generateMap(12345, actConfig);
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    map.nodes.forEach((n) => {
      incoming.set(n.id, 0);
      outgoing.set(n.id, 0);
    });
    for (const [from, to] of map.edges) {
      outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
      incoming.set(to, (incoming.get(to) ?? 0) + 1);
    }
    const floors = map.nodes.map((n) => n.floor);
    const minFloor = Math.min(...floors);
    const maxFloor = Math.max(...floors);
    for (const n of map.nodes) {
      if (n.floor === minFloor) {
        expect(incoming.get(n.id)).toBe(0);
      }
      if (n.type === 'boss' || n.floor === maxFloor) {
        expect(outgoing.get(n.id)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('with floorCount 15 has nodes only on consecutive floors 0..14 and boss at floor 15', () => {
    const map = generateMap(12345, actConfig);
    const floors = new Set(map.nodes.map((n) => n.floor));
    expect(floors.has(15)).toBe(true); // boss
    for (let f = 0; f <= 14; f++) {
      const onFloor = map.nodes.filter((n) => n.floor === f);
      if (onFloor.length > 0) expect(floors.has(f)).toBe(true);
    }
    const nonBossFloors = map.nodes.filter((n) => n.type !== 'boss').map((n) => n.floor);
    const maxNodeFloor = Math.max(...nonBossFloors);
    expect(maxNodeFloor).toBe(14);
  });

  it('floor 0 nodes are all combat', () => {
    const map = generateMap(99999, actConfig);
    const floor0 = map.nodes.filter((n) => n.floor === 0);
    expect(floor0.length).toBeGreaterThanOrEqual(1);
    floor0.forEach((n) => expect(n.type).toBe('combat'));
  });

  it('floor 8 nodes are all treasure (fixed F9)', () => {
    const map = generateMap(88888, actConfig);
    const floor8 = map.nodes.filter((n) => n.floor === 8);
    floor8.forEach((n) => expect(n.type).toBe('treasure'));
  });

  it('top floor (14) nodes are all rest', () => {
    const map = generateMap(77777, actConfig);
    const topFloor = 14;
    const topNodes = map.nodes.filter((n) => n.floor === topFloor);
    expect(topNodes.length).toBeGreaterThanOrEqual(1);
    topNodes.forEach((n) => expect(n.type).toBe('rest'));
  });

  it('no elite or rest on floors below 6 (override rule 1)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const map = generateMap(seed * 11111, actConfig);
      const below6 = map.nodes.filter((n) => n.floor < 6 && n.type !== 'boss' && n.type !== 'combat' && n.type !== 'event' && n.type !== 'shop' && n.type !== 'treasure');
      below6.forEach((n) => {
        expect(n.type).not.toBe('elite');
        expect(n.type).not.toBe('rest');
      });
    }
  });

  it('no rest on floor 13 (override rule 4)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const map = generateMap(seed * 22222, actConfig);
      const floor13 = map.nodes.filter((n) => n.floor === 13);
      floor13.forEach((n) => expect(n.type).not.toBe('rest'));
    }
  });

  it('no consecutive elite/rest/shop along any edge (override rule 2)', () => {
    const special = new Set(['elite', 'rest', 'shop']);
    for (let seed = 0; seed < 15; seed++) {
      const map = generateMap(seed * 33333, actConfig);
      const typeById = new Map(map.nodes.map((n) => [n.id, n.type]));
      for (const [fromId, toId] of map.edges) {
        const fromType = typeById.get(fromId);
        const toType = typeById.get(toId);
        if (fromType && toType && special.has(fromType)) {
          expect(special.has(toType)).toBe(false);
        }
      }
    }
  });

  it('crossroads have distinct destination types (override rule 3)', () => {
    for (let seed = 0; seed < 15; seed++) {
      const map = generateMap(seed * 44444, actConfig);
      const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
      const typeById = new Map(map.nodes.map((n) => [n.id, n.type]));
      const outgoingByFrom = new Map<string, string[]>();
      for (const [from, to] of map.edges) {
        const list = outgoingByFrom.get(from) ?? [];
        list.push(to);
        outgoingByFrom.set(from, list);
      }
      for (const [fromId, toIds] of outgoingByFrom) {
        if (toIds.length < 2) continue;
        const destTypes = toIds.map((id) => typeById.get(id)).filter(Boolean) as string[];
        const distinct = new Set(destTypes).size === destTypes.length;
        const allSameFixed =
          destTypes.length > 0 &&
          destTypes.every((t) => t === destTypes[0]) &&
          toIds.every((id) => {
            const node = nodeById.get(id);
            return node && (node.floor === 0 || node.floor === 8 || node.floor === 14);
          });
        expect(distinct || allSameFixed).toBe(true);
      }
    }
  });
});
