/**
 * Renders the run map (nodes, paths, container) with PixiJS.
 * Uses a context object to avoid depending on the component directly.
 */
import * as PIXI from 'pixi.js';
import type { GameState } from '../../../engine/types';
import type { MapNodeType } from '../../../engine/types';

export interface MapViewContext {
  getAvailableNextNodes(): string[];
  getNodeTexture(type: MapNodeType): PIXI.Texture | null;
  getMapBgTexture(): PIXI.Texture | null;
  onMapContentHeight(height: number): void;
  markForCheck(): void;
  onChooseNode(nodeId: string): void;
  loadMapAssets(): void;
  /** For map node tooltip: id of node currently hovered, or null. */
  hoveredNodeId: string | null;
  onNodePointerOver(nodeId: string): void;
  onNodePointerOut(): void;
}

/**
 * Convex hull (Graham scan), CCW order.
 * @param points - Input points
 * @returns Vertices of the convex hull
 */
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [...points];
  const idx = points.reduce((min, p, i) => {
    const q = points[min];
    return p.y < q.y || (p.y === q.y && p.x < q.x) ? i : min;
  }, 0);
  const pivot = points[idx];
  const rest = points.filter((_, i) => i !== idx);
  rest.sort((a, b) => {
    const ax = a.x - pivot.x;
    const ay = a.y - pivot.y;
    const bx = b.x - pivot.x;
    const by = b.y - pivot.y;
    const cross = ax * by - ay * bx;
    if (cross !== 0) return cross > 0 ? 1 : -1;
    return (ax * ax + ay * ay) - (bx * bx + by * by);
  });
  const hull: { x: number; y: number }[] = [pivot];
  for (const p of rest) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2];
      const b = hull[hull.length - 1];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross <= 0) hull.pop();
      else break;
    }
    hull.push(p);
  }
  return hull;
}

/**
 * Expand polygon outward by distance (CCW vertices).
 * @param poly - CCW polygon vertices
 * @param distance - Distance to expand
 */
export function expandPolygon(poly: { x: number; y: number }[], distance: number): { x: number; y: number }[] {
  const n = poly.length;
  if (n < 3) return poly;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const e1x = curr.x - prev.x;
    const e1y = curr.y - prev.y;
    const e2x = next.x - curr.x;
    const e2y = next.y - curr.y;
    const n1x = -e1y;
    const n1y = e1x;
    const n2x = -e2y;
    const n2y = e2x;
    const l1 = Math.hypot(n1x, n1y) || 1;
    const l2 = Math.hypot(n2x, n2y) || 1;
    const bx = n1x / l1 + n2x / l2;
    const by = n1y / l1 + n2y / l2;
    const bl = Math.hypot(bx, by) || 1;
    const scale = distance / bl;
    out.push({ x: curr.x + bx * scale, y: curr.y + by * scale });
  }
  return out;
}

/**
 * Draws the full map view (background, container, paths, nodes) onto the given stage.
 * @param context - Bridge to component (nodes, textures, callbacks)
 * @param state - Current game state with map
 * @param stage - Pixi container to draw into
 * @param w - Screen width
 * @param h - Screen height
 * @param padding - Layout padding
 */
