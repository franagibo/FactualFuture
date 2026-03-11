/**
 * Renders the combat scene (player, hand, enemies, targeting, floating numbers, banner) with PixiJS.
 * Uses a context object so the component owns state and event handlers.
 */
import * as PIXI from 'pixi.js';
import type { GameState, EnemyIntent } from '../../../engine/types';
import { COMBAT_LAYOUT, getCombatSlotBounds, getEnemyLayout } from '../constants/combat-layout.constants';
import { ENEMY_ANIMATION_TIMING } from '../constants/combat-timing.constants';
import type { FloatingNumber } from '../constants/combat-types';
import { getHandLayout, type HandLayoutResult } from '../constants/hand-layout';

/** Re-export for consumers that import from the renderer. */
export type { FloatingNumber };

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
    case 'vulnerable':
      g.rect(2, 2, INTENT_ICON_SIZE - 4, INTENT_ICON_SIZE - 4).fill(fill).stroke(stroke);
      break;
    case 'none':
    default:
      g.circle(half, half, half - 2).fill(fill).stroke(stroke);
      break;
  }
  container.addChild(g);
  const label =
    type === 'none' ? '?' : type === 'attack' ? `Attack ${value}` : type === 'block' ? `Block ${value}` : type === 'debuff' ? `Weak ${value}` : type === 'vulnerable' ? `Vuln ${value}` : `? ${value}`;
  const valueText = new PIXI.Text({
    text: label,
    style: { fontFamily: 'system-ui', fontSize: 10, fill: 0xffdd88, fontWeight: 'bold' },
  });
  valueText.x = INTENT_ICON_SIZE + L.intentLabelOffset;
  valueText.y = 2;
  container.addChild(valueText);
}

export interface CombatViewContext {
  stage: PIXI.Container;
  state: GameState;
  w: number;
  h: number;
  padding: number;
  hoveredCardIndex: number | null;
  cardInteractionState?: 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning';
  cardInteractionCardIndex: number | null;
  cardInteractionCardId: string | null;
  hoveredEnemyIndex: number | null;
  floatingNumbers: FloatingNumber[];
  showingEnemyTurn: boolean;
  getCardCost(cardId: string): number;
  getCardName(cardId: string): string;
  getCardEffectDescription(cardId: string): string;
  onCardClick(cardId: string, handIndex: number): void;
  onCardPointerDown?(cardId: string, handIndex: number, stageX: number, stageY: number): void;
  onEnemyTargetClick(enemyIndex: number): void;
  onCardPointerOver(handIndex: number): void;
  onCardPointerOut(): void;
  onEnemyPointerOver(enemyIndex: number): void;
  onEnemyPointerOut(): void;
  cardSprites: Map<string, PIXI.Container>;
  markForCheck(): void;
  /** B13/B14: Optional combat bg and character textures; null = use Graphics placeholder. */
  getCombatBgTexture?: () => PIXI.Texture | null;
  getHpIconTexture?: () => PIXI.Texture | null;
  getBlockIconTexture?: () => PIXI.Texture | null;
  getPlayerTexture?: () => PIXI.Texture | null;
  getEnemyTexture?: (id: string) => PIXI.Texture | null;
  /** Placeholder enemy: variant 1–3 per index; hurt/dying start times (ms); animation texture getter. */
  enemyVariants?: number[];
  enemyHurtStartMs?: (number | null)[];
  enemyDyingStartMs?: (number | null)[];
  getEnemyAnimationTexture?: (
    variant: number,
    animation: 'idle' | 'hurt' | 'dying',
    nowMs: number,
    startMs?: number
  ) => PIXI.Texture | null;
  /** Optional card art texture lookup; if absent or null, a solid placeholder is shown. */
  getCardArtTexture?: (cardId: string) => PIXI.Texture | null;
  /** B15: Per-card hover influence 0..1 for smooth lift/scale; same length as hand. If absent, use binary from hoveredCardIndex/cardInteractionCardIndex. */
  hoverLerp?: number[];
  /** Lerped per-card spread offset X for smooth neighbor movement; same length as hand. If absent, use layout spreadOffsetX. */
  spreadLerp?: number[];
  /** When true, player sprite shows shield animation instead of static texture. */
  shieldAnimationPlaying?: boolean;
  getShieldVideoTexture?: () => PIXI.Texture | null;
  /** When true, player sprite shows shooting animation (e.g. for strike card). */
  shootingAnimationPlaying?: boolean;
  getShootingTexture?: () => PIXI.Texture | null;
  /** When true, player sprite shows chibi slashing animation (strike card). */
  slashingAnimationPlaying?: boolean;
  getSlashingTexture?: () => PIXI.Texture | null;
  /** Text scale for card and overlay fonts (default 1). */
  textScale?: number;
  /** When 'off', floating numbers and hit flashes are not drawn. */
  vfxIntensity?: 'full' | 'reduced' | 'off';
  /** Drag-to-target: card is being dragged toward an enemy. */
  isDraggingCard?: boolean;
  dragCardId?: string | null;
  dragHandIndex?: number | null;
  dragScreenX?: number;
  dragScreenY?: number;
  /** True when the dragged card actually targets an enemy (attack, debuff, etc.). */
  dragIsTargetingEnemy?: boolean;
  /** Returning animation: 0..1 progress (ease-in). */
  returnProgress?: number | null;
  returnStartX?: number;
  returnStartY?: number;
  getHandLayout?: (count: number, hoveredIndex: number | null) => HandLayoutResult;
}

