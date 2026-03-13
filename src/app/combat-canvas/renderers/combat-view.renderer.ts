/**
 * Renders the combat scene (player, hand, enemies, targeting, floating numbers, banner) with PixiJS.
 * Uses a context object so the component owns state and event handlers.
 *
 * Sections: Types & constants | Intent icon | Neon/enemy borders | Background | Player area |
 * HP/Block/Energy | Hand | Enemies | Targeting arrow | Drag preview & returning card |
 * Floating numbers & banner | drawCombatView (entry).
 */
import * as PIXI from 'pixi.js';
import type { GameState, EnemyIntent, PlantState } from '../../../engine/types';
import { COMBAT_LAYOUT, getCombatSlotBounds, getEnemyLayout, getPlantsLayout } from '../constants/combat-layout.constants';
import { ENEMY_ANIMATION_TIMING } from '../constants/combat-timing.constants';
import type { FloatingNumber } from '../constants/combat-types';
import { getHandLayout, type HandLayoutResult } from '../constants/hand-layout';
import type { PixiPools } from '../pools/pixi-pools';
import type { CardPresentation } from '../models/card-presentation.model';

/** Re-export for consumers that import from the renderer. */
export type { FloatingNumber };

// ---------------------------------------------------------------------------
// Intent icon (attack/block/debuff/vulnerable/none)
// ---------------------------------------------------------------------------

/** B12: Draw a simple intent icon (attack=triangle, block=shield, debuff=diamond, none=?) into container at x,y. Optional addStatus appends to label (e.g. "+ N to draw"). */
function drawIntentIcon(
  ctx: CombatViewContext,
  container: PIXI.Container,
  type: EnemyIntent['type'],
  value: number,
  x: number,
  y: number,
  addStatus?: { cardId: string; count: number; to: 'draw' | 'discard' }[]
): void {
  const gr = g(ctx);
  gr.x = x;
  gr.y = y;
  const c = 0xffaa00;
  const fill = { color: c, alpha: 0.9 };
  const stroke = { width: 1.5, color: 0xffcc66 };
  const half = INTENT_ICON_SIZE / 2;
  switch (type) {
    case 'attack':
      gr.moveTo(half, 0).lineTo(INTENT_ICON_SIZE, INTENT_ICON_SIZE).lineTo(0, INTENT_ICON_SIZE).closePath().fill(fill).stroke(stroke);
      break;
    case 'block':
      gr.roundRect(0, 2, INTENT_ICON_SIZE, INTENT_ICON_SIZE - 4, 4).fill(fill).stroke(stroke);
      break;
    case 'debuff':
      gr.moveTo(half, 0).lineTo(INTENT_ICON_SIZE, half).lineTo(half, INTENT_ICON_SIZE).lineTo(0, half).closePath().fill(fill).stroke(stroke);
      break;
    case 'vulnerable':
      gr.rect(2, 2, INTENT_ICON_SIZE - 4, INTENT_ICON_SIZE - 4).fill(fill).stroke(stroke);
      break;
    case 'none':
    default:
      gr.circle(half, half, half - 2).fill(fill).stroke(stroke);
      break;
  }
  container.addChild(gr);
  let label =
    type === 'none' ? '?' : type === 'attack' ? `Attack ${value}` : type === 'block' ? `Block ${value}` : type === 'debuff' ? `Weak ${value}` : type === 'vulnerable' ? `Vuln ${value}` : `? ${value}`;
  if (addStatus?.length) {
    const n = addStatus.reduce((s, a) => s + a.count, 0);
    const to = addStatus[0].to === 'draw' ? 'draw' : 'discard';
    label += ` +${n} to ${to}`;
  }
  const valueText = t(ctx);
  valueText.text = label;
  valueText.style = { fontFamily: 'system-ui', fontSize: 10, fill: 0xffdd88, fontWeight: 'bold' };
  valueText.x = INTENT_ICON_SIZE + L.intentLabelOffset;
  valueText.y = 2;
  container.addChild(valueText);
}

// ---------------------------------------------------------------------------
// Combat view context types
// ---------------------------------------------------------------------------

/** Hand/cards subset of combat context for readability. */
export interface CombatViewHandContext {
  hoveredCardIndex: number | null;
  cardInteractionState?: 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning';
  cardInteractionCardIndex: number | null;
  cardInteractionCardId: string | null;
  getHandLayout?: (count: number, hoveredIndex: number | null) => HandLayoutResult;
  spreadLerp?: number[];
  hoverLerp?: number[];
  /** When set and length matches hand, drawHand uses current position/rotation/scale from these (target-based animation). */
  handPresentations?: CardPresentation[];
  cardSprites: Map<string, PIXI.Container>;
  getCardArtTexture?: (cardId: string) => PIXI.Texture | null;
  isDraggingCard?: boolean;
  dragCardId?: string | null;
  dragHandIndex?: number | null;
  dragScreenX?: number;
  dragScreenY?: number;
  dragIsTargetingEnemy?: boolean;
  returnProgress?: number | null;
  returnStartX?: number;
  returnStartY?: number;
}

