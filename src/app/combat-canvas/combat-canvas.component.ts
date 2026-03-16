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
  type Signal,
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
import { getHandLayout, type HandLayoutResult } from './constants/hand-layout';
import { getCardEffectDescription } from './helpers/card-text.helper';
import { drawMapView } from './renderers/map-view.renderer';
import { drawCombatView, buildCardVisualsContainer } from './renderers/combat-view.renderer';
import { MapPhaseController, type MapPhaseHost } from './controllers/map-phase.controller';
import { CombatPhaseController, type CombatPhaseHost } from './controllers/combat-phase.controller';
import { updateCardAnimations } from './systems/card-animation.system';
import { CombatPools } from './pools/pixi-pools';
import type { FloatingNumber } from './constants/combat-types';
import { logger } from '../util/app-logger';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { RewardPanelComponent } from './panels/reward-panel.component';
import { RestPanelComponent } from './panels/rest-panel.component';
import { ShopPanelComponent } from './panels/shop-panel.component';
import { EventPanelComponent } from './panels/event-panel.component';
import { VictoryPanelComponent } from './panels/victory-panel.component';

/**
 * Main game canvas: owns PixiJS app lifecycle, game state sync, and user actions.
 * Delegates map and combat drawing to renderers; handles redraw dispatch and event callbacks.
 */