const L = COMBAT_LAYOUT;
const INTENT_ICON_SIZE = L.intentIconSize;
const HP_BLOCK_ENERGY_ICON_SIZE = L.hpBlockEnergyIconSize;
const HP_BLOCK_ENERGY_GAP = L.hpBlockEnergyGap;

function scaledFontSize(base: number, ctx: CombatViewContext): number {
  const scale = ctx.textScale ?? 1;
  return Math.round(base * scale);
}

/** Draws a neon/glow border (Slay the Spire style) on a Graphics. Multiple stroked layers for glow. */
function drawNeonBorder(
  g: PIXI.Graphics,
  cardWidth: number,
  cardHeight: number,
  cornerRadius: number,
  isSelected: boolean
): void {
  const color = isSelected ? L.neonBorderSelectedColor : L.neonBorderHoverColor;
  const widths = isSelected ? L.neonBorderSelectedWidths : L.neonBorderHoverWidths;
  const alphas = isSelected ? L.neonBorderSelectedAlphas : L.neonBorderHoverAlphas;
  g.clear();
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const alpha = alphas[i] ?? 1;
    g.roundRect(0, 0, cardWidth, cardHeight, cornerRadius)
      .stroke({ width: w, color, alpha });
  }
}

/** B13: Draw combat background (sprite or dark rect) at zIndex 0. */
function drawCombatBackground(ctx: CombatViewContext): void {
  const { stage, w, h } = ctx;
  const bgBounds = getCombatSlotBounds('combatBg', w, h);
  const tex = ctx.getCombatBgTexture?.() ?? null;
  if (tex) {
    const bg = new PIXI.Sprite(tex);
    bg.x = bgBounds.x;
    bg.y = bgBounds.y;
    bg.width = bgBounds.width;
    bg.height = bgBounds.height;
    bg.zIndex = 0;
    stage.addChild(bg);
  } else {
    const bg = new PIXI.Graphics();
    bg.rect(bgBounds.x, bgBounds.y, bgBounds.width, bgBounds.height).fill(0x1a1a2e);
    bg.zIndex = 0;
    stage.addChild(bg);
  }
  stage.sortableChildren = true;
}

/** Draws the player character (sprite if available, else placeholder Graphics) and block-gain flash if any. */
function drawPlayerArea(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerBounds = getCombatSlotBounds('player', w, h);
  const playerPlaceholderW = playerBounds.width || L.playerPlaceholderW;
  const playerPlaceholderH = playerBounds.height || L.playerPlaceholderH;

  const playerContainer = new PIXI.Container();
  playerContainer.x = playerBounds.x;
  playerContainer.y = playerBounds.y;
  const slashingTex = ctx.slashingAnimationPlaying && ctx.getSlashingTexture?.() ? ctx.getSlashingTexture() : null;
  const shootingTex = ctx.shootingAnimationPlaying && ctx.getShootingTexture?.() ? ctx.getShootingTexture() : null;
  const shieldTex = ctx.shieldAnimationPlaying && ctx.getShieldVideoTexture?.() ? ctx.getShieldVideoTexture() : null;
  const playerTex = slashingTex ?? shootingTex ?? shieldTex ?? (ctx.getPlayerTexture?.() ?? null);
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
  const showBlockFlash = ctx.vfxIntensity !== 'off' && ctx.floatingNumbers.some((f) => f.type === 'block');
  if (showBlockFlash) {
    const blockOverlay = new PIXI.Graphics();
    blockOverlay.roundRect(0, 0, playerPlaceholderW, playerPlaceholderH, L.enemyCornerRadius).fill({ color: 0x44ff88, alpha: 0.3 });
    playerContainer.addChild(blockOverlay);
  }
  stage.addChild(playerContainer);
}

