/**
 * Renders the combat scene (player, hand, enemies, targeting, floating numbers, banner) with PixiJS.
 * Uses a context object so the component owns state and event handlers.
 */
import * as PIXI from 'pixi.js';
import type { GameState, EnemyIntent } from '../../../engine/types';
import { COMBAT_LAYOUT } from '../constants/combat-layout.constants';

const INTENT_ICON_SIZE = 16;

/** B12: Draw a simple intent icon (attack=triangle, block=shield, debuff=diamond, none=?) into container at x,y. */
function drawIntentIcon(container: PIXI.Container, type: EnemyIntent['type'], value: number, x: number, y: number): void {
  const g = new PIXI.Graphics();
  g.x = x;
  g.y = y;
  const c = 0xffaa00;
  const fill = { color: c, alpha: 0.9 };
  const stroke = { width: 1.5, color: 0xffcc66 };
  const half = INTENT_ICON_SIZE / 2;
  switch (type) {
    case 'attack':
      g.moveTo(half, 0).lineTo(INTENT_ICON_SIZE, INTENT_ICON_SIZE).lineTo(0, INTENT_ICON_SIZE).closePath().fill(fill).stroke(stroke);
      break;
    case 'block':
      g.roundRect(0, 2, INTENT_ICON_SIZE, INTENT_ICON_SIZE - 4, 4).fill(fill).stroke(stroke);
      break;
    case 'debuff':
      g.moveTo(half, 0).lineTo(INTENT_ICON_SIZE, half).lineTo(half, INTENT_ICON_SIZE).lineTo(0, half).closePath().fill(fill).stroke(stroke);
      break;
    case 'none':
    default:
      g.circle(half, half, half - 2).fill(fill).stroke(stroke);
      break;
  }
  container.addChild(g);
  const label =
    type === 'none' ? '?' : type === 'attack' ? `Attack ${value}` : type === 'block' ? `Block ${value}` : type === 'debuff' ? `Debuff ${value}` : `? ${value}`;
  const valueText = new PIXI.Text({
    text: label,
    style: { fontFamily: 'system-ui', fontSize: 10, fill: 0xffdd88, fontWeight: 'bold' },
  });
  valueText.x = INTENT_ICON_SIZE + 4;
  valueText.y = 2;
  container.addChild(valueText);
}

export interface FloatingNumber {
  type: 'damage' | 'block';
  value: number;
  x: number;
  y: number;
  enemyIndex?: number;
  /** B20: Timestamp when added for expiry (ms). */
  addedAt?: number;
}

export interface CombatViewContext {
  stage: PIXI.Container;
  state: GameState;
  w: number;
  h: number;
  padding: number;
  hoveredCardIndex: number | null;
  selectedCardId: string | null;
  selectedCardIndex: number | null;
  hoveredEnemyIndex: number | null;
  floatingNumbers: FloatingNumber[];
  showingEnemyTurn: boolean;
  getCardCost(cardId: string): number;
  getCardName(cardId: string): string;
  getCardEffectDescription(cardId: string): string;
  onCardClick(cardId: string, handIndex: number): void;
  onEnemyTargetClick(enemyIndex: number): void;
  onCardPointerOver(handIndex: number): void;
  onCardPointerOut(): void;
  onEnemyPointerOver(enemyIndex: number): void;
  onEnemyPointerOut(): void;
  cardSprites: Map<string, PIXI.Container>;
  markForCheck(): void;
  /** B13/B14: Optional combat bg and character textures; null = use Graphics placeholder. */
  getCombatBgTexture?: () => PIXI.Texture | null;
  getPlayerTexture?: () => PIXI.Texture | null;
  getEnemyTexture?: (id: string) => PIXI.Texture | null;
  /** B15: Per-card hover influence 0..1 for smooth lift/scale; same length as hand. If absent, use binary from hoveredCardIndex/selectedCardId. */
  hoverLerp?: number[];
  /** When true, player sprite shows shield animation instead of static texture. */
  shieldAnimationPlaying?: boolean;
  getShieldVideoTexture?: () => PIXI.Texture | null;
  /** When true, player sprite shows shooting animation (e.g. for strike card). */
  shootingAnimationPlaying?: boolean;
  getShootingTexture?: () => PIXI.Texture | null;
}

