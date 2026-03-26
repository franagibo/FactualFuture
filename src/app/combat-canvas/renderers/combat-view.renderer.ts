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

const intentBadgeColor = (type: EnemyIntent['type']): number => {
  switch (type) {
    case 'attack': case 'attack_multi': case 'attack_frail': case 'attack_vulnerable': case 'attack_and_block':
      return 0xc42222;
    case 'block': case 'block_ally':
      return 0x1a55bb;
    case 'debuff': case 'hex':
      return 0x7722aa;
    case 'drain':
      return 0x552288;
    case 'vulnerable':
      return 0x991177;
    case 'ritual': case 'buff':
      return 0x886600;
    default:
      return 0x334455;
  }
};
const intentTypeName = (type: EnemyIntent['type']): string => {
  switch (type) {
    case 'attack':           return 'ATTACK';
    case 'attack_multi':     return 'ATTACK';
    case 'attack_frail':     return 'ATTACK';
    case 'attack_vulnerable':return 'ATTACK';
    case 'attack_and_block': return 'ATTACK';
    case 'block':            return 'DEFEND';
    case 'block_ally':       return 'DEFEND';
    case 'debuff':           return 'DEBUFF';
    case 'drain':            return 'DRAIN';
    case 'hex':              return 'HEX';
    case 'vulnerable':       return 'VULNERABLE';
    case 'ritual':           return 'RITUAL';
    case 'buff':             return 'BUFF';
    default:                 return 'UNKNOWN';
  }
};
const intentSymbol = (type: EnemyIntent['type']): string => {
  switch (type) {
    case 'attack': case 'attack_multi': case 'attack_frail': case 'attack_vulnerable': case 'attack_and_block':
      return '\u2694';   // ⚔ crossed swords
    case 'block': case 'block_ally':
      return '\u25a0';   // ■ shield
    case 'debuff':
      return '\u2716';   // ✖
    case 'drain':
      return '\u25bc';   // ▼
    case 'hex':
      return '\u2726';   // ✦ star
    case 'vulnerable':
      return '\u25bc';   // ▼
    case 'ritual': case 'buff':
      return '\u2605';   // ★ star
    default:
      return '?';
  }
};
const lightenIntentHex = (color: number, factor: number): number => {
  const r2 = Math.min(255, Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * factor));
  const g2 = Math.min(255, Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * factor));
  const b2 = Math.min(255, Math.round((color & 0xff) + (255 - (color & 0xff)) * factor));
  return (r2 << 16) | (g2 << 8) | b2;
};
const darkenIntentHex = (color: number, factor: number): number => {
  const r2 = Math.floor(((color >> 16) & 0xff) * factor);
  const g2 = Math.floor(((color >> 8) & 0xff) * factor);
  const b2 = Math.floor((color & 0xff) * factor);
  return (r2 << 16) | (g2 << 8) | b2;
};


/**
 * Draws a polished Slay-the-Spire-style intent badge: large circle icon floating above the
 * enemy with a value pill below it. x,y = center-X and top-Y anchor in container local coords.
 */
function drawIntentIcon(
  ctx: CombatViewContext,
  container: PIXI.Container,
  type: EnemyIntent['type'],
  value: number,
  x: number,
  y: number,
  addStatus?: { cardId: string; count: number; to: 'draw' | 'discard' }[],
  intentExtras?: { times?: number; value2?: number; strength?: number; block?: number }
): void {
  const badgeColor = intentBadgeColor(type);
  const badgeDark  = darkenIntentHex(badgeColor, 0.28);
  const badgeLight = lightenIntentHex(badgeColor, 0.55);
  const badgeShine = lightenIntentHex(badgeColor, 0.85);

  // --- Build value string ---
  let valLine = '???';
  if (type === 'attack' || type === 'attack_multi' || type === 'attack_frail' || type === 'attack_vulnerable' || type === 'attack_and_block') {
    const times = intentExtras?.times ?? 1;
    valLine = times > 1 ? `${value} \u00d7${times}` : `${value}`;
  } else if (type === 'block' || type === 'block_ally') {
    valLine = `+${intentExtras?.strength ?? value}`;
  } else if (type === 'debuff')   valLine = `\u00d7${value}`;
  else if (type === 'vulnerable') valLine = `\u00d7${value}`;
  else if (type === 'ritual')     valLine = `+${value} STR`;
  else if (type === 'buff')       valLine = intentExtras?.strength ? `+${intentExtras.strength} STR` : (intentExtras?.block ? `+${intentExtras.block} BLK` : '!');
  else if (type === 'drain')      valLine = 'DRAIN';
  else if (type === 'hex')        valLine = 'HEX';
  else if (type === 'none')       valLine = '???';
  if (addStatus?.length) {
    const n = addStatus.reduce((s, a) => s + a.count, 0);
    valLine += ` +${n}`;
  }
  let secLabel = '';
  if (type === 'attack_frail'      && intentExtras?.value2) secLabel = `+${intentExtras.value2} Frail`;
  if (type === 'attack_vulnerable' && intentExtras?.value2) secLabel = `+${intentExtras.value2} Vuln`;
  if (type === 'attack_and_block'  && intentExtras?.value2) secLabel = `+${intentExtras.value2} Blk`;

  // Layout: large icon circle at top, pill label below
  const iconR  = 26;
  const iconCX = x;
  const iconCY = y + iconR + 2;     // center of the icon circle
  const pillH  = 30;
  const pillW  = secLabel ? 130 : 110;
  const pillX  = iconCX - pillW / 2;
  const pillY  = iconCY + iconR + 2; // pill starts just below the circle

  // Connector line
  const connGr = g(ctx);
  connGr.rect(iconCX - 1, iconCY + iconR - 1, 2, pillY - (iconCY + iconR - 1))
    .fill({ color: badgeLight, alpha: 0.45 });
  container.addChild(connGr);

  // Outer glow rings
  const glowGr = g(ctx);
  glowGr.circle(iconCX, iconCY, iconR + 18).fill({ color: badgeColor, alpha: 0.07 });
  glowGr.circle(iconCX, iconCY, iconR + 10).fill({ color: badgeColor, alpha: 0.15 });
  glowGr.circle(iconCX + 2, iconCY + 3, iconR + 1).fill({ color: 0x000000, alpha: 0.44 }); // drop shadow
  container.addChild(glowGr);

  // Icon circle: dark rim → colored body → shine
  const circleGr = g(ctx);
  circleGr.circle(iconCX, iconCY, iconR + 2.5).fill({ color: darkenIntentHex(badgeColor, 0.18) });
  circleGr.circle(iconCX, iconCY, iconR).fill({ color: badgeColor });
  circleGr.circle(iconCX - iconR * 0.26, iconCY - iconR * 0.30, iconR * 0.52).fill({ color: 0xffffff, alpha: 0.20 });
  circleGr.circle(iconCX, iconCY, iconR).stroke({ width: 2.5, color: badgeShine, alpha: 0.95 });
  circleGr.circle(iconCX, iconCY, iconR - 5).stroke({ width: 1, color: badgeLight, alpha: 0.28 });
  container.addChild(circleGr);

  // Intent symbol
  const symText = t(ctx);
  symText.text = intentSymbol(type);
  symText.style = {
    fontFamily: 'system-ui, serif',
    fontSize: Math.round(iconR * 1.18),
    fill: 0xffffff,
    fontWeight: '700',
    dropShadow: { color: 0x000000, blur: 6, distance: 1.5, alpha: 0.9 },
  };
  symText.anchor.set(0.5, 0.5);
  symText.x = iconCX;
  symText.y = iconCY;
  container.addChild(symText);

  // Value pill background
  const pillBg = g(ctx);
  pillBg.roundRect(pillX, pillY, pillW, pillH, pillH / 2)
    .fill({ color: badgeDark, alpha: 0.95 })
    .stroke({ width: 1.5, color: badgeLight, alpha: 0.70 });
  pillBg.roundRect(pillX + 4, pillY + 5, 3, pillH - 10, 1.5).fill({ color: badgeShine, alpha: 0.78 });
  container.addChild(pillBg);

  // Intent type name (small caps, inside pill top)
  const typeText = t(ctx);
  typeText.text = intentTypeName(type);
  typeText.style = {
    fontFamily: 'system-ui',
    fontSize: 10,
    fill: badgeLight,
    fontWeight: '700',
    letterSpacing: 0.8,
  };
  typeText.anchor.set(0.5, 0);
  typeText.x = iconCX + 3;
  typeText.y = pillY + 3;
  container.addChild(typeText);

  // Value line (bold, larger, bottom of pill)
  const valText = t(ctx);
  valText.text = valLine;
  valText.style = {
    fontFamily: 'system-ui',
    fontSize: 16,
    fill: 0xffffff,
    fontWeight: 'bold',
    dropShadow: { color: 0x000000, blur: 4, distance: 1, alpha: 0.85 },
  };
  valText.anchor.set(secLabel ? 0 : 0.5, 1);
  valText.x = secLabel ? pillX + 14 : iconCX + 3;
  valText.y = pillY + pillH - 2;
  container.addChild(valText);

  // Secondary effect label right-aligned in pill
  if (secLabel) {
    const secText = t(ctx);
    secText.text = secLabel;
    secText.style = {
      fontFamily: 'system-ui',
      fontSize: 10,
      fill: badgeShine,
      fontWeight: '600',
    };
    secText.anchor.set(1, 1);
    secText.x = pillX + pillW - 6;
    secText.y = pillY + pillH - 3;
    container.addChild(secText);
  }
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
  vmGrowSeedAnimationPlaying?: boolean;
  getVMGrowSeedTexture?: () => PIXI.Texture | null;
  vmSpellAnimationPlaying?: boolean;
  getVMSpellTexture?: () => PIXI.Texture | null;
  vmSummoningAnimationPlaying?: boolean;
  getVMSummoningTexture?: () => PIXI.Texture | null;
  vmCommandingAnimationPlaying?: boolean;
  getVMCommandingTexture?: () => PIXI.Texture | null;
  vmEvolveAnimationPlaying?: boolean;
  getVMEvolveTexture?: () => PIXI.Texture | null;
  vmDetonateAnimationPlaying?: boolean;
  getVMDetonateTexture?: () => PIXI.Texture | null;
  vmDrainAnimationPlaying?: boolean;
  getVMDrainTexture?: () => PIXI.Texture | null;
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
  getEnemyAnimationTextureById?: (enemyId: string, nowMs: number) => PIXI.Texture | null;
  hoveredEnemyIndex: number | null;
  onEnemySpriteCreated?: (index: number, sprite: PIXI.Sprite) => void;
}

export interface CombatViewContext {
  stage: PIXI.Container;
  state: GameState;
  w: number;
  h: number;
  padding: number;
  /** When enabled, draw debug rectangles for layout alignment. */
  debugLayout?: boolean;
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
  getHpBarBgTexture?: () => PIXI.Texture | null;
  getHpBarProgressTexture?: () => PIXI.Texture | null;
  getHpBarBorderTexture?: () => PIXI.Texture | null;
  getShieldBarBgTexture?: () => PIXI.Texture | null;
  getShieldBarProgressTexture?: () => PIXI.Texture | null;
  getShieldBarBorderTexture?: () => PIXI.Texture | null;
  /** @deprecated Use player.getPlayerTexture */
  getPlayerTexture?: () => PIXI.Texture | null;
  /** @deprecated Use enemies.getEnemyTexture */
  getEnemyTexture?: (id: string) => PIXI.Texture | null;
  /** @deprecated Use enemies.getEnemyAnimationTextureById */
  getEnemyAnimationTextureById?: (enemyId: string, nowMs: number) => PIXI.Texture | null;
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
  vmGrowSeedAnimationPlaying?: boolean;
  getVMGrowSeedTexture?: () => PIXI.Texture | null;
  vmSpellAnimationPlaying?: boolean;
  getVMSpellTexture?: () => PIXI.Texture | null;
  vmSummoningAnimationPlaying?: boolean;
  getVMSummoningTexture?: () => PIXI.Texture | null;
  vmCommandingAnimationPlaying?: boolean;
  getVMCommandingTexture?: () => PIXI.Texture | null;
  vmEvolveAnimationPlaying?: boolean;
  getVMEvolveTexture?: () => PIXI.Texture | null;
  vmDetonateAnimationPlaying?: boolean;
  getVMDetonateTexture?: () => PIXI.Texture | null;
  vmDrainAnimationPlaying?: boolean;
  getVMDrainTexture?: () => PIXI.Texture | null;
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
  const text = ctx.pools ? ctx.pools.getText() : new PIXI.Text({ text: '' });
  if (!ctx.pools) {
    const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;
    text.resolution = dpr;
  }
  text.roundPixels = true;
  return text;
}
function c(ctx: CombatViewContext): PIXI.Container {
  return ctx.pools ? ctx.pools.getContainer() : new PIXI.Container();
}
/** Always create a new Sprite (no pooling). Pooled sprite reuse caused wrong textures on cards (player/map/icon appearing on hover). */
function spriteNew(): PIXI.Sprite {
  return new PIXI.Sprite();
}
// ---------------------------------------------------------------------------
// Card neon border & enemy target border
// ---------------------------------------------------------------------------