/** Draws HP, block, and energy as icons with numbers centered (Slay the Spire style). */
function drawHpBlockEnergyIcons(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const hpBounds = getCombatSlotBounds('hpBlockEnergy', w, h);
  const centerX = hpBounds.x + L.playerPlaceholderW / 2;
  const baseY = hpBounds.y;
  const iconSize = HP_BLOCK_ENERGY_ICON_SIZE;
  const gap = HP_BLOCK_ENERGY_GAP;
  const fontSize = scaledFontSize(16, ctx);

  const drawIconWithNumber = (x: number, texture: PIXI.Texture | null, label: string, fill = 0xffffff): void => {
    const container = new PIXI.Container();
    container.x = x;
    container.y = baseY;
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0);
      sprite.width = iconSize;
      sprite.height = iconSize;
      container.addChild(sprite);
    } else {
      const bg = new PIXI.Graphics();
      bg.circle(0, iconSize / 2, iconSize / 2).fill(0x333344);
      container.addChild(bg);
    }
    const text = new PIXI.Text({
      text: label,
      style: { fontFamily: 'system-ui', fontSize, fill, fontWeight: 'bold' },
    });
    text.anchor.set(0.5, 0.5);
    text.x = 0;
    text.y = iconSize / 2;
    container.addChild(text);
    stage.addChild(container);
  };

  const hpTex = ctx.getHpIconTexture?.() ?? null;
  const blockTex = ctx.getBlockIconTexture?.() ?? null;
  drawIconWithNumber(centerX - gap, hpTex, `${state.playerHp}/${state.playerMaxHp}`);
  drawIconWithNumber(centerX, blockTex, String(state.playerBlock));
  const energyContainer = new PIXI.Container();
  energyContainer.x = centerX + gap;
  energyContainer.y = baseY;
  const energyBg = new PIXI.Graphics();
  energyBg.roundRect(-iconSize / 2, 0, iconSize, iconSize, 8).fill(0x2a3544).stroke({ width: 2, color: 0x88aacc });
  energyContainer.addChild(energyBg);
  const energyText = new PIXI.Text({
    text: `${state.energy}/${state.maxEnergy}`,
    style: { fontFamily: 'system-ui', fontSize, fill: 0xeeeeee, fontWeight: 'bold' },
  });
  energyText.anchor.set(0.5, 0.5);
  energyText.x = 0;
  energyText.y = iconSize / 2;
  energyContainer.addChild(energyText);
  stage.addChild(energyContainer);
}