const L = COMBAT_LAYOUT;

/** B13: Draw combat background (sprite or dark rect) at zIndex 0. */
function drawCombatBackground(ctx: CombatViewContext): void {
  const { stage, w, h } = ctx;
  const tex = ctx.getCombatBgTexture?.() ?? null;
  if (tex) {
    const bg = new PIXI.Sprite(tex);
    bg.width = w;
    bg.height = h;
    bg.zIndex = 0;
    stage.addChild(bg);
  } else {
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h).fill(0x1a1a2e);
    bg.zIndex = 0;
    stage.addChild(bg);
  }
  stage.sortableChildren = true;
}

/** Draws the player character (sprite if available, else placeholder Graphics) and block-gain flash if any. */
function drawPlayerArea(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerZoneX = w * L.playerZoneXRatio;
  const baselineBottom = h * L.baselineBottomRatio;
  const playerPlaceholderW = L.playerPlaceholderW;
  const playerPlaceholderH = L.playerPlaceholderH;

  const playerContainer = new PIXI.Container();
  playerContainer.x = playerZoneX - playerPlaceholderW / 2;
  playerContainer.y = baselineBottom - playerPlaceholderH;
  const shootingTex = ctx.shootingAnimationPlaying && ctx.getShootingTexture?.() ? ctx.getShootingTexture() : null;
  const shieldTex = ctx.shieldAnimationPlaying && ctx.getShieldVideoTexture?.() ? ctx.getShieldVideoTexture() : null;
  const playerTex = shootingTex ?? shieldTex ?? (ctx.getPlayerTexture?.() ?? null);
  if (playerTex) {
    const sprite = new PIXI.Sprite(playerTex);
    sprite.anchor.set(0.5, 1);
    sprite.x = playerPlaceholderW / 2;
    sprite.y = playerPlaceholderH;
    sprite.width = playerPlaceholderW;
    sprite.height = playerPlaceholderH;
    playerContainer.addChild(sprite);
  } else {
    const playerBody = new PIXI.Graphics();
    playerBody.roundRect(20, 44, 60, 72, 8).fill({ color: 0x3a4a6a }).stroke({ width: 2, color: 0x5a6a8a });
    playerContainer.addChild(playerBody);
    const playerHead = new PIXI.Graphics();
    playerHead.circle(50, 28, 22).fill({ color: 0x4a5a7a }).stroke({ width: 2, color: 0x6a7a9a });
    playerContainer.addChild(playerHead);
  }
  const showBlockFlash = ctx.floatingNumbers.some((f) => f.type === 'block');
  if (showBlockFlash) {
    const blockOverlay = new PIXI.Graphics();
    blockOverlay.roundRect(0, 0, playerPlaceholderW, playerPlaceholderH, L.enemyCornerRadius).fill({ color: 0x44ff88, alpha: 0.3 });
    playerContainer.addChild(blockOverlay);
  }
  stage.addChild(playerContainer);
}

/** Draws HP, block, and energy text below the player character (centered). */
function drawHpText(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerZoneX = w * L.playerZoneXRatio;
  const baselineBottom = h * L.baselineBottomRatio;
  const hpText = new PIXI.Text({
    text: `HP: ${state.playerHp}/${state.playerMaxHp}  Block: ${state.playerBlock}  Energy: ${state.energy}/${state.maxEnergy}`,
    style: { fontFamily: 'system-ui', fontSize: 18, fill: 0xeeeeee },
  });
  hpText.anchor.set(0.5, 0);
  hpText.x = playerZoneX;
  hpText.y = baselineBottom + 8;
  stage.addChild(hpText);
}