/** Player subset of combat context. */
export interface CombatViewPlayerContext {
  getPlayerTexture?: () => PIXI.Texture | null;
  shieldAnimationPlaying?: boolean;
  getShieldVideoTexture?: () => PIXI.Texture | null;
  shootingAnimationPlaying?: boolean;
  getShootingTexture?: () => PIXI.Texture | null;
  slashingAnimationPlaying?: boolean;
  getSlashingTexture?: () => PIXI.Texture | null;
  onPlayerSpriteCreated?: (sprite: PIXI.Sprite) => void;
}

/** Enemies subset of combat context. */
export interface CombatViewEnemiesContext {
  enemyVariants?: number[];
  enemyHurtStartMs?: (number | null)[];
  enemyDyingStartMs?: (number | null)[];
  getEnemyAnimationTexture?: (
    variant: number,
    animation: 'idle' | 'hurt' | 'dying',
    nowMs: number,
    startMs?: number
  ) => PIXI.Texture | null;
  getEnemyTexture?: (id: string) => PIXI.Texture | null;
  hoveredEnemyIndex: number | null;
  onEnemySpriteCreated?: (index: number, sprite: PIXI.Sprite) => void;
}

export interface CombatViewContext {
  stage: PIXI.Container;
  state: GameState;
  w: number;
  h: number;
  padding: number;
  /** Grouped hand state (preferred). Falls back to flat props for backward compat. */
  hand?: CombatViewHandContext;
  /** Grouped player state (preferred). */
  player?: CombatViewPlayerContext;
  /** Grouped enemies state (preferred). */
  enemies?: CombatViewEnemiesContext;
  /** @deprecated Use hand.hoveredCardIndex */
  hoveredCardIndex: number | null;
  /** @deprecated Use hand.cardInteractionState */
  cardInteractionState?: 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning';
  /** @deprecated Use hand.cardInteractionCardIndex */
  cardInteractionCardIndex: number | null;
  /** @deprecated Use hand.cardInteractionCardId */
  cardInteractionCardId: string | null;
  /** @deprecated Use enemies.hoveredEnemyIndex */
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
  /** @deprecated Use hand.cardSprites */
  cardSprites: Map<string, PIXI.Container>;
  markForCheck(): void;
  /** Optional object pools to reuse Graphics/Text/Container/Sprite and reduce allocations. */
  pools?: PixiPools;
  getCombatBgTexture?: () => PIXI.Texture | null;
  getHpIconTexture?: () => PIXI.Texture | null;
  getBlockIconTexture?: () => PIXI.Texture | null;
  /** @deprecated Use player.getPlayerTexture */
  getPlayerTexture?: () => PIXI.Texture | null;
  /** @deprecated Use enemies.getEnemyTexture */
  getEnemyTexture?: (id: string) => PIXI.Texture | null;
  /** @deprecated Use enemies.enemyVariants */
  enemyVariants?: number[];
  /** @deprecated Use enemies.enemyHurtStartMs */
  enemyHurtStartMs?: (number | null)[];
  /** @deprecated Use enemies.enemyDyingStartMs */
  enemyDyingStartMs?: (number | null)[];
  /** @deprecated Use enemies.getEnemyAnimationTexture */
  getEnemyAnimationTexture?: (
    variant: number,
    animation: 'idle' | 'hurt' | 'dying',
    nowMs: number,
    startMs?: number
  ) => PIXI.Texture | null;
  /** @deprecated Use hand.getCardArtTexture */
  getCardArtTexture?: (cardId: string) => PIXI.Texture | null;
  /** @deprecated Use hand.hoverLerp */
  hoverLerp?: number[];
  /** @deprecated Use hand.spreadLerp */
  spreadLerp?: number[];
  /** @deprecated Use player.shieldAnimationPlaying */
  shieldAnimationPlaying?: boolean;
  /** @deprecated Use player.getShieldVideoTexture */
  getShieldVideoTexture?: () => PIXI.Texture | null;
  /** @deprecated Use player.shootingAnimationPlaying */
  shootingAnimationPlaying?: boolean;
  /** @deprecated Use player.getShootingTexture */
  getShootingTexture?: () => PIXI.Texture | null;
  /** @deprecated Use player.slashingAnimationPlaying */
  slashingAnimationPlaying?: boolean;
  /** @deprecated Use player.getSlashingTexture */
  getSlashingTexture?: () => PIXI.Texture | null;
  textScale?: number;
  vfxIntensity?: 'full' | 'reduced' | 'off';
  /** @deprecated Use hand.isDraggingCard */
  isDraggingCard?: boolean;
  /** @deprecated Use hand.dragCardId */
  dragCardId?: string | null;
  /** @deprecated Use hand.dragHandIndex */
  dragHandIndex?: number | null;
  dragScreenX?: number;
  dragScreenY?: number;
  /** @deprecated Use hand.dragIsTargetingEnemy */
  dragIsTargetingEnemy?: boolean;
  /** @deprecated Use hand.returnProgress */
  returnProgress?: number | null;
  returnStartX?: number;
  returnStartY?: number;
  /** @deprecated Use hand.getHandLayout */
  getHandLayout?: (count: number, hoveredIndex: number | null) => HandLayoutResult;
  /** @deprecated Use player.onPlayerSpriteCreated */
  onPlayerSpriteCreated?: (sprite: PIXI.Sprite) => void;
  /** @deprecated Use enemies.onEnemySpriteCreated */
  onEnemySpriteCreated?: (index: number, sprite: PIXI.Sprite) => void;
}

const L = COMBAT_LAYOUT;
const INTENT_ICON_SIZE = L.intentIconSize;