/** Draws the hand container with arc layout, card visuals, hover/selection, and pointer handlers. */
function drawHand(ctx: CombatViewContext): PIXI.Container {
  const { state, stage, w, h } = ctx;
  const hand = state.hand;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const hoverLift = L.hoverLift;
  const hoverScale = L.hoverScale;

  const layout = ctx.getHandLayout
    ? ctx.getHandLayout(hand.length, ctx.hoveredCardIndex)
    : getHandLayout(hand.length, w, h, ctx.hoveredCardIndex);

  const handContainer = new PIXI.Container();
  handContainer.sortableChildren = true;
  ctx.cardSprites.clear();

  const useHoverLerp = ctx.hoverLerp && ctx.hoverLerp.length === hand.length;
  const isPressedOrDragging = (idx: number) =>
    ctx.cardInteractionCardIndex === idx &&
    (ctx.cardInteractionState === 'pressed' || ctx.cardInteractionState === 'dragging');

  // Yellow neon border (\"selected\") should only show when the card will actually trigger if the mouse is released.
  // For enemy-targeting cards: dragging + hovering a live enemy. For non-target cards: dragging above the play line.
  const isReadyToTrigger = (idx: number, cardId: string): boolean => {
    if (
      ctx.cardInteractionCardIndex !== idx ||
      ctx.cardInteractionCardId == null ||
      ctx.cardInteractionCardId !== cardId
    ) {
      return false;
    }
    if (ctx.cardInteractionState !== 'dragging') return false;
    const requiresEnemy = !!ctx.dragIsTargetingEnemy;
    if (requiresEnemy) {
      return ctx.hoveredEnemyIndex != null;
    }
    const dragY = ctx.dragScreenY;
    if (dragY == null) return false;
    const ratio = L.nonTargetPlayLineRatio;
    const playLineY = h * ratio;
    return dragY < playLineY;
  };

  /** Center-strip hit area; use full card for magnetic hover (resolver runs on document). */
  const hitStripRatio = 1;
  const hitStripX = 0;

  const isReturning = ctx.cardInteractionState === 'returning';
  const returningIndex = ctx.cardInteractionCardIndex;

  for (let i = 0; i < hand.length; i++) {
    if (isReturning && returningIndex === i) continue;
    const cardId = hand[i];
    const cost = ctx.getCardCost(cardId);
    const playable = state.energy >= cost;
    const isHovered = ctx.hoveredCardIndex === i;
    const isSelected = isReadyToTrigger(i, cardId);
    const lerp = useHoverLerp ? (ctx.hoverLerp![i] ?? 0) : (isHovered || isSelected ? 1 : 0);
    const isActive = isHovered || isSelected || lerp > 0.02;
    const applyHover = (isHovered || isSelected) && lerp > 0.5;

    const pos = layout?.positions[i];
    const spreadX = (ctx.spreadLerp && ctx.spreadLerp[i] !== undefined) ? ctx.spreadLerp[i] : (pos?.spreadOffsetX ?? 0);
    const cardX = pos ? pos.x + spreadX : w / 2 + (i - (hand.length - 1) / 2) * cardWidth * L.overlapRatio;
    const cardY = pos ? pos.y : 0;
    const rot = pos?.rotation ?? 0;
    const baseY = pos?.y ?? 0;
    const liftY = (isActive ? lerp * hoverLift : 0);

    const container = new PIXI.Container();
    container.sortableChildren = true;

    const shadow = new PIXI.Graphics();
    shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x000000, alpha: 0.35 });
    shadow.alpha = applyHover ? 1 : 0.18 / 0.35;
    container.addChild(shadow);

    // Card image is the full card (cardId.png or empty_card_template); text and cost are drawn on top.
    const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
    if (cardTex) {
      const cardSprite = new PIXI.Sprite(cardTex);
      cardSprite.width = cardWidth;
      cardSprite.height = cardHeight;
      cardSprite.roundPixels = true;
      container.addChild(cardSprite);
    }

    const neonBorder = new PIXI.Graphics();
    neonBorder.visible = isHovered || isSelected;
    if (neonBorder.visible) {
      drawNeonBorder(neonBorder, cardWidth, cardHeight, L.cardCornerRadius, isSelected);
    }
    container.addChild(neonBorder);

    const costRadius = L.costRadius;
    const costBg = new PIXI.Graphics();
    const costColor = playable ? 0x88ff88 : 0xff8888;
    const costCenter = costRadius + L.costCenterOffset;
    costBg.circle(costCenter, costCenter, costRadius).fill({ color: 0x1a1a2a }).stroke({ width: 2, color: costColor });
    container.addChild(costBg);
    const costFontSize = scaledFontSize(32, ctx);
    const costText = new PIXI.Text({
      text: String(cost),
      style: { fontFamily: 'system-ui', fontSize: costFontSize, fill: costColor },
    });
    costText.anchor.set(0.5, 0.5);
    costText.x = costCenter;
    costText.y = costCenter;
    container.addChild(costText);

    const name = ctx.getCardName(cardId);
    const nameDisplay = name.length > 16 ? name.slice(0, 16) + '…' : name;
    const nameText = new PIXI.Text({
      text: nameDisplay,
      style: { fontFamily: 'system-ui', fontSize: scaledFontSize(28, ctx), fill: 0xeeeeee, fontWeight: 'bold' },
    });
    nameText.x = 24;
    nameText.y = 84;
    container.addChild(nameText);

    const effectDesc = ctx.getCardEffectDescription(cardId);
    if (effectDesc) {
      const fs = scaledFontSize(22, ctx);
      const effectText = new PIXI.Text({
        text: effectDesc,
        style: {
          fontFamily: 'system-ui',
          fontSize: fs,
          fill: 0xcccccc,
          wordWrap: true,
          wordWrapWidth: cardWidth - L.cardTextPadding,
          lineHeight: Math.round(fs * 1.25),
        },
      });
      effectText.x = 24;
      effectText.y = cardHeight - 120;
      container.addChild(effectText);
    }

    container.pivot.set(cardWidth / 2, cardHeight);
    container.x = cardX;
    container.y = cardY - liftY;
    container.rotation = rot;
    container.scale.set(1 + (isActive ? lerp : 0) * (hoverScale - 1));
    container.zIndex = applyHover || (isActive && lerp > 0.5) ? 100 : i;
    container.alpha = playable ? (applyHover ? 1 : 0.92) : 0.6;

    container.eventMode = 'static';
    container.cursor = playable ? 'pointer' : 'not-allowed';
    container.hitArea = new PIXI.Rectangle(hitStripX, 0, cardWidth * hitStripRatio, cardHeight);
    const idx = i;
    container.on('pointerover', () => { ctx.onCardPointerOver(idx); });
    container.on('pointerout', () => ctx.onCardPointerOut());
    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      if (ctx.onCardPointerDown) {
        ctx.onCardPointerDown(cardId, idx, e.global.x, e.global.y);
      } else {
        ctx.onCardClick(cardId, idx);
      }
    });

    handContainer.addChild(container);
    ctx.cardSprites.set(`${cardId}-${idx}`, container);
  }

  return handContainer;
}