/** Draws the hand container with arc layout, card visuals, hover/selection, and pointer handlers. */
function drawHand(ctx: CombatViewContext): PIXI.Container {
  const { state, stage, w, padding } = ctx;
  const hand = state.hand;
  const playerY = ctx.h - L.playerYOffsetFromBottom;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const cardSpacing = cardWidth * L.overlapRatio;
  const totalHandWidth = (hand.length - 1) * cardSpacing + cardWidth;
  const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
  const handY = playerY - cardHeight - 20;
  const center = (hand.length - 1) / 2;
  const hoverLift = L.hoverLift;
  const hoverScale = L.hoverScale;
  const arcAmplitude = L.arcAmplitude;
  const cardRotationRad = L.cardRotationRad;

  const handContainer = new PIXI.Container();
  handContainer.sortableChildren = true;
  ctx.cardSprites.clear();

  const useHoverLerp = ctx.hoverLerp && ctx.hoverLerp.length === hand.length;

  for (let i = 0; i < hand.length; i++) {
    const cardId = hand[i];
    const cost = ctx.getCardCost(cardId);
    const playable = state.energy >= cost;
    const isHovered = ctx.hoveredCardIndex === i;
    const isSelected = ctx.selectedCardIndex === i;
    const lerp = useHoverLerp ? (ctx.hoverLerp![i] ?? 0) : ((isHovered && playable) || isSelected ? 1 : 0);
    const applyHover = lerp > 0.5;

    const arcNorm = hand.length > 1 ? (i - center) / (hand.length - 1) : 0;
    const baseY = handY + arcAmplitude * (4 * arcNorm * arcNorm);
    const rot = (i - center) * cardRotationRad;
    const cardX = startX + i * cardSpacing;
    const cardY = baseY - lerp * hoverLift;

    const container = new PIXI.Container();
    container.sortableChildren = true;

    const shadow = new PIXI.Graphics();
    shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x000000, alpha: applyHover ? 0.35 : 0.18 });
    container.addChild(shadow);

    const borderColor = isSelected ? 0xe8c060 : playable ? 0x6a6a8a : 0x4a4a5a;
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x2a2a4a })
      .stroke({ width: 2, color: borderColor });
    container.addChild(bg);

    const costRadius = L.costRadius;
    const costBg = new PIXI.Graphics();
    const costColor = playable ? 0x88ff88 : 0xff8888;
    costBg.circle(costRadius + 6, costRadius + 6, costRadius).fill({ color: 0x1a1a2a }).stroke({ width: 1.5, color: costColor });
    container.addChild(costBg);
    const costText = new PIXI.Text({
      text: String(cost),
      style: { fontFamily: 'system-ui', fontSize: 14, fill: costColor },
    });
    costText.anchor.set(0.5, 0.5);
    costText.x = costRadius + 6;
    costText.y = costRadius + 6;
    container.addChild(costText);

    const name = ctx.getCardName(cardId);
    const nameDisplay = name.length > 12 ? name.slice(0, 12) + '…' : name;
    const nameText = new PIXI.Text({
      text: nameDisplay,
      style: { fontFamily: 'system-ui', fontSize: 12, fill: 0xcccccc },
    });
    nameText.x = 8;
    nameText.y = 28;
    container.addChild(nameText);

    const artTop = 48;
    const artHeight = 50;
    const artArea = new PIXI.Graphics();
    artArea.roundRect(8, artTop, cardWidth - 16, artHeight, 4).fill({ color: 0x1e1e32 });
    container.addChild(artArea);

    const effectDesc = ctx.getCardEffectDescription(cardId);
    const effectText = new PIXI.Text({
      text: effectDesc.slice(0, 22) + (effectDesc.length > 22 ? '…' : ''),
      style: { fontFamily: 'system-ui', fontSize: 10, fill: 0xaaaaaa },
    });
    effectText.x = 8;
    effectText.y = cardHeight - 22;
    container.addChild(effectText);

    container.pivot.set(cardWidth / 2, cardHeight);
    container.x = cardX;
    container.y = cardY;
    container.rotation = rot;
    container.scale.set(1 + lerp * (hoverScale - 1));
    container.zIndex = applyHover ? 100 : i;
    if (!playable) container.alpha = 0.6;

    container.eventMode = 'static';
    container.cursor = playable ? 'pointer' : 'not-allowed';
    const idx = i;
    container.on('pointerover', () => { ctx.onCardPointerOver(idx); });
    container.on('pointerout', () => ctx.onCardPointerOut());
    container.on('pointerdown', () => ctx.onCardClick(cardId, idx));

    handContainer.addChild(container);
    ctx.cardSprites.set(`${cardId}-${idx}`, container);
  }

  return handContainer;
}