function g(ctx: CombatViewContext): PIXI.Graphics {
  return ctx.pools ? ctx.pools.getGraphics() : new PIXI.Graphics();
}
function t(ctx: CombatViewContext): PIXI.Text {
  return ctx.pools ? ctx.pools.getText() : new PIXI.Text({ text: '' });
}
function c(ctx: CombatViewContext): PIXI.Container {
  return ctx.pools ? ctx.pools.getContainer() : new PIXI.Container();
}
/** Always create a new Sprite (no pooling). Pooled sprite reuse caused wrong textures on cards (player/map/icon appearing on hover). */
function spriteNew(): PIXI.Sprite {
  return new PIXI.Sprite();
}
const HP_BLOCK_ENERGY_ICON_SIZE = L.hpBlockEnergyIconSize;
const HP_BLOCK_ENERGY_GAP = L.hpBlockEnergyGap;

// ---------------------------------------------------------------------------
// Card neon border & enemy target border
// ---------------------------------------------------------------------------

function scaledFontSize(base: number, ctx: CombatViewContext): number {
  const scale = ctx.textScale ?? 1;
  return Math.round(base * scale);
}

/** Draws a neon/glow border (Slay the Spire style) on a Graphics. Stroke uses alignment 1 (inside). Width is inset so the border matches the card frame; height unchanged. */
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
  const insetX = L.neonBorderWidthInset ?? 0;
  const x = insetX;
  const width = cardWidth - 2 * insetX;
  const radius = Math.max(0, cornerRadius - insetX);
  g.clear();
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const alpha = alphas[i] ?? 1;
    g.roundRect(x, 0, width, cardHeight, radius)
      .stroke({ width: w, color, alpha, alignment: 1 });
  }
}

/** Draws the enemy target highlight (valid target vs hovered). Layered glow + crisp edge, stroke inside so it aligns with the placeholder. */
function drawEnemyTargetBorder(
  g: PIXI.Graphics,
  placeholderW: number,
  placeholderH: number,
  cornerRadius: number,
  isHovered: boolean
): void {
  const color = isHovered ? L.enemyTargetBorderHoverColor : L.enemyTargetBorderColor;
  const widths = isHovered ? L.enemyTargetBorderHoverWidths : L.enemyTargetBorderWidths;
  const alphas = isHovered ? L.enemyTargetBorderHoverAlphas : L.enemyTargetBorderAlphas;
  g.clear();
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i];
    const alpha = alphas[i] ?? 1;
    g.roundRect(0, 0, placeholderW, placeholderH, cornerRadius)
      .stroke({ width: w, color, alpha, alignment: 1 });
  }
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

/** B13: Draw combat background (sprite or dark rect) at zIndex 0. Adds a dark overlay to improve character visibility. */
function drawCombatBackground(ctx: CombatViewContext): void {
  const { stage, w, h } = ctx;
  const bgBounds = getCombatSlotBounds('combatBg', w, h);
  const tex = ctx.getCombatBgTexture?.() ?? null;
  if (tex) {
    const bg = spriteNew();
    bg.texture = tex;
    bg.x = bgBounds.x;
    bg.y = bgBounds.y;
    bg.width = bgBounds.width;
    bg.height = bgBounds.height;
    bg.zIndex = 0;
    stage.addChild(bg);
    const overlay = g(ctx);
    overlay.rect(bgBounds.x, bgBounds.y, bgBounds.width, bgBounds.height).fill({ color: 0x000000, alpha: 0.42 });
    overlay.zIndex = 1;
    stage.addChild(overlay);
  } else {
    const bg = g(ctx);
    bg.rect(bgBounds.x, bgBounds.y, bgBounds.width, bgBounds.height).fill(0x1a1a2e);
    bg.zIndex = 0;
    stage.addChild(bg);
  }
  stage.sortableChildren = true;
}

// ---------------------------------------------------------------------------
// Player area (placeholder, sprite, block overlay)
// ---------------------------------------------------------------------------

