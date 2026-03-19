/**
 * Holds combat-phase state and builds the combat view context.
 * Used by the game canvas component so combat state and context building live outside the main component file.
 */
import type { GameState } from '../../../engine/types';
import * as PIXI from 'pixi.js';
import { getHandLayout, type HandLayoutResult } from '../constants/hand-layout';
import type { CombatViewContext } from '../renderers/combat-view.renderer';
import type { FloatingNumber } from '../constants/combat-types';
import type { PixiPools } from '../pools/pixi-pools';
import type { CardPresentation } from '../models/card-presentation.model';
import { createCardPresentation, setTargetsFromLayout } from '../models/card-presentation.model';
import { getHandLayoutTargets } from '../systems/hand-layout.system';
import { updateZOrder } from '../systems/z-order.system';
import { getDeckPosition } from '../constants/combat-layout.constants';
import { ZoneManager } from '../systems/zone-manager';

/** Host provided by the component: callbacks and getters needed to build CombatViewContext. */
export interface CombatPhaseHost {
  getCardCost(cardId: string): number;
  getCardName(cardId: string): string;
  getCardEffectDescription(cardId: string): string;
  getCombatAssets(): {
    getCardArtTexture: (id: string) => PIXI.Texture | null;
    getPlayerTexture: (now: number) => PIXI.Texture | null;
    getEnemyTexture: (id: string) => PIXI.Texture | null;
    getEnemyAnimationTexture: (variant: number, animation: 'idle' | 'hurt' | 'dying', nowMs: number, startMs?: number) => PIXI.Texture | null;
    getCombatBgTexture: () => PIXI.Texture | null;
    getHpIconTexture: () => PIXI.Texture | null;
    getBlockIconTexture: () => PIXI.Texture | null;
    getHpBarBgTexture: () => PIXI.Texture | null;
    getHpBarProgressTexture: () => PIXI.Texture | null;
    getHpBarBorderTexture: () => PIXI.Texture | null;
    getShieldBarBgTexture: () => PIXI.Texture | null;
    getShieldBarProgressTexture: () => PIXI.Texture | null;
    getShieldBarBorderTexture: () => PIXI.Texture | null;
    getShieldVideoTexture: () => PIXI.Texture | null;
    getShootingTexture: () => PIXI.Texture | null;
    getSlashingTexture: () => PIXI.Texture | null;
    getVMGrowSeedTexture: () => PIXI.Texture | null;
    getVMSpellTexture: () => PIXI.Texture | null;
    getVMSummoningTexture: () => PIXI.Texture | null;
    getVMCommandingTexture: () => PIXI.Texture | null;
    getVMEvolveTexture: () => PIXI.Texture | null;
    getVMDetonateTexture: () => PIXI.Texture | null;
    getVMDrainTexture: () => PIXI.Texture | null;
  };
  getGameSettings(): { handLayout: () => 'default' | 'compact'; reducedMotion: () => boolean; textScale: () => number; vfxIntensity: () => 'full' | 'reduced' | 'off'; debugLayout: () => boolean };
  /** Optional presentation-only effect (short flash overlay). */
  getImpactFlash?(): { alpha: number; color: number } | null;
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
  getPools?(): PixiPools | undefined;
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
  vmGrowSeedAnimationPlaying = false;
  vmSpellAnimationPlaying = false;
  vmSummoningAnimationPlaying = false;
  vmCommandingAnimationPlaying = false;
  vmEvolveAnimationPlaying = false;
  vmDetonateAnimationPlaying = false;
  vmDrainAnimationPlaying = false;
  activeCardVfx: { vfxId: string; x: number; y: number; startTime: number }[] = [];

  /** Target-based card presentation (current/target position, rotation, scale). Length matches state.hand. */
  handPresentations: CardPresentation[] = [];
  /** Indices of cards just drawn (for z-order). Cleared after a short delay. */
  newDrawIndices: number[] = [];
  private newDrawClearAt = 0;
  readonly zoneManager = new ZoneManager();

