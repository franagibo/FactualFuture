import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { Router } from '@angular/router';
import { CombatAssetsService } from '../services/combat-assets.service';
import { GameBridgeService } from '../services/game-bridge.service';
import { MapAssetsService } from '../services/map-assets.service';
import { SoundService } from '../services/sound.service';
import type { GameState, RunPhase, MapNodeType } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import * as PIXI from 'pixi.js';
import { COMBAT_LAYOUT } from './constants/combat-layout.constants';
import { getCardEffectDescription } from './helpers/card-text.helper';
import { drawMapView } from './renderers/map-view.renderer';
import { drawCombatView, type CombatViewContext } from './renderers/combat-view.renderer';

/**
 * Main game canvas: owns PixiJS app lifecycle, game state sync, and user actions.
 * Delegates map and combat drawing to renderers; handles redraw dispatch and event callbacks.
 */
@Component({
  selector: 'app-combat-canvas',
  standalone: true,
  templateUrl: './combat-canvas.component.html',
  styleUrls: ['./combat-canvas.component.scss'],
})
export class CombatCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('canvasHost', { static: true }) canvasHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollArea') scrollAreaRef?: ElementRef<HTMLElement>;

  private app: PIXI.Application | null = null;
  private cardSprites: Map<string, PIXI.Container> = new Map();
  private cardsMap: Map<string, CardDef> | null = null;
  /** Index of card in hand currently hovered; used for lift/scale/z-order. */
  hoveredCardIndex: number | null = null;
  /** When set, we are in targeting mode; player must click an enemy to play this card. */
  selectedCardId: string | null = null;
  /** In targeting mode, index of enemy currently hovered (for arrow and highlight). */
  hoveredEnemyIndex: number | null = null;
  /** B9/B20: Floating numbers to show (damage/block) with screen position; addedAt for expiry. */
  private floatingNumbers: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number; addedAt?: number }[] = [];
  /** B11: When true, show "Enemy turn" banner before resolving enemy phase. */
  private showingEnemyTurn = false;
  /** B15: Per-card hover influence 0..1 for smooth animation; length = hand length. */
  private hoverLerp: number[] = [];
  /** B15: Target values for hoverLerp (0 or 1); set each redraw in combat. */
  private targetLerp: number[] = [];
  private _steamWarning = '';
  private _combatResult: GameState['combatResult'] = null;
  private _runPhase: RunPhase | undefined = undefined;
  private resizeObserver: ResizeObserver | null = null;
  private hoverLerpTicker: ((t: { deltaTime: number }) => void) | null = null;
  private shieldTicker: (() => void) | null = null;
  /** When in map phase, total height of map content (px) for scroll. */
  mapContentHeight = 0;
  showPauseMenu = false;
  showPauseSettings = false;
  pauseFullscreen = true;
  /** When true, player shows shield animation video (played when a block card is used). */
  shieldAnimationPlaying = false;

  constructor(
    private bridge: GameBridgeService,
    private mapAssets: MapAssetsService,
    private combatAssets: CombatAssetsService,
    public sound: SoundService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedCardId != null) {
      this.selectedCardId = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.cdr.markForCheck();
      return;
    }
    // B18: targeting cancelled above; fall through to open pause menu
    this.showPauseSettings = false;
    this.showPauseMenu = true;
    this.cdr.markForCheck();
  }

  closePauseMenu(): void {
    this.showPauseMenu = false;
    this.showPauseSettings = false;
    this.cdr.markForCheck();
  }

  onPauseContinue(): void {
    this.closePauseMenu();
  }

  openPauseSettings(): void {
    this.showPauseSettings = true;
    if (this.isElectron()) {
      const api = (window as unknown as { electronAPI?: { getSettings?: () => Promise<{ fullscreen?: boolean }> } }).electronAPI;
      api?.getSettings?.().then((s) => {
        this.pauseFullscreen = s?.fullscreen !== false;
        this.cdr.markForCheck();
      });
    }
    this.cdr.markForCheck();
  }

  closePauseSettings(): void {
    this.showPauseSettings = false;
    this.cdr.markForCheck();
  }

  setPauseFullScreen(fullscreen: boolean): void {
    const api = (window as unknown as { electronAPI?: { setFullScreen?: (v: boolean) => void } }).electronAPI;
    if (api?.setFullScreen) api.setFullScreen(fullscreen);
    this.pauseFullscreen = fullscreen;
    this.cdr.markForCheck();
  }

  setPauseResolution(width: number, height: number): void {
    const api = (window as unknown as { electronAPI?: { setWindowSize?: (w: number, h: number) => void } }).electronAPI;
    if (api?.setWindowSize) api.setWindowSize(width | 0, height | 0);
    this.cdr.markForCheck();
  }

  setPauseSound(muted: boolean): void {
    this.sound.setMuted(muted);
    this.cdr.markForCheck();
  }

  onExitGame(): void {
    this.closePauseMenu();
    const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
    if (api?.quit) api.quit();
  }

  isElectron(): boolean {
    return typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined';
  }

  confirmQuitToMenu(): void {
    this.bridge.saveRun();
    this.showPauseMenu = false;
    this.showPauseSettings = false;
    this.cdr.markForCheck();
    this.router.navigate(['/']);
  }

  steamWarning = () => this._steamWarning;
  combatResult = () => this._combatResult;
  runPhase = () => this._runPhase;
  rewardChoices = () => this.bridge.getRewardChoices();

  ngOnInit(): void {
    this.sound.loadMutedPreference();
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { onSteamWarning?: (cb: (m: string) => void) => void } }).electronAPI?.onSteamWarning) {
      (window as unknown as { electronAPI: { onSteamWarning: (cb: (m: string) => void) => void } }).electronAPI.onSteamWarning((msg) => {
        this._steamWarning = msg;
        this.cdr.markForCheck();
      });
    }
    this.initPixi();
  }

  ngOnDestroy(): void {
    if (this.hoverLerpTicker && this.app) this.app.ticker.remove(this.hoverLerpTicker);
    this.hoverLerpTicker = null;
    if (this.shieldTicker && this.app) this.app.ticker.remove(this.shieldTicker);
    this.shieldTicker = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app?.destroy(true, { children: true, texture: false });
    this.app = null;
  }

  /** Create Pixi app, attach to host, wire resize and initial redraw. */
  private async initPixi(): Promise<void> {
    await this.bridge.ensureDataLoaded();
    if (!this.bridge.getState()) {
      this.bridge.startRun();
    }
    const state = this.bridge.getState();
    this._combatResult = state?.combatResult ?? null;
    this._runPhase = this.bridge.getRunPhase();
    this.cdr.markForCheck();

    const host = this.canvasHostRef.nativeElement;
    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: host,
      background: 0x1a1a2e,
      antialias: true,
    });
    host.appendChild(this.app.canvas);
    this.app.stage.eventMode = 'passive' as PIXI.EventMode;
    this.resizeObserver = new ResizeObserver(() => this.redraw());
    this.resizeObserver.observe(host);
    this.hoverLerpTicker = () => {
      if (this._runPhase !== 'combat' || !this.app || this.hoverLerp.length !== this.targetLerp.length) return;
      let changed = false;
      const factor = 0.2;
      for (let i = 0; i < this.hoverLerp.length; i++) {
        const prev = this.hoverLerp[i];
        this.hoverLerp[i] = prev + (this.targetLerp[i] - prev) * factor;
        if (Math.abs(this.hoverLerp[i] - prev) > 0.01) changed = true;
      }
      if (changed) {
        this.redraw();
        this.cdr.markForCheck();
      }
    };
    this.app.ticker.add(this.hoverLerpTicker);
    this.redraw();
    if (this._runPhase === 'map') {
      this.mapAssets.loadMapAssets().then(() => {
        requestAnimationFrame(() => this.redraw());
      });
    }
  }

  /** Clears stage and draws either map or combat view; syncs combat result and run phase from bridge. */
  private redraw(): void {
    const state = this.bridge.getState();
    if (!state || !this.app) return;
    const now = performance.now();
    this.floatingNumbers = this.floatingNumbers.filter((fn) => (fn.addedAt == null) || now - fn.addedAt <= 700);
    this._combatResult = state.combatResult;
    this._runPhase = this.bridge.getRunPhase();

    const stage = this.app.stage;
    stage.removeChildren();

    const padding = COMBAT_LAYOUT.padding;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // Map phase and overlays (reward, rest, shop, event, victory): render map as background.
    if (
      (this._runPhase === 'map' ||
        this._runPhase === 'reward' ||
        this._runPhase === 'rest' ||
        this._runPhase === 'shop' ||
        this._runPhase === 'event' ||
        this._runPhase === 'victory') &&
      state.map
    ) {
      const mapContext = {
        getAvailableNextNodes: () => this.bridge.getAvailableNextNodes(),
        getNodeTexture: (type: MapNodeType) => this.mapAssets.getNodeTexture(type),
        getMapBgTexture: () => this.mapAssets.getMapBgTexture(),
        onMapContentHeight: (height: number) => { this.mapContentHeight = height; },
        scrollAreaElement: this.scrollAreaRef?.nativeElement,
        markForCheck: () => this.cdr.markForCheck(),
        onChooseNode:
          this._runPhase === 'map'
            ? (nodeId: string) => {
                this.bridge.chooseNode(nodeId);
                this.redraw();
              }
            : () => {},
        loadMapAssets: () => this.mapAssets.loadMapAssets(),
      };
      drawMapView(mapContext, state, stage, w, h, padding);
      this.cdr.markForCheck();
      return;
    }

    // Combat phase only: ensure combat assets loading, build context and delegate to combat renderer.
    if (this._runPhase !== 'combat') return;
    this.combatAssets.loadCombatAssets();
    const hand = state.hand;
    if (this.hoveredCardIndex != null && this.hoveredCardIndex >= hand.length) this.hoveredCardIndex = null;

    this.targetLerp = hand.map((cardId, i) =>
      (i === this.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) || this.selectedCardId === cardId ? 1 : 0
    );
    if (this.hoverLerp.length !== this.targetLerp.length) {
      this.hoverLerp = [...this.targetLerp];
    }

    const combatContext: CombatViewContext = {
      stage,
      state,
      w,
      h,
      padding,
      hoveredCardIndex: this.hoveredCardIndex,
      selectedCardId: this.selectedCardId,
      hoveredEnemyIndex: this.hoveredEnemyIndex,
      floatingNumbers: this.floatingNumbers,
      showingEnemyTurn: this.showingEnemyTurn,
      getCardCost: (id) => this.getCardCost(id),
      getCardName: (id) => this.getCardName(id),
      getCardEffectDescription: (id) => getCardEffectDescription(id, (cid) => this.bridge.getCardDef(cid)),
      onCardClick: (cardId, handIndex) => this.onCardClick(cardId, handIndex),
      onEnemyTargetClick: (enemyIndex) => this.onEnemyTargetClick(enemyIndex),
      onCardPointerOver: (handIndex) => { this.hoveredCardIndex = handIndex; this.redraw(); },
      onCardPointerOut: () => { this.hoveredCardIndex = null; this.redraw(); },
      onEnemyPointerOver: (enemyIndex) => { this.hoveredEnemyIndex = enemyIndex; this.redraw(); },
      onEnemyPointerOut: () => { this.hoveredEnemyIndex = null; this.redraw(); },
      cardSprites: this.cardSprites,
      markForCheck: () => this.cdr.markForCheck(),
      getCombatBgTexture: () => this.combatAssets.getCombatBgTexture(),
      getPlayerTexture: () => this.combatAssets.getPlayerTexture(),
      getEnemyTexture: (id) => this.combatAssets.getEnemyTexture(id),
      hoverLerp: this.hoverLerp,
      shieldAnimationPlaying: this.shieldAnimationPlaying,
      getShieldVideoTexture: () => this.combatAssets.getShieldVideoTexture(),
    };
    drawCombatView(combatContext);
  }

  /** Energy cost of the card from definition. */
  private getCardCost(cardId: string): number {
    return this.bridge.getCardDef(cardId)?.cost ?? 0;
  }

  /** True if the card has any effect that targets an enemy (requires target selection). */
  private cardNeedsEnemyTarget(cardId: string): boolean {
    const def = this.bridge.getCardDef(cardId);
    return def?.effects?.some((e) => e.target === 'enemy') ?? false;
  }

  /** True if the card has a block effect (player gains block). Used to trigger shield animation. */
  private cardHasBlockEffect(cardId: string): boolean {
    const def = this.bridge.getCardDef(cardId);
    return def?.effects?.some((e) => e.type === 'block' && e.target === 'player') ?? false;
  }

  /** If the card grants block, play shield animation on the player character. */
  private triggerShieldAnimationIfBlock(cardId: string): void {
    if (!this.cardHasBlockEffect(cardId)) return;
    this.shieldAnimationPlaying = true;
    if (this.app && !this.shieldTicker) {
      this.shieldTicker = () => {
        if (this.shieldAnimationPlaying) {
          this.redraw();
          this.cdr.markForCheck();
          this.combatAssets.getShieldAnimationDone();
        }
      };
      this.app.ticker.add(this.shieldTicker);
    }
    this.redraw();
    this.cdr.markForCheck();
    this.combatAssets.playShieldAnimation().then(() => {
      this.shieldAnimationPlaying = false;
      if (this.shieldTicker && this.app) {
        this.app.ticker.remove(this.shieldTicker);
        this.shieldTicker = null;
      }
      this.redraw();
      this.cdr.markForCheck();
    });
  }

  /** Display name for a card (used in hand and reward/rest panels). */
  getCardName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

  /** Handle card click: enter targeting if needed, else play card or cancel selection. */
  onCardClick(cardId: string, _handIndex: number): void {
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;

    const cost = this.getCardCost(cardId);
    if (state.energy < cost) return;

    if (this.selectedCardId != null) {
      if (this.selectedCardId === cardId) {
        this.selectedCardId = null;
        this.redraw();
        this.cdr.markForCheck();
      }
      return;
    }

    if (this.cardNeedsEnemyTarget(cardId)) {
      const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
      if (aliveCount === 0) return; // B19: no valid target, do not enter targeting
      this.selectedCardId = cardId;
      this.redraw();
      this.cdr.markForCheck();
      return;
    }

    this.bridge.playCard(cardId, state.enemies.length > 0 ? 0 : undefined);
    this.triggerShieldAnimationIfBlock(cardId);
    this.redraw();
  }

  /** In targeting mode, play selected card against the clicked enemy (with fly animation). */
  onEnemyTargetClick(enemyIndex: number): void {
    if (this.selectedCardId == null) return;
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;
    const enemy = state.enemies[enemyIndex];
    if (!enemy || enemy.hp <= 0) return;
    this.runCardFlyThenPlay(this.selectedCardId, enemyIndex, state);
  }

  /** Clear selected card and hovered enemy; exit targeting mode. */
  cancelTargeting(): void {
    this.selectedCardId = null;
    this.hoveredEnemyIndex = null;
    this.redraw();
    this.cdr.markForCheck();
  }

  /**
   * B8: Animate card flying from hand to enemy, then play card, compute floating numbers, and redraw.
   * Ease-out so card decelerates at target; 280ms duration.
   */
  private runCardFlyThenPlay(cardId: string, enemyIndex: number, state: GameState): void {
    if (!this.app) return;
    const L = COMBAT_LAYOUT;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const padding = L.padding;
    const playerY = h - L.playerYOffsetFromBottom;
    const cardWidth = L.cardWidth;
    const cardHeight = L.cardHeight;
    const cardSpacing = cardWidth * L.overlapRatio;
    const totalHandWidth = (state.hand.length - 1) * cardSpacing + cardWidth;
    const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
    const handY = playerY - cardHeight - 20;
    const center = (state.hand.length - 1) / 2;
    const enemyPlaceholderW = L.enemyPlaceholderW;
    const enemyPlaceholderH = L.enemyPlaceholderH;
    const enemyGap = L.enemyGap;
    const enemyZoneStart = w * L.enemyZoneStartRatio;
    const baselineBottom = h * L.baselineBottomRatio;
    const enemyStartY = baselineBottom - enemyPlaceholderH;
    const totalEnemyWidth = state.enemies.length * enemyPlaceholderW + (state.enemies.length - 1) * enemyGap;
    const ex = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;

    const selIdx = state.hand.indexOf(cardId);
    if (selIdx < 0) {
      this.bridge.playCard(cardId, enemyIndex);
      this.triggerShieldAnimationIfBlock(cardId);
      this.selectedCardId = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.cdr.markForCheck();
      return;
    }
    const arcN = state.hand.length > 1 ? (selIdx - center) / (state.hand.length - 1) : 0;
    const fromX = startX + selIdx * cardSpacing;
    const fromY = handY + L.arcAmplitude * (1 - 4 * arcN * arcN) - L.hoverLift;
    const toX = ex + enemyIndex * (enemyPlaceholderW + enemyGap);
    const toY = enemyStartY + enemyPlaceholderH / 2;

    const flyCard = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
    flyCard.addChild(bg);
    flyCard.pivot.set(cardWidth / 2, cardHeight);
    flyCard.x = fromX;
    flyCard.y = fromY;
    this.app.stage.addChild(flyCard);

    const duration = 280; // ms
    const startTime = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = 1 - (1 - t) * (1 - t); // ease-out
      flyCard.x = fromX + (toX - fromX) * ease;
      flyCard.y = fromY + (toY - fromY) * ease;
      if (t >= 1) {
        this.app!.ticker.remove(tick);
        flyCard.destroy({ children: true });
        const oldState = state;
        this.bridge.playCard(cardId, enemyIndex);
        this.triggerShieldAnimationIfBlock(cardId);
        this.sound.playCardPlay();
        const newState = this.bridge.getState()!;
        this.selectedCardId = null;
        this.hoveredEnemyIndex = null;
        const now = performance.now();
        const toAdd: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number; addedAt: number }[] = [];
        if (oldState.enemies[enemyIndex] && newState.enemies[enemyIndex]) {
          const hpLost = oldState.enemies[enemyIndex].hp - newState.enemies[enemyIndex].hp;
          if (hpLost > 0) {
            toAdd.push({ type: 'damage', value: hpLost, x: toX, y: toY, enemyIndex, addedAt: now });
            this.sound.playHit();
          }
        }
        const blockGain = newState.playerBlock - oldState.playerBlock;
        if (blockGain > 0) {
          const playerZoneX = w * L.playerZoneXRatio;
          toAdd.push({ type: 'block', value: blockGain, x: playerZoneX, y: baselineBottom - L.playerPlaceholderH / 2, addedAt: now + (toAdd.length > 0 ? 80 : 0) });
          this.sound.playBlock();
        }
        this.floatingNumbers = [...this.floatingNumbers, ...toAdd];
        this.redraw();
        this.cdr.markForCheck();
        if (toAdd.length > 0) {
          setTimeout(() => {
            this.redraw();
            this.cdr.markForCheck();
          }, 750);
        }
      }
    };
    this.app.ticker.add(tick);
  }

  /** True when player can press "End turn" (player phase, combat, no result yet). */
  canEndTurn(): boolean {
    const state = this.bridge.getState();
    return !!state && state.phase === 'player' && !state.combatResult && this._runPhase === 'combat';
  }

  /** Show "Enemy turn" banner, then after 1200ms call bridge.endTurn() and redraw. */
  onEndTurn(): void {
    if (!this.canEndTurn()) return;
    this.sound.playTurnEnd();
    this.showingEnemyTurn = true;
    this.redraw();
    this.cdr.markForCheck();
    setTimeout(() => {
      this.sound.playTurnStart();
      this.bridge.endTurn();
      this.showingEnemyTurn = false;
      this.redraw();
      this.cdr.markForCheck();
    }, 1200);
  }

  onRestart(): void {
    this.bridge.startRun();
    this.redraw();
  }

  onChooseReward(cardId: string): void {
    this.bridge.chooseReward(cardId);
    this.redraw();
  }

  onRestHeal(): void {
    this.bridge.restHeal();
    this.redraw();
  }

  onRestRemoveCard(cardId: string): void {
    this.bridge.restRemoveCard(cardId);
    this.redraw();
  }

  getGold(): number {
    return this.bridge.getState()?.gold ?? 0;
  }

  getShopState(): GameState['shopState'] {
    return this.bridge.getShopState();
  }

  getEventState(): GameState['eventState'] {
    return this.bridge.getEventState();
  }

  getEventChoices(): { text: string; outcome: unknown }[] {
    return this.bridge.getEventState()?.choices ?? [];
  }

  getRelicName(relicId: string): string {
    return this.bridge.getRelicName(relicId);
  }

  onLeaveShop(): void {
    this.bridge.leaveShop();
    this.redraw();
    this.cdr.markForCheck();
  }

  onPurchaseCard(cardId: string): void {
    this.bridge.purchaseCard(cardId);
    this.redraw();
    this.cdr.markForCheck();
  }

  onPurchaseRelic(relicId: string): void {
    this.bridge.purchaseRelic(relicId);
    this.redraw();
    this.cdr.markForCheck();
  }

  onEventChoice(choiceIndex: number): void {
    this.bridge.executeEventChoice(choiceIndex);
    this.redraw();
    this.cdr.markForCheck();
  }

  onAdvanceToNextAct(): void {
    this.bridge.advanceToNextAct();
    this.redraw();
    this.cdr.markForCheck();
  }

  onVictoryToMenu(): void {
    this.bridge.clearState();
    this.bridge.clearSavedRun();
    this.router.navigate(['/']);
  }

  restRemovableCards(): string[] {
    const state = this.bridge.getState();
    if (!state) return [];
    // Unique card IDs from deck so you remove by card type
    return Array.from(new Set(state.deck));
  }
}