/** Draws the player character (sprite if available, else placeholder Graphics) and block-gain flash if any. */
function drawPlayerArea(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerBounds = getCombatSlotBounds('player', w, h);
  const playerPlaceholderW = playerBounds.width || L.playerPlaceholderW;
  const playerPlaceholderH = playerBounds.height || L.playerPlaceholderH;

  const playerContainer = c(ctx);
  playerContainer.x = playerBounds.x;
  playerContainer.y = playerBounds.y;
  playerContainer.zIndex = 10;
  const slashingTex = ctx.slashingAnimationPlaying && ctx.getSlashingTexture?.() ? ctx.getSlashingTexture() : null;
  const shootingTex = ctx.shootingAnimationPlaying && ctx.getShootingTexture?.() ? ctx.getShootingTexture() : null;
  const shieldTex = ctx.shieldAnimationPlaying && ctx.getShieldVideoTexture?.() ? ctx.getShieldVideoTexture() : null;
  const playerTex = slashingTex ?? shootingTex ?? shieldTex ?? (ctx.getPlayerTexture?.() ?? null);
  if (playerTex) {
    const centerX = playerPlaceholderW / 2;
    const feetY = playerPlaceholderH;
    const groundShadow = g(ctx);
    const shadowW = playerPlaceholderW * 0.7;
    const shadowH = playerPlaceholderH * 0.07;
    const shadowY = feetY - 28;
    groundShadow.ellipse(centerX, shadowY, shadowW / 2, shadowH).fill({ color: 0x000000, alpha: 0.48 });
    playerContainer.addChild(groundShadow);
    const sprite = spriteNew();
    sprite.texture = playerTex;
    sprite.anchor.set(0.5, 1);
    sprite.x = centerX;
    sprite.y = feetY;
    const texW = playerTex.width;
    const texH = playerTex.height;
    const fitScale = Math.min(playerPlaceholderW / texW, playerPlaceholderH / texH);
    sprite.width = texW * fitScale;
    sprite.height = texH * fitScale;
    playerContainer.addChild(sprite);
    ctx.onPlayerSpriteCreated?.(sprite);
  } else {
    const playerBody = g(ctx);
    playerBody.roundRect(20, 44, 60, 72, 8).fill({ color: 0x3a4a6a }).stroke({ width: 2, color: 0x5a6a8a });
    playerContainer.addChild(playerBody);
    const playerHead = g(ctx);
    playerHead.circle(50, 28, 22).fill({ color: 0x4a5a7a }).stroke({ width: 2, color: 0x6a7a9a });
    playerContainer.addChild(playerHead);
  }
  const showBlockFlash = ctx.vfxIntensity !== 'off' && ctx.floatingNumbers.some((f) => f.type === 'block');
  if (showBlockFlash) {
    const blockOverlay = g(ctx);
    blockOverlay.roundRect(0, 0, playerPlaceholderW, playerPlaceholderH, L.enemyCornerRadius).fill({ color: 0x44ff88, alpha: 0.3 });
    playerContainer.addChild(blockOverlay);
  }
  stage.addChild(playerContainer);
}

// ---------------------------------------------------------------------------
// Plants (Verdant Machinist)
// ---------------------------------------------------------------------------

const PLANT_GROWTH_TO_EVOLVE = 3;

/** Draws plant minions between player and enemies: summary (combined shield), then per-plant HP, block, mode, growth, stage. */
function drawPlants(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const plants = state.plants?.filter((p) => p.hp > 0) ?? [];
  if (plants.length === 0) return;
  const layout = getPlantsLayout(w, h, plants.length);
  const totalShield = plants.reduce((s, p) => s + (p.block ?? 0), 0);
  const fontSize = scaledFontSize(11, ctx);
  const smallFont = Math.max(9, fontSize - 2);

  // Summary line above plants: combined shield + targeting hint
  const summaryY = layout.startY - 14;
  const summaryContainer = c(ctx);
  summaryContainer.zIndex = 12;
  const summaryText = t(ctx);
  summaryText.text = totalShield > 0
    ? `Plants: ${plants.length}  •  Combined shield: ${totalShield}  •  Enemies hit plants first`
    : `Plants: ${plants.length}  •  Enemies hit plants first`;
  summaryText.style = { fontFamily: 'system-ui', fontSize: smallFont, fill: 0xa0ddbb };
  summaryText.anchor.set(0.5, 0);
  const plantsCenterX = layout.startX + (plants.length * (layout.slotW + layout.gap) - layout.gap) / 2;
  summaryText.x = plantsCenterX;
  summaryText.y = summaryY;
  summaryContainer.addChild(summaryText);
  stage.addChild(summaryContainer);

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    const center = layout.getCenter(i);
    const container = c(ctx);
    container.x = center.x - layout.slotW / 2;
    container.y = layout.startY;
    container.zIndex = 12;
    const bg = g(ctx);
    bg.roundRect(0, 0, layout.slotW, layout.slotH, 8).fill({ color: 0x1a3a2a, alpha: 0.9 }).stroke({ width: 2, color: 0x4a7a5a });
    container.addChild(bg);
    const hpText = t(ctx);
    hpText.text = `HP ${plant.hp}/${plant.maxHp}`;
    hpText.style = { fontFamily: 'system-ui', fontSize, fill: 0xccffcc, fontWeight: 'bold' };
    hpText.anchor.set(0.5, 0);
    hpText.x = layout.slotW / 2;
    hpText.y = 2;
    container.addChild(hpText);
    const blockVal = plant.block ?? 0;
    if (blockVal > 0) {
      const blockText = t(ctx);
      blockText.text = `Block: ${blockVal}`;
      blockText.style = { fontFamily: 'system-ui', fontSize: smallFont, fill: 0x88ddff };
      blockText.anchor.set(0.5, 0);
      blockText.x = layout.slotW / 2;
      blockText.y = 16;
      container.addChild(blockText);
    }
    const modeText = t(ctx);
    const modeLabel = plant.mode === 'attack' ? 'ATK' : plant.mode === 'defense' ? 'DEF' : 'SUP';
    modeText.text = modeLabel;
    modeText.style = { fontFamily: 'system-ui', fontSize: fontSize - 1, fill: 0xaaddaa };
    modeText.anchor.set(0.5, 0);
    modeText.x = layout.slotW / 2;
    modeText.y = blockVal > 0 ? 28 : 20;
    container.addChild(modeText);
    const growthText = t(ctx);
    growthText.text = `Growth ${plant.growth}/${PLANT_GROWTH_TO_EVOLVE}`;
    growthText.style = { fontFamily: 'system-ui', fontSize: smallFont, fill: 0x88bb88 };
    growthText.anchor.set(0.5, 0);
    growthText.x = layout.slotW / 2;
    growthText.y = blockVal > 0 ? 42 : 34;
    container.addChild(growthText);
    const stageLabel = plant.growthStage === 1 ? 'Seedling' : plant.growthStage === 2 ? 'Sprout' : 'Mature';
    const stageText = t(ctx);
    stageText.text = stageLabel;
    stageText.style = { fontFamily: 'system-ui', fontSize: smallFont, fill: 0x66aa66 };
    stageText.anchor.set(0.5, 0);
    stageText.x = layout.slotW / 2;
    stageText.y = blockVal > 0 ? 56 : 48;
    container.addChild(stageText);
    stage.addChild(container);
  }
}