function scaledFontSize(base: number, ctx: CombatViewContext): number {
  const scale = ctx.textScale ?? 1;
  return Math.round(base * scale);
}

interface StatBarPalette {
  fill: number;
  glow: number;
  border?: number;
}

/** Header-style stat bar used for HP/Shield/Energy (no texture assets). */
function drawStyledStatBar(
  ctx: CombatViewContext,
  container: PIXI.Container,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    ratio: number;
    label: string;
    palette: StatBarPalette;
    fontSize: number;
  }
): void {
  const { x, y, width, height, label, palette, fontSize } = opts;
  const ratio = Math.max(0, Math.min(1, opts.ratio));
  const radius = Math.max(4, Math.round(height / 2));
  const fillW = Math.max(0, width * ratio);

  const track = g(ctx);
  track.roundRect(x, y, width, height, radius).fill({ color: 0x000000, alpha: 0.5 });
  track.roundRect(x, y, width, height, radius).stroke({ width: 1, color: palette.border ?? 0xffffff, alpha: 0.14 });
  container.addChild(track);

  if (fillW > 0) {
    const fill = g(ctx);
    fill.roundRect(x, y, fillW, height, radius).fill({ color: palette.fill, alpha: 0.92 });
    if (fillW > 6) {
      fill.roundRect(x + 2, y + 1, fillW - 4, Math.max(2, height * 0.36), Math.max(2, height * 0.2))
        .fill({ color: 0xffffff, alpha: 0.14 });
    }
    fill.roundRect(x, y, fillW, height, radius).stroke({ width: 1, color: palette.glow, alpha: 0.55 });
    container.addChild(fill);

    const glow = g(ctx);
    glow.roundRect(x - 1, y - 1, fillW + 2, height + 2, radius + 1).stroke({ width: 1, color: palette.glow, alpha: 0.2 });
    container.addChild(glow);
  }

  const valueText = t(ctx);
  valueText.text = label;
  valueText.style = { fontFamily: 'system-ui', fontSize, fill: 0xe8d8a0, fontWeight: 'bold' };
  valueText.anchor.set(0.5, 0.5);
  valueText.x = x + width / 2;
  valueText.y = y + height / 2;
  container.addChild(valueText);
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
// Card type colour palette
// ---------------------------------------------------------------------------

interface CardTypePalette {
  frameColor: number;
  frameColorDim: number;
  accentTop: number;
  accentTopAlpha: number;
  artBg: number;
  artPatternColor: number;
  nameBg: number;
  dividerColor: number;
  bodyBg: number;
  gemColor: number;
  nameColor: number;
  descColor: number;
  costColor: number;
  costBg: number;
}

/** Derives a colour palette for a card based on its effect description text. */
function getCardPalette(effectDesc: string, playable: boolean): CardTypePalette {
  const d = effectDesc.toLowerCase();
  const isDamage  = /deal|damage|hit|strike|shot|attack/i.test(d);
  const isDefense = /block|shield|barrier|reinforce/i.test(d);
  const isNature  = /plant|grow|summon|seed|tendril|vine/i.test(d);

  if (!playable) {
    return {
      frameColor:      0x3d2d60,
      frameColorDim:   0x1e1630,
      accentTop:       0x5533aa,
      accentTopAlpha:  0.55,
      artBg:           0x08060f,
      artPatternColor: 0x2a1a55,
      nameBg:          0x100c1f,
      dividerColor:    0x3a2566,
      bodyBg:          0x090714,
      gemColor:        0x44286e,
      nameColor:       0x7766aa,
      descColor:       0x5c5080,
      costColor:       0x886677,
      costBg:          0x060410,
    };
  }

  if (isNature) {
    return {
      frameColor:      0x33aa55,
      frameColorDim:   0x1a5c2e,
      accentTop:       0x44cc66,
      accentTopAlpha:  0.8,
      artBg:           0x071410,
      artPatternColor: 0x164428,
      nameBg:          0x0e2018,
      dividerColor:    0x2d8847,
      bodyBg:          0x08110d,
      gemColor:        0x33aa55,
      nameColor:       0xaaffcc,
      descColor:       0x88ddaa,
      costColor:       0x88ffaa,
      costBg:          0x061008,
    };
  }

  if (isDamage && !isDefense) {
    return {
      frameColor:      0xcc4422,
      frameColorDim:   0x661a0e,
      accentTop:       0xff5533,
      accentTopAlpha:  0.8,
      artBg:           0x160804,
      artPatternColor: 0x441a0c,
      nameBg:          0x1e0c08,
      dividerColor:    0x993322,
      bodyBg:          0x0f0604,
      gemColor:        0xcc4422,
      nameColor:       0xffccbb,
      descColor:       0xddaa99,
      costColor:       0xff8866,
      costBg:          0x100402,
    };
  }

  if (isDefense && !isDamage) {
    return {
      frameColor:      0x2266cc,
      frameColorDim:   0x0f2e66,
      accentTop:       0x3388ff,
      accentTopAlpha:  0.8,
      artBg:           0x040c18,
      artPatternColor: 0x0e2a5c,
      nameBg:          0x071220,
      dividerColor:    0x1a4d99,
      bodyBg:          0x040a14,
      gemColor:        0x2266cc,
      nameColor:       0xbbddff,
      descColor:       0x99bbdd,
      costColor:       0x6699ff,
      costBg:          0x030810,
    };
  }

  // Mixed or utility — rich purple (default, Slay the Spire feel)
  return {
    frameColor:      0x7755cc,
    frameColorDim:   0x332266,
    accentTop:       0x9966ff,
    accentTopAlpha:  0.8,
    artBg:           0x0d1020,
    artPatternColor: 0x2a1a55,
    nameBg:          0x160f2e,
    dividerColor:    0x5533aa,
    bodyBg:          0x0b0818,
    gemColor:        0x8855dd,
    nameColor:       0xeeddff,
    descColor:       0xccbbee,
    costColor:       0xaa88ff,
    costBg:          0x08050e,
  };
}

/** Draws a production-ready procedural card body onto `cardBody` Graphics. No external textures required. */
function drawCardBody(
  cardBody: PIXI.Graphics,
  cardWidth: number,
  cardHeight: number,
  cr: number,
  pal: CardTypePalette,
): void {
  const artH  = 90;
  const nameH = 26;
  const divH  = 4;
  const nameY = artH;
  const divY  = nameY + nameH;
  const bodyY = divY + divH;

  // ── Base card ──
  cardBody.roundRect(0, 0, cardWidth, cardHeight, cr).fill({ color: 0x06040d });

  // ── Art zone ──
  cardBody.roundRect(0, 0, cardWidth, artH + cr, cr).fill({ color: pal.artBg });
  cardBody.rect(0, artH, cardWidth, cr).fill({ color: pal.artBg });

  // Diagonal stripe pattern in art zone
  for (let si = 0; si < 10; si++) {
    const sx = si * 20 - 6;
    cardBody.rect(sx, 0, 9, artH).fill({ color: pal.artPatternColor, alpha: 0.13 });
  }
  // Subtle crosshatch dots in art zone
  for (let dx = 16; dx < cardWidth - 8; dx += 22) {
    for (let dy = 16; dy < artH - 8; dy += 18) {
      cardBody.circle(dx, dy, 0.9).fill({ color: pal.frameColor, alpha: 0.18 });
    }
  }
  // Centre art placeholder ring
  const cx = cardWidth / 2;
  const cy = artH / 2 - 4;
  cardBody.circle(cx, cy, 18).fill({ color: pal.frameColor, alpha: 0.12 });
  cardBody.circle(cx, cy, 18).stroke({ width: 1, color: pal.frameColor, alpha: 0.22 });
  cardBody.circle(cx, cy, 10).fill({ color: pal.artPatternColor, alpha: 0.25 });
  // Top type accent strip
  cardBody.roundRect(0, 0, cardWidth, 5, cr).fill({ color: pal.accentTop, alpha: pal.accentTopAlpha });
  cardBody.rect(0, cr, cardWidth, 3).fill({ color: pal.accentTop, alpha: pal.accentTopAlpha });
  // Art zone bottom shadow
  cardBody.rect(0, artH - 2, cardWidth, 2).fill({ color: 0x000000, alpha: 0.4 });

  // ── Name band ──
  cardBody.rect(0, nameY, cardWidth, nameH).fill({ color: pal.nameBg });
  cardBody.rect(2, nameY, cardWidth - 4, 1).fill({ color: 0xffffff, alpha: 0.06 });
  cardBody.rect(2, nameY + nameH - 1, cardWidth - 4, 1).fill({ color: 0x000000, alpha: 0.25 });

  // ── Divider accent ──
  cardBody.rect(0, divY, cardWidth, divH).fill({ color: pal.dividerColor, alpha: 0.9 });
  cardBody.rect(0, divY, cardWidth, 1).fill({ color: pal.accentTop, alpha: 0.55 });

  // ── Body zone ──
  cardBody.rect(0, bodyY, cardWidth, cardHeight - bodyY - cr).fill({ color: pal.bodyBg });
  // Subtle vignette at bottom
  cardBody.roundRect(0, cardHeight - cr * 3, cardWidth, cr * 3, cr).fill({ color: 0x000000, alpha: 0.22 });

  // ── Outer border: layered glow + crisp edge ──
  cardBody.roundRect(0, 0, cardWidth, cardHeight, cr).stroke({ width: 6, color: pal.frameColor, alpha: 0.15 });
  cardBody.roundRect(0, 0, cardWidth, cardHeight, cr).stroke({ width: 2, color: pal.frameColor, alpha: 0.9 });
  // Thin inner highlight bevel
  cardBody.roundRect(2, 2, cardWidth - 4, cardHeight - 4, cr - 1).stroke({ width: 1, color: 0xffffff, alpha: 0.1 });

  // ── Corner gem ornaments ──
  const gems: [number, number][] = [
    [4, 4], [cardWidth - 10, 4],
    [4, cardHeight - 10], [cardWidth - 10, cardHeight - 10],
  ];
  for (const [gx, gy] of gems) {
    cardBody.roundRect(gx, gy, 6, 6, 1.5).fill({ color: pal.gemColor, alpha: 0.9 });
    cardBody.roundRect(gx, gy, 6, 6, 1.5).stroke({ width: 0.5, color: 0xffffff, alpha: 0.35 });
    cardBody.circle(gx + 1.5, gy + 1.5, 1.2).fill({ color: 0xffffff, alpha: 0.22 });
  }
}

/** Draws the cost gem circle. */
function drawCostGem(
  costBg: PIXI.Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  costColor: number,
  costBgColor: number,
): void {
  costBg.circle(centerX, centerY, radius + 4).fill({ color: costColor, alpha: 0.1 });
  costBg.circle(centerX, centerY, radius + 1).fill({ color: 0x000000, alpha: 0.55 });
  costBg.circle(centerX, centerY, radius).fill({ color: costBgColor });
  costBg.circle(centerX, centerY, radius).stroke({ width: 2, color: costColor, alpha: 1 });
  // Inner gloss highlight
  costBg.circle(centerX - 3, centerY - 4, 5).fill({ color: 0xffffff, alpha: 0.12 });
  costBg.circle(centerX - 2, centerY - 3, 2.5).fill({ color: 0xffffff, alpha: 0.08 });
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

/** B13: Draw combat background (sprite or atmospheric gradient) at zIndex 0. */
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
    // Vignette overlay — darkens edges for depth
    const overlay = g(ctx);
    overlay.rect(bgBounds.x, bgBounds.y, bgBounds.width, bgBounds.height).fill({ color: 0x000000, alpha: 0.38 });
    overlay.zIndex = 1;
    stage.addChild(overlay);
  } else {
    // Atmospheric gradient fallback: deep navy → dark purple → near-black
    const bg = g(ctx);
    // Sky gradient (top is lighter dark)
    bg.rect(bgBounds.x, bgBounds.y, bgBounds.width, bgBounds.height * 0.5).fill(0x0e0e1e);
    bg.rect(bgBounds.x, bgBounds.y + bgBounds.height * 0.5, bgBounds.width, bgBounds.height * 0.5).fill(0x12101e);
    // Mid-scene glow (behind character area)
    const glowCX = w * 0.5;
    const glowCY = h * 0.5;
    bg.circle(glowCX, glowCY, Math.min(w, h) * 0.45).fill({ color: 0x1a0e2a, alpha: 0.55 });
    // Side vignettes
    bg.rect(bgBounds.x, bgBounds.y, bgBounds.width * 0.15, bgBounds.height).fill({ color: 0x000000, alpha: 0.45 });
    bg.rect(bgBounds.x + bgBounds.width * 0.85, bgBounds.y, bgBounds.width * 0.15, bgBounds.height).fill({ color: 0x000000, alpha: 0.45 });
    bg.zIndex = 0;
    stage.addChild(bg);

    // Ground / floor platform line
    const floorY = h * COMBAT_LAYOUT.baselineBottomRatio;
    const floor = g(ctx);
    // Subtle horizontal ground glow
    floor.rect(0, floorY - 2, w, 4).fill({ color: 0x5540aa, alpha: 0.25 });
    floor.rect(0, floorY, w, 1).fill({ color: 0x8870cc, alpha: 0.18 });
    // Perspective floor tiles (just lines for depth)
    for (let i = 1; i <= 6; i++) {
      const lineAlpha = 0.04 + i * 0.015;
      const lineY = floorY + i * 18;
      if (lineY < h) {
        floor.rect(0, lineY, w, 1).fill({ color: 0x8870cc, alpha: lineAlpha });
      }
    }
    floor.zIndex = 1;
    stage.addChild(floor);
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
  const vmGrowSeedTex = ctx.vmGrowSeedAnimationPlaying && ctx.getVMGrowSeedTexture?.() ? ctx.getVMGrowSeedTexture() : null;
  const vmSpellTex = ctx.vmSpellAnimationPlaying && ctx.getVMSpellTexture?.() ? ctx.getVMSpellTexture() : null;
  const vmSummoningTex = ctx.vmSummoningAnimationPlaying && ctx.getVMSummoningTexture?.() ? ctx.getVMSummoningTexture() : null;
  const vmCommandingTex = ctx.vmCommandingAnimationPlaying && ctx.getVMCommandingTexture?.() ? ctx.getVMCommandingTexture() : null;
  const vmEvolveTex = ctx.vmEvolveAnimationPlaying && ctx.getVMEvolveTexture?.() ? ctx.getVMEvolveTexture() : null;
  const vmDetonateTex = ctx.vmDetonateAnimationPlaying && ctx.getVMDetonateTexture?.() ? ctx.getVMDetonateTexture() : null;
  const vmDrainTex = ctx.vmDrainAnimationPlaying && ctx.getVMDrainTexture?.() ? ctx.getVMDrainTexture() : null;
  const playerTex = slashingTex ?? shootingTex ?? shieldTex ?? vmGrowSeedTex ?? vmSpellTex ?? vmSummoningTex ?? vmCommandingTex ?? vmEvolveTex ?? vmDetonateTex ?? vmDrainTex ?? (ctx.getPlayerTexture?.() ?? null);

  const centerX = playerPlaceholderW / 2;
  const feetY = playerPlaceholderH;

  if (playerTex) {
    // Ambient halo behind player character
    const halo = g(ctx);
    const haloR = playerPlaceholderW * 0.55;
    halo.circle(centerX, feetY - playerPlaceholderH * 0.42, haloR).fill({ color: 0x4a2a88, alpha: 0.18 });
    halo.circle(centerX, feetY - playerPlaceholderH * 0.42, haloR * 0.7).fill({ color: 0x6636aa, alpha: 0.12 });
    playerContainer.addChild(halo);

    // Ground ellipse shadow (large and soft)
    const groundShadow = g(ctx);
    const shadowW = playerPlaceholderW * 0.78;
    const shadowH = playerPlaceholderH * 0.065;
    groundShadow.ellipse(centerX, feetY - 10, shadowW / 2, shadowH).fill({ color: 0x000000, alpha: 0.6 });
    groundShadow.ellipse(centerX, feetY - 10, shadowW * 0.55 / 2, shadowH * 0.55).fill({ color: 0x000000, alpha: 0.35 });
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
    // Polished placeholder when no texture is available
    const torsoH = playerPlaceholderH * 0.45;
    const torsoW = playerPlaceholderW * 0.38;
    const headR = playerPlaceholderW * 0.15;
    const torsoX = centerX - torsoW / 2;
    const torsoY = feetY - torsoH - headR * 1.8;

    // Ambient glow ring
    const halo = g(ctx);
    halo.circle(centerX, feetY - playerPlaceholderH * 0.45, playerPlaceholderW * 0.52).fill({ color: 0x3a2a78, alpha: 0.22 });
    playerContainer.addChild(halo);

    // Ground shadow
    const groundShadow = g(ctx);
    groundShadow.ellipse(centerX, feetY - 8, playerPlaceholderW * 0.38, playerPlaceholderH * 0.055).fill({ color: 0x000000, alpha: 0.55 });
    playerContainer.addChild(groundShadow);

    // Cape / cloak (behind body)
    const cape = g(ctx);
    cape.moveTo(centerX - torsoW * 0.65, torsoY + torsoH * 0.2).lineTo(centerX - torsoW * 0.85, feetY - 16).lineTo(centerX + torsoW * 0.85, feetY - 16).lineTo(centerX + torsoW * 0.65, torsoY + torsoH * 0.2).closePath().fill({ color: 0x2a1a50 });
    cape.moveTo(centerX - torsoW * 0.65, torsoY + torsoH * 0.2).lineTo(centerX - torsoW * 0.85, feetY - 16).lineTo(centerX + torsoW * 0.85, feetY - 16).lineTo(centerX + torsoW * 0.65, torsoY + torsoH * 0.2).closePath().stroke({ width: 1.5, color: 0x5a3a90, alpha: 0.7 });
    playerContainer.addChild(cape);

    // Body (torso)
    const playerBody = g(ctx);
    playerBody.roundRect(torsoX, torsoY, torsoW, torsoH, 6).fill({ color: 0x3a4878 });
    playerBody.roundRect(torsoX, torsoY, torsoW, torsoH, 6).stroke({ width: 2, color: 0x6878b8 });
    // Chest detail stripe
    playerBody.rect(torsoX + torsoW * 0.35, torsoY + torsoH * 0.1, torsoW * 0.08, torsoH * 0.55).fill({ color: 0x8898e8, alpha: 0.55 });
    // Shoulder pauldrons
    playerBody.roundRect(torsoX - 8, torsoY + 4, 14, 22, 4).fill({ color: 0x4a5a8a }).stroke({ width: 1, color: 0x6878b8 });
    playerBody.roundRect(torsoX + torsoW - 6, torsoY + 4, 14, 22, 4).fill({ color: 0x4a5a8a }).stroke({ width: 1, color: 0x6878b8 });
    playerContainer.addChild(playerBody);

    // Head
    const playerHead = g(ctx);
    const headCX = centerX;
    const headCY = torsoY - headR * 0.5;
    playerHead.circle(headCX, headCY, headR).fill({ color: 0x4a5880 });
    playerHead.circle(headCX, headCY, headR).stroke({ width: 2, color: 0x7888b8 });
    // Helmet / visor
    playerHead.roundRect(headCX - headR * 0.7, headCY - headR * 0.15, headR * 1.4, headR * 0.45, 4).fill({ color: 0x7090f0, alpha: 0.55 });
    // Eye glow
    playerHead.circle(headCX - headR * 0.22, headCY - headR * 0.02, headR * 0.14).fill({ color: 0x88ccff, alpha: 0.9 });
    playerHead.circle(headCX + headR * 0.22, headCY - headR * 0.02, headR * 0.14).fill({ color: 0x88ccff, alpha: 0.9 });
    playerContainer.addChild(playerHead);

    // Weapon (sword / staff outline)
    const weaponGr = g(ctx);
    const wpX = torsoX + torsoW + 6;
    const wpBottomY = feetY - 12;
    const wpTopY = torsoY - headR;
    weaponGr.rect(wpX, wpTopY, 5, wpBottomY - wpTopY).fill({ color: 0xaabbee });
    weaponGr.rect(wpX - 8, torsoY + torsoH * 0.18, 21, 4).fill({ color: 0x8899cc });
    weaponGr.circle(wpX + 2.5, wpTopY, 7).fill({ color: 0xccddff, alpha: 0.9 });
    playerContainer.addChild(weaponGr);
  }

  // Block flash VFX
  const showBlockFlash = ctx.vfxIntensity !== 'off' && ctx.floatingNumbers.some((f) => f.type === 'block');
  if (showBlockFlash) {
    const blockOverlay = g(ctx);
    blockOverlay.roundRect(4, 4, playerPlaceholderW - 8, playerPlaceholderH - 8, L.enemyCornerRadius)
      .fill({ color: 0x44ffaa, alpha: 0.22 })
      .stroke({ width: 3, color: 0x44ffaa, alpha: 0.7 });
    playerContainer.addChild(blockOverlay);
  }

  // Damage flash VFX
  const showDmgFlash = ctx.vfxIntensity !== 'off' && ctx.floatingNumbers.some((f) => f.type === 'damage' && f.enemyIndex == null);
  if (showDmgFlash) {
    const dmgOverlay = g(ctx);
    dmgOverlay.roundRect(4, 4, playerPlaceholderW - 8, playerPlaceholderH - 8, L.enemyCornerRadius)
      .fill({ color: 0xff3333, alpha: 0.25 })
      .stroke({ width: 3, color: 0xff3333, alpha: 0.8 });
    playerContainer.addChild(dmgOverlay);
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
// HP/Block/Energy icons — Polished STS-style Player HUD
// ---------------------------------------------------------------------------

/** Helper: draws a fully polished HP-style stat bar with inner glow, shine stripe and segment ticks. */
function drawHudStatBar(
  ctx: CombatViewContext,
  container: PIXI.Container,
  x: number, y: number, barW: number, barH: number,
  ratio: number,
  palette: { fill: number; glow: number; border: number },
  labelText: string,
): void {
  const r = Math.max(4, Math.round(barH / 2));
  const fillW = Math.max(0, barW * Math.max(0, Math.min(1, ratio)));

  // Track (dark recessed trough)
  const track = g(ctx);
  track.roundRect(x, y, barW, barH, r).fill({ color: 0x050308, alpha: 0.88 });
  track.roundRect(x, y, barW, barH, r).stroke({ width: 1, color: palette.border, alpha: 0.18 });
  container.addChild(track);

  if (fillW > 0) {
    // Main fill
    const fill = g(ctx);
    fill.roundRect(x, y, fillW, barH, r).fill({ color: palette.fill, alpha: 0.96 });
    // Top shine stripe
    if (fillW > 8) {
      fill.roundRect(x + 2, y + 2, fillW - 4, Math.max(2, barH * 0.32), Math.max(2, barH * 0.18))
        .fill({ color: 0xffffff, alpha: 0.17 });
    }
    // Segment tick marks (20% intervals)
    for (let seg = 1; seg <= 4; seg++) {
      const sx = x + barW * seg * 0.2;
      if (sx < x + fillW - 2) {
        fill.rect(sx, y + 2, 1.5, barH - 4).fill({ color: 0x000000, alpha: 0.22 });
      }
    }
    fill.roundRect(x, y, fillW, barH, r).stroke({ width: 1, color: palette.glow, alpha: 0.55 });
    container.addChild(fill);

    // Outer glow halo
    const glowGr = g(ctx);
    glowGr.roundRect(x - 1, y - 1, fillW + 2, barH + 2, r + 1)
      .stroke({ width: 2, color: palette.glow, alpha: 0.22 });
    container.addChild(glowGr);
  }

  // Centered label text (e.g. "45 / 80")
  const lbl = t(ctx);
  lbl.text = labelText;
  lbl.style = {
    fontFamily: 'system-ui',
    fontSize: scaledFontSize(13, ctx),
    fill: 0xffffff,
    fontWeight: 'bold',
    dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.95 },
  };
  lbl.anchor.set(0.5, 0.5);
  lbl.x = x + barW / 2;
  lbl.y = y + barH / 2;
  container.addChild(lbl);
}

/** Draws the polished player HUD: HP bar, block badge, energy orbs, and status badges. */
function drawHpBlockEnergyIcons(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const playerBounds = getCombatSlotBounds('player', w, h);
  const hpBounds = getCombatSlotBounds('hpBlockEnergy', w, h);

  // Panel is centered on the player character
  const panelW   = Math.max(260, L.playerPlaceholderW + 20);
  const panelX   = playerBounds.x + playerBounds.width / 2 - panelW / 2;
  const panelPad = 10;
  const innerW   = panelW - panelPad * 2;
  const barInnerX = panelX + panelPad;

  const hpRatio  = state.playerMaxHp > 0 ? Math.max(0, Math.min(1, state.playerHp / state.playerMaxHp)) : 0;
  const blockVal = state.playerBlock ?? 0;
  const curEnergy = state.energy;
  const maxEnergy = state.maxEnergy;

  // HP bar palette: green at full → orange → crimson at low
  const hpPalette = hpRatio < 0.25
    ? { fill: 0xcc1212, glow: 0xff3333, border: 0xff7777 }
    : hpRatio < 0.55
      ? { fill: 0xc06010, glow: 0xf08028, border: 0xf0aa66 }
      : { fill: 0x1a8832, glow: 0x33cc55, border: 0x66ee88 };

  // Section heights
  const headerH   = 22;   // "HP" label row
  const barH      = 26;
  const blockH    = blockVal > 0 ? 28 : 0;
  const divH      = 2;
  const orbSize   = 22;
  const energyH   = orbSize + 8;

  const playerStr      = state.strengthStacks        ?? 0;
  const playerWeak     = state.playerWeakStacks       ?? 0;
  const playerVuln     = state.playerVulnerableStacks ?? 0;
  const playerFrail    = state.frailStacks            ?? 0;
  const playerArtifact = state.playerArtifactStacks   ?? 0;
  const hexInHand      = state.hand.filter((id) => id === 'hex').length;

  interface HudBadgeDef { icon: string; label: string; count: string; bg: number; border: number; glow: number; }
  const playerBadges: HudBadgeDef[] = [];
  if (playerStr > 0)      playerBadges.push({ icon: '\u2694', label: 'STR',   count: `${playerStr}`,      bg: 0x8a1a1a, border: 0xff5555, glow: 0xff3333 });
  if (playerWeak > 0)     playerBadges.push({ icon: '\u223c', label: 'WEAK',  count: `${playerWeak}`,     bg: 0x333300, border: 0x888800, glow: 0xcccc00 });
  if (playerVuln > 0)     playerBadges.push({ icon: '\u25bd', label: 'VULN',  count: `${playerVuln}`,     bg: 0x550033, border: 0xcc1177, glow: 0xff44aa });
  if (playerFrail > 0)    playerBadges.push({ icon: '\u2248', label: 'FRAIL', count: `${playerFrail}`,    bg: 0x333355, border: 0x6666aa, glow: 0x8888cc });
  if (playerArtifact > 0) playerBadges.push({ icon: '\u25c6', label: 'ART',   count: `${playerArtifact}`, bg: 0x004433, border: 0x00bb77, glow: 0x00ffaa });
  if (hexInHand > 0)      playerBadges.push({ icon: '\u2726', label: 'HEX',   count: `${hexInHand}`,      bg: 0x330033, border: 0x9922aa, glow: 0xcc33dd });

  const badgeSz   = 28;
  const badgeH    = playerBadges.length > 0 ? badgeSz + 14 : 0;

  const totalPanelH = panelPad + headerH + 4 + barH + 6 + (blockH > 0 ? blockH + 6 : 0) + divH + 6 + energyH + (badgeH > 0 ? 6 + badgeH : 0) + panelPad;

  const panelY = hpBounds.y - 4;

  const container = c(ctx);
  container.zIndex = 20;

  // ── Outer glow halo around panel ───────────────────────────────────────
  const panelGlow = g(ctx);
  panelGlow.roundRect(panelX - 4, panelY - 4, panelW + 8, totalPanelH + 8, 16)
    .fill({ color: hpPalette.glow, alpha: 0.04 });
  container.addChild(panelGlow);

  // ── Background panel ──────────────────────────────────────────────────
  const panelBg = g(ctx);
  // Main body
  panelBg.roundRect(panelX, panelY, panelW, totalPanelH, 12)
    .fill({ color: 0x060412, alpha: 0.90 });
  // Subtle inner bevel
  panelBg.roundRect(panelX + 1, panelY + 1, panelW - 2, totalPanelH - 2, 11)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
  // Outer border — green when healthy, orange mid, red low
  panelBg.roundRect(panelX, panelY, panelW, totalPanelH, 12)
    .stroke({ width: 1.5, color: hpPalette.glow, alpha: 0.35 });
  // Top accent bar (colored stripe)
  panelBg.roundRect(panelX, panelY, panelW, 3, 12).fill({ color: hpPalette.glow, alpha: 0.50 });
  panelBg.roundRect(panelX + 4, panelY, panelW - 8, 1, 1).fill({ color: 0xffffff, alpha: 0.10 });
  container.addChild(panelBg);

  let curY = panelY + panelPad;

  // ── HP header row: icon + "HP" label + "X / Y" value ─────────────────
  const hpHeaderGr = g(ctx);
  // Heart icon circle
  const hpIconR = 8;
  const hpIconCX = barInnerX + hpIconR + 2;
  const hpIconCY = curY + headerH / 2;
  hpHeaderGr.circle(hpIconCX, hpIconCY, hpIconR + 2).fill({ color: hpPalette.fill, alpha: 0.22 });
  hpHeaderGr.circle(hpIconCX, hpIconCY, hpIconR).fill({ color: hpPalette.fill, alpha: 0.95 });
  hpHeaderGr.circle(hpIconCX, hpIconCY, hpIconR).stroke({ width: 1, color: hpPalette.glow, alpha: 0.65 });
  hpHeaderGr.circle(hpIconCX - hpIconR * 0.3, hpIconCY - hpIconR * 0.35, hpIconR * 0.38).fill({ color: 0xffffff, alpha: 0.25 });
  container.addChild(hpHeaderGr);

  // "HP" label
  const hpLbl = t(ctx);
  hpLbl.text = 'HP';
  hpLbl.style = {
    fontFamily: 'system-ui',
    fontSize: scaledFontSize(11, ctx),
    fill: hpPalette.glow,
    fontWeight: '800',
    letterSpacing: 1,
  };
  hpLbl.anchor.set(0, 0.5);
  hpLbl.x = hpIconCX + hpIconR + 6;
  hpLbl.y = hpIconCY;
  container.addChild(hpLbl);

  // HP value right-aligned
  const hpValT = t(ctx);
  hpValT.text = `${state.playerHp} / ${state.playerMaxHp}`;
  hpValT.style = {
    fontFamily: 'system-ui',
    fontSize: scaledFontSize(14, ctx),
    fill: 0xf0ead0,
    fontWeight: 'bold',
    dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.9 },
  };
  hpValT.anchor.set(1, 0.5);
  hpValT.x = panelX + panelW - panelPad;
  hpValT.y = hpIconCY;
  container.addChild(hpValT);

  curY += headerH + 4;

  // ── HP bar ─────────────────────────────────────────────────────────────
  drawHudStatBar(ctx, container, barInnerX, curY, innerW, barH, hpRatio, hpPalette, '');
  curY += barH + 6;

  // ── Block row (only when block > 0) ────────────────────────────────────
  if (blockVal > 0) {
    const shieldGlow = g(ctx);
    shieldGlow.roundRect(barInnerX - 2, curY - 2, innerW + 4, blockH + 4, 14)
      .fill({ color: 0x2244cc, alpha: 0.16 });
    container.addChild(shieldGlow);

    const shieldBg = g(ctx);
    shieldBg.roundRect(barInnerX, curY, innerW, blockH, 12)
      .fill({ color: 0x07101f, alpha: 0.95 })
      .stroke({ width: 1.5, color: 0x44aaff, alpha: 0.80 });
    // Left accent stripe
    shieldBg.roundRect(barInnerX + 4, curY + 5, 3, blockH - 10, 2).fill({ color: 0x88ccff, alpha: 0.72 });
    container.addChild(shieldBg);

    // Shield icon (pentagon/square-ish shape)
    const shieldIconGr = g(ctx);
    const siCX = barInnerX + 22;
    const siCY = curY + blockH / 2;
    shieldIconGr.circle(siCX, siCY, 11).fill({ color: 0x0a1e38, alpha: 0.95 });
    shieldIconGr.circle(siCX, siCY, 11).stroke({ width: 2, color: 0x44aaff, alpha: 0.85 });
    shieldIconGr.circle(siCX - 3, siCY - 3, 3.5).fill({ color: 0xffffff, alpha: 0.22 });
    container.addChild(shieldIconGr);

    const shieldSymT = t(ctx);
    shieldSymT.text = '\u25a3';
    shieldSymT.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(13, ctx),
      fill: 0x88ddff,
      fontWeight: 'bold',
      dropShadow: { color: 0x000022, blur: 3, distance: 1, alpha: 0.9 },
    };
    shieldSymT.anchor.set(0.5, 0.5);
    shieldSymT.x = siCX;
    shieldSymT.y = siCY;
    container.addChild(shieldSymT);

    const shieldLbl = t(ctx);
    shieldLbl.text = 'BLOCK';
    shieldLbl.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(10, ctx),
      fill: 0x5599cc,
      fontWeight: '700',
      letterSpacing: 0.8,
    };
    shieldLbl.anchor.set(0, 0.5);
    shieldLbl.x = barInnerX + 38;
    shieldLbl.y = curY + blockH / 2;
    container.addChild(shieldLbl);

    const shieldValT = t(ctx);
    shieldValT.text = `${blockVal}`;
    shieldValT.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(18, ctx),
      fill: 0xaaddff,
      fontWeight: 'bold',
      dropShadow: { color: 0x000022, blur: 4, distance: 1, alpha: 0.9 },
    };
    shieldValT.anchor.set(1, 0.5);
    shieldValT.x = panelX + panelW - panelPad;
    shieldValT.y = curY + blockH / 2;
    container.addChild(shieldValT);

    curY += blockH + 6;
  }

  // ── Divider ─────────────────────────────────────────────────────────────
  const divGr = g(ctx);
  divGr.rect(panelX + panelPad, curY, innerW, 1).fill({ color: 0x3a2a55, alpha: 0.60 });
  divGr.rect(panelX + panelPad, curY + 1, innerW, 1).fill({ color: 0xffffff, alpha: 0.04 });
  container.addChild(divGr);
  curY += divH + 6;

  // ── Energy section ────────────────────────────────────────────────────
  const energyLabelT = t(ctx);
  energyLabelT.text = 'ENERGY';
  energyLabelT.style = {
    fontFamily: 'system-ui',
    fontSize: scaledFontSize(9, ctx),
    fill: 0x4488aa,
    fontWeight: '700',
    letterSpacing: 1.2,
  };
  energyLabelT.anchor.set(0, 0.5);
  energyLabelT.x = barInnerX;
  energyLabelT.y = curY + orbSize / 2;
  container.addChild(energyLabelT);

  // Energy orbs (right-aligned in the row)
  const orbGap = 5;
  const totalOrbW = maxEnergy * orbSize + (maxEnergy - 1) * orbGap;
  const orbStartX = panelX + panelW - panelPad - totalOrbW;
  let orbX = orbStartX;
  for (let ei = 0; ei < maxEnergy; ei++) {
    const filled = ei < curEnergy;
    const ocx = orbX + orbSize / 2;
    const ocy = curY + orbSize / 2;
    const orbGr = g(ctx);
    // Outer glow
    if (filled) orbGr.circle(ocx, ocy, orbSize * 0.72).fill({ color: 0x1a99dd, alpha: 0.18 });
    // Drop shadow
    orbGr.circle(ocx + 1, ocy + 1.5, orbSize / 2 + 0.5).fill({ color: 0x000000, alpha: 0.45 });
    // Main orb body
    orbGr.circle(ocx, ocy, orbSize / 2).fill({ color: filled ? 0x1166bb : 0x09141e, alpha: filled ? 0.97 : 0.80 });
    orbGr.circle(ocx, ocy, orbSize / 2).stroke({ width: 2, color: filled ? 0x55ddff : 0x1d3a4e, alpha: filled ? 0.92 : 0.60 });
    // Inner crystal shine
    if (filled) {
      orbGr.circle(ocx - orbSize * 0.20, ocy - orbSize * 0.24, orbSize * 0.20).fill({ color: 0xffffff, alpha: 0.30 });
    }
    container.addChild(orbGr);
    if (filled) {
      const orbCore = g(ctx);
      orbCore.circle(ocx, ocy, orbSize * 0.16).fill({ color: 0x88eeff, alpha: 0.75 });
      container.addChild(orbCore);
    }
    // Orb number label (for current energy count)
    if (ei === maxEnergy - 1) {
      const energyCountT = t(ctx);
      energyCountT.text = `${curEnergy}/${maxEnergy}`;
      energyCountT.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(10, ctx),
        fill: filled ? 0x88ddff : 0x3a6688,
        fontWeight: 'bold',
        dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.8 },
      };
      energyCountT.anchor.set(0.5, 1);
      energyCountT.x = orbStartX + totalOrbW / 2;
      energyCountT.y = curY + orbSize + 4;
      container.addChild(energyCountT);
    }
    orbX += orbSize + orbGap;
  }
  curY += energyH;

  // ── Status effect badges row ──────────────────────────────────────────
  if (playerBadges.length > 0) {
    curY += 6;
    const bdSz  = badgeSz;
    const bdGap = 5;
    const totalBW = playerBadges.length * bdSz + (playerBadges.length - 1) * bdGap;
    const bdStartX = panelX + panelW / 2 - totalBW / 2;
    let bx = bdStartX;

    for (const badge of playerBadges) {
      const bcx = bx + bdSz / 2;
      const bcy = curY + bdSz / 2;

      // Outer glow
      const glGr = g(ctx);
      glGr.circle(bcx, bcy, bdSz * 0.75).fill({ color: badge.glow, alpha: 0.15 });
      container.addChild(glGr);

      // Circle body
      const ciGr = g(ctx);
      ciGr.circle(bcx + 1, bcy + 1.5, bdSz / 2 + 1).fill({ color: 0x000000, alpha: 0.48 });
      ciGr.circle(bcx, bcy, bdSz / 2).fill({ color: badge.bg, alpha: 0.97 });
      ciGr.circle(bcx, bcy, bdSz / 2).stroke({ width: 2, color: badge.border, alpha: 0.94 });
      ciGr.circle(bcx - bdSz * 0.22, bcy - bdSz * 0.24, bdSz * 0.20).fill({ color: 0xffffff, alpha: 0.22 });
      container.addChild(ciGr);

      // Icon
      const icT = t(ctx);
      icT.text = badge.icon;
      icT.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(13, ctx),
        fill: 0xffffff,
        fontWeight: 'bold',
        dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.85 },
      };
      icT.anchor.set(0.5, 0.5);
      icT.x = bcx;
      icT.y = bcy - 5;
      container.addChild(icT);

      // Count
      const ctT = t(ctx);
      ctT.text = badge.count;
      ctT.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(10, ctx),
        fill: 0xffffff,
        fontWeight: 'bold',
      };
      ctT.anchor.set(0.5, 0);
      ctT.x = bcx;
      ctT.y = bcy + 4;
      container.addChild(ctT);

      // Label below badge
      const lbT = t(ctx);
      lbT.text = badge.label;
      lbT.style = {
        fontFamily: 'system-ui',
        fontSize: Math.max(8, scaledFontSize(8, ctx)),
        fill: badge.border,
        fontWeight: '600',
      };
      lbT.anchor.set(0.5, 0);
      lbT.x = bcx;
      lbT.y = curY + bdSz + 2;
      container.addChild(lbT);

      bx += bdSz + bdGap;
    }
  }

  container.zIndex = 20;
  stage.addChild(container);
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
    const peek = (L as { handPeekHeight?: number }).handPeekHeight ?? Math.round(cardHeight * 0.5);
    const hiddenAtRest = Math.max(0, cardHeight - peek);
    // When hovering/selected, lift the card by the hidden amount so it becomes fully visible.
    const liftY = usePresentation ? 0 : (isActive ? lerp * (hiddenAtRest + hoverLift * 0.25) : 0);
    const cardScale = pres != null ? pres.currentScale : 1 + (isActive ? lerp : 0) * (hoverScale - 1);
    const cardZIndex = pres != null ? pres.zPriority : (isOnTop ? 100 : i);

    const container = c(ctx);
    container.sortableChildren = true;

   
    const shadow = g(ctx);
    // Black drop shadow
    shadow.roundRect(L.shadowOffset, L.shadowOffset, cardWidth, cardHeight, L.cardCornerRadius)
      .fill({ color: 0x000000, alpha: applyHover ? 0.55 : 0.28 });
    // Colored glow underneath the card when hovered/selected (purple or gold)
    if (applyHover) {
      const glowColor = isSelected ? 0xffcc22 : 0xb87820;
      shadow.roundRect(4, 6, cardWidth, cardHeight, L.cardCornerRadius)
        .fill({ color: glowColor, alpha: 0.28 });
    }
    container.addChild(shadow);

    // Card image is the full card (cardId.png); text and cost are drawn on top.
    // Falls back to procedural drawing when no dedicated art exists.
    const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
    if (cardTex) {
      const cardSprite = spriteNew();
      cardSprite.texture = cardTex;
      cardSprite.width = cardWidth;
      cardSprite.height = cardHeight;
      cardSprite.roundPixels = true;
      container.addChild(cardSprite);
    } else {
      const effectDesc = ctx.getCardEffectDescription(cardId);
      const pal = getCardPalette(effectDesc, playable);
      const cardBody = g(ctx);
      drawCardBody(cardBody, cardWidth, cardHeight, L.cardCornerRadius, pal);
      container.addChild(cardBody);
    }

    const neonBorder = g(ctx);
    neonBorder.visible = isHovered || isSelected;
    if (neonBorder.visible) {
      drawNeonBorder(neonBorder, cardWidth, cardHeight, L.cardCornerRadius, isSelected);
    }
    container.addChild(neonBorder);

    const costRadius = L.costRadius;
    const costBg2 = g(ctx);
    const handEffectDesc = ctx.getCardEffectDescription(cardId);
    const handPal = getCardPalette(handEffectDesc, playable);
    const costColor = handPal.costColor;
    const costCenterX = L.cardCostCenterX ?? (costRadius + L.costCenterOffset);
    const costCenterY = L.cardCostCenterY ?? (costRadius + L.costCenterOffset);
    drawCostGem(costBg2, costCenterX, costCenterY, costRadius, costColor, handPal.costBg);
    container.addChild(costBg2);
    const costFontSize = scaledFontSize(28, ctx);
    const costText = t(ctx);
    costText.text = String(cost);
    costText.style = {
      fontFamily: 'system-ui',
      fontSize: costFontSize,
      fill: costColor,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.7 },
    };
    costText.anchor.set(0.5, 0.5);
    costText.x = costCenterX;
    costText.y = costCenterY;
    container.addChild(costText);

    const name = ctx.getCardName(cardId);
    const nameDisplay = name.length > 13 ? name.slice(0, 13) + '…' : name;
    const nameText = t(ctx);
    nameText.text = nameDisplay;
    nameText.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(17, ctx),
      fill: handPal.nameColor,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.9 },
    };
    nameText.anchor.set(0.5, 0.5);
    nameText.x = L.cardNameCenterX ?? (cardWidth / 2);
    nameText.y = (L.cardNameY ?? 90) + 13;
    container.addChild(nameText);

    if (handEffectDesc) {
      const fs = scaledFontSize(14, ctx);
      const effectText = t(ctx);
      const maxChars = L.cardDescriptionMaxChars ?? 0;
      effectText.text = maxChars > 0 && handEffectDesc.length > maxChars ? handEffectDesc.slice(0, maxChars - 1) + '…' : handEffectDesc;
      effectText.style = {
        fontFamily: 'system-ui',
        fontSize: fs,
        fill: handPal.descColor,
        wordWrap: true,
        wordWrapWidth: L.cardDescriptionWidth ?? (cardWidth - L.cardTextPadding),
        lineHeight: Math.round(fs * 1.5),
        align: 'center',
      };
      effectText.anchor.set(0.5, 0);
      effectText.x = cardWidth / 2;
      effectText.y = L.cardDescriptionY ?? 128;
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
  const enemyLayout = getEnemyLayout(w, ctx.h, state.enemies.length);
  const enemyPlaceholderW = enemyLayout.placeholderW;
  const enemyPlaceholderH = enemyLayout.placeholderH;
  const hand = state.hand;
  const cardWidth = L.cardWidth;
  const cardHeight = L.cardHeight;
  const cardSpacing = cardWidth * L.overlapRatio;
  const totalHandWidth = (hand.length - 1) * cardSpacing + cardWidth;
  const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
  const peek = (L as { handPeekHeight?: number }).handPeekHeight ?? Math.round(cardHeight * 0.5);
  const handY = ctx.h + (cardHeight - peek) + (L.handYOffset ?? 0);
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
    const wasJustHit = ctx.floatingNumbers.some((f) => f.type === 'damage' && f.enemyIndex === i);
    const vfxOn = ctx.vfxIntensity !== 'off';

    const container = c(ctx);
    container.zIndex = 20;

    // Determine texture
    let enemyTex: PIXI.Texture | null = null;
    const getAnimTexById = ctx.getEnemyAnimationTextureById;
    if (getAnimTexById) {
      enemyTex = getAnimTexById(e.id, nowMs);
    }
    const variant = ctx.enemyVariants?.[i];
    const getAnimTex = ctx.getEnemyAnimationTexture;
    if (enemyTex == null && variant != null && (variant === 1 || variant === 2 || variant === 3) && getAnimTex) {
      const dyingStart = ctx.enemyDyingStartMs?.[i];
      const hurtStart = ctx.enemyHurtStartMs?.[i];
      if (e.hp <= 0) {
        enemyTex = getAnimTex(variant, 'dying', nowMs, dyingStart ?? 0);
      } else if (hurtStart != null && nowMs - hurtStart < ENEMY_ANIMATION_TIMING.hurtDurationMs) {
        enemyTex = getAnimTex(variant, 'hurt', nowMs, hurtStart);
      } else {
        enemyTex = getAnimTex(variant, 'idle', nowMs);
      }
    }
    if (enemyTex == null) enemyTex = ctx.getEnemyTexture?.(e.id) ?? null;

    // --- Ambient glow behind enemy (always drawn first) ---
    const enemyCX = enemyPlaceholderW / 2;
    const enemyBodyCY = enemyPlaceholderH * 0.45;
    const glowGr = g(ctx);
    const glowColor = isHoveredEnemy ? 0xffe066 : isValidTarget ? 0xc9a227 : 0x7a2222;
    const glowAlpha = isHoveredEnemy ? 0.28 : isValidTarget ? 0.18 : 0.1;
    glowGr.circle(enemyCX, enemyBodyCY, enemyPlaceholderW * 0.52).fill({ color: glowColor, alpha: glowAlpha });
    glowGr.circle(enemyCX, enemyBodyCY, enemyPlaceholderW * 0.36).fill({ color: glowColor, alpha: glowAlpha * 0.8 });
    container.addChild(glowGr);

    // --- Ground shadow ---
    const shadowGr = g(ctx);
    const shadowW = enemyPlaceholderW * 0.72;
    const shadowH = enemyPlaceholderH * 0.055;
    shadowGr.ellipse(enemyCX, enemyPlaceholderH - 10, shadowW / 2, shadowH).fill({ color: 0x000000, alpha: 0.58 });
    container.addChild(shadowGr);

    // --- Character sprite or placeholder ---
    if (enemyTex) {
      const sprite = spriteNew();
      sprite.texture = enemyTex;
      const texW = enemyTex.width;
      const texH = enemyTex.height;
      const fitScale = Math.min(enemyPlaceholderW / texW, enemyPlaceholderH / texH);
      sprite.width = texW * fitScale;
      sprite.height = texH * fitScale;
      sprite.anchor.set(0.5, 1);
      sprite.x = enemyCX;
      sprite.y = enemyPlaceholderH - 12;
      sprite.scale.x = -Math.abs(sprite.scale.x);
      container.addChild(sprite);
      ctx.onEnemySpriteCreated?.(i, sprite);
    } else {
      // Detailed enemy placeholder (unique look per enemy type)
      const ph = g(ctx);
      const cr = L.enemyCornerRadius;
      const bodyW = enemyPlaceholderW * 0.52;
      const bodyH = enemyPlaceholderH * 0.46;
      const bodyX = enemyCX - bodyW / 2;
      const bodyY = enemyPlaceholderH * 0.32;
      const headR = enemyPlaceholderW * 0.16;
      const headCX = enemyCX;
      const headCY = bodyY - headR * 0.6;
      // Eye glow color varies by enemy index
      const eyeColors = [0xff4444, 0xff8800, 0xcc44cc, 0x44ffcc, 0xff4488];
      const eyeColor = eyeColors[i % eyeColors.length];
      // Ambient halo
      ph.circle(headCX, headCY, headR * 1.6).fill({ color: eyeColor, alpha: 0.12 });
      // Body
      ph.roundRect(bodyX, bodyY, bodyW, bodyH, cr * 0.7).fill({ color: 0x3a1a1a }).stroke({ width: 2, color: 0x7a3a3a });
      // Body detail
      ph.rect(bodyX + bodyW * 0.4, bodyY + bodyH * 0.1, bodyW * 0.08, bodyH * 0.6).fill({ color: eyeColor, alpha: 0.4 });
      // Head
      ph.circle(headCX, headCY, headR).fill({ color: 0x4a2020 });
      ph.circle(headCX, headCY, headR).stroke({ width: 2, color: 0x8a4a4a });
      // Eyes (glowing)
      ph.circle(headCX - headR * 0.3, headCY - headR * 0.05, headR * 0.2).fill({ color: eyeColor, alpha: 0.95 });
      ph.circle(headCX + headR * 0.3, headCY - headR * 0.05, headR * 0.2).fill({ color: eyeColor, alpha: 0.95 });
      // Eye inner glow
      ph.circle(headCX - headR * 0.3, headCY - headR * 0.05, headR * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
      ph.circle(headCX + headR * 0.3, headCY - headR * 0.05, headR * 0.1).fill({ color: 0xffffff, alpha: 0.7 });
      // Horns / spikes
      ph.moveTo(headCX - headR * 0.4, headCY - headR * 0.8).lineTo(headCX - headR * 0.6, headCY - headR * 1.8).lineTo(headCX - headR * 0.1, headCY - headR * 0.85).closePath().fill({ color: 0x6a3030 });
      ph.moveTo(headCX + headR * 0.4, headCY - headR * 0.8).lineTo(headCX + headR * 0.6, headCY - headR * 1.8).lineTo(headCX + headR * 0.1, headCY - headR * 0.85).closePath().fill({ color: 0x6a3030 });
      // Arms
      ph.roundRect(bodyX - 14, bodyY + bodyH * 0.08, 14, bodyH * 0.52, 4).fill({ color: 0x3a1a1a }).stroke({ width: 1.5, color: 0x7a3a3a });
      ph.roundRect(bodyX + bodyW, bodyY + bodyH * 0.08, 14, bodyH * 0.52, 4).fill({ color: 0x3a1a1a }).stroke({ width: 1.5, color: 0x7a3a3a });
      // Claws
      ph.roundRect(bodyX - 15, bodyY + bodyH * 0.6, 7, 14, 2).fill({ color: eyeColor, alpha: 0.7 });
      ph.roundRect(bodyX - 8, bodyY + bodyH * 0.62, 6, 13, 2).fill({ color: eyeColor, alpha: 0.7 });
      ph.roundRect(bodyX + bodyW + 8, bodyY + bodyH * 0.6, 7, 14, 2).fill({ color: eyeColor, alpha: 0.7 });
      ph.roundRect(bodyX + bodyW + 2, bodyY + bodyH * 0.62, 6, 13, 2).fill({ color: eyeColor, alpha: 0.7 });
      // Legs
      ph.roundRect(bodyX + bodyW * 0.18, bodyY + bodyH - 2, bodyW * 0.22, bodyH * 0.28, 4).fill({ color: 0x3a1a1a }).stroke({ width: 1.5, color: 0x7a3a3a });
      ph.roundRect(bodyX + bodyW * 0.55, bodyY + bodyH - 2, bodyW * 0.22, bodyH * 0.28, 4).fill({ color: 0x3a1a1a }).stroke({ width: 1.5, color: 0x7a3a3a });
      container.addChild(ph);
    }

    // ─── Enemy info: polished bottom panel ──────────────────────────────────
    const eBlockVal = e.block ?? 0;
    const eHpRatio  = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;

    // HP palette: green (healthy) → orange (mid) → crimson (low)
    const eHpPal = eHpRatio < 0.25
      ? { fill: 0xcc1111, glow: 0xff3333, border: 0xff7070 }
      : eHpRatio < 0.55
        ? { fill: 0xc05510, glow: 0xf08828, border: 0xf0aa66 }
        : { fill: 0x1d8833, glow: 0x33cc55, border: 0x66ee88 };

    // Panel dimensions — full width, taller for improved legibility
    const ePanelPad = 6;
    const ePanelW   = enemyPlaceholderW - ePanelPad * 2;
    const ePanelX   = ePanelPad;
    const eBarW     = ePanelW - 8;
    const eBarH     = 24;
    const eBarX     = ePanelX + 4;
    const eNameH    = 20;
    const eBlockH   = eBlockVal > 0 ? 26 : 0;
    const ePanelH   = 6 + eNameH + 4 + eBarH + (eBlockVal > 0 ? 4 + eBlockH : 0) + 6;
    const ePanelY   = enemyPlaceholderH - ePanelH;

    // ── Panel background ────────────────────────────────────────────────
    const ePanelGlow = g(ctx);
    ePanelGlow.roundRect(ePanelX - 3, ePanelY - 3, ePanelW + 6, ePanelH + 6, 13)
      .fill({ color: eHpPal.glow, alpha: 0.06 });
    container.addChild(ePanelGlow);

    const ePanelBg = g(ctx);
    ePanelBg.roundRect(ePanelX, ePanelY, ePanelW, ePanelH, 10)
      .fill({ color: 0x06040e, alpha: 0.92 });
    // Inner bevel
    ePanelBg.roundRect(ePanelX + 1, ePanelY + 1, ePanelW - 2, ePanelH - 2, 9)
      .stroke({ width: 1, color: 0xffffff, alpha: 0.05 });
    // Outer border colored by HP state
    ePanelBg.roundRect(ePanelX, ePanelY, ePanelW, ePanelH, 10)
      .stroke({ width: 1.5, color: eHpPal.glow, alpha: 0.30 });
    // Top color stripe
    ePanelBg.roundRect(ePanelX, ePanelY, ePanelW, 3, 10).fill({ color: eHpPal.glow, alpha: 0.45 });
    container.addChild(ePanelBg);

    let eCurY = ePanelY + 6;

    // ── Enemy name ──────────────────────────────────────────────────────
    const eNameT = t(ctx);
    eNameT.text = e.name;
    eNameT.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(13, ctx),
      fill: 0xf2eeff,
      fontWeight: '800',
      letterSpacing: 0.3,
      dropShadow: { color: 0x000000, blur: 5, distance: 1, alpha: 0.95 },
    };
    eNameT.anchor.set(0.5, 0);
    eNameT.x = enemyPlaceholderW / 2;
    eNameT.y = eCurY;
    container.addChild(eNameT);
    eCurY += eNameH + 4;

    // ── HP bar (full-width, color-coded) ────────────────────────────────
    const eHpBarR = Math.max(4, Math.round(eBarH / 2));
    const eHpFillW = Math.max(0, eBarW * eHpRatio);

    // Track
    const eHpTrack = g(ctx);
    eHpTrack.roundRect(eBarX, eCurY, eBarW, eBarH, eHpBarR).fill({ color: 0x040208, alpha: 0.90 });
    eHpTrack.roundRect(eBarX, eCurY, eBarW, eBarH, eHpBarR).stroke({ width: 1, color: eHpPal.border, alpha: 0.20 });
    container.addChild(eHpTrack);

    // Fill
    if (eHpFillW > 0) {
      const eHpFill = g(ctx);
      eHpFill.roundRect(eBarX, eCurY, eHpFillW, eBarH, eHpBarR).fill({ color: eHpPal.fill, alpha: 0.97 });
      if (eHpFillW > 8) {
        eHpFill.roundRect(eBarX + 2, eCurY + 2, eHpFillW - 4, Math.max(2, eBarH * 0.32), Math.max(2, eBarH * 0.18))
          .fill({ color: 0xffffff, alpha: 0.18 });
        for (let seg = 1; seg <= 4; seg++) {
          const eSegX = eBarX + eBarW * seg * 0.2;
          if (eSegX < eBarX + eHpFillW - 2) {
            eHpFill.rect(eSegX, eCurY + 2, 1.5, eBarH - 4).fill({ color: 0x000000, alpha: 0.20 });
          }
        }
      }
      eHpFill.roundRect(eBarX, eCurY, eHpFillW, eBarH, eHpBarR).stroke({ width: 1, color: eHpPal.glow, alpha: 0.55 });
      container.addChild(eHpFill);

      const eHpGlow = g(ctx);
      eHpGlow.roundRect(eBarX - 1, eCurY - 1, eHpFillW + 2, eBarH + 2, eHpBarR + 1)
        .stroke({ width: 2, color: eHpPal.glow, alpha: 0.20 });
      container.addChild(eHpGlow);
    }

    // HP text: small "♥ X / Y" left-side of bar
    const eHpT = t(ctx);
    eHpT.text = `${e.hp} / ${e.maxHp}`;
    eHpT.style = {
      fontFamily: 'system-ui',
      fontSize: scaledFontSize(11, ctx),
      fill: 0xffffff,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.98 },
    };
    eHpT.anchor.set(0.5, 0.5);
    eHpT.x = eBarX + eBarW / 2;
    eHpT.y = eCurY + eBarH / 2;
    container.addChild(eHpT);
    eCurY += eBarH;

    // ── Block row (only when block > 0) ─────────────────────────────────
    if (eBlockVal > 0) {
      eCurY += 4;
      const eShieldGlow = g(ctx);
      eShieldGlow.roundRect(eBarX - 2, eCurY - 2, eBarW + 4, eBlockH + 4, 14)
        .fill({ color: 0x2244cc, alpha: 0.18 });
      container.addChild(eShieldGlow);

      const eShieldBg = g(ctx);
      eShieldBg.roundRect(eBarX, eCurY, eBarW, eBlockH, 12)
        .fill({ color: 0x07101f, alpha: 0.96 })
        .stroke({ width: 1.5, color: 0x44aaff, alpha: 0.80 });
      eShieldBg.roundRect(eBarX + 4, eCurY + 5, 3, eBlockH - 10, 2).fill({ color: 0x88ccff, alpha: 0.70 });
      container.addChild(eShieldBg);

      // Shield icon circle
      const eShIconGr = g(ctx);
      const eShCX = eBarX + 18;
      const eShCY = eCurY + eBlockH / 2;
      eShIconGr.circle(eShCX, eShCY, 10).fill({ color: 0x0a1e38, alpha: 0.95 });
      eShIconGr.circle(eShCX, eShCY, 10).stroke({ width: 2, color: 0x44aaff, alpha: 0.85 });
      eShIconGr.circle(eShCX - 2.5, eShCY - 2.5, 3).fill({ color: 0xffffff, alpha: 0.22 });
      container.addChild(eShIconGr);

      const eShSymT = t(ctx);
      eShSymT.text = '\u25a3';
      eShSymT.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(12, ctx),
        fill: 0x88ddff,
        fontWeight: 'bold',
        dropShadow: { color: 0x000022, blur: 3, distance: 1, alpha: 0.9 },
      };
      eShSymT.anchor.set(0.5, 0.5);
      eShSymT.x = eShCX;
      eShSymT.y = eShCY;
      container.addChild(eShSymT);

      const eShLbl = t(ctx);
      eShLbl.text = 'BLOCK';
      eShLbl.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(9, ctx),
        fill: 0x5599cc,
        fontWeight: '700',
        letterSpacing: 0.8,
      };
      eShLbl.anchor.set(0, 0.5);
      eShLbl.x = eBarX + 34;
      eShLbl.y = eShCY;
      container.addChild(eShLbl);

      const eShValT = t(ctx);
      eShValT.text = `${eBlockVal}`;
      eShValT.style = {
        fontFamily: 'system-ui',
        fontSize: scaledFontSize(17, ctx),
        fill: 0xaaddff,
        fontWeight: 'bold',
        dropShadow: { color: 0x000022, blur: 4, distance: 1, alpha: 0.9 },
      };
      eShValT.anchor.set(1, 0.5);
      eShValT.x = ePanelX + ePanelW - 4;
      eShValT.y = eShCY;
      container.addChild(eShValT);
    }

    // ─── Intent icon: floating above the enemy (negative y in container) ──
    const eIntentCX = enemyPlaceholderW / 2; // center of enemy horizontally
    const eIntentTopY = -88;                  // above the container top (y=0)
    if (e.intent) {
      drawIntentIcon(ctx, container, e.intent.type, e.intent.value, eIntentCX, eIntentTopY, e.intent.addStatus, {
        times: e.intent.times,
        value2: e.intent.value2,
        strength: e.intent.strength,
        block: e.intent.block,
      });
    } else {
      drawIntentIcon(ctx, container, 'none', 0, eIntentCX, eIntentTopY);
    }

    // ─── Status effect badges: horizontal row inside bottom panel ──────────
    const vulnerableStacks = e.vulnerableStacks ?? 0;
    const weakStacks       = e.weakStacks       ?? 0;
    const strengthStacks   = e.strengthStacks   ?? 0;
    const ritualStacks     = e.ritualStacks     ?? 0;
    const artifactStacks   = e.artifactStacks   ?? 0;

    interface EnemyStatusBadge {
      icon: string; label: string; count: string;
      bg: number; border: number; glow: number;
    }
    const allBadges: EnemyStatusBadge[] = [];
    if (strengthStacks > 0) allBadges.push({ icon: '\u2694', label: 'STR',  count: `${strengthStacks}`, bg: 0x8a1a1a, border: 0xff5555, glow: 0xff3333 });
    if (ritualStacks > 0)   allBadges.push({ icon: '\u2605', label: 'RITL', count: `${ritualStacks}`,   bg: 0x5a3300, border: 0xcc8800, glow: 0xffaa00 });
    if (artifactStacks > 0) allBadges.push({ icon: '\u25c6', label: 'ART',  count: `${artifactStacks}`, bg: 0x004433, border: 0x00bb77, glow: 0x00ffaa });
    if (vulnerableStacks > 0) allBadges.push({ icon: '\u25bd', label: 'VULN', count: `${vulnerableStacks}`, bg: 0x550033, border: 0xcc1177, glow: 0xff44aa });
    if (weakStacks > 0)     allBadges.push({ icon: '\u223c', label: 'WEAK', count: `${weakStacks}`,     bg: 0x333300, border: 0x888800, glow: 0xcccc00 });

    if (allBadges.length > 0) {
      const eBdSz  = 26;
      const eBdGap = 4;
      const eBdTotalW = allBadges.length * eBdSz + (allBadges.length - 1) * eBdGap;
      // Float badges just above the bottom panel
      const eBdY = ePanelY - eBdSz - 8;
      let eBdX = Math.floor((enemyPlaceholderW - eBdTotalW) / 2);

      for (const badge of allBadges) {
        const bcx = eBdX + eBdSz / 2;
        const bcy = eBdY + eBdSz / 2;

        // Glow
        const glGr = g(ctx);
        glGr.circle(bcx, bcy, eBdSz * 0.75).fill({ color: badge.glow, alpha: 0.16 });
        container.addChild(glGr);

        // Body
        const ciGr = g(ctx);
        ciGr.circle(bcx + 1, bcy + 1.5, eBdSz / 2 + 1).fill({ color: 0x000000, alpha: 0.48 });
        ciGr.circle(bcx, bcy, eBdSz / 2).fill({ color: badge.bg, alpha: 0.97 });
        ciGr.circle(bcx, bcy, eBdSz / 2).stroke({ width: 2, color: badge.border, alpha: 0.94 });
        ciGr.circle(bcx - eBdSz * 0.22, bcy - eBdSz * 0.24, eBdSz * 0.20).fill({ color: 0xffffff, alpha: 0.22 });
        container.addChild(ciGr);

        // Icon
        const icT = t(ctx);
        icT.text = badge.icon;
        icT.style = {
          fontFamily: 'system-ui',
          fontSize: scaledFontSize(11, ctx),
          fill: 0xffffff,
          fontWeight: 'bold',
          dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.85 },
        };
        icT.anchor.set(0.5, 0.5);
        icT.x = bcx;
        icT.y = bcy - 4;
        container.addChild(icT);

        // Count
        const ctT = t(ctx);
        ctT.text = badge.count;
        ctT.style = {
          fontFamily: 'system-ui',
          fontSize: scaledFontSize(9, ctx),
          fill: 0xffffff,
          fontWeight: 'bold',
        };
        ctT.anchor.set(0.5, 0);
        ctT.x = bcx;
        ctT.y = bcy + 4;
        container.addChild(ctT);

        // Label below badge
        const lbT = t(ctx);
        lbT.text = badge.label;
        lbT.style = {
          fontFamily: 'system-ui',
          fontSize: Math.max(7, scaledFontSize(8, ctx)),
          fill: badge.border,
          fontWeight: '600',
        };
        lbT.anchor.set(0.5, 0);
        lbT.x = bcx;
        lbT.y = eBdY + eBdSz + 2;
        container.addChild(lbT);

        eBdX += eBdSz + eBdGap;
      }
    }

    // --- Hit flash overlay ---
    if (wasJustHit && vfxOn) {
      const hitFlash = g(ctx);
      hitFlash.roundRect(2, 2, enemyPlaceholderW - 4, enemyPlaceholderH - 4, L.enemyCornerRadius)
        .fill({ color: 0xff2222, alpha: 0.32 })
        .stroke({ width: 3, color: 0xff4444, alpha: 0.8 });
      container.addChild(hitFlash);
    }

    // --- Target border (on top of everything) ---
    if (isValidTarget) {
      const targetBorder = g(ctx);
      drawEnemyTargetBorder(targetBorder, enemyPlaceholderW, enemyPlaceholderH, L.enemyCornerRadius, !!isHoveredEnemy);
      container.addChild(targetBorder);
    }

    // --- Dead enemy fade ---
    if (!isAlive) {
      container.alpha = 0.45;
    }

    // Position + scale
    const centerPos = enemyLayout.getCenter(i);
    const hitPop = wasJustHit && vfxOn ? 1.06 : 1;
    const scale = sizeScale(e.size) * (isHoveredEnemy ? 1.07 : 1) * hitPop;
    container.pivot.set(enemyPlaceholderW / 2, enemyPlaceholderH / 2);
    container.x = centerPos.x;
    container.y = centerPos.y;
    container.scale.set(scale);

    // Hover/intent tooltip should work even when we're NOT actively targeting.
    // Pointer events are therefore wired for all alive enemies (pointerover/out),
    // while pointerdown is kept behind isValidTarget so drag-and-drop targeting stays intact.
    if (isAlive) {
      container.eventMode = 'static';
      container.cursor = isValidTarget ? 'pointer' : 'default';
      container.hitArea = new PIXI.Rectangle(0, 0, enemyPlaceholderW, enemyPlaceholderH);
      const idx = i;
      container.on('pointerover', () => { ctx.onEnemyPointerOver(idx); });
      container.on('pointerout', () => ctx.onEnemyPointerOut());
      if (isValidTarget) {
        container.on('pointerdown', () => ctx.onEnemyTargetClick(idx));
      }
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

  // Card art background — procedural card when no dedicated art exists
  const cardTex = ctx.getCardArtTexture?.(cardId) ?? null;
  const dragEffectDesc = ctx.getCardEffectDescription(cardId);
  const dragCost = ctx.getCardCost(cardId);
  const dragPlayable = true; // drag preview is always a playable card
  const dragPal = getCardPalette(dragEffectDesc, dragPlayable);
  if (cardTex) {
    const sprite = spriteNew();
    sprite.texture = cardTex;
    sprite.width = cardWidth;
    sprite.height = cardHeight;
    sprite.roundPixels = true;
    container.addChild(sprite);
  } else {
    const bg = g(ctx);
    drawCardBody(bg, cardWidth, cardHeight, L.cardCornerRadius, dragPal);
    container.addChild(bg);
  }

  // Cost circle and text
  const costRadius = L.costRadius;
  const costCenterX = L.cardCostCenterX ?? (costRadius + L.costCenterOffset);
  const costCenterY = L.cardCostCenterY ?? (costRadius + L.costCenterOffset);
  const costBg = g(ctx);
  drawCostGem(costBg, costCenterX, costCenterY, costRadius, dragPal.costColor, dragPal.costBg);
  container.addChild(costBg);
  const costFontSize = scaledFontSize(28, ctx);
  const costText = t(ctx);
  costText.text = String(dragCost);
  costText.style = {
    fontFamily: 'system-ui',
    fontSize: costFontSize,
    fill: dragPal.costColor,
    fontWeight: 'bold',
    dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.7 },
  };
  costText.anchor.set(0.5, 0.5);
  costText.x = costCenterX;
  costText.y = costCenterY;
  container.addChild(costText);

  // Name
  const name = ctx.getCardName(cardId);
  const nameDisplay = name.length > 13 ? name.slice(0, 13) + '…' : name;
  const nameText = t(ctx);
  nameText.text = nameDisplay;
  nameText.style = {
    fontFamily: 'system-ui',
    fontSize: scaledFontSize(17, ctx),
    fill: dragPal.nameColor,
    fontWeight: 'bold',
    dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.9 },
  };
  nameText.anchor.set(0.5, 0.5);
  nameText.x = L.cardNameCenterX ?? (cardWidth / 2);
  nameText.y = (L.cardNameY ?? 90) + 13;
  container.addChild(nameText);

  // Effect description
  if (dragEffectDesc) {
    const fs = scaledFontSize(14, ctx);
    const effectText = t(ctx);
    const maxChars = L.cardDescriptionMaxChars ?? 0;
    effectText.text = maxChars > 0 && dragEffectDesc.length > maxChars ? dragEffectDesc.slice(0, maxChars - 1) + '…' : dragEffectDesc;
    effectText.style = {
      fontFamily: 'system-ui',
      fontSize: fs,
      fill: dragPal.descColor,
      wordWrap: true,
      wordWrapWidth: L.cardDescriptionWidth ?? (cardWidth - L.cardTextPadding),
      lineHeight: Math.round(fs * 1.5),
      align: 'center',
    };
    effectText.anchor.set(0.5, 0);
    effectText.x = cardWidth / 2;
    effectText.y = L.cardDescriptionY ?? 128;
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
  const vfxScale = ctx.vfxIntensity === 'reduced' ? 0.82 : 1;
  const baseDmg = scaledFontSize(34, ctx);
  const baseBlock = scaledFontSize(26, ctx);
  const baseHeal = scaledFontSize(28, ctx);
  for (const fn of ctx.floatingNumbers) {
    const isDmg = fn.type === 'damage';
    const isHeal = (fn as { type: string }).type === 'heal';
    const fontSize = Math.round((isDmg ? baseDmg : isHeal ? baseHeal : baseBlock) * vfxScale);
    const fillColor = isDmg ? 0xff4444 : isHeal ? 0x44ff88 : 0x44aaff;
    const strokeColor = isDmg ? 0x880000 : isHeal ? 0x006633 : 0x003366;
    const prefix = isDmg ? '-' : '+';

    // Outer drop shadow for readability
    const shadowTxt = t(ctx);
    shadowTxt.text = `${prefix}${fn.value}`;
    shadowTxt.style = {
      fontFamily: 'system-ui',
      fontSize,
      fill: 0x000000,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: Math.max(4, fontSize * 0.22) },
    };
    shadowTxt.anchor.set(0.5, 0.5);
    shadowTxt.x = fn.x + 2;
    shadowTxt.y = fn.y + 3;
    shadowTxt.alpha = 0.65;
    shadowTxt.zIndex = 699;
    stage.addChild(shadowTxt);

    // Main damage number
    const text = t(ctx);
    text.text = `${prefix}${fn.value}`;
    text.style = {
      fontFamily: 'system-ui',
      fontSize,
      fill: fillColor,
      fontWeight: 'bold',
      stroke: { color: strokeColor, width: Math.max(2, fontSize * 0.1) },
    };
    text.anchor.set(0.5, 0.5);
    text.x = fn.x;
    text.y = fn.y;
    text.zIndex = 700;
    stage.addChild(text);
  }
}