/** Draws enemy placeholders (right side), highlights for targeting/hover, hit flash, and hand on top; returns layout for arrow. */
function drawEnemies(ctx: CombatViewContext, handContainer: PIXI.Container): {
  enemyLayout: ReturnType<typeof getEnemyLayout>;
  handLength: number;
  center: number;
  startX: number;
  cardSpacing: number;
  handY: number;
  arcAmplitude: number;
  hoverLift: number;
} {
  const { state, stage, w } = ctx;
  const playerY = ctx.h - L.playerYOffsetFromBottom;
  const enemyLayout = getEnemyLayout(w, ctx.h, state.enemies.length);
  const enemyPlaceholderW = enemyLayout.placeholderW;
  const enemyPlaceholderH = enemyLayout.placeholderH;
  const hand = state.hand;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const cardSpacing = cardWidth * L.overlapRatio;
  const totalHandWidth = (hand.length - 1) * cardSpacing + cardWidth;
  const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
  const handY = playerY - cardHeight + (L.handYOffset ?? 0);
  const center = (hand.length - 1) / 2;

  const targetingMode =
    ctx.isDraggingCard && (ctx.dragIsTargetingEnemy ?? true);
  const enemies = state.enemies;
  const nowMs = performance.now();

  const sizeScale = (size: 'small' | 'medium' | 'large' | undefined): number =>
    size === 'small' ? 0.8 : size === 'large' ? 1.2 : 1;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const isAlive = e.hp > 0;
    const isValidTarget = targetingMode && isAlive;
    const isHoveredEnemy = targetingMode && ctx.hoveredEnemyIndex === i && isAlive;
    const container = new PIXI.Container();
    let enemyTex: PIXI.Texture | null = null;
    const variant = ctx.enemyVariants?.[i];
    const getAnimTex = ctx.getEnemyAnimationTexture;
    if (variant != null && (variant === 1 || variant === 2 || variant === 3) && getAnimTex) {
      const dyingStart = ctx.enemyDyingStartMs?.[i];
      const hurtStart = ctx.enemyHurtStartMs?.[i];
      if (e.hp <= 0) {
        enemyTex = getAnimTex(variant, 'dying', nowMs, dyingStart ?? 0);
      } else if (
        hurtStart != null &&
        nowMs - hurtStart < ENEMY_ANIMATION_TIMING.hurtDurationMs
      ) {
        enemyTex = getAnimTex(variant, 'hurt', nowMs, hurtStart);
      } else {
        enemyTex = getAnimTex(variant, 'idle', nowMs);
      }
    }
    if (enemyTex == null) {
      enemyTex = ctx.getEnemyTexture?.(e.id) ?? null;
    }
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
    const vfxOn = ctx.vfxIntensity !== 'off';
    const centerPos = enemyLayout.getCenter(i);
    if (wasJustHit && vfxOn) {
      const hitOverlay = new PIXI.Graphics();
      hitOverlay.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius).fill({ color: 0xff4444, alpha: 0.35 });
      container.addChild(hitOverlay);
    }
    const hitPop = wasJustHit && vfxOn ? 1.06 : 1;
    const scale = sizeScale(e.size) * (isHoveredEnemy ? 1.06 : 1) * hitPop;
    container.pivot.set(enemyPlaceholderW / 2, enemyPlaceholderH / 2);
    container.x = centerPos.x;
    container.y = centerPos.y;
    container.scale.set(scale);
    const nameT = new PIXI.Text({
      text: e.name,
      style: { fontFamily: 'system-ui', fontSize: scaledFontSize(13, ctx), fill: 0xeeeeee },
    });
    nameT.x = 8;
    nameT.y = 8;
    container.addChild(nameT);
    const hpT = new PIXI.Text({
      text: `HP: ${e.hp}/${e.maxHp}  Block: ${e.block}`,
      style: { fontFamily: 'system-ui', fontSize: scaledFontSize(11, ctx), fill: 0xcccccc },
    });
    hpT.x = 8;
    hpT.y = 26;
    container.addChild(hpT);
    if (e.intent) {
      drawIntentIcon(container, e.intent.type, e.intent.value, L.intentPosX, L.intentPosY);
    } else {
      drawIntentIcon(container, 'none', 0, L.intentPosX, L.intentPosY);
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
        style: { fontFamily: 'system-ui', fontSize: scaledFontSize(9, ctx), fill: 0xffffff, fontWeight: 'bold' },
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
        style: { fontFamily: 'system-ui', fontSize: scaledFontSize(9, ctx), fill: 0xffffff, fontWeight: 'bold' },
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
    enemyLayout,
    handLength: hand.length,
    center,
    startX,
    cardSpacing,
    handY,
    arcAmplitude: L.arcAmplitude,
    hoverLift: L.hoverLift,
  };
}

