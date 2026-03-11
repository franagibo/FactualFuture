import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  NgZone,
  HostListener,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CombatAssetsService } from '../services/combat-assets.service';
import { GameBridgeService } from '../services/game-bridge.service';
import { GameSettingsService } from '../services/game-settings.service';
import { MapAssetsService } from '../services/map-assets.service';
import { SoundService } from '../services/sound.service';
import type { GameState, RunPhase, MapNodeType } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import * as PIXI from 'pixi.js';
import { COMBAT_LAYOUT, getEnemyCenter, getPlayerCenter } from './constants/combat-layout.constants';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  /** Hand index of the selected card (for highlight and playing the correct instance). */
  selectedCardIndex: number | null = null;
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
  /** Signals for overlay template; updated in doRedrawBody and initPixi so template does not call bridge on every CD. */
  runPhaseSignal = signal<RunPhase | undefined>(undefined);
  combatResultSignal = signal<GameState['combatResult']>(null);
  rewardChoicesSignal = signal<string[]>([]);
  potionsSignal = signal<string[]>([]);
  goldSignal = signal(0);
  shopStateSignal = signal<GameState['shopState']>(undefined);
  eventStateSignal = signal<GameState['eventState']>(undefined);
  restRemovableCardsSignal = signal<string[]>([]);
  /** Short-lived feedback message (e.g. "New card: Overdrive") shown in overlay. */
  feedbackMessage = signal<string | null>(null);
  /** When set, reward panel shows chosen state before transitioning; used for micro-animation. */
  chosenRewardCardId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private hoverLerpTicker: ((ticker: PIXI.Ticker) => void) | null = null;
  private shieldTicker: (() => void) | null = null;
  /** When in map phase, total height of map content (px) for scroll. */
  mapContentHeight = 0;
  /** Map node id currently hovered (for tooltip). */
  private hoveredNodeId: string | null = null;
  /** True until we have drawn with valid canvas size once (fixes initial map/combat not showing). */
  private hadZeroSize = true;
  /** Coalesce redraws: if redraw() is called while doRedraw runs, schedule one more next frame. */
  private redrawAgain = false;
  /** Guard to avoid re-entrant doRedraw. */
  private inRedraw = false;
  /** ResizeObserver: throttle to one redraw per frame. */
  private resizeRedrawScheduled = false;
  /** Throttle hover-led redraws to ~30 FPS so we don't redraw every frame during card hover. */
  private lastHoverRedrawTime = 0;
  private static readonly HOVER_REDRAW_INTERVAL_MS = 33;
  showPauseMenu = false;
  showPauseSettings = false;
  pauseFullscreen = true;
  /** When true, player shows shield animation (played when a block card is used). */
  shieldAnimationPlaying = false;
  /** When true, player shows shooting animation (played when strike card is used). */
  shootingAnimationPlaying = false;

  constructor(
    private bridge: GameBridgeService,
    private mapAssets: MapAssetsService,
    private combatAssets: CombatAssetsService,
    public gameSettings: GameSettingsService,
    public sound: SoundService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  /** Run inside Angular zone, sync overlay signals from bridge, and mark for check. */
  private requestTemplateUpdate(): void {
    this.zone.run(() => {
      this.syncOverlaySignals(this.bridge.getState());
      this.cdr.markForCheck();
    });
  }

  /** Update overlay signals from bridge state so template does not call bridge on every CD. When state is provided, also sync _runPhase/_combatResult. */
  private syncOverlaySignals(state: GameState | null): void {
    if (state) {
      this._runPhase = this.bridge.getRunPhase();
      this._combatResult = state.combatResult ?? null;
    }
    this.runPhaseSignal.set(this._runPhase);
    this.combatResultSignal.set(this._combatResult);
    if (!state) return;
    this.rewardChoicesSignal.set(this.bridge.getRewardChoices());
    this.potionsSignal.set(this.bridge.getPotions());
    this.goldSignal.set(state.gold ?? 0);
    this.shopStateSignal.set(state.shopState);
    this.eventStateSignal.set(state.eventState);
    this.restRemovableCardsSignal.set(this._runPhase === 'rest' ? Array.from(new Set(state.deck ?? [])) : []);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selectedCardId != null) {
      this.selectedCardId = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.requestTemplateUpdate();
      return;
    }
    this.showPauseSettings = false;
    this.showPauseMenu = true;
    this.requestTemplateUpdate();
  }

  closePauseMenu(): void {
    this.showPauseMenu = false;
    this.showPauseSettings = false;
    this.requestTemplateUpdate();
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
        this.requestTemplateUpdate();
      });
    }
    this.requestTemplateUpdate();
  }

  closePauseSettings(): void {
    this.showPauseSettings = false;
    this.redraw(); // apply any changed VFX/text/animation settings
    this.requestTemplateUpdate();
  }

  setPauseFullScreen(fullscreen: boolean): void {
    const api = (window as unknown as { electronAPI?: { setFullScreen?: (v: boolean) => void } }).electronAPI;
    if (api?.setFullScreen) api.setFullScreen(fullscreen);
    this.pauseFullscreen = fullscreen;
    this.requestTemplateUpdate();
  }

  setPauseResolution(width: number, height: number): void {
    const api = (window as unknown as { electronAPI?: { setWindowSize?: (w: number, h: number) => void } }).electronAPI;
    if (api?.setWindowSize) api.setWindowSize(width | 0, height | 0);
    this.requestTemplateUpdate();
  }

  setPauseSound(muted: boolean): void {
    this.sound.setMuted(muted);
    this.requestTemplateUpdate();
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
    this.requestTemplateUpdate();
    this.router.navigate(['/']);
  }

  steamWarning = () => this._steamWarning;

  ngOnInit(): void {
    this.sound.loadMutedPreference();
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { onSteamWarning?: (cb: (m: string) => void) => void } }).electronAPI?.onSteamWarning) {
      (window as unknown as { electronAPI: { onSteamWarning: (cb: (m: string) => void) => void } }).electronAPI.onSteamWarning((msg) => {
        this._steamWarning = msg;
        this.requestTemplateUpdate();
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
    this.syncOverlaySignals(state);
    this.requestTemplateUpdate();

    // Preload card art only for current character's pool to keep load time and memory reasonable.
    const cardPoolIds = this.bridge.getCardPoolIdsForPreload();
    if (cardPoolIds.length) {
      this.combatAssets.preloadCardArt(cardPoolIds).catch(() => {});
    }
    this.combatAssets.loadGlobalCombatAssets().catch(() => {});

    const host = this.canvasHostRef.nativeElement;
    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: host,
      background: 0x1a1a2e,
      antialias: true,
    });
    host.appendChild(this.app.canvas);
    this.app.stage.eventMode = 'passive' as PIXI.EventMode;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeRedrawScheduled) return;
      this.resizeRedrawScheduled = true;
      requestAnimationFrame(() => {
        this.resizeRedrawScheduled = false;
        this.redraw();
      });
    });
    this.resizeObserver.observe(host);
    const runTickerOutsideZone = (): void => {
      if (!this.app) return;
      const w = this.app.screen.width;
      const h = this.app.screen.height;
      const hasValidSize = w > 0 && h > 0;
      if (!hasValidSize) {
        this.hadZeroSize = true;
        this.redraw();
        return;
      }
      if (this.hadZeroSize) {
        this.hadZeroSize = false;
        this.redraw();
        return;
      }
      if (this._runPhase !== 'combat') return;
      let changed = false;
      if (this.hoverLerp.length === this.targetLerp.length) {
        const factor = 0.35;
        for (let i = 0; i < this.hoverLerp.length; i++) {
          const prev = this.hoverLerp[i];
          this.hoverLerp[i] = prev + (this.targetLerp[i] - prev) * factor;
          if (Math.abs(this.hoverLerp[i] - prev) > 0.02) changed = true;
        }
      }
      if (changed) {
        const now = performance.now();
        if (now - this.lastHoverRedrawTime >= CombatCanvasComponent.HOVER_REDRAW_INTERVAL_MS) {
          this.lastHoverRedrawTime = now;
          this.redraw();
        }
      }
    };
    this.hoverLerpTicker = (_ticker: PIXI.Ticker) => this.zone.runOutsideAngular(runTickerOutsideZone);
    this.zone.runOutsideAngular(() => this.app!.ticker.add(this.hoverLerpTicker!));
    this.redraw();
    this.scheduleCanvasLayoutFix({ scrollToBottom: this._runPhase === 'map' });
    if (this._runPhase === 'map') {
      this.mapAssets.loadMapAssets().then(() => {
        requestAnimationFrame(() => this.redraw());
      });
    }
  }

  /** Schedules a paint outside Angular (coalesced). Use requestTemplateUpdate() only when overlay state (runPhase, rewards, potions, gold) actually changed. */
  private redraw(): void {
    if (this.inRedraw) {
      this.redrawAgain = true;
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.doRedraw();
      if (this.redrawAgain) {
        this.redrawAgain = false;
        requestAnimationFrame(() => this.redraw());
      }
    });
  }

  /**
   * Ensures map/canvas renders correctly after a phase or size change. Use when entering map (first time,
   * from combat/reward/rest/shop/event) or after restart. Double rAF is needed: first frame lets Angular
   * update layout (e.g. scroll area height); second lets Pixi resize and redraw with correct dimensions.
   */
  private scheduleCanvasLayoutFix(opts: { scrollToBottom?: boolean } = {}): void {
    if (!this.app) return;
    this.zone.run(() => this.cdr.detectChanges());
    this.app.resize();
    requestAnimationFrame(() => {
      if (!this.app) return;
      this.redraw();
      requestAnimationFrame(() => {
        if (!this.app) return;
        this.zone.run(() => this.cdr.detectChanges());
        this.app.resize();
        this.redraw();
        if (opts.scrollToBottom) {
          const el = this.scrollAreaRef?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  /** Clears stage and draws either map or combat view; syncs combat result and run phase from bridge. */
  private doRedraw(): void {
    this.inRedraw = true;
    try {
      this.doRedrawBody();
    } finally {
      this.inRedraw = false;
    }
  }

  private doRedrawBody(): void {
    const state = this.bridge.getState();
    if (!state || !this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w <= 0 || h <= 0) {
      requestAnimationFrame(() => this.redraw());
      return;
    }
    const now = performance.now();
    this.floatingNumbers = this.floatingNumbers.filter((fn) => (fn.addedAt == null) || now - fn.addedAt <= 700);
    const prevResult = this._combatResult;
    const prevPhase = this._runPhase;
    this._combatResult = state.combatResult;
    this._runPhase = this.bridge.getRunPhase();
    this.syncOverlaySignals(state);
    if (state.combatResult === 'win' && prevResult !== 'win') this.sound.playVictory();
    if (state.combatResult === 'lose' && prevResult !== 'lose') this.sound.playDefeat();
    if (this._runPhase === 'combat' && prevPhase !== 'combat') this.sound.playCombatStart();
    if (this._runPhase === 'combat' && prevPhase !== 'combat' && this.app) {
      this.cdr.detectChanges();
      this.app.resize();
    }

    const stage = this.app.stage;
    stage.removeChildren();

    const padding = COMBAT_LAYOUT.padding;

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
        onMapContentHeight: (height: number) => {
          const prev = this.mapContentHeight;
          this.mapContentHeight = height;
          if (height > 0 && height !== prev && this.app) {
            this.zone.run(() => this.cdr.detectChanges());
            this.app.resize();
            requestAnimationFrame(() => {
              if (this.app) this.redraw();
            });
          }
        },
        markForCheck: () => this.requestTemplateUpdate(),
        onChooseNode:
          this._runPhase === 'map'
            ? (nodeId: string) => {
                this.bridge.chooseNode(nodeId);
                this.redraw();
              }
            : () => {},
        loadMapAssets: () => this.mapAssets.loadMapAssets(),
        hoveredNodeId: this.hoveredNodeId,
        onNodePointerOver: (nodeId: string) => {
          if (this.hoveredNodeId === nodeId) return;
          this.hoveredNodeId = nodeId;
          this.redraw();
        },
        onNodePointerOut: () => {
          if (this.hoveredNodeId === null) return;
          this.hoveredNodeId = null;
          this.redraw();
        },
      };
      drawMapView(mapContext, state, stage, w, h, padding);
      this.requestTemplateUpdate();
      if (prevPhase !== 'map' && this._runPhase === 'map') {
        this.scheduleCanvasLayoutFix({ scrollToBottom: true });
      }
      return;
    }

    // Combat phase only: ensure combat assets loading (global + character + enemies), build context and delegate to combat renderer.
    if (this._runPhase !== 'combat') return;
    const characterId = state.characterId ?? undefined;
    const enemyIds = state.enemies.map((e) => e.id);
    this.combatAssets.loadCombatAssets(characterId, enemyIds);
    const hand = state.hand;
    if (this.hoveredCardIndex != null && this.hoveredCardIndex >= hand.length) this.hoveredCardIndex = null;

    this.targetLerp = hand.map((cardId, i) =>
      (i === this.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) || this.selectedCardIndex === i ? 1 : 0
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
      selectedCardIndex: this.selectedCardIndex,
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
      markForCheck: () => this.requestTemplateUpdate(),
      getCombatBgTexture: () => this.combatAssets.getCombatBgTexture(),
      getPlayerTexture: () => this.combatAssets.getPlayerTexture(),
      getEnemyTexture: (id) => this.combatAssets.getEnemyTexture(id),
      getCardArtTexture: (id) => this.combatAssets.getCardArtTexture(id),
      hoverLerp: this.hoverLerp,
      textScale: this.gameSettings.textScale(),
      vfxIntensity: this.gameSettings.vfxIntensity(),
      shieldAnimationPlaying: this.shieldAnimationPlaying,
      getShieldVideoTexture: () => this.combatAssets.getShieldVideoTexture(),
      shootingAnimationPlaying: this.shootingAnimationPlaying,
      getShootingTexture: () => this.combatAssets.getShootingTexture(),
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

  /** If the card grants block, play shield animation on the player character. Pixi-only; no overlay change. */
  private triggerShieldAnimationIfBlock(cardId: string): void {
    if (!this.cardHasBlockEffect(cardId)) return;
    this.shieldAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playShieldAnimation().then(() => {
      this.shieldAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  /** True if the card is the Strike card (triggers shooting animation). */
  private cardIsStrike(cardId: string): boolean {
    return cardId === 'strike';
  }

  /** If the card is Strike, play shooting animation on the player character. Pixi-only; no overlay change. */
  private triggerShootingAnimationIfStrike(cardId: string): void {
    if (!this.cardIsStrike(cardId)) return;
    this.shootingAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playShootingAnimation().then(() => {
      this.shootingAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  private ensurePlayerAnimationTicker(): void {
    if (this.app && !this.shieldTicker) {
      const runShieldTickerOutsideZone = (): void => {
        if (this.shieldAnimationPlaying || this.shootingAnimationPlaying) {
          this.combatAssets.getShieldAnimationDone();
          this.combatAssets.getShootingAnimationDone();
          this.redraw();
        }
      };
      this.shieldTicker = () => this.zone.runOutsideAngular(runShieldTickerOutsideZone);
      this.zone.runOutsideAngular(() => this.app!.ticker.add(this.shieldTicker!));
    }
  }

  private removePlayerAnimationTickerIfIdle(): void {
    if (this.shieldAnimationPlaying || this.shootingAnimationPlaying) return;
    if (this.shieldTicker && this.app) {
      this.app.ticker.remove(this.shieldTicker);
      this.shieldTicker = null;
    }
  }

  /** Display name for a card (used in hand and reward/rest panels). */
  getCardName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

  /** Handle card click: enter targeting if needed, else play card or cancel selection. */
  onCardClick(cardId: string, handIndex: number): void {
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;

    const cost = this.getCardCost(cardId);
    if (state.energy < cost) return;

    if (this.selectedCardId != null && this.selectedCardIndex !== null) {
      if (this.selectedCardIndex === handIndex) {
        this.selectedCardId = null;
        this.selectedCardIndex = null;
        this.redraw();
        this.requestTemplateUpdate();
      }
      return;
    }

    if (this.cardNeedsEnemyTarget(cardId)) {
      const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
      if (aliveCount === 0) return; // B19: no valid target, do not enter targeting
      this.selectedCardId = cardId;
      this.selectedCardIndex = handIndex;
      this.redraw();
      this.requestTemplateUpdate();
      return;
    }

    this.bridge.playCard(cardId, state.enemies.length > 0 ? 0 : undefined, handIndex);
    this.selectedCardIndex = null;
    this.triggerShieldAnimationIfBlock(cardId);
    this.triggerShootingAnimationIfStrike(cardId);
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
    this.requestTemplateUpdate();
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

    const selIdx = this.selectedCardIndex != null && this.selectedCardIndex < state.hand.length ? this.selectedCardIndex : state.hand.indexOf(cardId);
    if (selIdx < 0) {
      this.bridge.playCard(cardId, enemyIndex, this.selectedCardIndex ?? undefined);
      this.triggerShieldAnimationIfBlock(cardId);
      this.triggerShootingAnimationIfStrike(cardId);
      this.selectedCardId = null;
      this.selectedCardIndex = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.requestTemplateUpdate();
      return;
    }
    const arcN = state.hand.length > 1 ? (selIdx - center) / (state.hand.length - 1) : 0;
    const fromX = startX + selIdx * cardSpacing;
    const fromY = handY + L.arcAmplitude * (4 * arcN * arcN) - L.hoverLift;
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

    const speedMult = this.gameSettings.animationSpeedMultiplier();
    const duration = Math.max(120, 280 / speedMult); // ms; clamp so it never gets too fast
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
        this.bridge.playCard(cardId, enemyIndex, this.selectedCardIndex ?? undefined);
        this.triggerShieldAnimationIfBlock(cardId);
        this.triggerShootingAnimationIfStrike(cardId);
        this.sound.playCardPlay();
        const newState = this.bridge.getState()!;
        this.selectedCardId = null;
        this.selectedCardIndex = null;
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
          const playerCenter = getPlayerCenter(w, h);
          toAdd.push({ type: 'block', value: blockGain, x: playerCenter.x, y: playerCenter.y, addedAt: now + (toAdd.length > 0 ? 80 : 0) });
          this.sound.playBlock();
        }
        this.floatingNumbers = [...this.floatingNumbers, ...toAdd];
        this.redraw();
        this.requestTemplateUpdate();
        if (toAdd.length > 0) {
          setTimeout(() => this.redraw(), 750);
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
    this.requestTemplateUpdate();
    setTimeout(() => {
      this.sound.playTurnStart();
      this.bridge.endTurn();
      this.showingEnemyTurn = false;
      this.redraw();
      this.requestTemplateUpdate();
    }, 1200);
  }

  onRestart(): void {
    this.bridge.startRun();
    this.redraw();
    this.requestTemplateUpdate();
    this.scheduleCanvasLayoutFix({ scrollToBottom: true });
  }

  onChooseReward(cardId: string): void {
    if (this.chosenRewardCardId != null) return; // already animating
    this.chosenRewardCardId = cardId;
    const cardName = this.getCardName(cardId);
    this.feedbackMessage.set(`New card: ${cardName}`);
    this.requestTemplateUpdate();
    setTimeout(() => {
      this.bridge.chooseReward(cardId);
      this.chosenRewardCardId = null;
      this.feedbackMessage.set(null);
      this.redraw();
      this.requestTemplateUpdate();
      this.scheduleCanvasLayoutFix({ scrollToBottom: true });
    }, 480);
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

  /** Tooltip for cards (name + effect description). */
  getCardTooltip(cardId: string): string {
    const name = this.getCardName(cardId);
    const desc = getCardEffectDescription(cardId, (cid) => this.bridge.getCardDef(cid));
    return desc ? `${name}: ${desc}` : name;
  }

  /** Tooltip for relics (name + description). */
  getRelicTooltip(relicId: string): string {
    const name = this.bridge.getRelicName(relicId);
    const desc = this.bridge.getRelicDescription(relicId);
    return desc ? `${name}: ${desc}` : name;
  }

  getPotions(): string[] {
    return this.bridge.getPotions();
  }

  getPotionName(potionId: string): string {
    return this.bridge.getPotionDef(potionId)?.name ?? potionId;
  }

  getPotionTooltip(potionId: string): string {
    const def = this.bridge.getPotionDef(potionId);
    return def ? `${def.name}: ${def.description}` : potionId;
  }

  onUsePotion(potionId: string): void {
    const def = this.bridge.getPotionDef(potionId);
    const state = this.bridge.getState();
    if (!state || state.runPhase !== 'combat' || state.combatResult) return;
    const target =
      def?.effect?.type === 'damage'
        ? state.enemies.findIndex((e) => e.hp > 0)
        : undefined;
    if (def?.effect?.type === 'damage' && (target === undefined || target < 0)) return;
    this.bridge.usePotion(potionId, target ?? 0);
    this.redraw();
    this.requestTemplateUpdate();
  }

  onLeaveShop(): void {
    this.bridge.leaveShop();
    this.redraw();
    this.requestTemplateUpdate();
  }

  onPurchaseCard(cardId: string): void {
    this.bridge.purchaseCard(cardId);
    this.redraw();
    this.requestTemplateUpdate();
  }

  onPurchaseRelic(relicId: string): void {
    this.bridge.purchaseRelic(relicId);
    this.redraw();
    this.requestTemplateUpdate();
  }

  onEventChoice(choiceIndex: number): void {
    this.bridge.executeEventChoice(choiceIndex);
    this.redraw();
    this.requestTemplateUpdate();
  }

  onAdvanceToNextAct(): void {
    this.bridge.advanceToNextAct();
    this.redraw();
    this.requestTemplateUpdate();
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