// ---------------------------------------------------------------------------
// HP/Block/Energy icons
// ---------------------------------------------------------------------------

/** Draws HP, block, and energy as icons with numbers centered (Slay the Spire style). */
function drawHpBlockEnergyIcons(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerBounds = getCombatSlotBounds('player', w, h);
  const hpBounds = getCombatSlotBounds('hpBlockEnergy', w, h);
  const centerX = playerBounds.x + playerBounds.width / 2;
  const baseY = hpBounds.y;
  const iconSize = HP_BLOCK_ENERGY_ICON_SIZE;
  const gap = HP_BLOCK_ENERGY_GAP;
  const fontSize = scaledFontSize(16, ctx);

  const drawIconWithNumber = (x: number, texture: PIXI.Texture | null, label: string, fill = 0xffffff): void => {
    const container = c(ctx);
    container.zIndex = 20;
    container.x = x;
    container.y = baseY;
    if (texture) {
      const sprite = spriteNew();
      sprite.texture = texture;
      sprite.anchor.set(0.5, 0);
      sprite.width = iconSize;
      sprite.height = iconSize;
      container.addChild(sprite);
    } else {
      const bg = g(ctx);
      bg.circle(0, iconSize / 2, iconSize / 2).fill(0x333344);
      container.addChild(bg);
    }
    const text = t(ctx);
    text.text = label;
    text.style = { fontFamily: 'system-ui', fontSize, fill, fontWeight: 'bold' };
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
  const energyContainer = c(ctx);
  energyContainer.zIndex = 20;
  energyContainer.x = centerX + gap;
  energyContainer.y = baseY;
  const energyBg = g(ctx);
  energyBg.roundRect(-iconSize / 2, 0, iconSize, iconSize, 8).fill(0x2a3544).stroke({ width: 2, color: 0x88aacc });
  energyContainer.addChild(energyBg);
  const energyText = t(ctx);
  energyText.text = `${state.energy}/${state.maxEnergy}`;
  energyText.style = { fontFamily: 'system-ui', fontSize, fill: 0xeeeeee, fontWeight: 'bold' };
  energyText.anchor.set(0.5, 0.5);
  energyText.x = 0;
  energyText.y = iconSize / 2;
  energyContainer.addChild(energyText);
  stage.addChild(energyContainer);
}

// ---------------------------------------------------------------------------
// Hand (cards, hover/selection, pointer handlers)
// ---------------------------------------------------------------------------

/** Draws the hand container with arc layout, card visuals, hover/selection, and pointer handlers. */
function drawHand(ctx: CombatViewContext): PIXI.Container {
  const { state, stage, w, h } = ctx;
  const hand = state.hand;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const hoverScale = L.hoverScale;

  const layout = ctx.getHandLayout
    ? ctx.getHandLayout(hand.length, ctx.hoveredCardIndex)
    : getHandLayout(hand.length, w, h, ctx.hoveredCardIndex);
  const hoverLift = layout.hoverLift;

  const handContainer = c(ctx);
  handContainer.sortableChildren = true;
  handContainer.zIndex = 20;
  ctx.cardSprites.clear();

  const handPresentations = ctx.hand?.handPresentations;
  const usePresentation =
    handPresentations != null && handPresentations.length === hand.length;
  const useHoverLerp = !usePresentation && ctx.hoverLerp && ctx.hoverLerp.length === hand.length;
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
    /** Only the single hovered or selected card is on top; avoid lerp-based z so multiple cards don't get 100 during transitions. */
    const isOnTop = isHovered || isSelected;

    const pos = layout?.positions[i];
    const spreadX = (ctx.spreadLerp && ctx.spreadLerp[i] !== undefined) ? ctx.spreadLerp[i] : (pos?.spreadOffsetX ?? 0);
    const pres = usePresentation ? handPresentations![i] : null;
    const cardX = pres != null ? pres.currentX : pos ? pos.x + spreadX : w / 2 + (i - (hand.length - 1) / 2) * cardWidth * L.overlapRatio;
    const cardY = pres != null ? pres.currentY : pos ? pos.y : 0;
    const rot = pres != null ? pres.currentRotation : pos?.rotation ?? 0;
    const baseY = pos?.y ?? 0;
    const liftY = usePresentation ? 0 : (isActive ? lerp * hoverLift : 0);
    const cardScale = pres != null ? pres.currentScale : 1 + (isActive ? lerp : 0) * (hoverScale - 1);
    const cardZIndex = pres != null ? pres.zPriority : (isOnTop ? 100 : i);

    const container = c(ctx);
    container.sortableChildren = true;

    const shadow = g(ctx);
    shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x000000, alpha: 0.35 });
    shadow.alpha = applyHover ? 1 : 0.18 / 0.35;
    container.addChild(shadow);

    // Card image is the full card (cardId.png or empty_card_template); text and cost are drawn on top.
    const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
    if (cardTex) {
      const cardSprite = spriteNew();
      cardSprite.texture = cardTex;
      cardSprite.width = cardWidth;
      cardSprite.height = cardHeight;
      cardSprite.roundPixels = true;
      container.addChild(cardSprite);
    }

    const neonBorder = g(ctx);
    neonBorder.visible = isHovered || isSelected;
    if (neonBorder.visible) {
      drawNeonBorder(neonBorder, cardWidth, cardHeight, L.cardCornerRadius, isSelected);
    }
    container.addChild(neonBorder);

    const costRadius = L.costRadius;
    const costBg = g(ctx);
    const costColor = playable ? 0x88ff88 : 0xff8888;
    const costCenter = costRadius + L.costCenterOffset;
    costBg.circle(costCenter, costCenter, costRadius).fill({ color: 0x1a1a2a }).stroke({ width: 2, color: costColor });
    container.addChild(costBg);
    const costFontSize = scaledFontSize(32, ctx);
    const costText = t(ctx);
    costText.text = String(cost);
    costText.style = { fontFamily: 'system-ui', fontSize: costFontSize, fill: costColor };
    costText.anchor.set(0.5, 0.5);
    costText.x = costCenter;
    costText.y = costCenter;
    container.addChild(costText);

    const name = ctx.getCardName(cardId);
    const nameDisplay = name.length > 16 ? name.slice(0, 16) + '…' : name;
    const nameText = t(ctx);
    nameText.text = nameDisplay;
    nameText.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(28, ctx), fill: 0xeeeeee, fontWeight: 'bold' };
    nameText.x = 24;
    nameText.y = 84;
    container.addChild(nameText);

    const effectDesc = ctx.getCardEffectDescription(cardId);
    if (effectDesc) {
      const fs = scaledFontSize(22, ctx);
      const effectText = t(ctx);
      effectText.text = effectDesc;
      effectText.style = {
        fontFamily: 'system-ui',
        fontSize: fs,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardWidth - L.cardTextPadding,
        lineHeight: Math.round(fs * 1.25),
      };
      effectText.x = 24;
      effectText.y = cardHeight - 120;
      container.addChild(effectText);
    }

    container.pivot.set(cardWidth / 2, cardHeight);
    container.x = cardX;
    container.y = cardY - liftY;
    container.rotation = rot;
    container.scale.set(cardScale);
    container.zIndex = cardZIndex;
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