/** Draws enemy placeholders (right side), highlights for targeting/hover, hit flash, and hand on top; returns layout for arrow. */
function drawEnemies(ctx: CombatViewContext, handContainer: PIXI.Container): {
  enemyStartY: number;
  ex: number;
  handLength: number;
  center: number;
  startX: number;
  cardSpacing: number;
  handY: number;
  arcAmplitude: number;
  hoverLift: number;
} {
  const { state, stage, w, padding } = ctx;
  const playerZoneX = w * L.playerZoneXRatio;
  const enemyZoneStart = w * L.enemyZoneStartRatio;
  const baselineBottom = ctx.h * L.baselineBottomRatio;
  const playerY = ctx.h - L.playerYOffsetFromBottom;
  const enemyPlaceholderW = L.enemyPlaceholderW;
  const enemyPlaceholderH = L.enemyPlaceholderH;
  const enemyGap = L.enemyGap;
  const hand = state.hand;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const cardSpacing = cardWidth * L.overlapRatio;
  const totalHandWidth = (hand.length - 1) * cardSpacing + cardWidth;
  const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
  const handY = playerY - cardHeight - 20;
  const center = (hand.length - 1) / 2;

  const targetingMode = ctx.selectedCardId != null;
  const enemyStartY = baselineBottom - enemyPlaceholderH;
  const enemies = state.enemies;
  const totalEnemyWidth = enemies.length * enemyPlaceholderW + (enemies.length - 1) * enemyGap;
  const ex = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;

  const sizeScale = (size: 'small' | 'medium' | 'large' | undefined): number =>
    size === 'small' ? 0.8 : size === 'large' ? 1.2 : 1;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const isAlive = e.hp > 0;
    const isValidTarget = targetingMode && isAlive;
    const isHoveredEnemy = targetingMode && ctx.hoveredEnemyIndex === i && isAlive;
    const container = new PIXI.Container();
    const enemyTex = ctx.getEnemyTexture?.(e.id) ?? null;
    if (enemyTex) {
      const sprite = new PIXI.Sprite(enemyTex);
      sprite.width = enemyPlaceholderW;
      sprite.height = enemyPlaceholderH;
      container.addChild(sprite);
    } else {
      const placeholder = new PIXI.Graphics();
      placeholder.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius)
        .fill({ color: 0x4a3030 })
        .stroke({ width: isValidTarget ? 4 : 2, color: isHoveredEnemy ? 0xffcc44 : isValidTarget ? 0xcc8866 : 0x8a4a4a });
      container.addChild(placeholder);
    }
    if (enemyTex && (isValidTarget || isHoveredEnemy)) {
      const stroke = new PIXI.Graphics();
      stroke.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius)
        .stroke({ width: isValidTarget ? 4 : 2, color: isHoveredEnemy ? 0xffcc44 : 0xcc8866 });
      container.addChild(stroke);
    }
    if (isValidTarget) {
      const highlight = new PIXI.Graphics();
      highlight.roundRect(-3, -3, enemyPlaceholderW + 6, enemyPlaceholderH + 6, 12)
        .stroke({ width: isHoveredEnemy ? 3 : 2, color: isHoveredEnemy ? 0xffdd66 : 0xe8c060, alpha: 0.9 });
      container.addChild(highlight);
    }
    const wasJustHit = ctx.floatingNumbers.some((f) => f.type === 'damage' && f.enemyIndex === i);
    const baseEnemyX = ex + i * (enemyPlaceholderW + enemyGap) - enemyPlaceholderW / 2;
    const baseEnemyY = enemyStartY;
    if (wasJustHit) {
      const hitOverlay = new PIXI.Graphics();
      hitOverlay.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius).fill({ color: 0xff4444, alpha: 0.35 });
      container.addChild(hitOverlay);
    }
    const hitPop = wasJustHit ? 1.06 : 1;
    const scale = sizeScale(e.size) * (isHoveredEnemy ? 1.05 : 1) * hitPop;
    container.pivot.set(enemyPlaceholderW / 2, enemyPlaceholderH / 2);
    container.x = baseEnemyX + enemyPlaceholderW / 2;
    container.y = baseEnemyY + enemyPlaceholderH / 2;
    container.scale.set(scale);
    const nameT = new PIXI.Text({
      text: e.name,
      style: { fontFamily: 'system-ui', fontSize: 13, fill: 0xeeeeee },
    });
    nameT.x = 8;
    nameT.y = 8;
    container.addChild(nameT);
    const hpT = new PIXI.Text({
      text: `HP: ${e.hp}/${e.maxHp}  Block: ${e.block}`,
      style: { fontFamily: 'system-ui', fontSize: 11, fill: 0xcccccc },
    });
    hpT.x = 8;
    hpT.y = 26;
    container.addChild(hpT);
    if (e.intent) {
      drawIntentIcon(container, e.intent.type, e.intent.value, 8, 46);
    } else {
      drawIntentIcon(container, 'none', 0, 8, 46);
    }
    const vulnerableStacks = (e as { vulnerableStacks?: number }).vulnerableStacks ?? 0;
    const weakStacks = (e as { weakStacks?: number }).weakStacks ?? 0;
    let statusY = 6;
    if (vulnerableStacks > 0) {
      const vW = 32;
      const vBg = new PIXI.Graphics();
      vBg.roundRect(enemyPlaceholderW - vW - 4, statusY, vW, 14, 3).fill({ color: 0x9944aa, alpha: 0.9 }).stroke({ width: 1, color: 0xcc66dd });
      container.addChild(vBg);
      const vText = new PIXI.Text({
        text: `Vuln ${vulnerableStacks}`,
        style: { fontFamily: 'system-ui', fontSize: 9, fill: 0xffffff, fontWeight: 'bold' },
      });
      vText.x = enemyPlaceholderW - vW - 2;
      vText.y = statusY + 1;
      container.addChild(vText);
      statusY += 18;
    }
    if (weakStacks > 0) {
      const wW = 28;
      const wBg = new PIXI.Graphics();
      wBg.roundRect(enemyPlaceholderW - wW - 4, statusY, wW, 14, 3).fill({ color: 0x6a6a44, alpha: 0.9 }).stroke({ width: 1, color: 0x999966 });
      container.addChild(wBg);
      const wText = new PIXI.Text({
        text: `Weak ${weakStacks}`,
        style: { fontFamily: 'system-ui', fontSize: 9, fill: 0xffffff, fontWeight: 'bold' },
      });
      wText.x = enemyPlaceholderW - wW - 2;
      wText.y = statusY + 1;
      container.addChild(wText);
    }
    if (isValidTarget) {
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.hitArea = new PIXI.Rectangle(0, 0, enemyPlaceholderW, enemyPlaceholderH);
      const idx = i;
      container.on('pointerover', () => { ctx.onEnemyPointerOver(idx); });
      container.on('pointerout', () => ctx.onEnemyPointerOut());
      container.on('pointerdown', () => ctx.onEnemyTargetClick(idx));
    }
    stage.addChild(container);
  }

  stage.addChild(handContainer);
  return {
    enemyStartY,
    ex,
    handLength: hand.length,
    center,
    startX,
    cardSpacing,
    handY,
    arcAmplitude: L.arcAmplitude,
    hoverLift: L.hoverLift,
  };
}

