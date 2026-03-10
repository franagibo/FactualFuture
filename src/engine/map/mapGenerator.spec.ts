import { describe, it, expect } from 'vitest';
import { generateMap, type ActConfig } from './mapGenerator';

const actConfig: ActConfig = {
  combat: 4,
  elite: 0,
  rest: 2,
  shop: 0,
  event: 0,
  boss: 1,
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
});