/** Quadratic Bezier from (x0,y0) to (x2,y2) with control point (x1,y1). */
function bezierPoint(t: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * x1 + t * t * x2,
    y: u * u * y0 + 2 * u * t * y1 + t * t * y2,
  };
}

/** Draws the targeting arrow from the highlighted card in the hand to cursor or enemy (Bezier). Visible as soon as a targetable card is being dragged. */
function drawTargetingArrow(ctx: CombatViewContext, layout: ReturnType<typeof drawEnemies>): void {
  const { state, stage } = ctx;
  const { hoveredEnemyIndex, isDraggingCard, dragCardId, dragScreenX, dragScreenY, cardInteractionCardIndex, getHandLayout } = ctx;
  if (!isDraggingCard || !dragCardId || ctx.dragIsTargetingEnemy === false) return;

  const L2 = COMBAT_LAYOUT;
  const hand = state.hand;
  const idx = cardInteractionCardIndex ?? hand.indexOf(dragCardId);

  let fromX: number;
  let fromY: number;
  if (getHandLayout != null && idx >= 0 && idx < hand.length) {
    const handLayout = getHandLayout(hand.length, idx);
    const pos = handLayout.positions[idx];
    if (pos) {
      fromX = pos.x + (pos.spreadOffsetX ?? 0);
      fromY = pos.y - L2.hoverLift - L2.cardHeight;
    } else {
      fromX = typeof dragScreenX === 'number' ? dragScreenX : stage.width / 2;
      fromY = typeof dragScreenY === 'number' ? dragScreenY - L2.cardHeight : 0;
    }
  } else {
    fromX = typeof dragScreenX === 'number' ? dragScreenX : stage.width / 2;
    fromY = typeof dragScreenY === 'number' ? dragScreenY - L2.cardHeight * 0.5 : 0;
  }

  let toX: number;
  let toY: number;
  const enemies = state.enemies;
  const L2enemyLayout = layout.enemyLayout;
  if (
    hoveredEnemyIndex != null &&
    hoveredEnemyIndex < enemies.length &&
    enemies[hoveredEnemyIndex].hp > 0
  ) {
    const c = L2enemyLayout.getCenter(hoveredEnemyIndex);
    toX = c.x;
    toY = c.y;
  } else {
    toX = typeof dragScreenX === 'number' ? dragScreenX : fromX;
    toY = typeof dragScreenY === 'number' ? dragScreenY : fromY - 80;
  }

  let dx = toX - fromX;
  let dy = toY - fromY;
  let len = Math.hypot(dx, dy) || 1;
  const minLen = 50;
  if (len < minLen && len > 0) {
    const scale = minLen / len;
    toX = fromX + dx * scale;
    toY = fromY + dy * scale;
    dx = toX - fromX;
    dy = toY - fromY;
    len = minLen;
  } else if (len === 0) {
    toY = fromY - minLen;
    dy = -minLen;
    len = minLen;
  }
  const ux = dx / len;
  const uy = dy / len;
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const perpX = -uy * 40;
  const perpY = ux * 40;
  const cpx = midX - perpX;
  const cpy = midY - perpY;

  const arrow = new PIXI.Graphics();
  const segments = 24;
  arrow.moveTo(fromX, fromY);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const p = bezierPoint(t, fromX, fromY, cpx, cpy, toX, toY);
    arrow.lineTo(p.x, p.y);
  }
  arrow.stroke({ width: 3, color: 0xe8c060, alpha: 0.85 });

  const t1 = (segments - 1) / segments;
  const p1 = bezierPoint(t1, fromX, fromY, cpx, cpy, toX, toY);
  const endDirLen = Math.hypot(toX - p1.x, toY - p1.y) || 1;
  const uxEnd = (toX - p1.x) / endDirLen;
  const uyEnd = (toY - p1.y) / endDirLen;
  const headLen = 14;
  const headW = 8;
  const hx = toX - uxEnd * headLen;
  const hy = toY - uyEnd * headLen;
  const perpX2 = -uyEnd;
  const perpY2 = uxEnd;
  arrow.moveTo(toX, toY).lineTo(hx + perpX2 * headW, hy + perpY2 * headW);
  arrow.moveTo(toX, toY).lineTo(hx - perpX2 * headW, hy - perpY2 * headW);
  arrow.stroke({ width: 3, color: 0xe8c060, alpha: 0.85 });
  arrow.zIndex = 550;
  stage.addChild(arrow);
}