/** Draws the targeting arrow from selected card to hovered enemy when in targeting mode. */
function drawTargetingArrow(ctx: CombatViewContext, layout: ReturnType<typeof drawEnemies>): void {
  const { state, stage } = ctx;
  const { selectedCardId, hoveredEnemyIndex } = ctx;
  if (selectedCardId == null || hoveredEnemyIndex == null) return;
  const enemies = state.enemies;
  if (hoveredEnemyIndex >= enemies.length || enemies[hoveredEnemyIndex].hp <= 0) return;

  const hand = state.hand;
  const selIdx = ctx.selectedCardIndex != null && ctx.selectedCardIndex < hand.length ? ctx.selectedCardIndex : hand.indexOf(selectedCardId);
  if (selIdx < 0) return;

  const L2 = COMBAT_LAYOUT;
  const enemyPlaceholderW = L2.enemyPlaceholderW;
  const enemyPlaceholderH = L2.enemyPlaceholderH;
  const enemyGap = L2.enemyGap;

  const arcN = layout.handLength > 1 ? (selIdx - layout.center) / (layout.handLength - 1) : 0;
  const fromX = layout.startX + selIdx * layout.cardSpacing;
  const fromY = layout.handY + layout.arcAmplitude * (4 * arcN * arcN) - layout.hoverLift;
  const toX = layout.ex + hoveredEnemyIndex * (enemyPlaceholderW + enemyGap);
  const toY = layout.enemyStartY + enemyPlaceholderH / 2;

  const arrow = new PIXI.Graphics();
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const trim = 24;
  const startXArrow = fromX + ux * trim;
  const startYArrow = fromY + uy * trim;
  const endXArrow = toX - ux * trim;
  const endYArrow = toY - uy * trim;
  arrow.moveTo(startXArrow, startYArrow).lineTo(endXArrow, endYArrow);
  arrow.stroke({ width: 3, color: 0xe8c060, alpha: 0.85 });
  const headLen = 14;
  const headW = 8;
  const hx = endXArrow - ux * headLen;
  const hy = endYArrow - uy * headLen;
  const perpX = -uy;
  const perpY = ux;
  arrow.moveTo(endXArrow, endYArrow)
    .lineTo(hx + perpX * headW, hy + perpY * headW)
    .moveTo(endXArrow, endYArrow)
    .lineTo(hx - perpX * headW, hy - perpY * headW);
  arrow.stroke({ width: 3, color: 0xe8c060, alpha: 0.85 });
  stage.addChild(arrow);
}