/** Draws the "Enemy turn" overlay when showingEnemyTurn is true. */
function drawEnemyTurnBanner(ctx: CombatViewContext): void {
  const { stage, w, h } = ctx;
  if (!ctx.showingEnemyTurn) return;

  // Darkened overlay
  const overlay = g(ctx);
  overlay.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.58 });
  overlay.zIndex = 800;
  stage.addChild(overlay);

  // Horizontal banner strip
  const bannerH = 90;
  const bannerY = h / 2 - bannerH / 2;
  const bannerGr = g(ctx);
  // Dark strip
  bannerGr.rect(0, bannerY, w, bannerH).fill({ color: 0x0a0518, alpha: 0.92 });
  // Colored top/bottom accent lines
  bannerGr.rect(0, bannerY, w, 3).fill({ color: 0xcc2233, alpha: 0.9 });
  bannerGr.rect(0, bannerY + bannerH - 3, w, 3).fill({ color: 0xcc2233, alpha: 0.9 });
  // Inner glow streak
  bannerGr.rect(0, bannerY + 3, w, bannerH - 6).fill({ color: 0x660011, alpha: 0.22 });
  bannerGr.zIndex = 801;
  stage.addChild(bannerGr);

  // "ENEMY TURN" text with drop shadow
  const fontSize = scaledFontSize(46, ctx);
  const shadowTxt = t(ctx);
  shadowTxt.text = 'ENEMY TURN';
  shadowTxt.style = {
    fontFamily: 'system-ui',
    fontSize,
    fill: 0x000000,
    fontWeight: '900',
  };
  shadowTxt.anchor.set(0.5, 0.5);
  shadowTxt.x = w / 2 + 3;
  shadowTxt.y = h / 2 + 4;
  shadowTxt.zIndex = 802;
  stage.addChild(shadowTxt);

  const turnText = t(ctx);
  turnText.text = 'ENEMY TURN';
  turnText.style = {
    fontFamily: 'system-ui',
    fontSize,
    fill: 0xff3344,
    fontWeight: '900',
    stroke: { color: 0x330011, width: Math.max(2, fontSize * 0.08) },
  };
  turnText.anchor.set(0.5, 0.5);
  turnText.x = w / 2;
  turnText.y = h / 2;
  turnText.zIndex = 803;
  stage.addChild(turnText);
}