const DRAG_CARD_SCALE = 0.38;

/** Draws the dragged card preview at cursor when dragging an attack card. */
function drawDragCardPreview(ctx: CombatViewContext): void {
  const { stage } = ctx;
  if (!ctx.isDraggingCard || ctx.dragCardId == null || typeof ctx.dragScreenX !== 'number' || typeof ctx.dragScreenY !== 'number') return;
  const cardWidth = L.cardWidth * DRAG_CARD_SCALE;
  const cardHeight = L.cardHeight * DRAG_CARD_SCALE;
  const container = new PIXI.Container();
  container.x = ctx.dragScreenX;
  container.y = ctx.dragScreenY;
  container.pivot.set(cardWidth / 2, cardHeight / 2);
  const cardTex = ctx.getCardArtTexture?.(ctx.dragCardId) ?? null;
  if (cardTex) {
    const sprite = new PIXI.Sprite(cardTex);
    sprite.width = cardWidth;
    sprite.height = cardHeight;
    sprite.anchor.set(0, 0);
    container.addChild(sprite);
  } else {
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius * DRAG_CARD_SCALE).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
    container.addChild(bg);
  }
  container.zIndex = 600;
  stage.addChild(container);
}

/** Draws the returning card animating back into the hand (ease-in), with full UI (cost, name, text). */
function drawReturningCard(ctx: CombatViewContext): void {
  const { state, stage } = ctx;
  if (ctx.cardInteractionState !== 'returning' || ctx.returnProgress == null || ctx.getHandLayout == null) return;
  if (ctx.cardInteractionCardIndex == null || ctx.cardInteractionCardId == null) return;
  const progress = Math.min(1, ctx.returnProgress);
  const layout = ctx.getHandLayout(state.hand.length, null);
  const pos = layout.positions[ctx.cardInteractionCardIndex];
  if (!pos) return;

  const targetX = pos.x + (pos.spreadOffsetX ?? 0);
  const targetY = pos.y;
  const targetRot = pos.rotation;
  const fromX = ctx.returnStartX ?? targetX;
  const fromY = ctx.returnStartY ?? targetY;
  const x = fromX + (targetX - fromX) * progress;
  const y = fromY + (targetY - fromY) * progress;
  const rot = 0 + (targetRot - 0) * progress;

  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const container = new PIXI.Container();
  container.pivot.set(cardWidth / 2, cardHeight);
  container.x = x;
  container.y = y;
  container.rotation = rot;
  container.zIndex = 580;

  const cardId = ctx.cardInteractionCardId;

  // Shadow
  const shadow = new PIXI.Graphics();
  shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
    .fill({ color: 0x000000, alpha: 0.35 });
  container.addChild(shadow);

  // Card art background
  const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
  if (cardTex) {
    const sprite = new PIXI.Sprite(cardTex);
    sprite.width = cardWidth;
    sprite.height = cardHeight;
    sprite.roundPixels = true;
    container.addChild(sprite);
  } else {
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x2a2a4a })
      .stroke({ width: 2, color: 0xe8c060 });
    container.addChild(bg);
  }

  // Cost circle and text
  const cost = ctx.getCardCost(cardId);
  const costRadius = L.costRadius;
  const costBg = new PIXI.Graphics();
  const costColor = 0x88ff88;
  const costCenter = costRadius + L.costCenterOffset;
  costBg.circle(costCenter, costCenter, costRadius)
    .fill({ color: 0x1a1a2a })
    .stroke({ width: 2, color: costColor });
  container.addChild(costBg);
  const costFontSize = scaledFontSize(32, ctx);
  const costText = new PIXI.Text({
    text: String(cost),
    style: { fontFamily: 'system-ui', fontSize: costFontSize, fill: costColor },
  });
  costText.anchor.set(0.5, 0.5);
  costText.x = costCenter;
  costText.y = costCenter;
  container.addChild(costText);

  // Name
  const name = ctx.getCardName(cardId);
  const nameDisplay = name.length > 16 ? name.slice(0, 16) + '…' : name;
  const nameText = new PIXI.Text({
    text: nameDisplay,
    style: { fontFamily: 'system-ui', fontSize: scaledFontSize(28, ctx), fill: 0xeeeeee, fontWeight: 'bold' },
  });
  nameText.x = 24;
  nameText.y = 84;
  container.addChild(nameText);

  // Effect description
  const effectDesc = ctx.getCardEffectDescription(cardId);
  if (effectDesc) {
    const fs = scaledFontSize(22, ctx);
    const effectText = new PIXI.Text({
      text: effectDesc,
      style: {
        fontFamily: 'system-ui',
        fontSize: fs,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardWidth - L.cardTextPadding,
        lineHeight: Math.round(fs * 1.25),
      },
    });
    effectText.x = 24;
    effectText.y = cardHeight - 120;
    container.addChild(effectText);
  }

  stage.addChild(container);
}