// ---------------------------------------------------------------------------
// Enemies (placeholders, targeting border, intent, status)
// ---------------------------------------------------------------------------

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
    const container = c(ctx);
    container.zIndex = 20;
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
      const sprite = spriteNew();
      sprite.texture = enemyTex;
      const texW = enemyTex.width;
      const texH = enemyTex.height;
      const fitScale = Math.min(enemyPlaceholderW / texW, enemyPlaceholderH / texH);
      sprite.width = texW * fitScale;
      sprite.height = texH * fitScale;
      sprite.anchor.set(0.5, 1);
      sprite.x = enemyPlaceholderW / 2;
      sprite.y = enemyPlaceholderH;
      sprite.scale.x = -Math.abs(sprite.scale.x);
      container.addChild(sprite);
      ctx.onEnemySpriteCreated?.(i, sprite);
    } else {
      const placeholder = g(ctx);
      placeholder.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius)
        .fill({ color: 0x4a3030 })
        .stroke({ width: 2, color: 0x8a4a4a });
      container.addChild(placeholder);
    }
    if (isValidTarget) {
      const targetBorder = g(ctx);
      drawEnemyTargetBorder(targetBorder, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius, !!isHoveredEnemy);
      container.addChild(targetBorder);
    }
    const wasJustHit = ctx.floatingNumbers.some((f) => f.type === 'damage' && f.enemyIndex === i);
    const vfxOn = ctx.vfxIntensity !== 'off';
    const centerPos = enemyLayout.getCenter(i);
    const hitPop = wasJustHit && vfxOn ? 1.06 : 1;
    const scale = sizeScale(e.size) * (isHoveredEnemy ? 1.06 : 1) * hitPop;
    container.pivot.set(enemyPlaceholderW / 2, enemyPlaceholderH / 2);
    container.x = centerPos.x;
    container.y = centerPos.y;
    container.scale.set(scale);
    const nameT = t(ctx);
    nameT.text = e.name;
    nameT.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(13, ctx), fill: 0xeeeeee };
    nameT.x = 8;
    nameT.y = 8;
    container.addChild(nameT);
    const hpT = t(ctx);
    hpT.text = `HP: ${e.hp}/${e.maxHp}  Block: ${e.block}`;
    hpT.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(11, ctx), fill: 0xcccccc };
    hpT.x = 8;
    hpT.y = 26;
    container.addChild(hpT);
    if (e.intent) {
      drawIntentIcon(ctx, container, e.intent.type, e.intent.value, L.intentPosX, L.intentPosY, e.intent.addStatus);
    } else {
      drawIntentIcon(ctx, container, 'none', 0, L.intentPosX, L.intentPosY);
    }
    const vulnerableStacks = (e as { vulnerableStacks?: number }).vulnerableStacks ?? 0;
    const weakStacks = (e as { weakStacks?: number }).weakStacks ?? 0;
    let statusY = 6;
    if (vulnerableStacks > 0) {
      const vW = 32;
      const vBg = g(ctx);
      vBg.roundRect(enemyPlaceholderW - vW - 4, statusY, vW, 14, 3).fill({ color: 0x9944aa, alpha: 0.9 }).stroke({ width: 1, color: 0xcc66dd });
      container.addChild(vBg);
      const vText = t(ctx);
      vText.text = `Vuln ${vulnerableStacks}`;
      vText.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(9, ctx), fill: 0xffffff, fontWeight: 'bold' };
      vText.x = enemyPlaceholderW - vW - 2;
      vText.y = statusY + 1;
      container.addChild(vText);
      statusY += 18;
    }
    if (weakStacks > 0) {
      const wW = 28;
      const wBg = g(ctx);
      wBg.roundRect(enemyPlaceholderW - wW - 4, statusY, wW, 14, 3).fill({ color: 0x6a6a44, alpha: 0.9 }).stroke({ width: 1, color: 0x999966 });
      container.addChild(wBg);
      const wText = t(ctx);
      wText.text = `Weak ${weakStacks}`;
      wText.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(9, ctx), fill: 0xffffff, fontWeight: 'bold' };
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

