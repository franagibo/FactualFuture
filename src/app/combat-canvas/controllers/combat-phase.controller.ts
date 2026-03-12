/**
 * Holds combat-phase state and builds the combat view context.
 * Used by the game canvas component so combat state and context building live outside the main component file.
 */
import type { GameState } from '../../../engine/types';
import * as PIXI from 'pixi.js';
import { getHandLayout, type HandLayoutResult } from '../constants/hand-layout';
import type { CombatViewContext } from '../renderers/combat-view.renderer';
import type { FloatingNumber } from '../constants/combat-types';

/** Host provided by the component: callbacks and getters needed to build CombatViewContext. */
export interface CombatPhaseHost {
  getCardCost(cardId: string): number;
  getCardName(cardId: string): string;
  getCardEffectDescription(cardId: string): string;
  getCombatAssets(): { getCardArtTexture: (id: string) => PIXI.Texture | null; getPlayerTexture: (now: number) => PIXI.Texture | null; getEnemyTexture: (id: string) => PIXI.Texture | null; getEnemyAnimationTexture: (variant: number, animation: 'idle' | 'hurt' | 'dying', nowMs: number, startMs?: number) => PIXI.Texture | null; getCombatBgTexture: () => PIXI.Texture | null; getHpIconTexture: () => PIXI.Texture | null; getBlockIconTexture: () => PIXI.Texture | null; getShieldVideoTexture: () => PIXI.Texture | null; getShootingTexture: () => PIXI.Texture | null; getSlashingTexture: () => PIXI.Texture | null };
  getGameSettings(): { handLayout: () => 'default' | 'compact'; reducedMotion: () => boolean; textScale: () => number; vfxIntensity: () => 'full' | 'reduced' | 'off' };
  getApp(): PIXI.Application | null;
  redraw(): void;
  requestTemplateUpdate(): void;
  onCardPointerOver(handIndex: number): void;
  onCardPointerOut(): void;
  onCardPointerDown(cardId: string, handIndex: number, stageX: number, stageY: number): void;
  onCardClick(cardId: string, handIndex: number): void;
  onEnemyTargetClick(enemyIndex: number): void;
  onEnemyPointerOver(enemyIndex: number): void;
  onEnemyPointerOut(): void;
  cardNeedsEnemyTarget(cardId: string): boolean;
  markForCheck(): void;
}

export class CombatPhaseController {
  cardInteractionState: 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning' = 'idle';
  cardInteractionCardIndex: number | null = null;
  cardInteractionCardId: string | null = null;
  hoveredCardIndex: number | null = null;
  hoveredEnemyIndex: number | null = null;
  pressStartX = 0;
  pressStartY = 0;
  dragScreenX = 0;
  dragScreenY = 0;
  returnStartX = 0;
  returnStartY = 0;
  returnStartTime = 0;
  returnProgress = 0;
  floatingNumbers: FloatingNumber[] = [];
  showingEnemyTurn = false;
  hoverLerp: number[] = [];
  targetLerp: number[] = [];
  spreadLerp: number[] = [];
  readonly cardSprites: Map<string, PIXI.Container> = new Map();
  playerSpriteRef: PIXI.Sprite | null = null;
  enemySpriteRefs: PIXI.Sprite[] = [];
  enemyVariants: number[] = [];
  enemyHurtStartMs: (number | null)[] = [];
  enemyDyingStartMs: (number | null)[] = [];
  shieldAnimationPlaying = false;
  shootingAnimationPlaying = false;
  slashingAnimationPlaying = false;
  activeCardVfx: { vfxId: string; x: number; y: number; startTime: number }[] = [];