/** Draws floating damage (red) and block (green) numbers at their positions. Skipped when vfxIntensity is 'off'. */
function drawFloatingNumbers(ctx: CombatViewContext): void {
  if (ctx.vfxIntensity === 'off') return;
  const { stage } = ctx;
  const scale = ctx.vfxIntensity === 'reduced' ? 0.85 : 1;
  const baseDmg = scaledFontSize(22, ctx);
  const baseBlock = scaledFontSize(18, ctx);
  for (const fn of ctx.floatingNumbers) {
    const fontSize = (fn.type === 'damage' ? baseDmg : baseBlock) * scale;
    const text = new PIXI.Text({
      text: fn.type === 'damage' ? `-${fn.value}` : `+${fn.value}`,
      style: {
        fontFamily: 'system-ui',
        fontSize: Math.round(fontSize),
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
    style: { fontFamily: 'system-ui', fontSize: scaledFontSize(36, ctx), fill: 0xffcc44, fontWeight: 'bold' },
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
  drawHpBlockEnergyIcons(context);
  const handContainer = drawHand(context);
  const layout = drawEnemies(context, handContainer);
  drawTargetingArrow(context, layout);
  drawReturningCard(context);
  drawFloatingNumbers(context);
  drawEnemyTurnBanner(context);
}