// ---------------------------------------------------------------------------
// Targeting arrow (Bezier from hand to cursor/enemy)
// ---------------------------------------------------------------------------

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
      fromY = pos.y - handLayout.hoverLift - L2.cardHeight;
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

  const arrow = g(ctx);
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

// ---------------------------------------------------------------------------
// Drag card preview & returning card
// ---------------------------------------------------------------------------

const DRAG_CARD_SCALE = 0.38;

/** Draws the dragged card preview at cursor when dragging an attack card. */
function drawDragCardPreview(ctx: CombatViewContext): void {
  const { stage } = ctx;
  if (!ctx.isDraggingCard || ctx.dragCardId == null || typeof ctx.dragScreenX !== 'number' || typeof ctx.dragScreenY !== 'number') return;
  const cardWidth = L.cardWidth * DRAG_CARD_SCALE;
  const cardHeight = L.cardHeight * DRAG_CARD_SCALE;
  const container = c(ctx);
  container.x = ctx.dragScreenX;
  container.y = ctx.dragScreenY;
  container.pivot.set(cardWidth / 2, cardHeight / 2);
  const cardTex = ctx.getCardArtTexture?.(ctx.dragCardId) ?? null;
  if (cardTex) {
    const sprite = spriteNew();
    sprite.texture = cardTex;
    sprite.width = cardWidth;
    sprite.height = cardHeight;
    sprite.anchor.set(0, 0);
    container.addChild(sprite);
  } else {
    const bg = g(ctx);
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius * DRAG_CARD_SCALE).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
    container.addChild(bg);
  }
  container.zIndex = 600;
  stage.addChild(container);
}

/** Draws the returning card animating back into the hand (ease-out), with full UI (cost, name, text). */
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
  const container = c(ctx);
  container.pivot.set(cardWidth / 2, cardHeight);
  container.x = x;
  container.y = y;
  container.rotation = rot;
  container.zIndex = 580;

  const cardId = ctx.cardInteractionCardId;

  // Shadow
  const shadow = g(ctx);
  shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
    .fill({ color: 0x000000, alpha: 0.35 });
  container.addChild(shadow);

  // Card art background
  const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
  if (cardTex) {
    const sprite = spriteNew();
    sprite.texture = cardTex;
    sprite.width = cardWidth;
    sprite.height = cardHeight;
    sprite.roundPixels = true;
    container.addChild(sprite);
  } else {
    const bg = g(ctx);
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x2a2a4a })
      .stroke({ width: 2, color: 0xe8c060 });
    container.addChild(bg);
  }

  // Cost circle and text
  const cost = ctx.getCardCost(cardId);
  const costRadius = L.costRadius;
  const costBg = g(ctx);
  const costColor = 0x88ff88;
  const costCenter = costRadius + L.costCenterOffset;
  costBg.circle(costCenter, costCenter, costRadius)
    .fill({ color: 0x1a1a2a })
    .stroke({ width: 2, color: costColor });
  container.addChild(costBg);
  const costFontSize = scaledFontSize(32, ctx);
  const costText = t(ctx);
  costText.text = String(cost);
  costText.style = { fontFamily: 'system-ui', fontSize: costFontSize, fill: costColor };
  costText.anchor.set(0.5, 0.5);
  costText.x = costCenter;
  costText.y = costCenter;
  container.addChild(costText);

  // Name
  const name = ctx.getCardName(cardId);
  const nameDisplay = name.length > 16 ? name.slice(0, 16) + '…' : name;
  const nameText = t(ctx);
  nameText.text = nameDisplay;
  nameText.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(28, ctx), fill: 0xeeeeee, fontWeight: 'bold' };
  nameText.x = 24;
  nameText.y = 84;
  container.addChild(nameText);

  // Effect description
  const effectDesc = ctx.getCardEffectDescription(cardId);
  if (effectDesc) {
    const fs = scaledFontSize(22, ctx);
    const effectText = t(ctx);
    effectText.text = effectDesc;
    effectText.style = {
      fontFamily: 'system-ui',
      fontSize: fs,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: cardWidth - L.cardTextPadding,
      lineHeight: Math.round(fs * 1.25),
    };
    effectText.x = 24;
    effectText.y = cardHeight - 120;
    container.addChild(effectText);
  }

  stage.addChild(container);
}

