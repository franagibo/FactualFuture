import type { MapState, MapNode, MapNodeType } from '../types';

export interface ActConfig {
  combat: number;
  elite: number;
  rest: number;
  shop: number;
  event: number;
  boss: number;
  /** Number of floors (rows). Guide: 15. Bottom = floor 0, top = floorCount-1. */
  floorCount?: number;
  /** Weights for assigning node types on middle floors. Treasure is fixed on F9 (floor 8), not weighted. */
  typeWeights?: Partial<Record<MapNodeType, number>>;
}

const DEFAULT_FLOOR_COUNT = 15;
const LANE_COUNT = 7;
const NUM_PATHS = 6;

const DEFAULT_TYPE_WEIGHTS: [MapNodeType, number][] = [
  ['combat', 45],
  ['event', 22],
  ['elite', 16],
  ['rest', 12],
  ['shop', 5],
];

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

/** One of the 3 closest lanes on the next row: lane-1, lane, lane+1 (clamped). */
function pickNextLane(
  random: () => number,
  currentLane: number,
  prevTargetLane: number
): number {
  const minLane = Math.max(0, currentLane - 1);
  const maxLane = Math.min(LANE_COUNT - 1, currentLane + 1);
  const low = Math.max(minLane, prevTargetLane);
  return low <= maxLane ? randomInt(random, low, maxLane) : prevTargetLane;
}

/**
 * StS-style map: 7×floorCount grid, 6 paths from floor 0 to top, "3 closest" per step, non-crossing.
 * Pathless rooms pruned. Fixed: F0=combat, F8=treasure, F14=rest. Boss after. Then type assignment with override rules.
 */
