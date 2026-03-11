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
import { CardVfxService } from '../services/card-vfx.service';
import { CombatAssetsService } from '../services/combat-assets.service';
import { GameBridgeService } from '../services/game-bridge.service';
import { GameSettingsService } from '../services/game-settings.service';
import { MapAssetsService } from '../services/map-assets.service';
import { SoundService } from '../services/sound.service';
import type { GameState, RunPhase, MapNodeType } from '../../engine/types';
import type { CardDef } from '../../engine/cardDef';
import * as PIXI from 'pixi.js';
import { COMBAT_LAYOUT, getEnemyCenter, getEnemyIndexAtPoint, getPlayerCenter } from './constants/combat-layout.constants';
import { COMBAT_TIMING, ENEMY_ANIMATION_TIMING } from './constants/combat-timing.constants';
import { getHandLayout } from './constants/hand-layout';
import { getCardEffectDescription } from './helpers/card-text.helper';
import { drawMapView } from './renderers/map-view.renderer';
import { drawCombatView, type CombatViewContext } from './renderers/combat-view.renderer';
import type { FloatingNumber } from './constants/combat-types';
import { logger } from '../util/app-logger';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';

/**
 * Main game canvas: owns PixiJS app lifecycle, game state sync, and user actions.
 * Delegates map and combat drawing to renderers; handles redraw dispatch and event callbacks.
 */
