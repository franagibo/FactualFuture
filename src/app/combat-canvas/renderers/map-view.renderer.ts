/**
 * Renders the run map (nodes, paths, container) with PixiJS.
 * Uses a context object to avoid depending on the component directly.
 */
import * as PIXI from 'pixi.js';
import type { GameState } from '../../../engine/types';
import type { MapNodeType } from '../../../engine/types';
import { MAP_LAYOUT, getPathInset } from '../constants/map-layout.constants';

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
  const ML = MAP_LAYOUT;
  const NODE_RADIUS = ML.nodeRadius;
  const NODE_ICON_SIZE = ML.nodeIconSize;
  const BOSS_ICON_SIZE = ML.bossIconSize;
  const pathInset = getPathInset();
  const FLOOR_SPACING = ML.floorSpacing;
  const laneCount = ML.laneCount;

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
  const BOTTOM_MARGIN = ML.bottomMargin;
  const mapContentHeight = (maxFloor + 1) * FLOOR_SPACING + padding * 2 + BOTTOM_MARGIN;
  context.onMapContentHeight(mapContentHeight);

  const floors: string[][] = [];
  nodes.forEach((n) => {
    const f = floorById.get(n.id) ?? 0;
    if (!floors[f]) floors[f] = [];
    floors[f].push(n.id);
  });

  const totalMapHeight = (maxFloor + 2) * FLOOR_SPACING;
  const contentBottomPadding = ML.contentBottomPadding;
  /** Deterministic jitter from node id + floor so layout is stable but not rigid. Returns -1..1. */
  const jitterFrom = (nodeId: string, floor: number, seed: number) => {
    let h0 = seed;
    for (let i = 0; i < nodeId.length; i++) h0 = (h0 * 31 + nodeId.charCodeAt(i)) | 0;
    h0 = (h0 + floor * 17) | 0;
    return ((h0 >>> 0) % 2000) / 1000 - 1;
  };
  const JITTER_X = ML.jitterX;
  const JITTER_Y = ML.jitterY;
  const marginH = ML.mapMarginH;
  const gridWidth = Math.max(1, Math.min(w - marginH * 2, ML.maxMapWidth));
  const gridLeft = (w - gridWidth) / 2;
  const laneSpacing = laneCount > 1 ? gridWidth / (laneCount - 1) : gridWidth;
  const posById = new Map<string, { x: number; y: number }>();
  for (let f = 0; f <= maxFloor; f++) {
    const ids = floors[f] ?? [];
    if (!ids.length) continue;
    const baseY = contentBottomPadding + totalMapHeight - (f + 1) * FLOOR_SPACING;
    for (let i = 0; i < ids.length; i++) {
      const nodeId = ids[i];
      const n = nodes.find((x) => x.id === nodeId);
      let lane = (n && (n as { lane?: number }).lane != null) ? (n as { lane: number }).lane : i;
      if (lane < 0) lane = 0;
      if (lane >= laneCount) lane = laneCount - 1;
      const baseX = gridLeft + laneSpacing * (laneCount > 1 ? lane : 0.5);
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
  const bgAlpha = ML.backgroundAlpha ?? 0.78;
  if (bgTex) {
    const bgSprite = new PIXI.Sprite(bgTex);
    bgSprite.width = w;
    bgSprite.height = mapH;
    bgSprite.alpha = bgAlpha;
    bgSprite.zIndex = 0;
    stage.addChild(bgSprite);
  } else {
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, mapH).fill({ color: 0x120e08, alpha: bgAlpha });
    bg.zIndex = 0;
    stage.addChild(bg);
  }

  {
    // Full-size map frame: use all available map space instead of hugging node rows.
    const containerShape = new PIXI.Graphics();
    const shapeAlpha = ML.containerShapeAlpha ?? 0.9;
    const frameInset = 2;
    const frameRadius = 14;
    containerShape.roundRect(
      frameInset,
      frameInset,
      Math.max(0, w - frameInset * 2),
      Math.max(0, mapH - frameInset * 2),
      frameRadius
    );
    containerShape.fill({ color: 0x120d06, alpha: shapeAlpha });
    containerShape.roundRect(
      frameInset,
      frameInset,
      Math.max(0, w - frameInset * 2),
      Math.max(0, mapH - frameInset * 2),
      frameRadius
    );
    containerShape.stroke({ width: 2, color: 0xc8a030, alpha: 0.48 });
    containerShape.zIndex = 1;
    stage.addChild(containerShape);
  }

  const strokeColor = 0xd8be74;
  const pathBorderColor = 0x120d05;
  const pathGlowColor = 0xc8922a;
  const drawEdgePath = (g: PIXI.Graphics, lineWidth: number, color: number, alpha = 1) => {
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
      while (dist < segLen - ML.arrowBaseOffset) {
        const a = dist;
        const b = Math.min(dist + ML.dashLen, segLen - ML.arrowBaseOffset);
        g.moveTo(startX + ux * a, startY + uy * a);
        g.lineTo(startX + ux * b, startY + uy * b);
        g.stroke({ width: lineWidth, color, alpha });
        dist += ML.dashLen + ML.gapLen;
      }
      const arrowBase = segLen - ML.arrowBaseOffset;
      const baseX = startX + ux * arrowBase;
      const baseY = startY + uy * arrowBase;
      const arrowLen = ML.arrowLen * 1.2;
      g.moveTo(baseX - uy * arrowLen * 0.55, baseY + ux * arrowLen * 0.55);
      g.lineTo(endX, endY);
      g.lineTo(baseX + uy * arrowLen * 0.55, baseY - ux * arrowLen * 0.55);
      g.stroke({ width: lineWidth * 1.1, color, alpha });

    }
  };

  const edgeGlow = new PIXI.Graphics();
  drawEdgePath(edgeGlow, ML.pathBorderWidth * 2.5, pathGlowColor, 0.18);
  edgeGlow.zIndex = 2;
  stage.addChild(edgeGlow);

  const edgeGraphics = new PIXI.Graphics();
  drawEdgePath(edgeGraphics, ML.pathBorderWidth, pathBorderColor);
  drawEdgePath(edgeGraphics, ML.pathStrokeWidth, strokeColor);
  edgeGraphics.zIndex = 2;
  stage.addChild(edgeGraphics);

  const nodeColor = (type: MapNodeType): number => {
    switch (type) {
      case 'combat': return 0x994444;
      case 'elite': return 0xbb7733;
      case 'rest': return 0xdd9922;
      case 'shop': return 0x339966;
      case 'event': return 0x5599bb;
      case 'treasure': return 0xccaa44;
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
      case 'treasure': return 'Treasure';
      case 'boss': return 'Boss';
      default: return type;
    }
  };

  const hexPts = (r: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    return pts;
  };
  const darkenHex = (color: number, factor: number): number => {
    const r2 = Math.floor(((color >> 16) & 0xff) * factor);
    const g2 = Math.floor(((color >> 8) & 0xff) * factor);
    const b2 = Math.floor((color & 0xff) * factor);
    return (r2 << 16) | (g2 << 8) | b2;
  };
  const lightenHex = (color: number, factor: number): number => {
    const r2 = Math.min(255, Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * factor));
    const g2 = Math.min(255, Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * factor));
    const b2 = Math.min(255, Math.round((color & 0xff) + (255 - (color & 0xff)) * factor));
    return (r2 << 16) | (g2 << 8) | b2;
  };
  const nodeVisualCfg = (type: MapNodeType): { main: number; inner: number; rim: number; icon: string } => {
    switch (type) {
      case 'combat': return { main: 0x6b1515, inner: 0xb03030, rim: 0x300808, icon: '\u2694' };
      case 'elite': return { main: 0x6a3a00, inner: 0xb86a20, rim: 0x321a00, icon: '\u2620' };
      case 'rest': return { main: 0x0d4d2e, inner: 0x1e8a50, rim: 0x062815, icon: '\u2665' };
      case 'shop': return { main: 0x0a3d58, inner: 0x1570a8, rim: 0x05202e, icon: '\u25c6' };
      case 'event': return { main: 0x26186a, inner: 0x4432b0, rim: 0x100a34, icon: '?' };
      case 'treasure': return { main: 0x6a4d00, inner: 0xc89010, rim: 0x342700, icon: '\u2606' };
      case 'boss': return { main: 0x3a0660, inner: 0x6810aa, rim: 0x180328, icon: '\u2620' };
      default: return { main: 0x303040, inner: 0x505065, rim: 0x181820, icon: '?' };
    }
  };


  for (const n of nodes) {
    const pos = posById.get(n.id);
    if (!pos) continue;
    const isCurrent = state.currentNodeId === n.id;
    const isAvailable = availableNext.includes(n.id);
    const nodeTex = context.getNodeTexture(n.type);
    const size = n.type === 'boss' ? BOSS_ICON_SIZE : NODE_ICON_SIZE;
    const r = n.type === 'boss' ? NODE_RADIUS + 8 : NODE_RADIUS;

    const container = new PIXI.Container();
    container.x = pos.x;
    container.y = pos.y;
    container.zIndex = 3;

    if (nodeTex) {
      if (isCurrent || isAvailable) {
        const glowColor = isCurrent ? 0xf4d98a : 0xe0b84c;
        const ringR = size / 2 + 8;
        for (let gi = 3; gi >= 1; gi--) {
          const haloGr = new PIXI.Graphics();
          haloGr.circle(0, 0, ringR + gi * 6).fill({ color: glowColor, alpha: 0.07 * gi });
          container.addChildAt(haloGr, 0);
        }
        const ring = new PIXI.Graphics();
        if (isCurrent) {
          ring.circle(0, 0, ringR).stroke({ width: 4, color: 0xf4d98a, alpha: 0.95 });
        } else {
          ring.circle(0, 0, ringR).stroke({ width: 3, color: 0xe0b84c, alpha: 0.9 });
        }
        container.addChildAt(ring, 0);
      }
      const whiteBg = new PIXI.Graphics();
      whiteBg.circle(0, 0, size / 2 + 4).fill(0xffffff);
      container.addChild(whiteBg);
      const sprite = new PIXI.Sprite(nodeTex);
      sprite.anchor.set(0.5, 0.5);
      sprite.width = size;
      sprite.height = size;
      container.addChild(sprite);
    } else {
      const cfg = nodeVisualCfg(n.type);
      const isBoss = n.type === 'boss';
      const glowColor = isCurrent ? 0xf4d98a : 0xe0b84c;
      if (isCurrent || isAvailable) {
        for (let gi = 4; gi >= 1; gi--) {
          const haloGr = new PIXI.Graphics();
          haloGr.poly(hexPts(r + 8 + gi * 7)).fill({ color: glowColor, alpha: 0.05 * gi });
          container.addChild(haloGr);
        }
      }
      const shadowGr = new PIXI.Graphics();
      shadowGr.poly(hexPts(r + 2)).fill({ color: 0x000000, alpha: 0.6 });
      shadowGr.x = 3;
      shadowGr.y = 5;
      container.addChild(shadowGr);
      const rimGr = new PIXI.Graphics();
      rimGr.poly(hexPts(r + 1)).fill({ color: cfg.rim });
      container.addChild(rimGr);
      const mainGr = new PIXI.Graphics();
      mainGr.poly(hexPts(r - 2)).fill({ color: cfg.main });
      container.addChild(mainGr);
      const innerGr = new PIXI.Graphics();
      innerGr.poly(hexPts(r - 6)).fill({ color: cfg.inner });
      container.addChild(innerGr);
      const sheenGr = new PIXI.Graphics();
      sheenGr.poly(hexPts(r - 9)).fill({ color: 0xffffff, alpha: 0.10 });
      container.addChild(sheenGr);
      const borderColor = isCurrent ? 0xf4d98a : (isAvailable ? 0xe0b84c : lightenHex(cfg.inner, 0.3));
      const borderWidth = (isCurrent || isAvailable) ? 3 : 1.5;
      const borderAlpha = (isCurrent || isAvailable) ? 1 : 0.65;
      const borderGr = new PIXI.Graphics();
      borderGr.poly(hexPts(r + 1)).stroke({ width: borderWidth, color: borderColor, alpha: borderAlpha });
      container.addChild(borderGr);
      const innerBorderGr = new PIXI.Graphics();
      innerBorderGr.poly(hexPts(r - 5)).stroke({ width: 1, color: 0xffffff, alpha: 0.1 });
      container.addChild(innerBorderGr);
      if (isAvailable && !isCurrent) {
        const pulseGr = new PIXI.Graphics();
        pulseGr.poly(hexPts(r + 3)).stroke({ width: 1.5, color: 0xe0b84c, alpha: 0.35 });
        container.addChild(pulseGr);
      }
      const iconSize = isBoss ? Math.round(r * 1.05) : Math.round(r * 0.75);
      const iconText = new PIXI.Text({
        text: cfg.icon,
        style: {
          fontFamily: 'system-ui, serif',
          fontSize: iconSize,
          fill: isBoss ? darkenHex(0xffffff, 0.85) : 0xffffff,
          fontWeight: '700',
        },
      });
      iconText.anchor.set(0.5, 0.5);
      iconText.y = 1;
      container.addChild(iconText);
      if (isBoss) {
        const bossRingGr = new PIXI.Graphics();
        bossRingGr.poly(hexPts(r + 4)).stroke({ width: 2, color: 0xc8a030, alpha: 0.55 });
        container.addChild(bossRingGr);
      }

    }

    container.eventMode = 'static';
    container.hitArea = new PIXI.Circle(0, 0, Math.max(size / 2, r) + 10);
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
      const cfg = nodeVisualCfg(hovered.type);
      const label = nodeTypeLabel(hovered.type);
      const tooltipContainer = new PIXI.Container();
      tooltipContainer.zIndex = 20;
      const labelText = new PIXI.Text({
        text: label,
        style: { fontFamily: 'system-ui', fontSize: 13, fill: 0xffffff, fontWeight: '700' },
      });
      labelText.anchor.set(0.5, 0.5);
      const padH = 12;
      const padV = 6;
      const boxW = labelText.width + padH * 2;
      const boxH = labelText.height + padV * 2;
      const tooltipBg = new PIXI.Graphics();
      tooltipBg.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 7)
        .fill({ color: 0x120d05, alpha: 0.96 })
        .stroke({ width: 1.5, color: lightenHex(cfg.inner, 0.15), alpha: 0.9 });
      tooltipContainer.addChild(tooltipBg);
      tooltipContainer.addChild(labelText);
      const nodeR = hovered.type === 'boss' ? NODE_RADIUS + 8 : NODE_RADIUS;
      const nodeSize = hovered.type === 'boss' ? BOSS_ICON_SIZE : NODE_ICON_SIZE;
      tooltipContainer.x = pos.x;
      tooltipContainer.y = pos.y - Math.max(nodeSize / 2, nodeR) - 22;
      stage.addChild(tooltipContainer);
    }
  }
}