/** Fullscreen flash overlay for impacts (very short-lived). */
function drawImpactFlash(ctx: CombatViewContext): void {
  const any = ctx as unknown as { impactFlash?: { alpha: number; color: number } };
  const flash = any.impactFlash;
  if (!flash || flash.alpha <= 0) return;
  const { stage, w, h } = ctx;
  const gr = g(ctx);
  gr.rect(0, 0, w, h).fill({ color: flash.color ?? 0xffffff, alpha: Math.max(0, Math.min(1, flash.alpha)) });
  gr.zIndex = 999;
  stage.addChild(gr);
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

  const buildEffectDesc = getCardEffectDescription(cardId);
  const buildPal = getCardPalette(buildEffectDesc, true);

  const cardTex = getCardArtTexture(cardId);
  if (cardTex) {
    const cardSprite = new PIXI.Sprite(cardTex);
    cardSprite.width = cardWidth;
    cardSprite.height = cardHeight;
    cardSprite.roundPixels = true;
    container.addChild(cardSprite);
  } else {
    const bg = new PIXI.Graphics();
    drawCardBody(bg, cardWidth, cardHeight, L.cardCornerRadius, buildPal);
    container.addChild(bg);
  }

  const cost = getCardCost(cardId);
  const costRadius = L.costRadius;
  const costCenterX = L.cardCostCenterX ?? (costRadius + L.costCenterOffset);
  const costCenterY = L.cardCostCenterY ?? (costRadius + L.costCenterOffset);
  const costBg = new PIXI.Graphics();
  drawCostGem(costBg, costCenterX, costCenterY, costRadius, buildPal.costColor, buildPal.costBg);
  container.addChild(costBg);
  const costFontSize = Math.round(28 * textScale);
  const costText = new PIXI.Text({
    text: String(cost),
    style: {
      fontFamily: 'system-ui',
      fontSize: costFontSize,
      fill: buildPal.costColor,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 3, distance: 1, alpha: 0.7 },
    },
  });
  costText.anchor.set(0.5, 0.5);
  costText.x = costCenterX;
  costText.y = costCenterY;
  container.addChild(costText);

  const name = getCardName(cardId);
  const nameDisplay = name.length > 13 ? name.slice(0, 13) + '…' : name;
  const nameText = new PIXI.Text({
    text: nameDisplay,
    style: {
      fontFamily: 'system-ui',
      fontSize: Math.round(17 * textScale),
      fill: buildPal.nameColor,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.9 },
    },
  });
  nameText.anchor.set(0.5, 0.5);
  nameText.x = L.cardNameCenterX ?? (cardWidth / 2);
  nameText.y = (L.cardNameY ?? 90) + 13;
  container.addChild(nameText);

  if (buildEffectDesc) {
    const fs = Math.round(14 * textScale);
    const maxChars = L.cardDescriptionMaxChars ?? 0;
    const text = maxChars > 0 && buildEffectDesc.length > maxChars ? buildEffectDesc.slice(0, maxChars - 1) + '…' : buildEffectDesc;
    const effectText = new PIXI.Text({
      text,
      style: {
        fontFamily: 'system-ui',
        fontSize: fs,
        fill: buildPal.descColor,
        wordWrap: true,
        wordWrapWidth: L.cardDescriptionWidth ?? (cardWidth - L.cardTextPadding),
        lineHeight: Math.round(fs * 1.5),
        align: 'center',
      },
    });
    effectText.anchor.set(0.5, 0);
    effectText.x = cardWidth / 2;
    effectText.y = L.cardDescriptionY ?? 128;
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
  drawImpactFlash(context);
  drawDeckDiscardCounter(context);
  drawDebugLayout(context);
}