@Component({
  selector: 'app-combat-canvas',
  standalone: true,
  imports: [SettingsModalComponent],
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
  /** Card interaction state machine. */
  cardInteractionState: 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning' = 'idle';
  /** Hand index of the card in a non-idle state (pressed/dragging/returning). */
  cardInteractionCardIndex: number | null = null;
  cardInteractionCardId: string | null = null;
  /** Index of card in hand currently hovered; used for lift/scale/z-order. */
  hoveredCardIndex: number | null = null;
  /** In targeting mode, index of enemy currently hovered (for arrow and highlight). */
  hoveredEnemyIndex: number | null = null;
  /** Press start position for drag threshold. */
  private pressStartX = 0;
  private pressStartY = 0;
  dragScreenX = 0;
  dragScreenY = 0;
  /** Returning animation: start position and time. */
  returnStartX = 0;
  returnStartY = 0;
  returnStartTime = 0;
  readonly returnDurationMs = COMBAT_TIMING.returnDurationMs;
  /** 0..1 when returning; set by ticker, used by renderer. */
  returnProgress = 0;
  private dragListenersBound: (() => void) | null = null;
  private hoverResolveBound: (() => void) | null = null;
  /** B9/B20: Floating numbers to show (damage/block) with screen position; addedAt for expiry. */
  private floatingNumbers: FloatingNumber[] = [];
  /** B11: When true, show "Enemy turn" banner before resolving enemy phase. */
  private showingEnemyTurn = false;
  /** B15: Per-card hover influence 0..1 for smooth animation; length = hand length. */
  private hoverLerp: number[] = [];
  /** B15: Target values for hoverLerp (0 or 1); set each redraw in combat. */
  private targetLerp: number[] = [];
  /** Lerped per-card spread offset X so neighbor cards move smoothly when hover changes. */
  private spreadLerp: number[] = [];
  private _steamWarning = '';
  private _combatResult: GameState['combatResult'] = null;
  private _runPhase: RunPhase | undefined = undefined;
  /** Signals for overlay template; updated in doRedrawBody and initPixi so template does not call bridge on every CD. */
  runPhaseSignal = signal<RunPhase | undefined>(undefined);
  combatResultSignal = signal<GameState['combatResult']>(null);
  rewardChoicesSignal = signal<string[]>([]);
  potionsSignal = signal<string[]>([]);
  goldSignal = signal(0);
  playerHpSignal = signal(0);
  playerMaxHpSignal = signal(0);
  headerFloorSignal = signal(1);
  headerCharacterNameSignal = signal('');
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
  /** True when map assets are loaded and map has been drawn (enables reveal animation). */
  mapReady = signal(false);
  mapLoadError = signal(false);
  private mapLoadScheduled = false;
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
  showPauseMenu = false;
  showPauseSettings = false;
  /** When true, player shows shield animation (played when a block card is used). */
  shieldAnimationPlaying = false;
  /** When true, player shows shooting animation (played when strike card is used). */
  shootingAnimationPlaying = false;
  /** When true, player shows chibi slashing animation (strike card). */
  slashingAnimationPlaying = false;
  /** Placeholder enemy: variant 1–3 (Zombie_Villager_X) per enemy index. Set when combat starts. */
  enemyVariants: number[] = [];
  /** Per-enemy: when hurt animation started (ms). Cleared when reinitializing for new combat. */
  enemyHurtStartMs: (number | null)[] = [];
  /** Per-enemy: when dying animation started (ms). Set when HP goes to 0. */
  enemyDyingStartMs: (number | null)[] = [];
  /** Active card impact VFX (drawn each frame, removed when animation done). */
  private activeCardVfx: { vfxId: string; x: number; y: number; startTime: number }[] = [];

  constructor(
    private bridge: GameBridgeService,
    private mapAssets: MapAssetsService,
    private combatAssets: CombatAssetsService,
    private cardVfx: CardVfxService,
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
    this.playerHpSignal.set(state.playerHp ?? 0);
    this.playerMaxHpSignal.set(state.playerMaxHp ?? 0);
    this.headerFloorSignal.set(state.floor ?? 1);
    const char = state.characterId ? this.bridge.getCharacter(state.characterId) : undefined;
    this.headerCharacterNameSignal.set(char?.name ?? state.characterId ?? '');
    this.shopStateSignal.set(state.shopState);
    this.eventStateSignal.set(state.eventState);
    this.restRemovableCardsSignal.set(this._runPhase === 'rest' ? Array.from(new Set(state.deck ?? [])) : []);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showPauseSettings) {
      this.closePauseSettings();
      return;
    }
    if (this.showPauseMenu) {
      this.closePauseMenu();
      return;
    }
    if (this.cardInteractionState !== 'idle' && this.cardInteractionState !== 'hover') {
      this.cardInteractionState = 'idle';
      this.cardInteractionCardIndex = null;
      this.cardInteractionCardId = null;
      this.hoveredEnemyIndex = null;
      this.clearDragListeners();
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
    this.requestTemplateUpdate();
  }

  /** Open pause overlay and show settings (e.g. from header gear). */
  onHeaderSettings(): void {
    this.showPauseMenu = true;
    this.showPauseSettings = true;
    this.requestTemplateUpdate();
  }

  closePauseSettings(): void {
    this.showPauseSettings = false;
    this.redraw(); // apply any changed VFX/text/animation settings
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
    this.sound.loadSoundPreferences();
    this.cardVfx.loadConfig().catch((err) => { logger.warn('Card VFX config load failed', err); });
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { onSteamWarning?: (cb: (m: string) => void) => void } }).electronAPI?.onSteamWarning) {
      (window as unknown as { electronAPI: { onSteamWarning: (cb: (m: string) => void) => void } }).electronAPI.onSteamWarning((msg) => {
        this._steamWarning = msg;
        this.requestTemplateUpdate();
      });
    }
    this.initPixi();
  }

  ngOnDestroy(): void {
    if (this.hoverResolveBound) {
      this.hoverResolveBound();
      this.hoverResolveBound = null;
    }
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
      this.combatAssets.preloadCardArt(cardPoolIds).catch((err) => { logger.warn('Preload card art failed', err); });
    }
    this.combatAssets.loadGlobalCombatAssets().catch((err) => { logger.warn('Global combat assets load failed', err); });

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
    const runTickerOutsideZone = (ticker: PIXI.Ticker): void => {
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
      const state = this.bridge.getState();
      if (!state) return;
      const hand = state.hand;
      if (this.cardInteractionCardIndex != null && this.cardInteractionCardIndex >= hand.length) {
        this.cardInteractionState = 'idle';
        this.cardInteractionCardIndex = null;
        this.cardInteractionCardId = null;
        this.clearDragListeners();
      }
      if (hand.length !== this.hoverLerp.length) {
        this.targetLerp = hand.map((cardId, i) =>
          (i === this.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
          (i === this.cardInteractionCardIndex && (this.cardInteractionState === 'pressed' || this.cardInteractionState === 'dragging'))
            ? 1
            : 0
        );
        this.hoverLerp = [...this.targetLerp];
        const layoutInit = getHandLayout(hand.length, this.app.screen.width, this.app.screen.height, this.hoveredCardIndex);
        this.spreadLerp = layoutInit.positions.map((p) => p.spreadOffsetX ?? 0);
        this.redraw();
        return;
      }
      this.targetLerp = hand.map((cardId, i) =>
        (i === this.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
        (i === this.cardInteractionCardIndex && (this.cardInteractionState === 'pressed' || this.cardInteractionState === 'dragging'))
          ? 1
          : 0
      );
      const dt = (ticker.deltaTime ?? 1) / 60;
      const factor = 1 - Math.exp(-5 * dt);
      const spreadFactor = 1 - Math.exp(-4 * dt);
      let changed = false;
      const now = performance.now();
      if (state.characterId === 'chibi') changed = true;
      if (this.activeCardVfx.length > 0) changed = true;
      if (this.enemyHurtStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.hurtDurationMs)) changed = true;
      if (this.enemyDyingStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.dyingDurationMs)) changed = true;
      if (this.cardInteractionState === 'returning') {
        const elapsed = performance.now() - this.returnStartTime;
        const raw = Math.min(1, elapsed / this.returnDurationMs);
        this.returnProgress = 1 - (1 - raw) * (1 - raw);
        if (raw >= 1) {
          this.cardInteractionState = 'idle';
          this.cardInteractionCardIndex = null;
          this.cardInteractionCardId = null;
        }
        changed = true;
      }
      const layout = getHandLayout(hand.length, this.app.screen.width, this.app.screen.height, this.hoveredCardIndex);
      if (this.spreadLerp.length === layout.positions.length) {
        for (let i = 0; i < this.spreadLerp.length; i++) {
          const target = layout.positions[i].spreadOffsetX ?? 0;
          const prev = this.spreadLerp[i];
          this.spreadLerp[i] = prev + (target - prev) * spreadFactor;
          if (Math.abs(this.spreadLerp[i] - prev) > 0.3) changed = true;
        }
      } else {
        this.spreadLerp = layout.positions.map((p) => p.spreadOffsetX ?? 0);
        changed = true;
      }
      if (this.hoverLerp.length === this.targetLerp.length) {
        for (let i = 0; i < this.hoverLerp.length; i++) {
          const prev = this.hoverLerp[i];
          this.hoverLerp[i] = prev + (this.targetLerp[i] - prev) * factor;
          if (Math.abs(this.hoverLerp[i] - prev) > 0.002) changed = true;
        }
      }
      if (changed) {
        const enemyAnimPlaying =
          this.enemyHurtStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.hurtDurationMs) ||
          this.enemyDyingStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.dyingDurationMs);
        if (
          this.activeCardVfx.length > 0 ||
          this.cardSprites.size !== hand.length ||
          this.cardInteractionState === 'returning' ||
          state.characterId === 'chibi' ||
          enemyAnimPlaying
        ) {
          this.redraw();
        } else {
          this.updateHandHoverOnly();
        }
      }
    };
    this.hoverLerpTicker = (ticker: PIXI.Ticker) => this.zone.runOutsideAngular(() => runTickerOutsideZone(ticker));
    this.zone.runOutsideAngular(() => this.app!.ticker.add(this.hoverLerpTicker!));
    const onPointerMove = (e: PointerEvent): void => this.resolveHover(e.clientX, e.clientY);
    document.addEventListener('pointermove', onPointerMove);
    this.hoverResolveBound = (): void => document.removeEventListener('pointermove', onPointerMove);
    this.redraw();
    this.scheduleCanvasLayoutFix({ scrollToBottom: this._runPhase === 'map' });
  }

  /** Schedules a paint outside Angular (coalesced). Use requestTemplateUpdate() only when overlay state (runPhase, rewards, potions, gold) actually changed. */
  private redraw(): void {
    if (this.inRedraw) {
      this.redrawAgain = true;
      return;
    }
    this.zone.runOutsideAngular(() => this.doRedraw());
  }

  /** True for map and any overlay that shows the map as background (reward, rest, shop, event, victory). */
  private isMapOrOverlayPhase(phase: RunPhase | undefined): boolean {
    return (
      phase === 'map' ||
      phase === 'reward' ||
      phase === 'rest' ||
      phase === 'shop' ||
      phase === 'event' ||
      phase === 'victory'
    );
  }

  /** Starts map asset load if not yet started; on completion sets mapReady and runs layout fix. Timeout and rejection set mapLoadError. */
  private ensureMapLoadThenReveal(): void {
    if (this.mapLoadScheduled) return;
    this.mapLoadScheduled = true;
    this.mapLoadError.set(false);
    const timeoutId = window.setTimeout(() => {
      if (!this.mapAssets.isMapLoaded()) {
        this.mapLoadScheduled = false;
        this.mapLoadError.set(true);
        this.zone.run(() => this.cdr.detectChanges());
      }
    }, COMBAT_TIMING.mapLoadTimeoutMs);
    this.mapAssets.loadMapAssets()
      .then(() => {
        window.clearTimeout(timeoutId);
        this.mapLoadScheduled = false;
        this.mapLoadError.set(false);
        this.mapReady.set(true);
        this.zone.run(() => this.cdr.detectChanges());
        this.scheduleCanvasLayoutFix({ scrollToBottom: true });
      })
      .catch((err) => {
        window.clearTimeout(timeoutId);
        this.mapLoadScheduled = false;
        this.mapLoadError.set(true);
        logger.warn('Map assets load failed', err);
        this.zone.run(() => this.cdr.detectChanges());
      });
  }

  /** Retry map load and clear error (e.g. user clicked Retry). */
  retryMapLoad(): void {
    this.mapLoadError.set(false);
    this.mapReady.set(false);
    this.mapLoadScheduled = false;
    this.ensureMapLoadThenReveal();
  }

  /** Draws a loading state on the stage while map assets are loading. */
  private drawMapLoadingState(stage: PIXI.Container, w: number, h: number): void {
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h).fill(0x1a1822);
    bg.zIndex = 0;
    stage.addChild(bg);
    const text = new PIXI.Text({
      text: 'Loading map…',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 28,
        fill: 0xcccccc,
      },
    });
    text.anchor.set(0.5, 0.5);
    text.x = w / 2;
    text.y = h / 2;
    text.zIndex = 1;
    stage.addChild(text);
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
    if (this.inRedraw) {
      this.redrawAgain = true;
      return;
    }
    this.inRedraw = true;
    void this.doRedrawBody().finally(() => {
      this.inRedraw = false;
      if (this.redrawAgain) {
        this.redrawAgain = false;
        requestAnimationFrame(() => this.redraw());
      }
    });
  }

  private async doRedrawBody(): Promise<void> {
    const state = this.bridge.getState();
    if (!state || !this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w <= 0 || h <= 0) {
      requestAnimationFrame(() => this.redraw());
      return;
    }
    const now = performance.now();
    this.floatingNumbers = this.floatingNumbers.filter((fn) => (fn.addedAt == null) || now - fn.addedAt <= COMBAT_TIMING.floatingNumberTtlMs);
    const prevResult = this._combatResult;
    const prevPhase = this._runPhase;
    this._combatResult = state.combatResult;
    this._runPhase = this.bridge.getRunPhase();
    if (this._runPhase !== 'combat') {
      this.cardInteractionState = 'idle';
      this.cardInteractionCardIndex = null;
      this.cardInteractionCardId = null;
      this.clearDragListeners();
    }
    if (prevPhase === 'map' && this._runPhase !== 'map') {
      this.mapReady.set(false);
      this.mapLoadError.set(false);
      this.mapLoadScheduled = false;
    }
    this.syncOverlaySignals(state);
    if (state.combatResult === 'win' && prevResult !== 'win') this.sound.playVictory();
    if (state.combatResult === 'lose' && prevResult !== 'lose') this.sound.playDefeat();
    if (this._runPhase === 'combat' && prevPhase !== 'combat') this.sound.playCombatStart();
    if (this._runPhase === 'combat' && prevPhase !== 'combat' && this.app) {
      this.cdr.detectChanges();
      this.app.resize();
    }

    if (this._runPhase === 'combat') {
      const characterId = state.characterId ?? undefined;
      const enemyIds = state.enemies.map((e) => e.id);
      await this.combatAssets.loadCombatAssets(characterId, enemyIds);
    }

    const stage = this.app.stage;
    stage.removeChildren();

    const padding = COMBAT_LAYOUT.padding;

    // Map phase and overlays (reward, rest, shop, event, victory): render map as background.
    if (this.isMapOrOverlayPhase(this._runPhase) && state.map) {
      if (!this.mapAssets.isMapLoaded()) {
        this.drawMapLoadingState(stage, w, h);
        this.ensureMapLoadThenReveal();
        this.requestTemplateUpdate();
        return;
      }
      this.mapReady.set(true);
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
    if (this.cardInteractionCardIndex != null && this.cardInteractionCardIndex >= state.hand.length) {
      this.cardInteractionState = 'idle';
      this.cardInteractionCardIndex = null;
      this.cardInteractionCardId = null;
      this.clearDragListeners();
    }
    if (state.hand.length > 0 && this.spreadLerp.length !== state.hand.length) {
      const layoutInit = getHandLayout(state.hand.length, w, h, this.hoveredCardIndex);
      this.spreadLerp = layoutInit.positions.map((p) => p.spreadOffsetX ?? 0);
    }
    const characterId = state.characterId ?? undefined;
    const enemyIds = state.enemies.map((e) => e.id);
    this.cardVfx.loadConfig().then(() => {
      const cardIds = [...state.hand, ...(state.deck ?? [])];
      if (cardIds.length) this.cardVfx.preloadVfxForCards(cardIds);
    });
    const hand = state.hand;
    if (this.hoveredCardIndex != null && this.hoveredCardIndex >= hand.length) this.hoveredCardIndex = null;

    this.targetLerp = hand.map((cardId, i) =>
      (i === this.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
      (i === this.cardInteractionCardIndex && (this.cardInteractionState === 'pressed' || this.cardInteractionState === 'dragging'))
        ? 1
        : 0
    );
    if (this.hoverLerp.length !== this.targetLerp.length) {
      this.hoverLerp = [...this.targetLerp];
    }

    const combatContext = this.buildCombatContext(stage, state, w, h, padding);
    drawCombatView(combatContext);
    this.drawCardImpactVfx(stage, now);
  }

  /** Build the combat view context for the renderer. Keeps doRedrawBody shorter and context shape consistent. */
  private buildCombatContext(
    stage: PIXI.Container,
    state: GameState,
    w: number,
    h: number,
    padding: number
  ): CombatViewContext {
    if (state.runPhase === 'combat' && state.enemies.length !== this.enemyVariants.length) {
      this.enemyVariants = state.enemies.map(() => 1 + Math.floor(Math.random() * 3));
      this.enemyHurtStartMs = state.enemies.map(() => null);
      this.enemyDyingStartMs = state.enemies.map(() => null);
    }
    return {
      stage,
      state,
      w,
      h,
      padding,
      hoveredCardIndex: this.hoveredCardIndex,
      cardInteractionState: this.cardInteractionState,
      cardInteractionCardIndex: this.cardInteractionCardIndex,
      cardInteractionCardId: this.cardInteractionCardId,
      hoveredEnemyIndex: this.hoveredEnemyIndex,
      isDraggingCard: this.cardInteractionState === 'dragging',
      dragCardId: this.cardInteractionState === 'dragging' ? this.cardInteractionCardId : null,
      dragHandIndex: this.cardInteractionState === 'dragging' ? this.cardInteractionCardIndex : null,
      dragScreenX: this.dragScreenX,
      dragScreenY: this.dragScreenY,
      dragIsTargetingEnemy: this.cardInteractionCardId ? this.cardNeedsEnemyTarget(this.cardInteractionCardId) : false,
      returnProgress: this.cardInteractionState === 'returning' ? this.returnProgress : null,
      returnStartX: this.returnStartX,
      returnStartY: this.returnStartY,
      getHandLayout: (count: number, hoveredIdx: number | null) =>
        getHandLayout(count, w, h, hoveredIdx),
      floatingNumbers: this.floatingNumbers,
      showingEnemyTurn: this.showingEnemyTurn,
      getCardCost: (id) => this.getCardCost(id),
      getCardName: (id) => this.getCardName(id),
      getCardEffectDescription: (id) => getCardEffectDescription(id, (cid) => this.bridge.getCardDef(cid)),
      /** No-op: card play is on pointer-up/release, not click. Kept for renderer event binding. */
      onCardClick: (cardId, handIndex) => this.onCardClick(cardId, handIndex),
      /** No-op: targetable cards trigger on release over enemy. Kept for renderer event binding. */
      onEnemyTargetClick: (enemyIndex) => this.onEnemyTargetClick(enemyIndex),
      onCardPointerOver: () => {},
      onCardPointerOut: () => {},
      onCardPointerDown: (cardId, handIndex, stageX, stageY) => this.onCardPointerDown(cardId, handIndex, stageX, stageY),
      onEnemyPointerOver: (enemyIndex) => { this.hoveredEnemyIndex = enemyIndex; this.redraw(); },
      onEnemyPointerOut: () => { this.hoveredEnemyIndex = null; this.redraw(); },
      cardSprites: this.cardSprites,
      markForCheck: () => this.requestTemplateUpdate(),
      getCombatBgTexture: () => this.combatAssets.getCombatBgTexture(),
      getHpIconTexture: () => this.combatAssets.getHpIconTexture(),
      getBlockIconTexture: () => this.combatAssets.getBlockIconTexture(),
      getPlayerTexture: () => this.combatAssets.getPlayerTexture(performance.now()),
      getEnemyTexture: (id) => this.combatAssets.getEnemyTexture(id),
      enemyVariants: this.enemyVariants,
      enemyHurtStartMs: this.enemyHurtStartMs,
      enemyDyingStartMs: this.enemyDyingStartMs,
      getEnemyAnimationTexture: (variant, animation, nowMs, startMs) =>
        this.combatAssets.getEnemyAnimationTexture(variant as 1 | 2 | 3, animation, nowMs, startMs),
      getCardArtTexture: (id) => this.combatAssets.getCardArtTexture(id),
      hoverLerp: this.hoverLerp,
      spreadLerp: this.spreadLerp,
      textScale: this.gameSettings.textScale(),
      vfxIntensity: this.gameSettings.vfxIntensity(),
      shieldAnimationPlaying: this.shieldAnimationPlaying,
      getShieldVideoTexture: () => this.combatAssets.getShieldVideoTexture(),
      shootingAnimationPlaying: this.shootingAnimationPlaying,
      getShootingTexture: () => this.combatAssets.getShootingTexture(),
      slashingAnimationPlaying: this.slashingAnimationPlaying,
      getSlashingTexture: () => this.combatAssets.getSlashingTexture(),
    };
  }

  /** Draw active card impact VFX and remove expired ones. Uses CardVfxService for data-driven VFX. */
  private drawCardImpactVfx(stage: PIXI.Container, now: number): void {
    if (this.gameSettings.vfxIntensity() === 'off') {
      this.activeCardVfx.length = 0;
      return;
    }
    for (let i = this.activeCardVfx.length - 1; i >= 0; i--) {
      const e = this.activeCardVfx[i];
      const meta = this.cardVfx.getVfxMeta(e.vfxId);
      const frames = this.cardVfx.getVfxFrames(e.vfxId);
      if (!meta || frames.length === 0) {
        this.activeCardVfx.splice(i, 1);
        continue;
      }
      const elapsed = now - e.startTime;
      const frameIndex = Math.floor(elapsed / meta.frameMs);
      if (frameIndex >= meta.frameCount) {
        this.activeCardVfx.splice(i, 1);
        continue;
      }
      const tex = frames[Math.min(frameIndex, frames.length - 1)];
      const sprite = new PIXI.Sprite(tex);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = e.x;
      sprite.y = e.y;
      sprite.scale.set(meta.scale ?? 1);
      sprite.zIndex = 500;
      stage.addChild(sprite);
    }
  }

  /**
   * Updates only card transforms (x, y, rotation, scale, zIndex, alpha, shadow) from current hover lerp.
   * Uses arc layout from getHandLayout for consistency with drawHand.
   */
  private updateHandHoverOnly(): void {
    const state = this.bridge.getState();
    if (!state || !this.app || state.hand.length !== this.cardSprites.size) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const L = COMBAT_LAYOUT;
    const hand = state.hand;
    const hoverLift = L.hoverLift;
    const hoverScale = L.hoverScale;
    const useHoverLerp = this.hoverLerp.length === hand.length;
    const layout = getHandLayout(hand.length, w, h, this.hoveredCardIndex);
    const isPressedOrDragging = (idx: number) =>
      this.cardInteractionCardIndex === idx &&
      (this.cardInteractionState === 'pressed' || this.cardInteractionState === 'dragging');

    for (let i = 0; i < hand.length; i++) {
      const container = this.cardSprites.get(`${hand[i]}-${i}`);
      if (!container) continue;
      const cost = this.getCardCost(hand[i]);
      const playable = state.energy >= cost;
      const isHovered = this.hoveredCardIndex === i;
      const isSelected = isPressedOrDragging(i);
      const lerp = useHoverLerp ? (this.hoverLerp[i] ?? 0) : (isHovered || isSelected ? 1 : 0);
      const isActive = isHovered || isSelected || lerp > 0.02;
      const applyHover = (isHovered || isSelected) && lerp > 0.5;

      const pos = layout.positions[i];
      const spreadX = this.spreadLerp[i] ?? pos.spreadOffsetX ?? 0;
      const cardX = pos.x + spreadX;
      const cardY = pos.y - (isActive ? lerp * hoverLift : 0);
      const scale = 1 + (isActive ? lerp : 0) * (hoverScale - 1);
      const zIndex = applyHover || (isActive && lerp > 0.5) ? 100 : i;
      const alpha = playable ? (applyHover ? 1 : 0.92) : 0.6;

      container.x = cardX;
      container.y = cardY;
      container.rotation = pos.rotation;
      container.scale.set(scale);
      container.zIndex = zIndex;
      container.alpha = alpha;
      const shadow = container.children[0];
      if (shadow) shadow.alpha = applyHover ? 1 : 0.18 / 0.35;
    }
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

  /** If the card is Strike, play shooting or chibi slashing animation on the player character. Pixi-only; no overlay change. */
  private triggerShootingAnimationIfStrike(cardId: string): void {
    if (!this.cardIsStrike(cardId)) return;
    const state = this.bridge.getState();
    const isChibi = state?.characterId === 'chibi';
    if (isChibi) {
      this.slashingAnimationPlaying = true;
      this.ensurePlayerAnimationTicker();
      this.redraw();
      this.combatAssets.playSlashingAnimation().then(() => {
        this.slashingAnimationPlaying = false;
        this.removePlayerAnimationTickerIfIdle();
        this.redraw();
      });
    } else {
      this.shootingAnimationPlaying = true;
      this.ensurePlayerAnimationTicker();
      this.redraw();
      this.combatAssets.playShootingAnimation().then(() => {
        this.shootingAnimationPlaying = false;
        this.removePlayerAnimationTickerIfIdle();
        this.redraw();
      });
    }
  }

  private ensurePlayerAnimationTicker(): void {
    if (this.app && !this.shieldTicker) {
      const runShieldTickerOutsideZone = (): void => {
        if (this.shieldAnimationPlaying || this.shootingAnimationPlaying || this.slashingAnimationPlaying) {
          this.combatAssets.getShieldAnimationDone();
          this.combatAssets.getShootingAnimationDone();
          this.combatAssets.getSlashingAnimationDone();
          this.redraw();
        }
      };
      this.shieldTicker = () => this.zone.runOutsideAngular(runShieldTickerOutsideZone);
      this.zone.runOutsideAngular(() => this.app!.ticker.add(this.shieldTicker!));
    }
  }

  private removePlayerAnimationTickerIfIdle(): void {
    if (this.shieldAnimationPlaying || this.shootingAnimationPlaying || this.slashingAnimationPlaying) return;
    if (this.shieldTicker && this.app) {
      this.app.ticker.remove(this.shieldTicker);
      this.shieldTicker = null;
    }
  }

  /** Display name for a card (used in hand and reward/rest panels). */
  getCardName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

  /** Character display name for combat header. */
  getCharacterName(): string {
    const state = this.bridge.getState();
    const id = state?.characterId;
    if (!id) return 'Pilot';
    const char = this.bridge.getCharacter(id);
    return char?.name ?? id;
  }

  /** Floor/level for combat header (e.g. act or sector). */
  getHeaderFloor(): number {
    return this.bridge.getState()?.floor ?? 1;
  }

  /** Current game state (for template bindings e.g. header HP). */
  getState(): GameState | null {
    return this.bridge.getState();
  }

  /** Convert client coordinates to stage (canvas) coordinates for drag. */
  private clientToStage(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.app?.canvas) return { x: 0, y: 0 };
    const rect = this.app.canvas.getBoundingClientRect();
    const scaleX = this.app.screen.width / rect.width;
    const scaleY = this.app.screen.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private clearDragListeners(): void {
    if (!this.dragListenersBound) return;
    this.dragListenersBound();
    this.dragListenersBound = null;
  }

  /**
   * Returns the axis-aligned bounding box of a card (rotated rect). Card pivot is bottom-center.
   * Used so hover only highlights the card whose visual bounds contain the cursor.
   */
  private getCardAABB(
    pos: { x: number; y: number; rotation: number; spreadOffsetX?: number },
    cardWidth: number,
    cardHeight: number
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    const cx = pos.x + (pos.spreadOffsetX ?? 0);
    const cy = pos.y;
    const r = pos.rotation;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const hw = cardWidth / 2;
    const corners = [
      [cx + (-hw) * cos - 0 * sin, cy + (-hw) * sin + 0 * cos],
      [cx + hw * cos - 0 * sin, cy + hw * sin + 0 * cos],
      [cx + hw * cos - -cardHeight * sin, cy + hw * sin + -cardHeight * cos],
      [cx + (-hw) * cos - -cardHeight * sin, cy + (-hw) * sin + -cardHeight * cos],
    ];
    let minX = corners[0][0];
    let maxX = corners[0][0];
    let minY = corners[0][1];
    let maxY = corners[0][1];
    for (let i = 1; i < corners.length; i++) {
      minX = Math.min(minX, corners[i][0]);
      maxX = Math.max(maxX, corners[i][0]);
      minY = Math.min(minY, corners[i][1]);
      maxY = Math.max(maxY, corners[i][1]);
    }
    return { minX, minY, maxX, maxY };
  }

  private pointInAABB(px: number, py: number, aabb: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    return px >= aabb.minX && px <= aabb.maxX && py >= aabb.minY && py <= aabb.maxY;
  }

  /** Hover: only highlight the card whose visual bounds contain the cursor (card-width hit area, no overlap). */
  private resolveHover(clientX: number, clientY: number): void {
    if (this._runPhase !== 'combat' || !this.app) return;
    const state = this.bridge.getState();
    if (!state) return;
    const hand = state.hand;
    if (hand.length === 0) return;
    const { x: mouseX, y: mouseY } = this.clientToStage(clientX, clientY);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const layout = getHandLayout(hand.length, w, h, null);
    const cardWidth = COMBAT_LAYOUT.cardWidth;
    const cardHeight = COMBAT_LAYOUT.cardHeight;
    const cardCenterYOffset = cardHeight / 2;

    if (this.cardInteractionState === 'dragging' && this.cardInteractionCardIndex !== null) return;

    if (this.hoveredCardIndex != null && this.hoveredCardIndex < layout.positions.length) {
      const aabb = this.getCardAABB(layout.positions[this.hoveredCardIndex], cardWidth, cardHeight);
      if (this.pointInAABB(mouseX, mouseY, aabb)) return;
    }

    let best: { index: number; dist: number } | null = null;
    for (let i = 0; i < layout.positions.length; i++) {
      const pos = layout.positions[i];
      const aabb = this.getCardAABB(pos, cardWidth, cardHeight);
      if (!this.pointInAABB(mouseX, mouseY, aabb)) continue;
      const cx = pos.x + (pos.spreadOffsetX ?? 0);
      const cy = pos.y - cardCenterYOffset;
      const dist = Math.hypot(mouseX - cx, mouseY - cy);
      if (best == null || dist < best.dist) best = { index: i, dist };
    }
    const newHover = best?.index ?? null;
    if (newHover !== this.hoveredCardIndex) {
      this.hoveredCardIndex = newHover;
      this.requestTemplateUpdate();
      this.redraw();
    }
  }

  /** Card pointer down: enter Pressed; Dragging after threshold; play or Returning on release. */
  onCardPointerDown(cardId: string, handIndex: number, stageX: number, stageY: number): void {
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;
    const cost = this.getCardCost(cardId);
    if (state.energy < cost) return;

    const needsEnemy = this.cardNeedsEnemyTarget(cardId);
    if (needsEnemy) {
      const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
      if (aliveCount === 0) return;
    }

    this.cardInteractionState = 'pressed';
    this.cardInteractionCardIndex = handIndex;
    this.cardInteractionCardId = cardId;
    this.pressStartX = stageX;
    this.pressStartY = stageY;
    this.redraw();
    this.requestTemplateUpdate();

    const onMove = (e: PointerEvent): void => {
      const { x, y } = this.clientToStage(e.clientX, e.clientY);
      if (this.cardInteractionState === 'pressed') {
        const dx = x - this.pressStartX;
        const dy = y - this.pressStartY;
        const threshold = COMBAT_LAYOUT.dragThreshold;
        if (Math.hypot(dx, dy) > threshold) {
          this.cardInteractionState = 'dragging';
        }
      }
      if (this.cardInteractionState === 'dragging') {
        this.dragScreenX = x;
        this.dragScreenY = y;
        if (this.app) {
          const stateNow = this.bridge.getState();
          if (stateNow?.enemies?.length) {
            const idx = getEnemyIndexAtPoint(x, y, stateNow.enemies.length, this.app.screen.width, this.app.screen.height);
            const newHover = idx != null && stateNow.enemies[idx].hp > 0 ? idx : null;
            if (this.hoveredEnemyIndex !== newHover) {
              this.hoveredEnemyIndex = newHover;
            }
          } else {
            this.hoveredEnemyIndex = null;
          }
        }
        this.redraw();
      }
    };

    const onUp = (e: PointerEvent): void => {
      const { x, y } = this.clientToStage(e.clientX, e.clientY);
      const currentCardId = this.cardInteractionCardId ?? cardId;
      const currentHandIndex = this.cardInteractionCardIndex ?? handIndex;
      const needsEnemyLocal = this.cardNeedsEnemyTarget(currentCardId);

      if (this.cardInteractionState === 'pressed') {
        this.cardInteractionState = 'idle';
        this.cardInteractionCardIndex = null;
        this.cardInteractionCardId = null;
        this.redraw();
        this.requestTemplateUpdate();
      } else if (this.cardInteractionState === 'dragging') {
        const stateNow = this.bridge.getState();
        let played = false;
        if (needsEnemyLocal) {
          const enemyIdx = this.hoveredEnemyIndex;
          if (stateNow && enemyIdx != null && enemyIdx < stateNow.enemies.length && stateNow.enemies[enemyIdx].hp > 0) {
            this.runCardFlyThenPlay(currentCardId, enemyIdx, stateNow);
            played = true;
          }
        } else if (stateNow && this.app) {
          const ratio = COMBAT_LAYOUT.nonTargetPlayLineRatio;
          const playLineY = this.app.screen.height * ratio;
          if (y < playLineY) {
            this.bridge.playCard(currentCardId, undefined, currentHandIndex);
            this.triggerShieldAnimationIfBlock(currentCardId);
            this.triggerShootingAnimationIfStrike(currentCardId);
            played = true;
          }
        }

        if (played) {
          this.cardInteractionState = 'idle';
          this.cardInteractionCardIndex = null;
          this.cardInteractionCardId = null;
        } else {
          this.cardInteractionState = 'returning';
          if (this.app && currentHandIndex >= 0 && stateNow) {
            const layout = getHandLayout(stateNow.hand.length, this.app.screen.width, this.app.screen.height, currentHandIndex);
            const pos = layout.positions[currentHandIndex];
            if (pos) {
              this.returnStartX = pos.x + (pos.spreadOffsetX ?? 0);
              this.returnStartY = pos.y;
            } else {
              this.returnStartX = this.dragScreenX ?? 0;
              this.returnStartY = this.dragScreenY ?? 0;
            }
          } else {
            this.returnStartX = this.dragScreenX ?? 0;
            this.returnStartY = this.dragScreenY ?? 0;
          }
          this.returnStartTime = performance.now();
          this.returnProgress = 0;
        }
        this.redraw();
        this.requestTemplateUpdate();
      }
      this.clearDragListeners();
    };

    this.dragListenersBound = (): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  /** Legacy: card click (all interaction is via pointer down -> pressed -> drag in combat). */
  onCardClick(_cardId: string, _handIndex: number): void {
    if (this._runPhase === 'combat') return;
    // Non-combat or fallback: no-op; combat uses onCardPointerDown only.
  }

  /** Enemy click is not used to play cards; targetable cards only trigger on drop (release) over an enemy. Hover only highlights. */
  onEnemyTargetClick(_enemyIndex: number): void {
    // Card plays only when pointer is released (drop) over an enemy in onUp, not on click. No lock-on.
  }

  /** Clear card interaction and hovered enemy; exit targeting mode. */
  cancelTargeting(): void {
    this.cardInteractionState = 'idle';
    this.cardInteractionCardIndex = null;
    this.cardInteractionCardId = null;
    this.hoveredEnemyIndex = null;
    this.clearDragListeners();
    this.redraw();
    this.requestTemplateUpdate();
  }

  /**
   * B8: Animate card flying from hand (or drag position) to enemy, then play card, compute floating numbers, and redraw.
   * Ease-out so card decelerates at target; 280ms duration.
   * @param dragStart When playing from drag, use this as fly start so the card flies from the cursor.
   */
  private runCardFlyThenPlay(cardId: string, enemyIndex: number, state: GameState, dragStart?: { x: number; y: number }): void {
    if (!this.app) return;
    const L = COMBAT_LAYOUT;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cardWidth = L.cardWidth;
    const cardHeight = L.cardHeight;

    const toCenter = getEnemyCenter(enemyIndex, state.enemies.length, w, h);

    let fromX: number;
    let fromY: number;
    const selIdx = this.cardInteractionCardIndex != null && this.cardInteractionCardIndex < state.hand.length
      ? this.cardInteractionCardIndex
      : state.hand.indexOf(cardId);
    const handIndexForPlay = this.cardInteractionCardIndex ?? selIdx;
    if (dragStart) {
      fromX = dragStart.x;
      fromY = dragStart.y;
    } else if (selIdx >= 0) {
      const layout = getHandLayout(state.hand.length, w, h, null);
      const pos = layout.positions[selIdx];
      fromX = pos.x + (pos.spreadOffsetX ?? 0);
      fromY = pos.y - L.hoverLift;
    } else {
      this.bridge.playCard(cardId, enemyIndex, handIndexForPlay >= 0 ? handIndexForPlay : undefined);
      this.triggerShieldAnimationIfBlock(cardId);
      this.triggerShootingAnimationIfStrike(cardId);
      this.cardInteractionState = 'idle';
      this.cardInteractionCardIndex = null;
      this.cardInteractionCardId = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.requestTemplateUpdate();
      return;
    }
    const toX = toCenter.x;
    const toY = toCenter.y;

    const flyCard = new PIXI.Container();
    const cardTex = this.combatAssets.getCardArtTexture(cardId);
    if (cardTex) {
      const cardSprite = new PIXI.Sprite(cardTex);
      cardSprite.width = cardWidth;
      cardSprite.height = cardHeight;
      flyCard.addChild(cardSprite);
    } else {
      const bg = new PIXI.Graphics();
      bg.roundRect(0, 0, cardWidth, cardHeight, L.cardCornerRadius).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
      flyCard.addChild(bg);
    }
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
        this.bridge.playCard(cardId, enemyIndex, handIndexForPlay >= 0 ? handIndexForPlay : undefined);
        this.triggerShieldAnimationIfBlock(cardId);
        this.triggerShootingAnimationIfStrike(cardId);
        this.sound.playCardPlay();
        const vfxId = this.cardVfx.getVfxIdForCard(cardId);
        if (vfxId && this.gameSettings.vfxIntensity() !== 'off' && this.cardVfx.getVfxFrames(vfxId).length > 0) {
          this.activeCardVfx.push({ vfxId, x: toX, y: toY, startTime: performance.now() });
        }
        const newState = this.bridge.getState()!;
        this.cardInteractionState = 'idle';
        this.cardInteractionCardIndex = null;
        this.cardInteractionCardId = null;
        this.hoveredEnemyIndex = null;
        const now = performance.now();
        const toAdd: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number; addedAt: number }[] = [];
        if (oldState.enemies[enemyIndex] && newState.enemies[enemyIndex]) {
          const hpLost = oldState.enemies[enemyIndex].hp - newState.enemies[enemyIndex].hp;
          if (hpLost > 0) {
            toAdd.push({ type: 'damage', value: hpLost, x: toX, y: toY, enemyIndex, addedAt: now });
            this.sound.playHit();
            this.enemyHurtStartMs[enemyIndex] = now;
            if (newState.enemies[enemyIndex].hp <= 0) {
              this.enemyDyingStartMs[enemyIndex] = now;
            }
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
          setTimeout(() => this.redraw(), COMBAT_TIMING.redrawAfterFloatMs);
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

  /** Show "Enemy turn" banner, then after delay call bridge.endTurn() and redraw. */
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
    }, COMBAT_TIMING.enemyTurnBannerDelayMs);
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
    }, COMBAT_TIMING.rewardFeedbackDelayMs);
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