// ---------------------------------------------------------------------------
// Floating numbers & enemy turn banner
// ---------------------------------------------------------------------------

/** Draws floating damage (red) and block (green) numbers at their positions. Skipped when vfxIntensity is 'off'. */
function drawFloatingNumbers(ctx: CombatViewContext): void {
  if (ctx.vfxIntensity === 'off') return;
  const { stage } = ctx;
  const scale = ctx.vfxIntensity === 'reduced' ? 0.85 : 1;
  const baseDmg = scaledFontSize(22, ctx);
  const baseBlock = scaledFontSize(18, ctx);
  for (const fn of ctx.floatingNumbers) {
    const fontSize = (fn.type === 'damage' ? baseDmg : baseBlock) * scale;
    const text = t(ctx);
    text.text = fn.type === 'damage' ? `-${fn.value}` : `+${fn.value}`;
    text.style = {
      fontFamily: 'system-ui',
      fontSize: Math.round(fontSize),
      fill: fn.type === 'damage' ? 0xff6666 : 0x66ff88,
      fontWeight: 'bold',
    };
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
  const banner = g(ctx);
  banner.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.5 });
  stage.addChild(banner);
  const turnText = t(ctx);
  turnText.text = 'Enemy turn';
  turnText.style = { fontFamily: 'system-ui', fontSize: scaledFontSize(36, ctx), fill: 0xffcc44, fontWeight: 'bold' };
  turnText.anchor.set(0.5, 0.5);
  turnText.x = w / 2;
  turnText.y = h / 2;
  stage.addChild(turnText);
}

// ---------------------------------------------------------------------------
// Full card visuals (for fly-to-enemy and other single-card use)
// ---------------------------------------------------------------------------

export interface BuildCardVisualsParams {
  cardId: string;
  cardWidth: number;
  cardHeight: number;
  getCardCost(cardId: string): number;
  getCardName(cardId: string): string;
  getCardEffectDescription(cardId: string): string;
  getCardArtTexture(cardId: string): PIXI.Texture | null;
  textScale?: number;
}

/**
 * Builds a PIXI.Container with the same visual content as a hand card: shadow, art, cost, name, effect.
 * Use for flying card animation so the card that flies to the enemy shows full content, not just template.
 */
export function buildCardVisualsContainer(params: BuildCardVisualsParams): PIXI.Container {
  const {
    cardId,
    cardWidth,
    cardHeight,
    getCardCost,
    getCardName,
    getCardEffectDescription,
    getCardArtTexture,
    textScale = 1,
  } = params;
  const container = new PIXI.Container();

  const shadow = new PIXI.Graphics();
  shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
    .fill({ color: 0x000000, alpha: 0.35 });
  container.addChild(shadow);

  const cardTex = getCardArtTexture(cardId);
  if (cardTex) {
    const cardSprite = new PIXI.Sprite(cardTex);
    cardSprite.width = cardWidth;
    cardSprite.height = cardHeight;
    cardSprite.roundPixels = true;
    container.addChild(cardSprite);
  } else {
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
    container.addChild(bg);
  }

  const cost = getCardCost(cardId);
  const costRadius = L.costRadius;
  const costCenter = costRadius + L.costCenterOffset;
  const costColor = 0x88ff88;
  const costBg = new PIXI.Graphics();
  costBg.circle(costCenter, costCenter, costRadius).fill({ color: 0x1a1a2a }).stroke({ width: 2, color: costColor });
  container.addChild(costBg);
  const costFontSize = Math.round(32 * textScale);
  const costText = new PIXI.Text({
    text: String(cost),
    style: { fontFamily: 'system-ui', fontSize: costFontSize, fill: costColor },
  });
  costText.anchor.set(0.5, 0.5);
  costText.x = costCenter;
  costText.y = costCenter;
  container.addChild(costText);

  const name = getCardName(cardId);
  const nameDisplay = name.length > 16 ? name.slice(0, 16) + '…' : name;
  const nameText = new PIXI.Text({
    text: nameDisplay,
    style: { fontFamily: 'system-ui', fontSize: Math.round(28 * textScale), fill: 0xeeeeee, fontWeight: 'bold' },
  });
  nameText.x = 24;
  nameText.y = 84;
  container.addChild(nameText);

  const effectDesc = getCardEffectDescription(cardId);
  if (effectDesc) {
    const fs = Math.round(22 * textScale);
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

  return container;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Draws the full combat view onto the given stage (player, HP, hand, enemies, arrow, floating numbers, banner).
 * Component builds context and calls this; renderer only draws and wires pointer events to context callbacks.
 */
export function drawCombatView(context: CombatViewContext): void {
  drawCombatBackground(context);
  drawPlayerArea(context);
  drawPlants(context);
  drawHpBlockEnergyIcons(context);
  const handContainer = drawHand(context);
  const layout = drawEnemies(context, handContainer);
  drawTargetingArrow(context, layout);
  drawReturningCard(context);
  drawFloatingNumbers(context);
  drawEnemyTurnBanner(context);
}