// ---------------------------------------------------------------------------
// Deck / Discard counter (top-right, Slay the Spire style)
// ---------------------------------------------------------------------------

/**
 * Draws mini card-stack icons for the draw pile and discard pile in the top-right corner.
 * The draw pile is furthest right; the discard pile sits to its left.
 */
function drawDeckDiscardCounter(ctx: CombatViewContext): void {
  const { state, stage, w, h } = ctx;
  const deckCount    = state.deck?.length    ?? 0;
  const discardCount = state.discard?.length ?? 0;

  // ── Layout ──────────────────────────────────────────────────────────────
  const padding   = L.padding + 8;
  const cardW     = 44;
  const cardH     = 60;
  const gap       = 14;            // gap between draw pile and discard pile
  // Keep deck widgets below header in a responsive way (avoid overlap on smaller windows).
  const headerSafeTop = Math.max(72, Math.round(h * 0.09));
  const yTop      = headerSafeTop + 4;
  const labelSize = 11;
  const countSize = 20;
  const cr        = 6;             // corner radius for mini cards

  // Draw pile at far right; discard to its left
  const drawX    = w - padding - cardW;
  const discardX = drawX - gap - cardW;
  const cardTop  = yTop;

  /** Draw one pile widget. stackOffset staggers the fanned cards behind. */
  function drawPileWidget(
    baseX: number,
    count: number,
    label: string,
    frameColor: number,
    badgeColor: number,
    isDiscard: boolean,
  ): void {
    const container = c(ctx);
    container.zIndex = 25;

    // ── Stacked card silhouettes (depth effect, 2 cards behind) ──────────
    const stackColors = [0x1a1330, 0x221a40];
    for (let si = 0; si < 2; si++) {
      const off = (si + 1) * 2;
      const back = g(ctx);
      back.roundRect(-off, off, cardW, cardH, cr)
        .fill({ color: stackColors[si], alpha: 0.85 });
      back.roundRect(-off, off, cardW, cardH, cr)
        .stroke({ width: 1, color: frameColor, alpha: 0.35 });
      container.addChild(back);
    }

    // ── Main card face ────────────────────────────────────────────────────
    const face = g(ctx);
    // Background
    face.roundRect(0, 0, cardW, cardH, cr)
      .fill({ color: 0x100c1e });
    // Top accent strip
    face.roundRect(0, 0, cardW, 5, cr)
      .fill({ color: frameColor, alpha: 0.85 });
    face.rect(0, cr, cardW, 3)
      .fill({ color: frameColor, alpha: 0.85 });
    // Card back pattern — crosshatch dots
    for (let dx = 8; dx < cardW - 4; dx += 9) {
      for (let dy = 10; dy < cardH - 8; dy += 9) {
        face.circle(dx, dy, 0.8).fill({ color: frameColor, alpha: 0.22 });
      }
    }
    // Centre ornament
    const cx = cardW / 2;
    const cy = cardH / 2 + 4;
    face.circle(cx, cy, 10).fill({ color: frameColor, alpha: 0.1 });
    face.circle(cx, cy, 10).stroke({ width: 1, color: frameColor, alpha: 0.3 });
    face.circle(cx, cy, 5).fill({ color: frameColor, alpha: 0.18 });
    // Discard pile gets a subtle diagonal slash across the centre
    if (isDiscard) {
      face.moveTo(cx - 7, cy - 7);
      face.lineTo(cx + 7, cy + 7);
      // Pixi Graphics uses stroke() call for lines - we use a thin rect instead
      face.roundRect(cx - 6, cy - 1, 12, 2, 1).fill({ color: frameColor, alpha: 0.35 });
    }
    // Border: glow + crisp
    face.roundRect(0, 0, cardW, cardH, cr)
      .stroke({ width: 3, color: frameColor, alpha: 0.15 });
    face.roundRect(0, 0, cardW, cardH, cr)
      .stroke({ width: 1.5, color: frameColor, alpha: 0.9 });
    container.addChild(face);

    // ── Count badge (top-right corner of card) ────────────────────────────
    const badgeR = 11;
    const badgeX = cardW - 2;
    const badgeY = -2;
    const badge = g(ctx);
    badge.circle(badgeX, badgeY, badgeR + 2).fill({ color: 0x000000, alpha: 0.5 });
    badge.circle(badgeX, badgeY, badgeR).fill({ color: badgeColor });
    badge.circle(badgeX, badgeY, badgeR).stroke({ width: 1.5, color: 0xffffff, alpha: 0.25 });
    container.addChild(badge);

    const countTxt = t(ctx);
    countTxt.text = String(count);
    countTxt.style = {
      fontFamily: 'system-ui',
      fontSize: countSize,
      fill: 0xffffff,
      fontWeight: 'bold',
      dropShadow: { color: 0x000000, blur: 2, distance: 0, alpha: 0.8 },
    };
    countTxt.anchor.set(0.5, 0.5);
    countTxt.x = badgeX;
    countTxt.y = badgeY;
    container.addChild(countTxt);

    // ── Label below the card ──────────────────────────────────────────────
    const labelTxt = t(ctx);
    labelTxt.text = label;
    labelTxt.style = {
      fontFamily: 'system-ui',
      fontSize: labelSize,
      fill: frameColor,
      fontWeight: 'bold',
      letterSpacing: 0.5,
    };
    labelTxt.anchor.set(0.5, 0);
    labelTxt.x = cardW / 2;
    labelTxt.y = cardH + 5;
    container.addChild(labelTxt);

    // ── Empty-pile dimming ────────────────────────────────────────────────
    container.alpha = count === 0 ? 0.38 : 1;

    container.x = baseX;
    container.y = cardTop;
    stage.addChild(container);
  }

  // Draw pile — warm gold palette
  drawPileWidget(drawX, deckCount, 'DRAW', 0xc8922a, 0x9a6e1a, false);
  // Discard pile — muted silver/slate palette
  drawPileWidget(discardX, discardCount, 'DISCARD', 0x7a8099, 0x3a4055, true);
}