/** Draws floating damage (red) and block (green) numbers at their positions. */
function drawFloatingNumbers(ctx: CombatViewContext): void {
  const { stage } = ctx;
  for (const fn of ctx.floatingNumbers) {
    const text = new PIXI.Text({
      text: fn.type === 'damage' ? `-${fn.value}` : `+${fn.value}`,
      style: {
        fontFamily: 'system-ui',
        fontSize: fn.type === 'damage' ? 22 : 18,
        fill: fn.type === 'damage' ? 0xff6666 : 0x66ff88,
        fontWeight: 'bold',
      },
    });
    text.anchor.set(0.5, 0.5);
    text.x = fn.x;
    text.y = fn.y;
    stage.addChild(text);
  }
}

/** Draws the "Enemy turn" overlay when showingEnemyTurn is true. */
function drawEnemyTurnBanner(ctx: CombatViewContext): void {
  const { stage, w, h } = ctx;
  if (!ctx.showingEnemyTurn) return;
  const banner = new PIXI.Graphics();
  banner.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.5 });
  stage.addChild(banner);
  const turnText = new PIXI.Text({
    text: 'Enemy turn',
    style: { fontFamily: 'system-ui', fontSize: 36, fill: 0xffcc44, fontWeight: 'bold' },
  });
  turnText.anchor.set(0.5, 0.5);
  turnText.x = w / 2;
  turnText.y = h / 2;
  stage.addChild(turnText);
}

/**
 * Draws the full combat view onto the given stage (player, HP, hand, enemies, arrow, floating numbers, banner).
 * Component builds context and calls this; renderer only draws and wires pointer events to context callbacks.
 */
export function drawCombatView(context: CombatViewContext): void {
  drawCombatBackground(context);
  drawPlayerArea(context);
  drawHpText(context);
  const handContainer = drawHand(context);
  const layout = drawEnemies(context, handContainer);
  drawTargetingArrow(context, layout);
  drawFloatingNumbers(context);
  drawEnemyTurnBanner(context);
  context.markForCheck();
}