  /** Builds the context passed to drawCombatView. */
  buildCombatContext(
    host: CombatPhaseHost,
    stage: PIXI.Container,
    state: GameState,
    w: number,
    h: number,
    padding: number
  ): CombatViewContext {
    const c = this;
    const assets = host.getCombatAssets();
    const settings = host.getGameSettings();
    if (state.runPhase === 'combat' && state.enemies.length !== c.enemyVariants.length) {
      c.enemyVariants = state.enemies.map(() => 1 + Math.floor(Math.random() * 3));
      c.enemyHurtStartMs = state.enemies.map(() => null);
      c.enemyDyingStartMs = state.enemies.map(() => null);
    }
    const getHandLayoutFn = (count: number, hoveredIdx: number | null): HandLayoutResult =>
      getHandLayout(count, w, h, hoveredIdx, {
        handLayout: settings.handLayout(),
        reducedMotion: settings.reducedMotion(),
      });
    return {
      stage,
      state,
      w,
      h,
      padding,
      hand: {
        hoveredCardIndex: c.hoveredCardIndex,
        cardInteractionState: c.cardInteractionState,
        cardInteractionCardIndex: c.cardInteractionCardIndex,
        cardInteractionCardId: c.cardInteractionCardId,
        getHandLayout: getHandLayoutFn,
        spreadLerp: c.spreadLerp,
        hoverLerp: c.hoverLerp,
        cardSprites: c.cardSprites,
        getCardArtTexture: (id) => assets.getCardArtTexture(id),
        isDraggingCard: c.cardInteractionState === 'dragging',
        dragCardId: c.cardInteractionState === 'dragging' ? c.cardInteractionCardId : null,
        dragHandIndex: c.cardInteractionState === 'dragging' ? c.cardInteractionCardIndex : null,
        dragScreenX: c.dragScreenX,
        dragScreenY: c.dragScreenY,
        dragIsTargetingEnemy: c.cardInteractionCardId ? host.cardNeedsEnemyTarget(c.cardInteractionCardId) : false,
        returnProgress: c.cardInteractionState === 'returning' ? c.returnProgress : null,
        returnStartX: c.returnStartX,
        returnStartY: c.returnStartY,
      },
      player: {
        getPlayerTexture: () => assets.getPlayerTexture(performance.now()),
        shieldAnimationPlaying: c.shieldAnimationPlaying,
        getShieldVideoTexture: () => assets.getShieldVideoTexture(),
        shootingAnimationPlaying: c.shootingAnimationPlaying,
        getShootingTexture: () => assets.getShootingTexture(),
        slashingAnimationPlaying: c.slashingAnimationPlaying,
        getSlashingTexture: () => assets.getSlashingTexture(),
        onPlayerSpriteCreated: (s) => { c.playerSpriteRef = s; },
      },
      enemies: {
        enemyVariants: c.enemyVariants,
        enemyHurtStartMs: c.enemyHurtStartMs,
        enemyDyingStartMs: c.enemyDyingStartMs,
        getEnemyAnimationTexture: (variant, animation, nowMs, startMs) =>
          assets.getEnemyAnimationTexture(variant, animation, nowMs, startMs),
        getEnemyTexture: (id) => assets.getEnemyTexture(id),
        hoveredEnemyIndex: c.hoveredEnemyIndex,
        onEnemySpriteCreated: (i, s) => { c.enemySpriteRefs[i] = s; },
      },
      hoveredCardIndex: c.hoveredCardIndex,
      cardInteractionState: c.cardInteractionState,
      cardInteractionCardIndex: c.cardInteractionCardIndex,
      cardInteractionCardId: c.cardInteractionCardId,
      hoveredEnemyIndex: c.hoveredEnemyIndex,
      isDraggingCard: c.cardInteractionState === 'dragging',
      dragCardId: c.cardInteractionState === 'dragging' ? c.cardInteractionCardId : null,
      dragHandIndex: c.cardInteractionState === 'dragging' ? c.cardInteractionCardIndex : null,
      dragScreenX: c.dragScreenX,
      dragScreenY: c.dragScreenY,
      dragIsTargetingEnemy: c.cardInteractionCardId ? host.cardNeedsEnemyTarget(c.cardInteractionCardId) : false,
      returnProgress: c.cardInteractionState === 'returning' ? c.returnProgress : null,
      returnStartX: c.returnStartX,
      returnStartY: c.returnStartY,
      getHandLayout: getHandLayoutFn,
      floatingNumbers: c.floatingNumbers,
      showingEnemyTurn: c.showingEnemyTurn,
      getCardCost: (id) => host.getCardCost(id),
      getCardName: (id) => host.getCardName(id),
      getCardEffectDescription: (id) => host.getCardEffectDescription(id),
      onCardClick: (cardId, handIndex) => host.onCardClick(cardId, handIndex),
      onEnemyTargetClick: (enemyIndex) => host.onEnemyTargetClick(enemyIndex),
      onCardPointerOver: (handIndex) => host.onCardPointerOver(handIndex),
      onCardPointerOut: () => host.onCardPointerOut(),
      onCardPointerDown: (cardId, handIndex, stageX, stageY) => host.onCardPointerDown(cardId, handIndex, stageX, stageY),
      onEnemyPointerOver: (enemyIndex) => host.onEnemyPointerOver(enemyIndex),
      onEnemyPointerOut: () => host.onEnemyPointerOut(),
      cardSprites: c.cardSprites,
      markForCheck: () => host.markForCheck(),
      getCombatBgTexture: () => assets.getCombatBgTexture(),
      getHpIconTexture: () => assets.getHpIconTexture(),
      getBlockIconTexture: () => assets.getBlockIconTexture(),
      getPlayerTexture: () => assets.getPlayerTexture(performance.now()),
      getEnemyTexture: (id) => assets.getEnemyTexture(id),
      enemyVariants: c.enemyVariants,
      enemyHurtStartMs: c.enemyHurtStartMs,
      enemyDyingStartMs: c.enemyDyingStartMs,
      getEnemyAnimationTexture: (variant, animation, nowMs, startMs) =>
        assets.getEnemyAnimationTexture(variant, animation, nowMs, startMs),
      getCardArtTexture: (id) => assets.getCardArtTexture(id),
      hoverLerp: c.hoverLerp,
      spreadLerp: c.spreadLerp,
      textScale: settings.textScale(),
      vfxIntensity: settings.vfxIntensity(),
      shieldAnimationPlaying: c.shieldAnimationPlaying,
      getShieldVideoTexture: () => assets.getShieldVideoTexture(),
      shootingAnimationPlaying: c.shootingAnimationPlaying,
      getShootingTexture: () => assets.getShootingTexture(),
      slashingAnimationPlaying: c.slashingAnimationPlaying,
      getSlashingTexture: () => assets.getSlashingTexture(),
      onPlayerSpriteCreated: (s) => { c.playerSpriteRef = s; },
      onEnemySpriteCreated: (i, s) => { c.enemySpriteRefs[i] = s; },
    };
  }
}