function drawDebugLayout(ctx: CombatViewContext): void {
  if (!ctx.debugLayout) return;

  let gr = ctx.stage.getChildByName('__debugLayout') as PIXI.Graphics | null;
  if (!gr) {
    gr = new PIXI.Graphics();
    gr.name = '__debugLayout';
    gr.zIndex = 9999;
    ctx.stage.addChild(gr);
  }
  gr.clear();

  const w = ctx.w;
  const h = ctx.h;

  // Spec constants (see docs/ui-layout-fights.md)
  const safe = 24;
  const headerH = 96;
  const footerH = 240;

  // Safe area
  gr.lineStyle(2, 0x66ffcc, 0.9);
  gr.drawRect(safe, safe, w - safe * 2, h - safe * 2);

  // Header / footer guide lines
  gr.lineStyle(2, 0xffcc66, 0.95);
  gr.drawRect(0, 0, w, headerH);
  gr.drawRect(0, h - footerH, w, footerH);

  // Stage zone
  gr.lineStyle(2, 0x66aaff, 0.9);
  gr.drawRect(0, headerH, w, Math.max(0, h - headerH - footerH));

  // Player slot
  const playerBounds = getCombatSlotBounds('player', w, h);
  gr.lineStyle(3, 0x33ff33, 0.95);
  gr.drawRect(playerBounds.x, playerBounds.y, playerBounds.width, playerBounds.height);

  // Player HP / shield bars (stacked under player)
  const hpAnchor = getCombatSlotBounds('hpBlockEnergy', w, h);
  const barW = L.hpBarWidth;
  const barH = L.hpBarHeight;
  const barGap = 6;
  const barX = hpAnchor.x - barW / 2;
  const hpY = hpAnchor.y + 8;
  const blockY = hpY + barH + barGap;
  gr.lineStyle(2, 0xffffff, 0.85);
  gr.drawRect(barX, hpY, barW, barH);
  gr.lineStyle(2, 0x7aa7ff, 0.85);
  gr.drawRect(barX, blockY, barW, barH);

  // Enemy slots
  const enemies = ctx.state.enemies ?? [];
  const layout = getEnemyLayout(w, h, enemies.length);
  gr.lineStyle(3, 0xff3366, 0.9);
  for (let i = 0; i < enemies.length; i++) {
    const left = layout.getLeft(i);
    gr.drawRect(left, layout.startY, layout.placeholderW, layout.placeholderH);
    // Enemy bars inside frame (top-ish)
    const ebw = L.enemyBarWidth;
    const ebh = L.enemyBarHeight;
    const egap = 4;
    const ex = left + (layout.placeholderW - ebw) / 2;
    const ey = layout.startY + layout.placeholderH - (ebh * 2 + egap) - 10;
    gr.lineStyle(2, 0xffffff, 0.75);
    gr.drawRect(ex, ey, ebw, ebh);
    gr.lineStyle(2, 0x7aa7ff, 0.75);
    gr.drawRect(ex, ey + ebh + egap, ebw, ebh);
  }

  // Leave attached; we reuse it each frame.
}