export function drawMapView(
  context: MapViewContext,
  state: GameState,
  stage: PIXI.Container,
  w: number,
  h: number,
  padding: number
): void {
  const map = state.map!;
  const nodes = map.nodes;
  const edges = map.edges;
  const availableNext = context.getAvailableNextNodes();
  const NODE_RADIUS = 28;
  const NODE_ICON_SIZE = 80;
  const BOSS_ICON_SIZE = 92;
  const pathInset = Math.max(NODE_RADIUS + 6, BOSS_ICON_SIZE / 2 + 8);
  const FLOOR_SPACING = 240;
  const laneCount = 7;

  const floorById = new Map<string, number>();
  const hasFloor = nodes.length > 0 && typeof (nodes[0] as { floor?: number }).floor === 'number';
  if (hasFloor) {
    nodes.forEach((n) => floorById.set(n.id, (n as { floor: number }).floor));
  } else {
    // Compute floor from graph: nodes with no incoming edge are level 0, then BFS.
    const hasIncoming = new Set<string>();
    edges.forEach(([, to]) => hasIncoming.add(to));
    const queue: { id: string; level: number }[] = [];
    nodes.forEach((n) => { if (!hasIncoming.has(n.id)) queue.push({ id: n.id, level: 0 }); });
    if (queue.length === 0 && nodes.length) queue.push({ id: nodes[0].id, level: 0 });
    while (queue.length) {
      const { id, level } = queue.shift()!;
      if (floorById.has(id)) continue;
      floorById.set(id, level);
      edges.forEach(([from, to]) => { if (from === id) queue.push({ id: to, level: level + 1 }); });
    }
  }

  const maxFloor = Math.max(0, ...Array.from(floorById.values()));
  const BOTTOM_MARGIN = 130;
  const mapContentHeight = (maxFloor + 1) * FLOOR_SPACING + padding * 2 + BOTTOM_MARGIN;
  context.onMapContentHeight(mapContentHeight);

  const floors: string[][] = [];
  nodes.forEach((n) => {
    const f = floorById.get(n.id) ?? 0;
    if (!floors[f]) floors[f] = [];
    floors[f].push(n.id);
  });

  const totalMapHeight = (maxFloor + 2) * FLOOR_SPACING;
  const contentBottomPadding = 60;
  /** Deterministic jitter from node id + floor so layout is stable but not rigid. Returns -1..1. */
  const jitterFrom = (nodeId: string, floor: number, seed: number) => {
    let h0 = seed;
    for (let i = 0; i < nodeId.length; i++) h0 = (h0 * 31 + nodeId.charCodeAt(i)) | 0;
    h0 = (h0 + floor * 17) | 0;
    return ((h0 >>> 0) % 2000) / 1000 - 1;
  };
  const JITTER_X = 28;
  const JITTER_Y = 16;
  const posById = new Map<string, { x: number; y: number }>();
  for (let f = 0; f <= maxFloor; f++) {
    const ids = floors[f] ?? [];
    if (!ids.length) continue;
    const baseY = contentBottomPadding + totalMapHeight - (f + 1) * FLOOR_SPACING;
    const gapX = Math.min(140, (w - padding * 2) / Math.max(1, ids.length));
    const rowWidth = (ids.length - 1) * gapX;
    const centerX = w / 2;
    for (let i = 0; i < ids.length; i++) {
      const nodeId = ids[i];
      const n = nodes.find((x) => x.id === nodeId);
      const lane = (n && (n as { lane?: number }).lane != null) ? (n as { lane: number }).lane : i;
      const laneJitter = (lane / laneCount - 0.5) * 28;
      const baseX = centerX - rowWidth / 2 + i * gapX + laneJitter;
      const x = baseX + jitterFrom(nodeId, f, 1) * JITTER_X;
      const y = baseY + jitterFrom(nodeId, f, 2) * JITTER_Y;
      posById.set(nodeId, { x, y });
    }
  }
  for (const n of nodes) {
    if (n.type === 'boss' && (n as { floor: number }).floor === maxFloor + 1) {
      posById.set(n.id, { x: w / 2, y: contentBottomPadding + totalMapHeight - FLOOR_SPACING });
    }
  }

  context.loadMapAssets();
  const bgTex = context.getMapBgTexture();
  stage.sortableChildren = true;
  const mapH = Math.max(h, mapContentHeight);
  if (bgTex) {
    const bgSprite = new PIXI.Sprite(bgTex);
    bgSprite.width = w;
    bgSprite.height = mapH;
    bgSprite.zIndex = 0;
    stage.addChild(bgSprite);
  } else {
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, mapH).fill(0x1a1822);
    bg.zIndex = 0;
    stage.addChild(bg);
  }

  const PAD_H = 88;
  const PAD_V = 42;
  const rowData: { left: number; right: number; y: number }[] = [];
  for (let f = 0; f <= maxFloor; f++) {
    const ids = floors[f] ?? [];
    if (ids.length === 0) continue;
    const xs = ids.map((id) => posById.get(id)!.x);
    const ys = ids.map((id) => posById.get(id)!.y);
    const left = Math.min(...xs) - PAD_H;
    const right = Math.max(...xs) + PAD_H;
    const y = ys.reduce((a, b) => a + b, 0) / ys.length;
    rowData.push({ left, right, y });
  }
  if (rowData.length >= 2) {
    rowData[0].y += PAD_V;
    rowData[rowData.length - 1].y -= PAD_V;
    const containerShape = new PIXI.Graphics();
    const first = rowData[0];
    containerShape.moveTo(first.left, first.y);
    containerShape.lineTo(first.right, first.y);
    for (let i = 1; i < rowData.length; i++) {
      containerShape.lineTo(rowData[i].right, rowData[i].y);
    }
    const last = rowData[rowData.length - 1];
    containerShape.lineTo(last.left, last.y);
    for (let i = rowData.length - 2; i >= 0; i--) {
      containerShape.lineTo(rowData[i].left, rowData[i].y);
    }
    containerShape.fill({ color: 0x0c0a18, alpha: 0.88 });
    containerShape.stroke({ width: 2, color: 0xb48cff, alpha: 0.45 });
    containerShape.zIndex = 1;
    stage.addChild(containerShape);
  }

  const strokeColor = 0x8899aa;
  const pathBorderColor = 0x0c0c18;
  const pathBorderWidth = 6;
  const pathStrokeWidth = 2.5;
  const dashLen = 10;
  const gapLen = 6;

  const drawEdgePath = (g: PIXI.Graphics, lineWidth: number, color: number) => {
    for (const [from, to] of edges) {
      const fromPos = posById.get(from);
      const toPos = posById.get(to);
      if (!fromPos || !toPos) continue;
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const len = Math.hypot(dx, dy);
      if (len < pathInset * 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const startX = fromPos.x + ux * pathInset;
      const startY = fromPos.y + uy * pathInset;
      const endX = toPos.x - ux * pathInset;
      const endY = toPos.y - uy * pathInset;
      const segLen = Math.hypot(endX - startX, endY - startY);
      let dist = 0;
      while (dist < segLen - 16) {
        const a = dist;
        const b = Math.min(dist + dashLen, segLen - 16);
        g.moveTo(startX + ux * a, startY + uy * a);
        g.lineTo(startX + ux * b, startY + uy * b);
        g.stroke({ width: lineWidth, color });
        dist += dashLen + gapLen;
      }
      const arrowBase = segLen - 16;
      const baseX = startX + ux * arrowBase;
      const baseY = startY + uy * arrowBase;
      const arrowLen = 12;
      g.moveTo(baseX - uy * arrowLen * 0.5, baseY + ux * arrowLen * 0.5);
      g.lineTo(endX, endY);
      g.lineTo(baseX + uy * arrowLen * 0.5, baseY - ux * arrowLen * 0.5);
      g.stroke({ width: lineWidth, color });
    }
  };

  const edgeGraphics = new PIXI.Graphics();
  drawEdgePath(edgeGraphics, pathBorderWidth, pathBorderColor);
  drawEdgePath(edgeGraphics, pathStrokeWidth, strokeColor);
  edgeGraphics.zIndex = 2;
  stage.addChild(edgeGraphics);

  const nodeColor = (type: MapNodeType): number => {
    switch (type) {
      case 'combat': return 0x994444;
      case 'elite': return 0xbb7733;
      case 'rest': return 0xdd9922;
      case 'shop': return 0x339966;
      case 'event': return 0x5599bb;
      case 'boss': return 0x7733aa;
      default: return 0x555566;
    }
  };

  const nodeTypeLabel = (type: MapNodeType): string => {
    switch (type) {
      case 'combat': return 'Combat';
      case 'elite': return 'Elite';
      case 'rest': return 'Repair bay';
      case 'shop': return 'Shop';
      case 'event': return 'Event';
      case 'boss': return 'Boss';
      default: return type;
    }
  };

  for (const n of nodes) {
    const pos = posById.get(n.id);
    if (!pos) continue;
    const isCurrent = state.currentNodeId === n.id;
    const isAvailable = availableNext.includes(n.id);
    const nodeTex = context.getNodeTexture(n.type);
    const size = n.type === 'boss' ? BOSS_ICON_SIZE : NODE_ICON_SIZE;
    const r = n.type === 'boss' ? NODE_RADIUS + 6 : NODE_RADIUS;

    const container = new PIXI.Container();
    container.x = pos.x;
    container.y = pos.y;
    container.zIndex = 3;

    if (nodeTex) {
      const whiteBg = new PIXI.Graphics();
      whiteBg.circle(0, 0, size / 2 + 4).fill(0xffffff);
      container.addChild(whiteBg);
      const sprite = new PIXI.Sprite(nodeTex);
      sprite.anchor.set(0.5, 0.5);
      sprite.width = size;
      sprite.height = size;
      container.addChild(sprite);
    } else {
      const circle = new PIXI.Graphics();
      circle.circle(0, 0, r + 2).fill(0x2a2a35);
      circle.circle(0, 0, r).fill({ color: isAvailable ? 0xe8e8a0 : nodeColor(n.type) });
      if (isCurrent) {
        circle.circle(0, 0, r + 8).stroke({ width: 5, color: 0x55aaff });
      } else {
        circle.circle(0, 0, r).stroke({ width: 2.5, color: 0x333344 });
      }
      container.addChild(circle);
      const labelText = n.type === 'event' ? '?' : n.type === 'shop' ? '$' : n.type.slice(0, 1).toUpperCase();
      const label = new PIXI.Text({
        text: labelText,
        style: { fontFamily: 'system-ui', fontSize: n.type === 'boss' ? 16 : 12, fill: 0xffffff, fontWeight: 'bold' },
      });
      label.anchor.set(0.5, 0.5);
      container.addChild(label);
    }

    if (nodeTex && (isCurrent || isAvailable)) {
      const ring = new PIXI.Graphics();
      const ringR = size / 2 + 6;
      if (isCurrent) {
        ring.circle(0, 0, ringR).stroke({ width: 5, color: 0x55aaff });
      } else {
        ring.circle(0, 0, ringR).stroke({ width: 3, color: 0xe8e8a0 });
      }
      container.addChildAt(ring, 0);
    }

    container.eventMode = 'static';
    container.hitArea = new PIXI.Circle(0, 0, Math.max(size / 2, r) + 8);
    const nodeId = n.id;
    container.on('pointerover', () => context.onNodePointerOver(nodeId));
    container.on('pointerout', () => context.onNodePointerOut());
    if (isAvailable) {
      container.cursor = 'pointer';
      container.on('pointerdown', () => context.onChooseNode(nodeId));
    }
    stage.addChild(container);
  }

  if (context.hoveredNodeId) {
    const hovered = nodes.find((x) => x.id === context.hoveredNodeId);
    const pos = hovered ? posById.get(hovered.id) : null;
    if (hovered && pos) {
      const label = nodeTypeLabel(hovered.type);
      const tooltip = new PIXI.Text({
        text: label,
        style: { fontFamily: 'system-ui', fontSize: 12, fill: 0xffffff, fontWeight: 'bold' },
      });
      tooltip.anchor.set(0.5, 1);
      tooltip.x = pos.x;
      tooltip.y = pos.y - (hovered.type === 'boss' ? BOSS_ICON_SIZE : NODE_ICON_SIZE) / 2 - 6;
      tooltip.zIndex = 10;
      stage.addChild(tooltip);
    }
  }
}