@Component({
  selector: 'app-combat-canvas',
  standalone: true,
  imports: [
    SettingsModalComponent,
    RewardPanelComponent,
    RestPanelComponent,
    ShopPanelComponent,
    EventPanelComponent,
    VictoryPanelComponent,
  ],
  templateUrl: './combat-canvas.component.html',
  styleUrls: ['./combat-canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CombatCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('canvasHost', { static: true }) canvasHostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollArea') scrollAreaRef?: ElementRef<HTMLElement>;

  private app: PIXI.Application | null = null;
  private cardsMap: Map<string, CardDef> | null = null;
  private dragListenersBound: (() => void) | null = null;
  private hoverResolveBound: (() => void) | null = null;
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
  /** Map-phase state and context building; created in ngOnInit. */
  private mapController!: MapPhaseController;
  /** Combat-phase state and context building; created in ngOnInit. */
  private combatController!: CombatPhaseController;
  /** True until we have drawn with valid canvas size once (fixes initial map/combat not showing). */
  private hadZeroSize = true;
  /** Coalesce redraws: if redraw() is called while doRedraw runs, schedule one more next frame. */
  private redrawAgain = false;
  /** Guard to avoid re-entrant doRedraw. */
  private inRedraw = false;
  /** True when a redraw is already scheduled for next frame (at most one doRedraw per frame). */
  private redrawScheduled = false;
  /** ResizeObserver: throttle to one redraw per frame. */
  private resizeRedrawScheduled = false;
  /** Ticker frame counter for throttling idle and animation-only redraws. */
  private tickerFrameCount = 0;
  /** Persistent containers so we can update only VFX without full stage clear (avoids recreating all combat nodes every frame). */
  private contentContainer: PIXI.Container | null = null;
  private vfxContainer: PIXI.Container | null = null;
  /** Throttle hover resolution to ~30fps to reduce work on pointer move. */
  private lastResolveHoverTime = 0;
  /** Pools for combat view display objects; reused across redraws to reduce allocations. */
  private combatPools = new CombatPools();
  /** True when contentContainer last drew combat (so we release to pools instead of destroy on next clear). */
  private lastContentWasCombat = false;
  showPauseMenu = false;
  showPauseSettings = false;

  /** Combat state is on CombatPhaseController; expose for template. */
  get cardInteractionState(): 'idle' | 'hover' | 'pressed' | 'dragging' | 'playing' | 'returning' {
    return this.combatController?.cardInteractionState ?? 'idle';
  }

  get returnDurationMs(): number {
    return this.gameSettings.reducedMotion() ? 50 : COMBAT_TIMING.returnDurationMs;
  }

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
      const nextPhase = this.bridge.getRunPhase();
      if (nextPhase !== this._runPhase) {
        if (nextPhase === 'map') this.sound.startMapSoundtrack();
        if (nextPhase === 'combat') this.sound.startCombatSoundtrack();
      }
      this._runPhase = nextPhase;
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
    if (this.combatController.cardInteractionState !== 'idle' && this.combatController.cardInteractionState !== 'hover') {
      this.combatController.cardInteractionState = 'idle';
      this.combatController.cardInteractionCardIndex = null;
      this.combatController.cardInteractionCardId = null;
      this.combatController.hoveredEnemyIndex = null;
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

  /** Getters for template: map state is owned by MapPhaseController. */
  get mapContentHeight(): number {
    return this.mapController?.getMapContentHeight() ?? 0;
  }
  get mapReady(): Signal<boolean> {
    return this.mapController?.mapReady ?? signal(false);
  }
  get mapLoadError(): Signal<boolean> {
    return this.mapController?.mapLoadError ?? signal(false);
  }

  ngOnInit(): void {
    this.mapController = new MapPhaseController(this.createMapPhaseHost());
    this.combatController = new CombatPhaseController();
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

  private createMapPhaseHost(): MapPhaseHost {
    return {
      getBridge: () => this.bridge,
      getMapAssets: () => this.mapAssets,
      getApp: () => this.app,
      getZone: () => this.zone,
      getCdr: () => this.cdr,
      redraw: () => this.redraw(),
      requestTemplateUpdate: () => this.requestTemplateUpdate(),
      scheduleCanvasLayoutFix: (opts) => this.scheduleCanvasLayoutFix(opts),
    };
  }

  private createCombatPhaseHost(): CombatPhaseHost {
    return {
      getCardCost: (id) => this.getCardCost(id),
      getCardName: (id) => this.getCardName(id),
      getCardEffectDescription: (id) => this.getCardEffectDescriptionText(id),
      getCombatAssets: () => ({
        getCardArtTexture: (id) => this.combatAssets.getCardArtTexture(id),
        getPlayerTexture: (now) => this.combatAssets.getPlayerTexture(now),
        getEnemyTexture: (id) => this.combatAssets.getEnemyTexture(id),
        getEnemyAnimationTexture: (v, a, n, s) => this.combatAssets.getEnemyAnimationTexture(v as 1 | 2 | 3, a, n, s),
        getCombatBgTexture: () => this.combatAssets.getCombatBgTexture(),
        getHpIconTexture: () => this.combatAssets.getHpIconTexture(),
        getBlockIconTexture: () => this.combatAssets.getBlockIconTexture(),
        getShieldVideoTexture: () => this.combatAssets.getShieldVideoTexture(),
        getShootingTexture: () => this.combatAssets.getShootingTexture(),
        getSlashingTexture: () => this.combatAssets.getSlashingTexture(),
        getVMGrowSeedTexture: () => this.combatAssets.getVMGrowSeedTexture(),
        getVMSpellTexture: () => this.combatAssets.getVMSpellTexture(),
        getVMSummoningTexture: () => this.combatAssets.getVMSummoningTexture(),
      }),
      getGameSettings: () => ({
        handLayout: () => this.gameSettings.handLayout(),
        reducedMotion: () => this.gameSettings.reducedMotion(),
        textScale: () => this.gameSettings.textScale(),
        vfxIntensity: () => this.gameSettings.vfxIntensity(),
      }),
      getApp: () => this.app,
      redraw: () => this.redraw(),
      requestTemplateUpdate: () => this.requestTemplateUpdate(),
      onCardPointerOver: (i) => this.onCardPointerOver(i),
      onCardPointerOut: () => this.onCardPointerOut(),
      onCardPointerDown: (cardId, handIndex, stageX, stageY) => this.onCardPointerDown(cardId, handIndex, stageX, stageY),
      onCardClick: (cardId, handIndex) => this.onCardClick(cardId, handIndex),
      onEnemyTargetClick: (enemyIndex) => this.onEnemyTargetClick(enemyIndex),
      onEnemyPointerOver: (enemyIndex) => { this.combatController.hoveredEnemyIndex = enemyIndex; this.redraw(); },
      onEnemyPointerOut: () => { this.combatController.hoveredEnemyIndex = null; this.redraw(); },
      cardNeedsEnemyTarget: (cardId) => this.cardNeedsEnemyTarget(cardId),
      markForCheck: () => this.requestTemplateUpdate(),
      getPools: () => this.combatPools,
    };
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
    this.contentContainer = null;
    this.vfxContainer = null;
  }

  /** Create Pixi app, attach to host, wire resize and initial redraw. */
  private async initPixi(): Promise<void> {
    await this.bridge.ensureDataLoaded();
    if (!this.bridge.getState()) {
      const characterId = this.bridge.getPendingCharacter() ?? 'gungirl';
      this.bridge.startRun(characterId);
      this.bridge.clearPendingCharacter();
    }
    const state = this.bridge.getState();
    this._combatResult = state?.combatResult ?? null;
    this._runPhase = this.bridge.getRunPhase();
    if (this._runPhase === 'map') this.sound.startMapSoundtrack();
    if (this._runPhase === 'combat') this.sound.startCombatSoundtrack();
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
      this.tickerFrameCount++;
      const state = this.bridge.getState();
      if (!state) return;
      const hand = state.hand;
      if (this.combatController.cardInteractionCardIndex != null && this.combatController.cardInteractionCardIndex >= hand.length) {
        this.combatController.cardInteractionState = 'idle';
        this.combatController.cardInteractionCardIndex = null;
        this.combatController.cardInteractionCardId = null;
        this.clearDragListeners();
      }
      if (hand.length !== this.combatController.hoverLerp.length) {
        this.combatController.targetLerp = hand.map((cardId, i) =>
          (i === this.combatController.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
          (i === this.combatController.cardInteractionCardIndex && (this.combatController.cardInteractionState === 'pressed' || this.combatController.cardInteractionState === 'dragging'))
            ? 1
            : 0
        );
        this.combatController.hoverLerp = [...this.combatController.targetLerp];
        const layoutInit = getHandLayout(hand.length, this.app.screen.width, this.app.screen.height, this.combatController.hoveredCardIndex, {
          handLayout: this.gameSettings.handLayout(),
          reducedMotion: this.gameSettings.reducedMotion(),
        });
        this.combatController.spreadLerp = layoutInit.positions.map((p) => p.spreadOffsetX ?? 0);
        this.redraw();
        return;
      }
      this.combatController.targetLerp = hand.map((cardId, i) =>
        (i === this.combatController.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
        (i === this.combatController.cardInteractionCardIndex && (this.combatController.cardInteractionState === 'pressed' || this.combatController.cardInteractionState === 'dragging'))
          ? 1
          : 0
      );
      const dt = (ticker.deltaTime ?? 1) / 60;
      const factor = 1 - Math.exp(-COMBAT_TIMING.hoverLerpSpeed * dt);
      const spreadFactor = 1 - Math.exp(-COMBAT_TIMING.spreadLerpSpeed * dt);
      let changed = false;
      const now = performance.now();
      // Drive redraw every frame when character or enemies have idle animations so they advance
      if (this.bridge.hasAnimatedIdle(state.characterId ?? '')) changed = true;
      if (this.combatController.activeCardVfx.length > 0) changed = true;
      if (this.combatController.enemyHurtStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.hurtDurationMs)) changed = true;
      if (this.combatController.enemyDyingStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.dyingDurationMs)) changed = true;
      if (this.combatController.cardInteractionState === 'returning') {
        const elapsed = performance.now() - this.combatController.returnStartTime;
        const raw = Math.min(1, elapsed / this.returnDurationMs);
        // Cubic ease-out: smooth deceleration at the end for a polished snap-in
        this.combatController.returnProgress = 1 - (1 - raw) ** 3;
        if (raw >= 1) {
          this.combatController.cardInteractionState = 'idle';
          this.combatController.cardInteractionCardIndex = null;
          this.combatController.cardInteractionCardId = null;
        }
        changed = true;
      }
      const layout = getHandLayout(hand.length, this.app.screen.width, this.app.screen.height, this.combatController.hoveredCardIndex, {
        handLayout: this.gameSettings.handLayout(),
        reducedMotion: this.gameSettings.reducedMotion(),
      });
      if (this.combatController.spreadLerp.length === layout.positions.length) {
        for (let i = 0; i < this.combatController.spreadLerp.length; i++) {
          const target = layout.positions[i].spreadOffsetX ?? 0;
          const prev = this.combatController.spreadLerp[i];
          this.combatController.spreadLerp[i] = prev + (target - prev) * spreadFactor;
          if (Math.abs(this.combatController.spreadLerp[i] - prev) > 0.3) changed = true;
        }
      } else {
        this.combatController.spreadLerp = layout.positions.map((p) => p.spreadOffsetX ?? 0);
        changed = true;
      }
      if (this.combatController.hoverLerp.length === this.combatController.targetLerp.length) {
        for (let i = 0; i < this.combatController.hoverLerp.length; i++) {
          const prev = this.combatController.hoverLerp[i];
          this.combatController.hoverLerp[i] = prev + (this.combatController.targetLerp[i] - prev) * factor;
          if (Math.abs(this.combatController.hoverLerp[i] - prev) > 0.002) changed = true;
        }
      }
      if (hand.length > 0 && this.combatController.handPresentations.length === hand.length) changed = true;
      if (changed) {
        const enemyAnimPlaying =
          this.combatController.enemyHurtStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.hurtDurationMs) ||
          this.combatController.enemyDyingStartMs.some((t) => t != null && now - t < ENEMY_ANIMATION_TIMING.dyingDurationMs);
        const useIdleOnlyPath =
          this.bridge.hasAnimatedIdle(state.characterId ?? '') &&
          this.combatController.activeCardVfx.length === 0 &&
          this.combatController.cardSprites.size === hand.length &&
          this.combatController.cardInteractionState !== 'returning' &&
          !this.combatController.shieldAnimationPlaying &&
          !this.combatController.shootingAnimationPlaying &&
          !this.combatController.slashingAnimationPlaying &&
          !this.combatController.vmGrowSeedAnimationPlaying &&
          !this.combatController.vmSpellAnimationPlaying &&
          !this.combatController.vmSummoningAnimationPlaying &&
          !enemyAnimPlaying &&
          this.combatController.playerSpriteRef != null &&
          this.combatController.enemySpriteRefs.length === state.enemies.length;
        if (useIdleOnlyPath) {
          // Keep hand positions in sync: presentations drive card layout; without this, cards stay at deck position.
          if (hand.length > 0 && this.combatController.handPresentations.length === hand.length) {
            const w = this.app.screen.width;
            const h = this.app.screen.height;
            const excludedIndex =
              this.combatController.cardInteractionState === 'dragging' &&
              this.combatController.cardInteractionCardIndex != null
                ? this.combatController.cardInteractionCardIndex
                : null;
            this.combatController.applyHandLayoutTargets(
              hand.length,
              w,
              h,
              { handLayout: this.gameSettings.handLayout(), reducedMotion: this.gameSettings.reducedMotion() },
              excludedIndex,
              this.combatController.dragScreenX,
              this.combatController.dragScreenY
            );
            updateCardAnimations(this.combatController.handPresentations, dt);
            this.updateHandFromPresentation();
          }
          // Update every frame so idle animations (character + enemies) stay smooth; throttle was causing static appearance.
          this.updatePlayerAndEnemyTexturesOnly();
        } else if (
          this.combatController.activeCardVfx.length > 0 ||
          this.combatController.cardSprites.size !== hand.length ||
          this.combatController.cardInteractionState === 'returning' ||
          this.bridge.hasAnimatedIdle(state.characterId ?? '') ||
          enemyAnimPlaying
        ) {
          const animationOnlyRedraw = this.combatController.cardSprites.size === hand.length;
          const onlyVfxNoReturning =
            this.combatController.activeCardVfx.length > 0 &&
            this.combatController.cardInteractionState !== 'returning' &&
            !enemyAnimPlaying;
          if (onlyVfxNoReturning && this.vfxContainer) {
            this.updateVfxOnly();
          } else if (!animationOnlyRedraw || this.tickerFrameCount % 2 === 0) {
            this.redraw();
          }
        } else {
          if (this.combatController.handPresentations.length === hand.length) {
            const w = this.app.screen.width;
            const h = this.app.screen.height;
            const excludedIndex =
              this.combatController.cardInteractionState === 'dragging' &&
              this.combatController.cardInteractionCardIndex != null
                ? this.combatController.cardInteractionCardIndex
                : null;
            this.combatController.applyHandLayoutTargets(
              hand.length,
              w,
              h,
              { handLayout: this.gameSettings.handLayout(), reducedMotion: this.gameSettings.reducedMotion() },
              excludedIndex,
              this.combatController.dragScreenX,
              this.combatController.dragScreenY
            );
            updateCardAnimations(this.combatController.handPresentations, dt);
            this.updateHandFromPresentation();
          } else {
            this.updateHandHoverOnly(layout);
          }
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

  /** Schedules a paint outside Angular (coalesced). At most one doRedraw per animation frame. */
  private redraw(): void {
    if (this.inRedraw) {
      this.redrawAgain = true;
      return;
    }
    if (this.redrawScheduled) {
      this.redrawAgain = true;
      return;
    }
    this.redrawScheduled = true;
    requestAnimationFrame(() => {
      this.redrawScheduled = false;
      this.zone.runOutsideAngular(() => this.doRedraw());
    });
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

  /** Retry map load and clear error (e.g. user clicked Retry). Delegates to MapPhaseController. */
  retryMapLoad(): void {
    this.mapController.retryMapLoad();
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
    const floatTtl = this.gameSettings.reducedMotion() ? 50 : COMBAT_TIMING.floatingNumberTtlMs;
    this.combatController.floatingNumbers = this.combatController.floatingNumbers.filter((fn) => (fn.addedAt == null) || now - fn.addedAt <= floatTtl);
    const prevResult = this._combatResult;
    const prevPhase = this._runPhase;
    this._combatResult = state.combatResult;
    this._runPhase = this.bridge.getRunPhase();
    if (this._runPhase !== 'combat') {
      this.combatController.cardInteractionState = 'idle';
      this.combatController.cardInteractionCardIndex = null;
      this.combatController.cardInteractionCardId = null;
      this.clearDragListeners();
    }
    if (prevPhase === 'map' && this._runPhase !== 'map') {
      this.mapController.resetOnLeaveMap();
    }
    this.syncOverlaySignals(state);
    if (state.combatResult === 'win' && prevResult !== 'win') this.sound.playVictory();
    if (state.combatResult === 'lose' && prevResult !== 'lose') this.sound.playDefeat();
    if (this._runPhase === 'map' && prevPhase !== 'map') this.sound.startMapSoundtrack();
    if (this._runPhase === 'combat' && prevPhase !== 'combat') {
      this.sound.startCombatSoundtrack();
      this.sound.playCombatStart();
    }
    if (this._runPhase === 'combat' && prevPhase !== 'combat' && this.app) {
      this.cdr.detectChanges();
      this.app.resize();
    }

    if (this._runPhase === 'combat') {
      const characterId = state.characterId ?? undefined;
      const enemyIds = state.enemies.map((e) => e.id);
      await this.combatAssets.loadCombatAssets(characterId, enemyIds);
    }

    if (!this.contentContainer) {
      this.contentContainer = new PIXI.Container();
      this.vfxContainer = new PIXI.Container();
      this.app.stage.addChild(this.contentContainer);
      this.app.stage.addChild(this.vfxContainer);
    }
    const content = this.contentContainer;
    const vfx = this.vfxContainer!;
    if (this._runPhase === 'combat' || this.lastContentWasCombat) {
      this.combatController.playerSpriteRef = null;
      this.combatController.enemySpriteRefs = [];
      this.combatController.cardSprites.clear();
    }
    const contentChildren = [...content.children];
    for (const child of contentChildren) {
      content.removeChild(child);
      child.destroy({ children: true, texture: false });
    }
    const vfxChildren = vfx.removeChildren();
    for (const child of vfxChildren) child.destroy({ children: true, texture: false });

    const padding = COMBAT_LAYOUT.padding;

    // Map phase and overlays (reward, rest, shop, event, victory): render map as background.
    if (this.isMapOrOverlayPhase(this._runPhase) && state.map) {
      if (!this.mapAssets.isMapLoaded()) {
        this.mapController.drawMapLoadingState(content, w, h);
        this.mapController.ensureMapLoadThenReveal();
        this.requestTemplateUpdate();
        return;
      }
      this.mapController.setMapReady(true);
      const mapContext = this.mapController.buildMapContext(state, this._runPhase);
      drawMapView(mapContext, state, content, w, h, padding);
      this.lastContentWasCombat = false;
      if (this._runPhase === 'map' && this.bridge.getAvailableNextNodes().length > 0) {
        const characterId = state.characterId ?? undefined;
        const enemyIds = this.bridge.getEnemyIdsForNextPossibleEncounters();
        if (enemyIds.length > 0) {
          this.combatAssets.loadCombatAssets(characterId, enemyIds).catch(() => {});
        }
      }
      this.requestTemplateUpdate();
      if (prevPhase !== 'map' && this._runPhase === 'map') {
        this.scheduleCanvasLayoutFix({ scrollToBottom: true });
      }
      return;
    }

    // Combat phase only: ensure combat assets loading (global + character + enemies), build context and delegate to combat renderer.
    if (this._runPhase !== 'combat') return;
    if (!this.lastContentWasCombat) {
      this.combatController.playerSpriteRef = null;
      this.combatController.enemySpriteRefs = [];
    }
    if (this.combatController.cardInteractionCardIndex != null && this.combatController.cardInteractionCardIndex >= state.hand.length) {
      this.combatController.cardInteractionState = 'idle';
      this.combatController.cardInteractionCardIndex = null;
      this.combatController.cardInteractionCardId = null;
      this.clearDragListeners();
    }
    if (state.hand.length > 0 && this.combatController.spreadLerp.length !== state.hand.length) {
      const layoutInit = getHandLayout(state.hand.length, w, h, this.combatController.hoveredCardIndex, {
        handLayout: this.gameSettings.handLayout(),
        reducedMotion: this.gameSettings.reducedMotion(),
      });
      this.combatController.spreadLerp = layoutInit.positions.map((p) => p.spreadOffsetX ?? 0);
    }
    const characterId = state.characterId ?? undefined;
    const enemyIds = state.enemies.map((e) => e.id);
    this.cardVfx.loadConfig().then(() => {
      const cardIds = [...state.hand, ...(state.deck ?? [])];
      if (cardIds.length) this.cardVfx.preloadVfxForCards(cardIds);
    });
    const hand = state.hand;
    if (this.combatController.hoveredCardIndex != null && this.combatController.hoveredCardIndex >= hand.length) this.combatController.hoveredCardIndex = null;

    this.combatController.targetLerp = hand.map((cardId, i) =>
      (i === this.combatController.hoveredCardIndex && state.energy >= this.getCardCost(cardId)) ||
      (i === this.combatController.cardInteractionCardIndex && (this.combatController.cardInteractionState === 'pressed' || this.combatController.cardInteractionState === 'dragging'))
        ? 1
        : 0
    );
    if (this.combatController.hoverLerp.length !== this.combatController.targetLerp.length) {
      this.combatController.hoverLerp = [...this.combatController.targetLerp];
    }

    const combatContext = this.combatController.buildCombatContext(
      this.createCombatPhaseHost(),
      content,
      state,
      w,
      h,
      padding
    );
    drawCombatView(combatContext);
    this.drawCardImpactVfx(vfx, now);
    this.lastContentWasCombat = true;
  }

  /** Draw active card impact VFX and remove expired ones. Uses CardVfxService for data-driven VFX. */
  private drawCardImpactVfx(stage: PIXI.Container, now: number): void {
    if (this.gameSettings.vfxIntensity() === 'off') {
      this.combatController.activeCardVfx.length = 0;
      return;
    }
    for (let i = this.combatController.activeCardVfx.length - 1; i >= 0; i--) {
      const e = this.combatController.activeCardVfx[i];
      const meta = this.cardVfx.getVfxMeta(e.vfxId);
      const frames = this.cardVfx.getVfxFrames(e.vfxId);
      if (!meta || frames.length === 0) {
        this.combatController.activeCardVfx.splice(i, 1);
        continue;
      }
      const elapsed = now - e.startTime;
      const frameIndex = Math.floor(elapsed / meta.frameMs);
      if (frameIndex >= meta.frameCount) {
        this.combatController.activeCardVfx.splice(i, 1);
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

  /** Updates only the VFX layer (no full combat redraw). Use when only card impact VFX is animating. */
  private updateVfxOnly(): void {
    const vfx = this.vfxContainer;
    if (!vfx || !this.app) return;
    const vfxChildren = vfx.removeChildren();
    for (const child of vfxChildren) child.destroy({ children: true, texture: false });
    this.drawCardImpactVfx(vfx, performance.now());
  }

  /**
   * Updates only card transforms from handPresentations (current position/rotation/scale/zPriority).
   * Used when target-based animation is active (handPresentations.length === hand.length).
   */
  private updateHandFromPresentation(): void {
    const state = this.bridge.getState();
    if (!state || state.hand.length !== this.combatController.cardSprites.size) return;
    const hand = state.hand;
    const presentations = this.combatController.handPresentations;
    if (presentations.length !== hand.length) return;
    for (let i = 0; i < hand.length; i++) {
      const container = this.combatController.cardSprites.get(`${hand[i]}-${i}`);
      if (!container) continue;
      const p = presentations[i];
      container.x = p.currentX;
      container.y = p.currentY;
      container.rotation = p.currentRotation;
      container.scale.set(p.currentScale);
      container.zIndex = p.zPriority;
    }
  }

  /**
   * Updates only card transforms (x, y, rotation, scale, zIndex, alpha, shadow) from current hover lerp.
   * Uses arc layout from getHandLayout for consistency with drawHand. Pass layout when already computed (e.g. from ticker) to avoid recomputing.
   */
  private updateHandHoverOnly(layout?: HandLayoutResult): void {
    const state = this.bridge.getState();
    if (!state || !this.app || state.hand.length !== this.combatController.cardSprites.size) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const L = COMBAT_LAYOUT;
    const hand = state.hand;
    const hoverScale = L.hoverScale;
    const useHoverLerp = this.combatController.hoverLerp.length === hand.length;
    const resolvedLayout = layout ?? getHandLayout(hand.length, w, h, this.combatController.hoveredCardIndex, {
      handLayout: this.gameSettings.handLayout(),
      reducedMotion: this.gameSettings.reducedMotion(),
    });
    const isPressedOrDragging = (idx: number) =>
      this.combatController.cardInteractionCardIndex === idx &&
      (this.combatController.cardInteractionState === 'pressed' || this.combatController.cardInteractionState === 'dragging');

    for (let i = 0; i < hand.length; i++) {
      const container = this.combatController.cardSprites.get(`${hand[i]}-${i}`);
      if (!container) continue;
      const cost = this.getCardCost(hand[i]);
      const playable = state.energy >= cost;
      const isHovered = this.combatController.hoveredCardIndex === i;
      const isSelected = isPressedOrDragging(i);
      const lerp = useHoverLerp ? (this.combatController.hoverLerp[i] ?? 0) : (isHovered || isSelected ? 1 : 0);
      const isActive = isHovered || isSelected || lerp > 0.02;
      const applyHover = (isHovered || isSelected) && lerp > 0.5;
      const isOnTop = isHovered || isSelected;

      const pos = resolvedLayout.positions[i];
      const spreadX = this.combatController.spreadLerp[i] ?? pos.spreadOffsetX ?? 0;
      const cardX = pos.x + spreadX;
      const hoverLift = resolvedLayout.hoverLift;
      const cardY = pos.y - (isActive ? lerp * hoverLift : 0);
      const scale = 1 + (isActive ? lerp : 0) * (hoverScale - 1);
      const zIndex = isOnTop ? 100 : i;
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

  /**
   * Updates only player and enemy sprite textures (idle/hurt/dying). Used when only time has changed
   * so we avoid a full redraw every frame for idle animations.
   */
  private updatePlayerAndEnemyTexturesOnly(): void {
    const state = this.bridge.getState();
    if (!state || !this.app || this._runPhase !== 'combat') return;
    const now = performance.now();

    const noPlayerAnim =
      !this.combatController.shieldAnimationPlaying && !this.combatController.shootingAnimationPlaying &&
      !this.combatController.slashingAnimationPlaying && !this.combatController.vmGrowSeedAnimationPlaying &&
      !this.combatController.vmSpellAnimationPlaying && !this.combatController.vmSummoningAnimationPlaying;
    if (this.combatController.playerSpriteRef && noPlayerAnim) {
      const tex = this.combatAssets.getPlayerTexture(now);
      if (tex) this.combatController.playerSpriteRef.texture = tex;
    }

    const enemies = state.enemies;
    for (let i = 0; i < this.combatController.enemySpriteRefs.length; i++) {
      const sprite = this.combatController.enemySpriteRefs[i];
      if (!sprite || !enemies[i]) continue;
      const e = enemies[i];
      const variant = this.combatController.enemyVariants[i];
      if (variant != null && (variant === 1 || variant === 2 || variant === 3)) {
        const dyingStart = this.combatController.enemyDyingStartMs[i];
        const hurtStart = this.combatController.enemyHurtStartMs[i];
        let tex: PIXI.Texture | null = null;
        if (e.hp <= 0) {
          tex = this.combatAssets.getEnemyAnimationTexture(variant as 1 | 2 | 3, 'dying', now, dyingStart ?? 0);
        } else if (hurtStart != null && now - hurtStart < ENEMY_ANIMATION_TIMING.hurtDurationMs) {
          tex = this.combatAssets.getEnemyAnimationTexture(variant as 1 | 2 | 3, 'hurt', now, hurtStart);
        } else {
          tex = this.combatAssets.getEnemyAnimationTexture(variant as 1 | 2 | 3, 'idle', now);
        }
        if (tex) sprite.texture = tex;
      }
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
    this.combatController.shieldAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playShieldAnimation().then(() => {
      this.combatController.shieldAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  /** Trigger exactly one player animation for the played card (priority: strike → block → summoning → growth → spell). */
  private triggerPlayerAnimationForCard(cardId: string): void {
    const state = this.bridge.getState();
    const isVM = state?.characterId === 'verdant_machinist';
    if (this.cardIsStrike(cardId)) {
      this.triggerShootingAnimationIfStrike(cardId);
      return;
    }
    if (this.cardHasBlockEffect(cardId)) {
      this.triggerShieldAnimationIfBlock(cardId);
      return;
    }
    if (isVM && this.cardHasSummonPlantEffect(cardId)) {
      this.triggerVMSummoningAnimationIfSummon(cardId);
      return;
    }
    if (isVM && this.cardHasGrowPlantEffect(cardId)) {
      this.triggerVMGrowSeedAnimationIfGrowth(cardId);
      return;
    }
    if (isVM && this.cardIsVMSpell(cardId)) {
      this.triggerVMSpellAnimationIfSpell(cardId);
    }
  }

  /** True if the card is the Strike card (triggers shooting animation). */
  private cardIsStrike(cardId: string): boolean {
    return cardId === 'strike';
  }

  /** True if the card has grow_plant effect (Verdant Machinist growth). */
  private cardHasGrowPlantEffect(cardId: string): boolean {
    const def = this.bridge.getCardDef(cardId);
    return def?.effects?.some((e) => e.type === 'grow_plant') ?? false;
  }

  /** True if the card has summon_plant effect (creates new seeds). */
  private cardHasSummonPlantEffect(cardId: string): boolean {
    const def = this.bridge.getCardDef(cardId);
    return def?.effects?.some((e) => e.type === 'summon_plant') ?? false;
  }

  /** Verdant Machinist cards that use the "spell" animation (damage/debuff, not strike). */
  private static readonly VM_SPELL_CARD_IDS = new Set([
    'thorn_jab', 'vine_lash', 'drain_tendril', 'root_slam', 'thorn_volley', 'spore_cloud', 'symbiotic_strike',
  ]);

  private cardIsVMSpell(cardId: string): boolean {
    return CombatCanvasComponent.VM_SPELL_CARD_IDS.has(cardId);
  }

  /** If the card is Strike, play shooting or chibi slashing animation on the player character. Pixi-only; no overlay change. */
  private triggerShootingAnimationIfStrike(cardId: string): void {
    if (!this.cardIsStrike(cardId)) return;
    const state = this.bridge.getState();
    const isChibi = state?.characterId === 'chibi';
    if (isChibi) {
      this.combatController.slashingAnimationPlaying = true;
      this.ensurePlayerAnimationTicker();
      this.redraw();
      this.combatAssets.playSlashingAnimation().then(() => {
        this.combatController.slashingAnimationPlaying = false;
        this.removePlayerAnimationTickerIfIdle();
        this.redraw();
      });
    } else {
      this.combatController.shootingAnimationPlaying = true;
      this.ensurePlayerAnimationTicker();
      this.redraw();
      this.combatAssets.playShootingAnimation().then(() => {
        this.combatController.shootingAnimationPlaying = false;
        this.removePlayerAnimationTickerIfIdle();
        this.redraw();
      });
    }
  }

  /** Verdant Machinist: play grow_seed animation for growth abilities. */
  private triggerVMGrowSeedAnimationIfGrowth(cardId: string): void {
    if (!this.cardHasGrowPlantEffect(cardId)) return;
    const state = this.bridge.getState();
    if (state?.characterId !== 'verdant_machinist') return;
    this.combatController.vmGrowSeedAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playVMGrowSeedAnimation().then(() => {
      this.combatController.vmGrowSeedAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  /** Verdant Machinist: play spell animation for VM spell cards. */
  private triggerVMSpellAnimationIfSpell(cardId: string): void {
    if (!this.cardIsVMSpell(cardId)) return;
    const state = this.bridge.getState();
    if (state?.characterId !== 'verdant_machinist') return;
    this.combatController.vmSpellAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playVMSpellAnimation().then(() => {
      this.combatController.vmSpellAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  /** Verdant Machinist: play summoning animation for cards that create new seeds. */
  private triggerVMSummoningAnimationIfSummon(cardId: string): void {
    if (!this.cardHasSummonPlantEffect(cardId)) return;
    const state = this.bridge.getState();
    if (state?.characterId !== 'verdant_machinist') return;
    this.combatController.vmSummoningAnimationPlaying = true;
    this.ensurePlayerAnimationTicker();
    this.redraw();
    this.combatAssets.playVMSummoningAnimation().then(() => {
      this.combatController.vmSummoningAnimationPlaying = false;
      this.removePlayerAnimationTickerIfIdle();
      this.redraw();
    });
  }

  private ensurePlayerAnimationTicker(): void {
    if (this.app && !this.shieldTicker) {
      const runShieldTickerOutsideZone = (): void => {
        const c = this.combatController;
        const anyPlaying =
          c.shieldAnimationPlaying || c.shootingAnimationPlaying || c.slashingAnimationPlaying ||
          c.vmGrowSeedAnimationPlaying || c.vmSpellAnimationPlaying || c.vmSummoningAnimationPlaying;
        if (anyPlaying) {
          this.combatAssets.getShieldAnimationDone();
          this.combatAssets.getShootingAnimationDone();
          this.combatAssets.getSlashingAnimationDone();
          this.combatAssets.getVMGrowSeedAnimationDone();
          this.combatAssets.getVMSpellAnimationDone();
          this.combatAssets.getVMSummoningAnimationDone();
          this.redraw();
        }
      };
      this.shieldTicker = () => this.zone.runOutsideAngular(runShieldTickerOutsideZone);
      this.zone.runOutsideAngular(() => this.app!.ticker.add(this.shieldTicker!));
    }
  }

  private removePlayerAnimationTickerIfIdle(): void {
    const c = this.combatController;
    if (c.shieldAnimationPlaying || c.shootingAnimationPlaying || c.slashingAnimationPlaying ||
        c.vmGrowSeedAnimationPlaying || c.vmSpellAnimationPlaying || c.vmSummoningAnimationPlaying) return;
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

  /** Hover: only highlight the card whose visual bounds contain the cursor. Use rest layout (no hover) for hit-test so the lifted card does not move its AABB and clear hover. Throttled to ~30fps. */
  private resolveHover(clientX: number, clientY: number): void {
    if (this._runPhase !== 'combat' || !this.app) return;
    const now = performance.now();
    if (now - this.lastResolveHoverTime < 32) return;
    this.lastResolveHoverTime = now;
    const state = this.bridge.getState();
    if (!state) return;
    const hand = state.hand;
    if (hand.length === 0) return;
    const { x: mouseX, y: mouseY } = this.clientToStage(clientX, clientY);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    // Use rest layout (hoveredIndex = null) for hit-test so cursor stays "over" the card after it lifts
    const layout = getHandLayout(hand.length, w, h, null, {
      handLayout: this.gameSettings.handLayout(),
      reducedMotion: this.gameSettings.reducedMotion(),
    });
    const cardWidth = COMBAT_LAYOUT.cardWidth;
    const cardHeight = COMBAT_LAYOUT.cardHeight;
    const cardCenterYOffset = cardHeight / 2;

    if (this.combatController.cardInteractionState === 'dragging' && this.combatController.cardInteractionCardIndex !== null) return;

    if (this.combatController.hoveredCardIndex != null && this.combatController.hoveredCardIndex < layout.positions.length) {
      const aabb = this.getCardAABB(layout.positions[this.combatController.hoveredCardIndex], cardWidth, cardHeight);
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
    if (newHover !== this.combatController.hoveredCardIndex) {
      if (newHover != null) {
        this.onCardPointerOver(newHover);
      } else {
        this.onCardPointerOut();
      }
    }
  }

  /** Card pointer over: set hover so focused lift/scale applies on hover (not only on click). */
  onCardPointerOver(handIndex: number): void {
    if (this._runPhase !== 'combat' || !this.app) return;
    const state = this.bridge.getState();
    if (!state) return;
    const hand = state.hand;
    if (hand.length === 0 || handIndex < 0 || handIndex >= hand.length) return;
    if (this.combatController.hoveredCardIndex === handIndex) return;

    this.combatController.hoveredCardIndex = handIndex;
    this.combatController.targetLerp = hand.map((_, i) => (i === handIndex ? 1 : 0));

    this.redraw();
    this.requestTemplateUpdate();
  }

  /** Card pointer out: clear hover so cards move back in place. */
  onCardPointerOut(): void {
    if (this._runPhase !== 'combat' || !this.app) return;
    const state = this.bridge.getState();
    if (!state) return;
    const hand = state.hand;
    if (hand.length === 0) {
      this.combatController.hoveredCardIndex = null;
      return;
    }
    if (this.combatController.hoveredCardIndex === null) return;

    this.combatController.hoveredCardIndex = null;
    // Animate cards back: set target to 0 and let the ticker smoothly lerp hoverLerp/spreadLerp
    this.combatController.targetLerp = hand.map(() => 0);

    this.redraw();
    this.requestTemplateUpdate();
  }

  /** Card pointer down: enter Pressed; Dragging after threshold; play or Returning on release. */
  onCardPointerDown(cardId: string, handIndex: number, stageX: number, stageY: number): void {
    this.clearDragListeners();
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;
    const cost = this.getCardCost(cardId);
    if (state.energy < cost) return;

    const needsEnemy = this.cardNeedsEnemyTarget(cardId);
    if (needsEnemy) {
      const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
      if (aliveCount === 0) return;
    }

    this.combatController.cardInteractionState = 'pressed';
    this.combatController.cardInteractionCardIndex = handIndex;
    this.combatController.cardInteractionCardId = cardId;
    this.combatController.pressStartX = stageX;
    this.combatController.pressStartY = stageY;
    this.redraw();
    this.requestTemplateUpdate();

    const onMove = (e: PointerEvent): void => {
      const { x, y } = this.clientToStage(e.clientX, e.clientY);
      if (this.combatController.cardInteractionState === 'pressed') {
        const dx = x - this.combatController.pressStartX;
        const dy = y - this.combatController.pressStartY;
        const threshold = COMBAT_LAYOUT.dragThreshold;
        if (Math.hypot(dx, dy) > threshold) {
          this.combatController.cardInteractionState = 'dragging';
        }
      }
      if (this.combatController.cardInteractionState === 'dragging') {
        this.combatController.dragScreenX = x;
        this.combatController.dragScreenY = y;
        if (this.app) {
          const stateNow = this.bridge.getState();
          if (stateNow?.enemies?.length) {
            const idx = getEnemyIndexAtPoint(x, y, stateNow.enemies.length, this.app.screen.width, this.app.screen.height);
            const newHover = idx != null && stateNow.enemies[idx].hp > 0 ? idx : null;
            if (this.combatController.hoveredEnemyIndex !== newHover) {
              this.combatController.hoveredEnemyIndex = newHover;
            }
          } else {
            this.combatController.hoveredEnemyIndex = null;
          }
        }
        this.redraw();
      }
    };

    const onUp = (e: PointerEvent): void => {
      const { x, y } = this.clientToStage(e.clientX, e.clientY);
      const currentCardId = this.combatController.cardInteractionCardId ?? cardId;
      const currentHandIndex = this.combatController.cardInteractionCardIndex ?? handIndex;
      const needsEnemyLocal = this.cardNeedsEnemyTarget(currentCardId);

      if (this.combatController.cardInteractionState === 'pressed') {
        this.combatController.cardInteractionState = 'idle';
        this.combatController.cardInteractionCardIndex = null;
        this.combatController.cardInteractionCardId = null;
        this.redraw();
        this.requestTemplateUpdate();
      } else if (this.combatController.cardInteractionState === 'dragging') {
        const stateNow = this.bridge.getState();
        let played = false;
        if (needsEnemyLocal) {
          const enemyIdx = this.combatController.hoveredEnemyIndex;
          if (stateNow && enemyIdx != null && enemyIdx < stateNow.enemies.length && stateNow.enemies[enemyIdx].hp > 0) {
            this.runCardFlyThenPlay(currentCardId, enemyIdx, stateNow);
            played = true;
          }
        } else if (stateNow && this.app) {
          const ratio = COMBAT_LAYOUT.nonTargetPlayLineRatio;
          const playLineY = this.app.screen.height * ratio;
          if (y < playLineY) {
            this.bridge.playCard(currentCardId, undefined, currentHandIndex);
            this.triggerPlayerAnimationForCard(currentCardId);
            played = true;
          }
        }

        if (played) {
          this.combatController.cardInteractionState = 'idle';
          this.combatController.cardInteractionCardIndex = null;
          this.combatController.cardInteractionCardId = null;
        } else {
          this.combatController.cardInteractionState = 'returning';
          if (this.app && currentHandIndex >= 0 && stateNow) {
            const layout = getHandLayout(stateNow.hand.length, this.app.screen.width, this.app.screen.height, currentHandIndex, {
              handLayout: this.gameSettings.handLayout(),
              reducedMotion: this.gameSettings.reducedMotion(),
            });
            const pos = layout.positions[currentHandIndex];
            if (pos) {
              this.combatController.returnStartX = pos.x + (pos.spreadOffsetX ?? 0);
              this.combatController.returnStartY = pos.y;
            } else {
              this.combatController.returnStartX = this.combatController.dragScreenX ?? 0;
              this.combatController.returnStartY = this.combatController.dragScreenY ?? 0;
            }
          } else {
            this.combatController.returnStartX = this.combatController.dragScreenX ?? 0;
            this.combatController.returnStartY = this.combatController.dragScreenY ?? 0;
          }
          this.combatController.returnStartTime = performance.now();
          this.combatController.returnProgress = 0;
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
    this.combatController.cardInteractionState = 'idle';
    this.combatController.cardInteractionCardIndex = null;
    this.combatController.cardInteractionCardId = null;
    this.combatController.hoveredEnemyIndex = null;
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
    const selIdx = this.combatController.cardInteractionCardIndex != null && this.combatController.cardInteractionCardIndex < state.hand.length
      ? this.combatController.cardInteractionCardIndex
      : state.hand.indexOf(cardId);
    const handIndexForPlay = this.combatController.cardInteractionCardIndex ?? selIdx;
    if (dragStart) {
      fromX = dragStart.x;
      fromY = dragStart.y;
    } else if (selIdx >= 0) {
      const layout = getHandLayout(state.hand.length, w, h, null, {
        handLayout: this.gameSettings.handLayout(),
        reducedMotion: this.gameSettings.reducedMotion(),
      });
      const pos = layout.positions[selIdx];
      fromX = pos.x + (pos.spreadOffsetX ?? 0);
      fromY = pos.y - layout.hoverLift;
    } else {
      this.bridge.playCard(cardId, enemyIndex, handIndexForPlay >= 0 ? handIndexForPlay : undefined);
      this.triggerPlayerAnimationForCard(cardId);
      this.combatController.cardInteractionState = 'idle';
      this.combatController.cardInteractionCardIndex = null;
      this.combatController.cardInteractionCardId = null;
      this.combatController.hoveredEnemyIndex = null;
      this.redraw();
      this.requestTemplateUpdate();
      return;
    }
    const toX = toCenter.x;
    const toY = toCenter.y;

    const flyCard = buildCardVisualsContainer({
      cardId,
      cardWidth,
      cardHeight,
      getCardCost: (id) => this.getCardCost(id),
      getCardName: (id) => this.getCardName(id),
      getCardEffectDescription: (id) => this.getCardEffectDescriptionText(id),
      getCardArtTexture: (id) => this.combatAssets.getCardArtTexture(id),
      textScale: this.gameSettings.textScale(),
    });
    flyCard.pivot.set(cardWidth / 2, cardHeight);
    flyCard.x = fromX;
    flyCard.y = fromY;
    this.app.stage.addChild(flyCard);

    const speedMult = this.gameSettings.animationSpeedMultiplier();
    const duration = this.gameSettings.reducedMotion()
      ? 0
      : Math.max(120, 280 / speedMult); // ms; clamp so it never gets too fast
    const startTime = performance.now();
    const completePlay = (): void => {
      this.app!.ticker.remove(tick);
      if (flyCard.parent) flyCard.destroy({ children: true });
      const oldState = state;
      this.bridge.playCard(cardId, enemyIndex, handIndexForPlay >= 0 ? handIndexForPlay : undefined);
      this.triggerPlayerAnimationForCard(cardId);
      this.sound.playCardPlay();
      const vfxId = this.cardVfx.getVfxIdForCard(cardId);
      if (vfxId && this.gameSettings.vfxIntensity() !== 'off' && this.cardVfx.getVfxFrames(vfxId).length > 0) {
        this.combatController.activeCardVfx.push({ vfxId, x: toX, y: toY, startTime: performance.now() });
      }
      const newState = this.bridge.getState()!;
      this.combatController.cardInteractionState = 'idle';
      this.combatController.cardInteractionCardIndex = null;
      this.combatController.cardInteractionCardId = null;
      this.combatController.hoveredEnemyIndex = null;
      const now = performance.now();
      const toAdd: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number; addedAt: number }[] = [];
      if (oldState.enemies[enemyIndex] && newState.enemies[enemyIndex]) {
        const hpLost = oldState.enemies[enemyIndex].hp - newState.enemies[enemyIndex].hp;
        if (hpLost > 0) {
          toAdd.push({ type: 'damage', value: hpLost, x: toX, y: toY, enemyIndex, addedAt: now });
          this.sound.playHit();
          this.combatController.enemyHurtStartMs[enemyIndex] = now;
          if (newState.enemies[enemyIndex].hp <= 0) {
            this.combatController.enemyDyingStartMs[enemyIndex] = now;
          }
        }
      }
      const blockGain = newState.playerBlock - oldState.playerBlock;
      if (blockGain > 0) {
        const playerCenter = getPlayerCenter(w, h);
        toAdd.push({ type: 'block', value: blockGain, x: playerCenter.x, y: playerCenter.y, addedAt: now + (toAdd.length > 0 ? 80 : 0) });
        this.sound.playBlock();
      }
      this.combatController.floatingNumbers = [...this.combatController.floatingNumbers, ...toAdd];
      this.redraw();
      this.requestTemplateUpdate();
      if (toAdd.length > 0) {
        const delay = this.gameSettings.reducedMotion() ? 50 : COMBAT_TIMING.redrawAfterFloatMs;
        setTimeout(() => this.redraw(), delay);
      }
    };

    const tick = () => {
      if (!flyCard.parent) {
        completePlay();
        return;
      }
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = 1 - (1 - t) * (1 - t); // ease-out
      flyCard.x = fromX + (toX - fromX) * ease;
      flyCard.y = fromY + (toY - fromY) * ease;
      if (t >= 1) completePlay();
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
    this.combatController.showingEnemyTurn = true;
    this.redraw();
    this.requestTemplateUpdate();
    setTimeout(() => {
      this.sound.playTurnStart();
      this.bridge.endTurn();
      this.combatController.showingEnemyTurn = false;
      this.redraw();
      this.requestTemplateUpdate();
    }, COMBAT_TIMING.enemyTurnBannerDelayMs);
  }

  onRestart(): void {
    this.bridge.startRun(this.bridge.getCurrentCharacterId() ?? 'gungirl');
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

  /** URL for card art image (overlay panels). Uses /assets/cards/{cardId}.png. */
  getCardArtUrl(cardId: string): string {
    return `/assets/cards/${encodeURIComponent(cardId)}.png`;
  }

  /** Short effect description only (for overlay card list). */
  getCardEffectDescriptionText(cardId: string): string {
    return getCardEffectDescription(cardId, (cid) => this.bridge.getCardDef(cid));
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

  getRunSeed(): number | undefined {
    return this.bridge.getRunSeed();
  }

  getDrawCount(): number {
    return this.bridge.getState()?.deck?.length ?? 0;
  }

  getDiscardCount(): number {
    return this.bridge.getState()?.discard?.length ?? 0;
  }

  getTopDrawCardId(): string | null {
    const deck = this.bridge.getState()?.deck;
    return deck?.length ? deck[0] ?? null : null;
  }

  getPotionName(potionId: string): string {
    return this.bridge.getPotionDef(potionId)?.name ?? potionId;
  }

  /** URL for potion icon (header). Uses iconPath from def if set, else /assets/potions/{id}.png. */
  getPotionIconUrl(potionId: string): string {
    const def = this.bridge.getPotionDef(potionId);
    if (def?.iconPath) {
      return def.iconPath.startsWith('/') ? def.iconPath : `/assets/${def.iconPath}`;
    }
    return `/assets/potions/${encodeURIComponent(potionId)}.png`;
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

}
