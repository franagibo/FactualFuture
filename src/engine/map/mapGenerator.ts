import type { MapState, MapNode, MapNodeType } from '../types';

export interface ActConfig {
  combat: number;
  elite: number;
  rest: number;
  shop: number;
  event: number;
  boss: number;
}

const FLOOR_COUNT = 8;
const LANE_COUNT = 7;

/** Seeded random: returns 0..1. Mulberry32. */
function seededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: () => number, min: number, maxInclusive: number): number {
  return min + Math.floor(random() * (maxInclusive - min + 1));
}

/** Pick 2 distinct lanes for the bottom floor (roots). */
function pickTwoDistinctLanes(random: () => number): [number, number] {
  const a = randomInt(random, 0, LANE_COUNT - 1);
  let b = randomInt(random, 0, LANE_COUNT - 1);
  while (b === a) b = randomInt(random, 0, LANE_COUNT - 1);
  return a < b ? [a, b] : [b, a];
}

/**
 * Generate a floor-based map: bottom-to-top, non-crossing paths, at least 2 starting nodes.
 * Assigns node types per plan (combat on floor 0, rest on top floor, boss after, middle by rules).
 */
export function generateMap(seed: number, _actConfig: ActConfig): MapState {
  const random = seededRandom(seed);
  const nodes: MapNode[] = [];
  const edges: [string, string][] = [];
  let nodeIdCounter = 0;
  const id = () => `node_${nodeIdCounter++}`;

  // Grid: (floor, lane) -> nodeId. Only create nodes where we place them.
  const slotToId = new Map<string, string>();
  const getOrCreateNode = (floor: number, lane: number, type: MapNodeType): string => {
    const key = `${floor},${lane}`;
    let nodeId = slotToId.get(key);
    if (!nodeId) {
      nodeId = id();
      slotToId.set(key, nodeId);
      nodes.push({ id: nodeId, type, floor, lane });
    }
    return nodeId;
  };

  // Floor 0: 2 distinct starting lanes (combat).
  const [lane0a, lane0b] = pickTwoDistinctLanes(random);
  const startLanes = [lane0a, lane0b].sort((a, b) => a - b);
  const active: { nodeId: string; lane: number }[] = [];
  for (const lane of startLanes) {
    const nodeId = getOrCreateNode(0, lane, 'combat');
    active.push({ nodeId, lane });
  }

  // Floors 1 .. FLOOR_COUNT-2: connect each active node to next floor without crossing.
  // Some nodes will connect to 2 targets to create bigger splits.
  for (let floor = 1; floor <= FLOOR_COUNT - 2; floor++) {
    active.sort((a, b) => a.lane - b.lane);
    let prevTargetLane = -1;
    const nextActive: { nodeId: string; lane: number }[] = [];

    for (const { nodeId, lane } of active) {
      const minLane = Math.max(0, lane - 1);
      const maxLane = Math.min(LANE_COUNT - 1, lane + 1);
      const low = Math.max(minLane, prevTargetLane);
      const targetLane = low <= maxLane ? randomInt(random, low, maxLane) : prevTargetLane;
      prevTargetLane = targetLane;

      const primaryId = getOrCreateNode(floor, targetLane, 'combat'); // type assigned later
      edges.push([nodeId, primaryId]);
      nextActive.push({ nodeId: primaryId, lane: targetLane });

      // Optional second connection to create more branching.
      const possibleLanes: number[] = [];
      for (let cand = minLane; cand <= maxLane; cand++) {
        if (cand !== targetLane && cand >= prevTargetLane) {
          possibleLanes.push(cand);
        }
      }
      if (possibleLanes.length > 0 && random() < 0.5) {
        const secondLane = possibleLanes[randomInt(random, 0, possibleLanes.length - 1)];
        prevTargetLane = secondLane;
        const secondId = getOrCreateNode(floor, secondLane, 'combat');
        edges.push([nodeId, secondId]);
        nextActive.push({ nodeId: secondId, lane: secondLane });
      }
    }

    active.length = 0;
    active.push(...nextActive);
  }

  // Top floor (FLOOR_COUNT-1): rest sites. Connect current active to rest nodes.
  const topFloor = FLOOR_COUNT - 1;
  active.sort((a, b) => a.lane - b.lane);
  let prevRestLane = -1;
  const restNodes: string[] = [];
  for (const { nodeId, lane } of active) {
    const minLane = Math.max(0, lane - 1);
    const maxLane = Math.min(LANE_COUNT - 1, lane + 1);
    const low = Math.max(minLane, prevRestLane);
    const targetLane = low <= maxLane ? randomInt(random, low, maxLane) : prevRestLane;
    prevRestLane = targetLane;
    const restId = getOrCreateNode(topFloor, targetLane, 'rest');
    edges.push([nodeId, restId]);
    restNodes.push(restId);
  }

  // Boss node: one node at "floor" FLOOR_COUNT, all rest nodes connect to it.
  const bossId = id();
  nodes.push({ id: bossId, type: 'boss', floor: FLOOR_COUNT, lane: Math.floor(LANE_COUNT / 2) });
  for (const restId of restNodes) {
    edges.push([restId, bossId]);
  }

  // Assign types for middle floors (1 .. FLOOR_COUNT-2). Already set combat for floor 0, rest for top, boss above.
  const typeWeights: [MapNodeType, number][] = [
    ['combat', 45],
    ['event', 22],
    ['elite', 16],
    ['rest', 12],
    ['shop', 5],
  ];
  const minNonCombatFloor = 3; // approximate: no rest/shop/elite below this

  for (const n of nodes) {
    if (n.type !== 'combat') continue; // already set for rest, boss
    if (n.floor === 0) continue; // keep combat
    if (n.floor >= topFloor) continue;

    const outgoing = edges.filter(([from]) => from === n.id).map(([, to]) => to);
    const destTypes = new Set(outgoing.map((to) => nodes.find((x) => x.id === to)?.type).filter(Boolean));

    let chosen: MapNodeType = 'combat';
    if (n.floor >= minNonCombatFloor) {
      const prevType = (() => {
        const inEdge = edges.find(([, to]) => to === n.id);
        if (!inEdge) return null;
        return nodes.find((x) => x.id === inEdge[0])?.type ?? null;
      })();
      const safeTypes = typeWeights.filter(([t]) => {
        if (t === 'rest' || t === 'shop' || t === 'elite') {
          if (prevType === 'rest' || prevType === 'shop' || prevType === 'elite') return false;
        }
        return true;
      });
      const total = safeTypes.reduce((s, [, w]) => s + w, 0);
      let r = random() * total;
      for (const [t, w] of safeTypes) {
        r -= w;
        if (r <= 0) {
          chosen = t;
          break;
        }
      }
    }
    n.type = chosen;
  }

  return { nodes, edges };
}