  /**
   * Syncs handPresentations length and sets targets from layout (and drag position for dragged card).
   * Call from buildCombatContext and from the ticker so targets stay current.
   */
  applyHandLayoutTargets(
    handLen: number,
    w: number,
    h: number,
    options: { handLayout: 'default' | 'compact'; reducedMotion: boolean },
    excludedIndex: number | null,
    dragX: number,
    dragY: number
  ): void {
    const c = this;
    const layoutTargets = getHandLayoutTargets(handLen, c.hoveredCardIndex, excludedIndex, w, h, options);
    const oldLen = c.handPresentations.length;
    while (c.handPresentations.length > handLen) c.handPresentations.pop();
    const deckPos = getDeckPosition(w, h);
    while (c.handPresentations.length < handLen) {
      const idx = c.handPresentations.length;
      const t = layoutTargets[idx];
      c.handPresentations.push(
        createCardPresentation(deckPos.x, deckPos.y, 0, 1)
      );
      if (t) setTargetsFromLayout(c.handPresentations[idx], t.x, t.y, t.rotation, t.scale, t.spreadOffsetX);
    }
    if (handLen > oldLen) {
      c.newDrawIndices = Array.from({ length: handLen - oldLen }, (_, k) => oldLen + k);
      c.newDrawClearAt = typeof performance !== 'undefined' ? performance.now() + 500 : 0;
    }
    if (c.newDrawClearAt > 0 && typeof performance !== 'undefined' && performance.now() >= c.newDrawClearAt) {
      c.newDrawIndices = [];
      c.newDrawClearAt = 0;
    }
    for (let i = 0; i < handLen; i++) {
      const p = c.handPresentations[i];
      if (i === excludedIndex) {
        p.targetX = dragX;
        p.targetY = dragY;
        p.targetRotation = 0;
        p.targetScale = 1.08;
      } else {
        const t = layoutTargets[i];
        if (t) setTargetsFromLayout(p, t.x, t.y, t.rotation, t.scale, t.spreadOffsetX);
      }
    }
    const isNewByIndex = (i: number) => c.newDrawIndices.includes(i);
    updateZOrder(c.handPresentations, c.hoveredCardIndex, excludedIndex, isNewByIndex);
  }

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
    if (state.runPhase !== 'combat') {
      c.zoneManager.reset();
    }
    const hand = state.runPhase === 'combat' ? state.hand : [];
    const handLen = hand.length;
    if (state.runPhase === 'combat') {
      c.zoneManager.onEngineStateChanged(state);
    }
    const excludedIndex =
      c.cardInteractionState === 'dragging' && c.cardInteractionCardIndex != null ? c.cardInteractionCardIndex : null;
    const layoutOptions = { handLayout: settings.handLayout(), reducedMotion: settings.reducedMotion() };
    if (state.runPhase === 'combat' && handLen > 0) {
      c.applyHandLayoutTargets(handLen, w, h, layoutOptions, excludedIndex, c.dragScreenX, c.dragScreenY);
    }
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
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Optional presentation layer from host (juice effects).
    const anyHost = host as unknown as { getImpactFlash?: () => { alpha: number; color: number } | null };
    const impactFlash = anyHost.getImpactFlash?.() ?? null;

    return {
      stage,
      state,
      w,
      h,
      padding,
      debugLayout: settings.debugLayout(),
      ...(impactFlash ? { impactFlash } : {}),
      pools: undefined,
      hand: {
        hoveredCardIndex: c.hoveredCardIndex,
        cardInteractionState: c.cardInteractionState,
        cardInteractionCardIndex: c.cardInteractionCardIndex,
        cardInteractionCardId: c.cardInteractionCardId,
        getHandLayout: getHandLayoutFn,
        spreadLerp: c.spreadLerp,
        hoverLerp: c.hoverLerp,
        handPresentations: c.handPresentations,
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
        vmGrowSeedAnimationPlaying: c.vmGrowSeedAnimationPlaying,
        getVMGrowSeedTexture: () => assets.getVMGrowSeedTexture(),
        vmSpellAnimationPlaying: c.vmSpellAnimationPlaying,
        getVMSpellTexture: () => assets.getVMSpellTexture(),
        vmSummoningAnimationPlaying: c.vmSummoningAnimationPlaying,
        getVMSummoningTexture: () => assets.getVMSummoningTexture(),
        vmCommandingAnimationPlaying: c.vmCommandingAnimationPlaying,
        getVMCommandingTexture: () => assets.getVMCommandingTexture(),
        vmEvolveAnimationPlaying: c.vmEvolveAnimationPlaying,
        getVMEvolveTexture: () => assets.getVMEvolveTexture(),
        vmDetonateAnimationPlaying: c.vmDetonateAnimationPlaying,
        getVMDetonateTexture: () => assets.getVMDetonateTexture(),
        vmDrainAnimationPlaying: c.vmDrainAnimationPlaying,
        getVMDrainTexture: () => assets.getVMDrainTexture(),
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
      getHpBarBgTexture: () => assets.getHpBarBgTexture(),
      getHpBarProgressTexture: () => assets.getHpBarProgressTexture(),
      getHpBarBorderTexture: () => assets.getHpBarBorderTexture(),
      getShieldBarBgTexture: () => assets.getShieldBarBgTexture(),
      getShieldBarProgressTexture: () => assets.getShieldBarProgressTexture(),
      getShieldBarBorderTexture: () => assets.getShieldBarBorderTexture(),
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
      vmGrowSeedAnimationPlaying: c.vmGrowSeedAnimationPlaying,
      getVMGrowSeedTexture: () => assets.getVMGrowSeedTexture(),
      vmSpellAnimationPlaying: c.vmSpellAnimationPlaying,
      getVMSpellTexture: () => assets.getVMSpellTexture(),
      vmSummoningAnimationPlaying: c.vmSummoningAnimationPlaying,
      getVMSummoningTexture: () => assets.getVMSummoningTexture(),
      vmCommandingAnimationPlaying: c.vmCommandingAnimationPlaying,
      getVMCommandingTexture: () => assets.getVMCommandingTexture(),
      vmEvolveAnimationPlaying: c.vmEvolveAnimationPlaying,
      getVMEvolveTexture: () => assets.getVMEvolveTexture(),
      vmDetonateAnimationPlaying: c.vmDetonateAnimationPlaying,
      getVMDetonateTexture: () => assets.getVMDetonateTexture(),
      vmDrainAnimationPlaying: c.vmDrainAnimationPlaying,
      getVMDrainTexture: () => assets.getVMDrainTexture(),
      onPlayerSpriteCreated: (s) => { c.playerSpriteRef = s; },
      onEnemySpriteCreated: (i, s) => { c.enemySpriteRefs[i] = s; },
    };
  }
}