export function generateMap(seed: number, actConfig: ActConfig): MapState {
  const random = seededRandom(seed);
  const floorCount = Math.max(3, actConfig.floorCount ?? DEFAULT_FLOOR_COUNT);
  const topFloor = floorCount - 1; // 0-based; guide F15 = rest

  // ---------- Phase 1: Generate 6 paths (floor 0 to topFloor), non-crossing ----------
  // paths[p][f] = lane at floor f for path p
  const paths: number[][] = [];
  const start0 = randomInt(random, 0, LANE_COUNT - 1);
  let start1 = randomInt(random, 0, LANE_COUNT - 1);
  while (start1 === start0) start1 = randomInt(random, 0, LANE_COUNT - 1);
  paths[0] = [start0];
  paths[1] = [start1];
  for (let p = 2; p < NUM_PATHS; p++) {
    paths[p] = [randomInt(random, 0, LANE_COUNT - 1)];
  }

  for (let floor = 0; floor < topFloor; floor++) {
    const currentLanes = paths.map((path) => path[floor]);
    const order = [...Array(NUM_PATHS)].map((_, i) => i).sort((a, b) => currentLanes[a] - currentLanes[b]);
    let prevTargetLane = -1;
    for (const idx of order) {
      const lane = paths[idx][floor];
      const targetLane = pickNextLane(random, lane, prevTargetLane);
      prevTargetLane = targetLane;
      paths[idx].push(targetLane);
    }
  }

  // ---------- Reached slots and edges (deduplicated) ----------
  const reached = new Set<string>();
  const edgeSet = new Set<string>();
  for (let p = 0; p < NUM_PATHS; p++) {
    for (let f = 0; f <= topFloor; f++) {
      reached.add(`${f},${paths[p][f]}`);
    }
    for (let f = 0; f < topFloor; f++) {
      const from = `${f},${paths[p][f]}`;
      const to = `${f + 1},${paths[p][f + 1]}`;
      edgeSet.add(`${from}->${to}`);
    }
  }

  // ---------- Create nodes only for reached slots; fixed floor types ----------
  const nodes: MapNode[] = [];
  const edges: [string, string][] = [];
  let nodeIdCounter = 0;
  const id = () => `node_${nodeIdCounter++}`;
  const slotToId = new Map<string, string>();

  const TREASURE_FLOOR = 8; // guide F9

  for (const key of reached) {
    const [f, l] = key.split(',').map(Number);
    let type: MapNodeType;
    if (f === 0) type = 'combat';
    else if (f === TREASURE_FLOOR) type = 'treasure';
    else if (f === topFloor) type = 'rest';
    else type = 'combat'; // assigned later
    const nodeId = id();
    slotToId.set(key, nodeId);
    nodes.push({ id: nodeId, type, floor: f, lane: l });
  }

  for (const edgeKey of edgeSet) {
    const [fromKey, toKey] = edgeKey.split('->');
    const fromId = slotToId.get(fromKey);
    const toId = slotToId.get(toKey);
    if (fromId && toId) edges.push([fromId, toId]);
  }

  // ---------- Boss: one node, all top-floor nodes connect to it ----------
  const bossId = id();
  nodes.push({ id: bossId, type: 'boss', floor: floorCount, lane: Math.floor(LANE_COUNT / 2) });
  for (const n of nodes) {
    if (n.floor === topFloor && n.type === 'rest') edges.push([n.id, bossId]);
  }

  // ---------- Type weights (exclude treasure from random assignment) ----------
  const typeWeightsArray: [MapNodeType, number][] = DEFAULT_TYPE_WEIGHTS.map(([t, w]) => [
    t,
    actConfig.typeWeights?.[t] ?? w,
  ]);

  // ---------- Assign types for non-fixed middle nodes; apply 4 override rules ----------
  const assignableNodes = nodes.filter(
    (n) =>
      n.type === 'combat' &&
      n.floor !== 0 &&
      n.floor !== TREASURE_FLOOR &&
      n.floor !== topFloor
  );

  const getIncomingType = (nodeId: string): MapNodeType | null => {
    const inEdge = edges.find(([, to]) => to === nodeId);
    if (!inEdge) return null;
    return nodes.find((x) => x.id === inEdge[0])?.type ?? null;
  };

  const getOutgoingNodeIds = (nodeId: string): string[] => {
    return edges.filter(([from]) => from === nodeId).map(([, to]) => to);
  };

  const getOutgoingTypes = (nodeId: string): MapNodeType[] => {
    return getOutgoingNodeIds(nodeId)
      .map((id) => nodes.find((n) => n.id === id)?.type)
      .filter((t): t is MapNodeType => t != null);
  };

  const isSpecial = (t: MapNodeType) => t === 'elite' || t === 'rest' || t === 'shop';

  const rule1 = (n: MapNode): boolean => n.floor >= 6 || (n.type !== 'elite' && n.type !== 'rest');
  const rule2 = (n: MapNode): boolean => {
    const prev = getIncomingType(n.id);
    if (prev != null && isSpecial(n.type) && isSpecial(prev)) return false;
    const successorTypes = getOutgoingNodeIds(n.id).map((id) => nodes.find((x) => x.id === id)?.type);
    if (successorTypes.some((t) => t != null && isSpecial(t)) && isSpecial(n.type)) return false;
    return true;
  };
  const rule3 = (n: MapNode): boolean => {
    const destTypes = getOutgoingTypes(n.id);
    if (destTypes.length < 2) return true;
    return new Set(destTypes).size === destTypes.length;
  };
  const rule4 = (n: MapNode): boolean => n.floor !== 13 || n.type !== 'rest';

  const assignType = (n: MapNode, excludeConsecutiveSpecial: boolean): void => {
    const prevType = getIncomingType(n.id);
    const successorTypes = getOutgoingNodeIds(n.id)
      .map((id) => nodes.find((x) => x.id === id)?.type)
      .filter((t): t is MapNodeType => t != null);
    const anySuccessorSpecial = successorTypes.some((t) => isSpecial(t));
    let candidates = typeWeightsArray.filter(([t]) => {
      if (t === 'treasure') return false;
      if (n.floor < 6 && (t === 'elite' || t === 'rest')) return false;
      if (n.floor === 13 && t === 'rest') return false;
      if (excludeConsecutiveSpecial && (t === 'elite' || t === 'rest' || t === 'shop')) {
        if (prevType === 'elite' || prevType === 'rest' || prevType === 'shop') return false;
        if (anySuccessorSpecial) return false;
      }
      return true;
    });
    const total = candidates.reduce((s, [, w]) => s + w, 0);
    let r = total > 0 ? random() * total : 0;
    let chosen: MapNodeType = 'combat';
    for (const [t, w] of candidates) {
      r -= w;
      if (r <= 0) {
        chosen = t;
        break;
      }
    }
    n.type = chosen;
  };

  const assignableIds = new Set(assignableNodes.map((n) => n.id));

  for (const n of assignableNodes) assignType(n, true);

  let maxIter = 100;
  while (maxIter-- > 0) {
    const violations: MapNode[] = [];
    for (const n of assignableNodes) {
      if (!rule1(n) || !rule2(n) || !rule4(n)) violations.push(n);
    }
    // Rule 3 (crossroads): reassign one of the destination nodes that share a type
    for (const n of nodes) {
      const destIds = getOutgoingNodeIds(n.id);
      if (destIds.length < 2) continue;
      const destTypes = destIds.map((id) => nodes.find((x) => x.id === id)?.type).filter(Boolean) as MapNodeType[];
      if (new Set(destTypes).size === destTypes.length) continue;
      const byType = new Map<MapNodeType, string[]>();
      for (let i = 0; i < destIds.length; i++) {
        const t = destTypes[i];
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(destIds[i]);
      }
      for (const [, ids] of byType) {
        if (ids.length > 1) {
          const toReassign = ids.find((id) => assignableIds.has(id));
          if (toReassign) {
            const node = nodes.find((x) => x.id === toReassign);
            if (node) violations.push(node);
          }
          break;
        }
      }
    }
    if (violations.length === 0) break;
    for (const n of violations) assignType(n, true);
  }

  return { nodes, edges };
}
