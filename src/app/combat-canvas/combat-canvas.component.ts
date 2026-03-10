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
import { GameBridgeService } from '../services/game-bridge.service';
import { MapAssetsService } from '../services/map-assets.service';
import type { GameState, RunPhase, MapNodeType } from '../../engine/types';
import type { CardDef, CardEffect } from '../../engine/cardDef';
import * as PIXI from 'pixi.js';

@Component({
  selector: 'app-combat-canvas',
  standalone: true,
  template: `
    <div class="canvas-wrap" [class.map-mode]="runPhase() === 'map'">
      <div #scrollArea class="scroll-area">
        <div class="game-view-inner" [style.height]="(runPhase() === 'map' && mapContentHeight) ? (mapContentHeight + 'px') : '100%'">
          <div #canvasHost class="pixi-host"></div>
        </div>
      </div>
      <div class="overlay-actions">
        @if (runPhase() === 'combat') {
          @if (selectedCardId) {
            <button type="button" class="btn-cancel-target" (click)="cancelTargeting()">Cancel target</button>
          }
          <button type="button" class="btn-end" (click)="onEndTurn()" [disabled]="!canEndTurn()">
            End turn
          </button>
          @if (combatResult()) {
            <div class="result" [class.win]="combatResult() === 'win'" [class.lose]="combatResult() === 'lose'">
              {{ combatResult() === 'win' ? 'You win!' : 'Defeat' }}
            </div>
            <button type="button" class="btn-restart" (click)="onRestart()">Restart</button>
          }
        }
      </div>
      @if (runPhase() === 'reward') {
        <div class="reward-panel">
          <div class="reward-title">Choose your reward</div>
          <div class="reward-cards">
            @for (cardId of rewardChoices(); track cardId) {
              <button type="button" class="reward-card" (click)="onChooseReward(cardId)">
                {{ getCardName(cardId) }}
              </button>
            }
          </div>
        </div>
      }
      @if (runPhase() === 'rest') {
        <div class="rest-panel">
          <div class="rest-title">Rest site</div>
          <div class="rest-actions">
            <button type="button" class="btn-rest" (click)="onRestHeal()">Heal</button>
          </div>
          <div class="rest-subtitle">Remove a card from your deck:</div>
          <div class="rest-cards">
            @for (cardId of restRemovableCards(); track cardId) {
              <button
                type="button"
                class="btn-rest-card"
                (click)="onRestRemoveCard(cardId)"
              >
                {{ getCardName(cardId) }}
              </button>
            }
          </div>
        </div>
      }
      @if (steamWarning()) {
        <div class="steam-warning">{{ steamWarning() }}</div>
      }
      @if (showPauseMenu) {
        <div class="quit-backdrop" (click)="closePauseMenu()"></div>
        <div class="quit-modal pause-modal">
          @if (!showPauseSettings) {
            <div class="quit-title">Menu</div>
            <div class="pause-actions">
              <button type="button" class="btn-quit btn-pause" (click)="onPauseContinue()">Continue</button>
              <button type="button" class="btn-quit btn-pause" (click)="openPauseSettings()">Settings</button>
              <button type="button" class="btn-quit btn-pause" (click)="confirmQuitToMenu()">Main menu</button>
              @if (isElectron()) {
                <button type="button" class="btn-quit btn-pause btn-pause-exit" (click)="onExitGame()">Exit game</button>
              }
            </div>
          } @else {
            <div class="quit-title">Settings</div>
            @if (isElectron()) {
              <div class="pause-settings-section">
                <div class="pause-settings-label">Display</div>
                <div class="pause-settings-options">
                  <button type="button" class="btn-quit btn-pause" [class.active]="pauseFullscreen" (click)="setPauseFullScreen(true)">Fullscreen</button>
                  <button type="button" class="btn-quit btn-pause" [class.active]="!pauseFullscreen" (click)="setPauseFullScreen(false)">Windowed</button>
                </div>
              </div>
              <div class="pause-settings-section">
                <div class="pause-settings-label">Resolution</div>
                <div class="pause-settings-options">
                  <button type="button" class="btn-quit btn-pause" (click)="setPauseResolution(1920, 1080)">1920 × 1080</button>
                  <button type="button" class="btn-quit btn-pause" (click)="setPauseResolution(1600, 900)">1600 × 900</button>
                  <button type="button" class="btn-quit btn-pause" (click)="setPauseResolution(1280, 720)">1280 × 720</button>
                </div>
              </div>
            }
            <button type="button" class="btn-quit btn-pause btn-pause-back" (click)="closePauseSettings()">Back</button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      .canvas-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 0;
        background: #1a1a2e;
        display: flex;
        flex-direction: column;
      }
      .canvas-wrap.map-mode .scroll-area {
        flex: 1 1 0;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .canvas-wrap.map-mode .scroll-area::-webkit-scrollbar {
        display: none;
      }
      .scroll-area {
        flex: 1 1 0;
        min-height: 0;
        position: relative;
        overflow: hidden;
      }
      .game-view-inner {
        position: relative;
        width: 100%;
        height: 100%;
        z-index: 0;
      }
      .pixi-host {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: #1a1a2e;
        z-index: 0;
      }
      .pixi-host canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .overlay-actions {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        align-items: center;
        z-index: 1000;
        pointer-events: auto;
      }
      .btn-end, .btn-restart {
        position: relative;
        padding: 12px 24px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        color: #fff;
        border: none;
        border-radius: 10px;
        background: linear-gradient(180deg, #5a4a9e 0%, #3d3270 50%, #2d2555 100%);
        box-shadow:
          0 4px 0 #1e1838,
          0 6px 20px rgba(0, 0, 0, 0.45),
          0 0 16px rgba(120, 80, 200, 0.25),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }
      .btn-end:disabled, .btn-restart:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      .btn-end:hover:not(:disabled), .btn-restart:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        box-shadow:
          0 6px 0 #1e1838,
          0 10px 28px rgba(0, 0, 0, 0.5),
          0 0 28px rgba(150, 110, 255, 0.45),
          inset 0 1px 0 rgba(255, 255, 255, 0.25);
        filter: brightness(1.08);
      }
      .btn-end:active:not(:disabled), .btn-restart:active:not(:disabled) {
        transform: translateY(1px) scale(0.99);
        box-shadow:
          0 2px 0 #1e1838,
          0 2px 8px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .btn-cancel-target {
        position: relative;
        padding: 10px 20px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        color: #1a1a2e;
        border: none;
        border-radius: 10px;
        background: linear-gradient(180deg, #c9a227 0%, #9a7b1a 50%, #7a6015 100%);
        box-shadow: 0 4px 0 #4a3a0a, 0 6px 16px rgba(0, 0, 0, 0.35);
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.3);
        margin-right: 12px;
      }
      .btn-cancel-target:hover {
        transform: translateY(-2px) scale(1.02);
        filter: brightness(1.1);
      }
      .btn-cancel-target:active {
        transform: translateY(1px) scale(0.99);
      }
      .result {
        font-size: 1.35rem;
        font-weight: 700;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
      }
      .result.win { color: #8f8; }
      .result.lose { color: #f88; }
      .reward-panel, .rest-panel {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 50;
        background: rgba(12, 10, 24, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 20px 24px;
        border-radius: 14px;
        border: 1px solid rgba(180, 140, 255, 0.3);
        box-shadow:
          0 0 32px rgba(80, 50, 140, 0.35),
          0 12px 40px rgba(0, 0, 0, 0.6),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        color: #eee;
        min-width: 280px;
      }
      .reward-title, .rest-title {
        font-size: 1.15rem;
        font-weight: 700;
        margin-bottom: 14px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }
      .reward-cards {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }
      .reward-card {
        padding: 12px 18px;
        font-weight: 600;
        background: linear-gradient(180deg, #3d3560 0%, #2a2345 100%);
        border-radius: 10px;
        border: none;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 4px 0 #1a1630, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }
      .reward-card:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 6px 0 #1a1630, 0 8px 20px rgba(0, 0, 0, 0.45), 0 0 20px rgba(140, 100, 220, 0.3);
        filter: brightness(1.1);
      }
      .reward-card:active {
        transform: translateY(1px) scale(0.98);
        box-shadow: 0 2px 0 #1a1630, 0 2px 8px rgba(0, 0, 0, 0.4);
      }
      .rest-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .btn-rest {
        padding: 12px 20px;
        font-weight: 600;
        background: linear-gradient(180deg, #5a4a9e 0%, #3d3270 100%);
        border-radius: 10px;
        border: none;
        color: #fff;
        cursor: pointer;
        box-shadow: 0 4px 0 #1e1838, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }
      .btn-rest:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 6px 0 #1e1838, 0 8px 20px rgba(0, 0, 0, 0.45), 0 0 20px rgba(150, 110, 255, 0.35);
        filter: brightness(1.08);
      }
      .btn-rest:active {
        transform: translateY(1px) scale(0.99);
        box-shadow: 0 2px 0 #1e1838, 0 2px 8px rgba(0, 0, 0, 0.4);
      }
      .rest-subtitle {
        margin-top: 14px;
        margin-bottom: 8px;
        text-align: center;
        font-size: 0.9rem;
        color: #ccc;
      }
      .rest-cards {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
      }
      .btn-rest-card {
        padding: 10px 14px;
        font-weight: 500;
        background: linear-gradient(180deg, #3d3560 0%, #2a2345 100%);
        border-radius: 8px;
        border: none;
        color: #fff;
        cursor: pointer;
        font-size: 0.85rem;
        box-shadow: 0 3px 0 #1a1630, 0 3px 10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: transform 0.12s ease, box-shadow 0.15s ease, filter 0.15s ease;
      }
      .btn-rest-card:hover {
        transform: translateY(-1px) scale(1.02);
        box-shadow: 0 4px 0 #1a1630, 0 6px 16px rgba(0, 0, 0, 0.4), 0 0 14px rgba(120, 80, 200, 0.25);
        filter: brightness(1.08);
      }
      .btn-rest-card:active {
        transform: translateY(0) scale(0.98);
        box-shadow: 0 1px 0 #1a1630, 0 2px 6px rgba(0, 0, 0, 0.35);
      }
      .steam-warning {
        position: absolute;
        top: 8px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 12px;
        background: rgba(200, 150, 0, 0.9);
        color: #111;
        border-radius: 4px;
        font-size: 12px;
        z-index: 100;
      }
      .quit-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000;
      }
      .quit-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(12, 10, 24, 0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        padding: 22px 28px;
        border-radius: 14px;
        border: 1px solid rgba(180, 140, 255, 0.3);
        box-shadow:
          0 0 32px rgba(80, 50, 140, 0.35),
          0 12px 40px rgba(0, 0, 0, 0.65);
        color: #eee;
        min-width: 280px;
        z-index: 1001;
      }
      .quit-title {
        font-size: 1.2rem;
        font-weight: 600;
        margin-bottom: 1.25rem;
      }
      .pause-actions {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        min-width: 200px;
      }
      .pause-modal .quit-title {
        text-align: center;
      }
      .btn-quit, .btn-pause {
        padding: 10px 22px;
        font-size: 1rem;
        font-weight: 600;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      }
      .btn-pause {
        width: 100%;
        background: linear-gradient(180deg, #3d3560 0%, #2a2345 100%);
        box-shadow: 0 4px 0 #1a1630, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      }
      .btn-pause:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 6px 0 #1a1630, 0 8px 20px rgba(0, 0, 0, 0.45), 0 0 20px rgba(120, 80, 200, 0.3);
        filter: brightness(1.08);
      }
      .btn-pause.active {
        background: linear-gradient(180deg, #5a4a9e 0%, #3d3270 100%);
        box-shadow: 0 0 16px rgba(120, 80, 200, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .btn-pause-exit {
        background: linear-gradient(180deg, #6a3a3a 0%, #4a2525 100%);
        box-shadow: 0 4px 0 #2a1515, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .btn-pause-exit:hover {
        box-shadow: 0 6px 0 #2a1515, 0 8px 20px rgba(0, 0, 0, 0.45), 0 0 20px rgba(180, 80, 80, 0.25);
      }
      .btn-pause-back {
        margin-top: 1rem;
        width: 100%;
      }
      .btn-pause:active {
        transform: translateY(1px) scale(0.99);
      }
      .pause-settings-section {
        margin-bottom: 1rem;
      }
      .pause-settings-label {
        font-size: 0.75rem;
        color: #aaa;
        margin-bottom: 0.4rem;
      }
      .pause-settings-options {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
    `,
  ],
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
  /** B9: Floating numbers to show (damage/block) with screen position. */
  private floatingNumbers: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number }[] = [];
  /** B11: When true, show "Enemy turn" banner before resolving enemy phase. */
  private showingEnemyTurn = false;
  private _steamWarning = '';
  private _combatResult: GameState['combatResult'] = null;
  private _runPhase: RunPhase | undefined = undefined;
  private resizeObserver: ResizeObserver | null = null;
  /** When in map phase, total height of map content (px) for scroll. */
  mapContentHeight = 0;
  showPauseMenu = false;
  showPauseSettings = false;
  pauseFullscreen = true;

  constructor(
    private bridge: GameBridgeService,
    private mapAssets: MapAssetsService,
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
    if (typeof window !== 'undefined' && (window as unknown as { electronAPI?: { onSteamWarning?: (cb: (m: string) => void) => void } }).electronAPI?.onSteamWarning) {
      (window as unknown as { electronAPI: { onSteamWarning: (cb: (m: string) => void) => void } }).electronAPI.onSteamWarning((msg) => {
        this._steamWarning = msg;
        this.cdr.markForCheck();
      });
    }
    this.initPixi();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.app?.destroy(true, { children: true, texture: false });
    this.app = null;
  }

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
    this.redraw();
    if (this._runPhase === 'map') {
      this.mapAssets.loadMapAssets().then(() => {
        requestAnimationFrame(() => this.redraw());
      });
    }
  }

  private redraw(): void {
    const state = this.bridge.getState();
    if (!state || !this.app) return;
    this._combatResult = state.combatResult;
    this._runPhase = this.bridge.getRunPhase();

    const stage = this.app.stage;
    stage.removeChildren();

    const padding = 20;
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    // If we're on the map, render vertical layered map (bottom → top) and return.
    if (this._runPhase === 'map' && state.map) {
      this.drawMapView(state, stage, w, h, padding);
      this.cdr.markForCheck();
      return;
    }

    // Combat layout: player left, enemies right; both in bottom 40% of height
    const playerZoneX = w * 0.18;
    const enemyZoneStart = w * 0.52;
    const baselineBottom = h * 0.6;
    const playerY = h - 28;
    const playerPlaceholderW = 100;
    const playerPlaceholderH = 130;
    const enemyPlaceholderW = 100;
    const enemyPlaceholderH = 110;
    const enemyGap = 28;

    // Player character placeholder (left), in bottom 40%
    const playerContainer = new PIXI.Container();
    playerContainer.x = playerZoneX - playerPlaceholderW / 2;
    playerContainer.y = baselineBottom - playerPlaceholderH;
    const playerBody = new PIXI.Graphics();
    playerBody.roundRect(20, 44, 60, 72, 8).fill({ color: 0x3a4a6a }).stroke({ width: 2, color: 0x5a6a8a });
    playerContainer.addChild(playerBody);
    const playerHead = new PIXI.Graphics();
    playerHead.circle(50, 28, 22).fill({ color: 0x4a5a7a }).stroke({ width: 2, color: 0x6a7a9a });
    playerContainer.addChild(playerHead);
    const showBlockFlash = this.floatingNumbers.some((f) => f.type === 'block');
    if (showBlockFlash) {
      const blockOverlay = new PIXI.Graphics();
      blockOverlay.roundRect(0, 0, playerPlaceholderW, playerPlaceholderH, 10).fill({ color: 0x44ff88, alpha: 0.3 });
      playerContainer.addChild(blockOverlay);
    }
    stage.addChild(playerContainer);

    const hpText = new PIXI.Text({
      text: `HP: ${state.playerHp}/${state.playerMaxHp}  Block: ${state.playerBlock}  Energy: ${state.energy}/${state.maxEnergy}`,
      style: { fontFamily: 'system-ui', fontSize: 18, fill: 0xeeeeee },
    });
    hpText.x = padding;
    hpText.y = playerY;
    stage.addChild(hpText);

    // Hand: arc + overlap + pivot, card visuals, hover lift, unplayable dim
    const hand = state.hand;
    if (this.hoveredCardIndex != null && this.hoveredCardIndex >= hand.length) this.hoveredCardIndex = null;
    const cardWidth = 100;
    const cardHeight = 140;
    const overlapRatio = 0.45;
    const arcAmplitude = 30;
    const cardRotationRad = 0.03;
    const cardSpacing = cardWidth * overlapRatio;
    const totalHandWidth = (hand.length - 1) * cardSpacing + cardWidth;
    const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
    const handY = playerY - cardHeight - 20;
    const center = (hand.length - 1) / 2;
    const hoverLift = 20;
    const hoverScale = 1.08;

    const handContainer = new PIXI.Container();
    handContainer.sortableChildren = true;
    this.cardSprites.clear();

    for (let i = 0; i < hand.length; i++) {
      const cardId = hand[i];
      const cost = this.getCardCost(cardId);
      const playable = state.energy >= cost;
      const isHovered = this.hoveredCardIndex === i;
      const isSelected = this.selectedCardId === cardId;
      const applyHover = (isHovered && playable) || isSelected;

      const arcNorm = hand.length > 1 ? (i - center) / (hand.length - 1) : 0;
      const baseY = handY + arcAmplitude * (1 - 4 * arcNorm * arcNorm);
      const rot = (i - center) * cardRotationRad;
      const cardX = startX + i * cardSpacing;
      const cardY = baseY - (applyHover ? hoverLift : 0);

      const container = new PIXI.Container();
      container.sortableChildren = true;

      const shadowOffset = 4;
      const shadow = new PIXI.Graphics();
      shadow.roundRect(shadowOffset, shadowOffset, cardWidth, cardHeight, 10)
        .fill({ color: 0x000000, alpha: applyHover ? 0.35 : 0.18 });
      container.addChild(shadow);

      const borderColor = isSelected ? 0xe8c060 : playable ? 0x6a6a8a : 0x4a4a5a;
      const bg = new PIXI.Graphics();
      bg.roundRect(0, 0, cardWidth, cardHeight, 10)
        .fill({ color: 0x2a2a4a })
        .stroke({ width: 2, color: borderColor });
      container.addChild(bg);

      const costRadius = 12;
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

      const name = this.getCardName(cardId);
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

      const effectDesc = this.getCardEffectDescription(cardId);
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
      container.scale.set(applyHover ? hoverScale : 1);
      container.zIndex = applyHover ? 100 : i;
      if (!playable) container.alpha = 0.6;

      container.eventMode = 'static';
      container.cursor = playable ? 'pointer' : 'not-allowed';
      const idx = i;
      container.on('pointerover', () => {
        this.hoveredCardIndex = idx;
        this.redraw();
      });
      container.on('pointerout', () => {
        this.hoveredCardIndex = null;
        this.redraw();
      });
      container.on('pointerdown', () => this.onCardClick(cardId, idx));

      handContainer.addChild(container);
      this.cardSprites.set(`${cardId}-${idx}`, container);
    }

    // Enemies (bottom right): same baseline as player, in bottom 40%
    const targetingMode = this.selectedCardId != null;
    const enemyStartY = baselineBottom - enemyPlaceholderH;
    const enemies = state.enemies;
    const totalEnemyWidth = enemies.length * enemyPlaceholderW + (enemies.length - 1) * enemyGap;
    const ex = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const isAlive = e.hp > 0;
      const isValidTarget = targetingMode && isAlive;
      const isHoveredEnemy = targetingMode && this.hoveredEnemyIndex === i && isAlive;
      const container = new PIXI.Container();
      const placeholder = new PIXI.Graphics();
      placeholder.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, 10)
        .fill({ color: 0x4a3030 })
        .stroke({ width: isValidTarget ? 4 : 2, color: isHoveredEnemy ? 0xffcc44 : isValidTarget ? 0xcc8866 : 0x8a4a4a });
      container.addChild(placeholder);
      if (isValidTarget) {
        const highlight = new PIXI.Graphics();
        highlight.roundRect(-3, -3, enemyPlaceholderW + 6, enemyPlaceholderH + 6, 12)
          .stroke({ width: isHoveredEnemy ? 3 : 2, color: isHoveredEnemy ? 0xffdd66 : 0xe8c060, alpha: 0.9 });
        container.addChild(highlight);
      }
      const wasJustHit = this.floatingNumbers.some((f) => f.type === 'damage' && f.enemyIndex === i);
      const baseEnemyX = ex + i * (enemyPlaceholderW + enemyGap) - enemyPlaceholderW / 2;
      const baseEnemyY = enemyStartY;
      if (wasJustHit) {
        const hitOverlay = new PIXI.Graphics();
        hitOverlay.roundRect(0, 0, enemyPlaceholderW, enemyPlaceholderH, 10).fill({ color: 0xff4444, alpha: 0.35 });
        container.addChild(hitOverlay);
      }
      if (isHoveredEnemy) {
        container.scale.set(1.05);
        container.pivot.set(enemyPlaceholderW / 2, enemyPlaceholderH / 2);
        container.x = baseEnemyX + enemyPlaceholderW / 2;
        container.y = baseEnemyY + enemyPlaceholderH / 2;
      } else {
        container.x = baseEnemyX;
        container.y = baseEnemyY;
      }
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
      const intentStr = e.intent ? `${e.intent.type} ${e.intent.value}` : '?';
      const intentT = new PIXI.Text({
        text: intentStr,
        style: { fontFamily: 'system-ui', fontSize: 10, fill: 0xffaa00 },
      });
      intentT.x = 8;
      intentT.y = 46;
      container.addChild(intentT);
      if (isValidTarget) {
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.hitArea = new PIXI.Rectangle(0, 0, enemyPlaceholderW, enemyPlaceholderH);
        const idx = i;
        container.on('pointerover', () => {
          this.hoveredEnemyIndex = idx;
          this.redraw();
        });
        container.on('pointerout', () => {
          this.hoveredEnemyIndex = null;
          this.redraw();
        });
        container.on('pointerdown', () => this.onEnemyTargetClick(idx));
      }
      stage.addChild(container);
    }

    // B5: Arrow from selected card to hovered enemy (targeting mode)
    if (targetingMode && this.hoveredEnemyIndex != null && this.hoveredEnemyIndex < enemies.length && enemies[this.hoveredEnemyIndex].hp > 0) {
      const selIdx = hand.indexOf(this.selectedCardId!);
      if (selIdx >= 0) {
        const arcN = hand.length > 1 ? (selIdx - center) / (hand.length - 1) : 0;
        const fromX = startX + selIdx * cardSpacing;
        const fromY = handY + arcAmplitude * (1 - 4 * arcN * arcN) - hoverLift;
        const toX = ex + this.hoveredEnemyIndex * (enemyPlaceholderW + enemyGap);
        const toY = enemyStartY + enemyPlaceholderH / 2;
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
    }

    stage.addChild(handContainer);

    for (const fn of this.floatingNumbers) {
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

    if (this.showingEnemyTurn) {
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

    this.cdr.markForCheck();
  }

  /** Convex hull (Graham scan), CCW order. */
  private convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
    if (points.length < 3) return [...points];
    const idx = points.reduce((min, p, i) => {
      const q = points[min];
      return p.y < q.y || (p.y === q.y && p.x < q.x) ? i : min;
    }, 0);
    const pivot = points[idx];
    const rest = points.filter((_, i) => i !== idx);
    rest.sort((a, b) => {
      const ax = a.x - pivot.x;
      const ay = a.y - pivot.y;
      const bx = b.x - pivot.x;
      const by = b.y - pivot.y;
      const cross = ax * by - ay * bx;
      if (cross !== 0) return cross > 0 ? 1 : -1;
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    });
    const hull: { x: number; y: number }[] = [pivot];
    for (const p of rest) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2];
        const b = hull[hull.length - 1];
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (cross <= 0) hull.pop();
        else break;
      }
      hull.push(p);
    }
    return hull;
  }

  /** Expand polygon outward by distance (CCW vertices). */
  private expandPolygon(poly: { x: number; y: number }[], distance: number): { x: number; y: number }[] {
    const n = poly.length;
    if (n < 3) return poly;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const prev = poly[(i - 1 + n) % n];
      const curr = poly[i];
      const next = poly[(i + 1) % n];
      const e1x = curr.x - prev.x;
      const e1y = curr.y - prev.y;
      const e2x = next.x - curr.x;
      const e2y = next.y - curr.y;
      const n1x = -e1y;
      const n1y = e1x;
      const n2x = -e2y;
      const n2y = e2x;
      const l1 = Math.hypot(n1x, n1y) || 1;
      const l2 = Math.hypot(n2x, n2y) || 1;
      const bx = n1x / l1 + n2x / l2;
      const by = n1y / l1 + n2y / l2;
      const bl = Math.hypot(bx, by) || 1;
      const scale = distance / bl;
      out.push({ x: curr.x + bx * scale, y: curr.y + by * scale });
    }
    return out;
  }

  private drawMapView(
    state: GameState,
    stage: PIXI.Container,
    w: number,
    h: number,
    padding: number
  ): void {
    const map = state.map!;
    const nodes = map.nodes;
    const edges = map.edges;
    const availableNext = this.bridge.getAvailableNextNodes();
    const NODE_RADIUS = 20;
    const FLOOR_SPACING = 240;
    const laneCount = 7;

    // Use floor from nodes when present, else compute level from graph
    const floorById = new Map<string, number>();
    const hasFloor = nodes.length > 0 && typeof (nodes[0] as { floor?: number }).floor === 'number';
    if (hasFloor) {
      nodes.forEach((n) => floorById.set(n.id, (n as { floor: number }).floor));
    } else {
      const hasIncoming = new Set<string>();
      edges.forEach(([, to]) => hasIncoming.add(to));
      const queue: { id: string; level: number }[] = [];
      nodes.forEach((n) => { if (!hasIncoming.has(n.id)) queue.push({ id: n.id, level: 0 }); });
      if (queue.length === 0 && nodes.length) queue.push({ id: nodes[0].id, level: 0 });
      while (queue.length) {
        const { id, level } = queue.shift()!;
        if (floorById.has(id)) continue;
        floorById.set(id, level);
        edges.forEach(([from, to]) => { if (from === id) queue.push({ id: to, level: level + 1 }); });
      }
    }

    const maxFloor = Math.max(0, ...Array.from(floorById.values()));
    const BOTTOM_MARGIN = 130;
    this.mapContentHeight = (maxFloor + 1) * FLOOR_SPACING + padding * 2 + BOTTOM_MARGIN;
    this.cdr.markForCheck();
    setTimeout(() => {
      const el = this.scrollAreaRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 120);

    const floors: string[][] = [];
    nodes.forEach((n) => {
      const f = floorById.get(n.id) ?? 0;
      if (!floors[f]) floors[f] = [];
      floors[f].push(n.id);
    });

    const totalMapHeight = (maxFloor + 2) * FLOOR_SPACING;
    const contentBottomPadding = 60;
    /** Deterministic jitter from node id + floor so layout is less rigid but stable. Returns -1..1. */
    const jitterFrom = (nodeId: string, floor: number, seed: number) => {
      let h = seed;
      for (let i = 0; i < nodeId.length; i++) h = (h * 31 + nodeId.charCodeAt(i)) | 0;
      h = (h + floor * 17) | 0;
      return ((h >>> 0) % 2000) / 1000 - 1;
    };
    const JITTER_X = 28;
    const JITTER_Y = 16;
    const posById = new Map<string, { x: number; y: number }>();
    for (let f = 0; f <= maxFloor; f++) {
      const ids = floors[f] ?? [];
      if (!ids.length) continue;
      const baseY = contentBottomPadding + totalMapHeight - (f + 1) * FLOOR_SPACING;
      const gapX = Math.min(140, (w - padding * 2) / Math.max(1, ids.length));
      const rowWidth = (ids.length - 1) * gapX;
      const centerX = w / 2;
      for (let i = 0; i < ids.length; i++) {
        const nodeId = ids[i];
        const n = nodes.find((x) => x.id === nodeId);
        const lane = (n && (n as { lane?: number }).lane != null) ? (n as { lane: number }).lane : i;
        const laneJitter = (lane / laneCount - 0.5) * 28;
        const baseX = centerX - rowWidth / 2 + i * gapX + laneJitter;
        const x = baseX + jitterFrom(nodeId, f, 1) * JITTER_X;
        const y = baseY + jitterFrom(nodeId, f, 2) * JITTER_Y;
        posById.set(nodeId, { x, y });
      }
    }
    for (const n of nodes) {
      if (n.type === 'boss' && (n as { floor: number }).floor === maxFloor + 1) {
        posById.set(n.id, { x: w / 2, y: contentBottomPadding + totalMapHeight - FLOOR_SPACING });
      }
    }

    this.mapAssets.loadMapAssets();
    const bgTex = this.mapAssets.getMapBgTexture();
    stage.sortableChildren = true;
    const mapH = Math.max(h, this.mapContentHeight);
    if (bgTex) {
      const bgSprite = new PIXI.Sprite(bgTex);
      bgSprite.width = w;
      bgSprite.height = mapH;
      bgSprite.zIndex = 0;
      stage.addChild(bgSprite);
    } else {
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, w, mapH).fill(0x1a1822);
      bg.zIndex = 0;
      stage.addChild(bg);
    }

    // Container that follows the width of each layer (wider where nodes spread, narrower at top/bottom)
    const PAD_H = 88;
    const PAD_V = 42;
    const rowData: { left: number; right: number; y: number }[] = [];
    for (let f = 0; f <= maxFloor; f++) {
      const ids = floors[f] ?? [];
      if (ids.length === 0) continue;
      const xs = ids.map((id) => posById.get(id)!.x);
      const ys = ids.map((id) => posById.get(id)!.y);
      const left = Math.min(...xs) - PAD_H;
      const right = Math.max(...xs) + PAD_H;
      const y = ys.reduce((a, b) => a + b, 0) / ys.length;
      rowData.push({ left, right, y });
    }
    if (rowData.length >= 2) {
      rowData[0].y += PAD_V;
      rowData[rowData.length - 1].y -= PAD_V;
      const containerShape = new PIXI.Graphics();
      const first = rowData[0];
      containerShape.moveTo(first.left, first.y);
      containerShape.lineTo(first.right, first.y);
      for (let i = 1; i < rowData.length; i++) {
        containerShape.lineTo(rowData[i].right, rowData[i].y);
      }
      const last = rowData[rowData.length - 1];
      containerShape.lineTo(last.left, last.y);
      for (let i = rowData.length - 2; i >= 0; i--) {
        containerShape.lineTo(rowData[i].left, rowData[i].y);
      }
      containerShape.fill({ color: 0x0c0a18, alpha: 0.88 });
      containerShape.stroke({ width: 2, color: 0xb48cff, alpha: 0.45 });
      containerShape.zIndex = 1;
      stage.addChild(containerShape);
    }

    const inset = NODE_RADIUS + 6;
    const strokeColor = 0x8899aa;
    const pathBorderColor = 0x0c0c18;
    const pathBorderWidth = 6;
    const pathStrokeWidth = 2.5;
    const dashLen = 10;
    const gapLen = 6;

    const drawEdgePath = (g: PIXI.Graphics, lineWidth: number, color: number) => {
      for (const [from, to] of edges) {
        const fromPos = posById.get(from);
        const toPos = posById.get(to);
        if (!fromPos || !toPos) continue;
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const len = Math.hypot(dx, dy);
        if (len < inset * 2) continue;
        const ux = dx / len;
        const uy = dy / len;
        const startX = fromPos.x + ux * inset;
        const startY = fromPos.y + uy * inset;
        const endX = toPos.x - ux * inset;
        const endY = toPos.y - uy * inset;
        const segLen = Math.hypot(endX - startX, endY - startY);
        let dist = 0;
        while (dist < segLen - 16) {
          const a = dist;
          const b = Math.min(dist + dashLen, segLen - 16);
          g.moveTo(startX + ux * a, startY + uy * a);
          g.lineTo(startX + ux * b, startY + uy * b);
          g.stroke({ width: lineWidth, color });
          dist += dashLen + gapLen;
        }
        const arrowBase = segLen - 16;
        const baseX = startX + ux * arrowBase;
        const baseY = startY + uy * arrowBase;
        const arrowLen = 12;
        g.moveTo(baseX - uy * arrowLen * 0.5, baseY + ux * arrowLen * 0.5);
        g.lineTo(endX, endY);
        g.lineTo(baseX + uy * arrowLen * 0.5, baseY - ux * arrowLen * 0.5);
        g.stroke({ width: lineWidth, color });
      }
    };

    const edgeGraphics = new PIXI.Graphics();
    drawEdgePath(edgeGraphics, pathBorderWidth, pathBorderColor);
    drawEdgePath(edgeGraphics, pathStrokeWidth, strokeColor);
    edgeGraphics.zIndex = 2;
    stage.addChild(edgeGraphics);

    const nodeColor = (type: MapNodeType): number => {
      switch (type) {
        case 'combat': return 0x994444;
        case 'elite': return 0xbb7733;
        case 'rest': return 0xdd9922;
        case 'shop': return 0x339966;
        case 'event': return 0x5599bb;
        case 'boss': return 0x7733aa;
        default: return 0x555566;
      }
    };

    const NODE_ICON_SIZE = 44;
    const BOSS_ICON_SIZE = 52;

    for (const n of nodes) {
      const pos = posById.get(n.id);
      if (!pos) continue;
      const isCurrent = state.currentNodeId === n.id;
      const isAvailable = availableNext.includes(n.id);
      const nodeTex = this.mapAssets.getNodeTexture(n.type);
      const size = n.type === 'boss' ? BOSS_ICON_SIZE : NODE_ICON_SIZE;
      const r = n.type === 'boss' ? NODE_RADIUS + 6 : NODE_RADIUS;

      const container = new PIXI.Container();
      container.x = pos.x;
      container.y = pos.y;
      container.zIndex = 3;

      if (nodeTex) {
        const sprite = new PIXI.Sprite(nodeTex);
        sprite.anchor.set(0.5, 0.5);
        sprite.width = size;
        sprite.height = size;
        container.addChild(sprite);
      } else {
        const circle = new PIXI.Graphics();
        circle.circle(0, 0, r + 2).fill(0x2a2a35);
        circle.circle(0, 0, r).fill({ color: isAvailable ? 0xe8e8a0 : nodeColor(n.type) });
        if (isCurrent) {
          circle.circle(0, 0, r + 8).stroke({ width: 5, color: 0x55aaff });
        } else {
          circle.circle(0, 0, r).stroke({ width: 2.5, color: 0x333344 });
        }
        container.addChild(circle);
        const labelText = n.type === 'event' ? '?' : n.type === 'shop' ? '$' : n.type.slice(0, 1).toUpperCase();
        const label = new PIXI.Text({
          text: labelText,
          style: { fontFamily: 'system-ui', fontSize: n.type === 'boss' ? 16 : 12, fill: 0xffffff, fontWeight: 'bold' },
        });
        label.anchor.set(0.5, 0.5);
        container.addChild(label);
      }

      if (nodeTex && (isCurrent || isAvailable)) {
        const ring = new PIXI.Graphics();
        const ringR = size / 2 + 6;
        if (isCurrent) {
          ring.circle(0, 0, ringR).stroke({ width: 5, color: 0x55aaff });
        } else {
          ring.circle(0, 0, ringR).stroke({ width: 3, color: 0xe8e8a0 });
        }
        container.addChildAt(ring, 0);
      }

      if (isAvailable) {
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.hitArea = new PIXI.Circle(0, 0, Math.max(size / 2, r) + 8);
        container.on('pointerdown', () => {
          this.bridge.chooseNode(n.id);
          this.redraw();
        });
      }
      stage.addChild(container);
    }
  }

  private formatEffect(e: CardEffect): string {
    switch (e.type) {
      case 'damage': return `Deal ${e.value} damage`;
      case 'block': return `Gain ${e.value} block`;
      case 'heal': return `Heal ${e.value}`;
      case 'draw': return e.value === 1 ? 'Draw 1 card' : `Draw ${e.value} cards`;
      case 'vulnerable': return `Apply ${e.value} Vulnerable`;
      case 'damageEqualToBlock': return 'Damage equal to block';
      default: return '';
    }
  }

  private getCardEffectDescription(cardId: string): string {
    const def = this.bridge.getCardDef(cardId);
    if (!def?.effects?.length) return '';
    return def.effects.map((e) => this.formatEffect(e)).filter(Boolean).join(' • ') || '';
  }

  private getCardCost(cardId: string): number {
    return this.bridge.getCardDef(cardId)?.cost ?? 0;
  }

  /** True if the card has any effect that targets an enemy (requires target selection). */
  private cardNeedsEnemyTarget(cardId: string): boolean {
    const def = this.bridge.getCardDef(cardId);
    return def?.effects?.some((e) => e.target === 'enemy') ?? false;
  }

  getCardName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

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
      if (aliveCount === 0) return;
      this.selectedCardId = cardId;
      this.redraw();
      this.cdr.markForCheck();
      return;
    }

    this.bridge.playCard(cardId, state.enemies.length > 0 ? 0 : undefined);
    this.redraw();
  }

  onEnemyTargetClick(enemyIndex: number): void {
    if (this.selectedCardId == null) return;
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;
    const enemy = state.enemies[enemyIndex];
    if (!enemy || enemy.hp <= 0) return;
    this.runCardFlyThenPlay(this.selectedCardId, enemyIndex, state);
  }

  cancelTargeting(): void {
    this.selectedCardId = null;
    this.hoveredEnemyIndex = null;
    this.redraw();
    this.cdr.markForCheck();
  }

  /** B8: Animate card flying to enemy, then play card and redraw. */
  private runCardFlyThenPlay(cardId: string, enemyIndex: number, state: GameState): void {
    if (!this.app) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const padding = 20;
    const playerY = h - 28;
    const cardWidth = 100;
    const cardHeight = 140;
    const overlapRatio = 0.45;
    const arcAmplitude = 30;
    const hoverLift = 20;
    const cardSpacing = cardWidth * overlapRatio;
    const totalHandWidth = (state.hand.length - 1) * cardSpacing + cardWidth;
    const startX = (w - totalHandWidth) / 2 + cardWidth / 2;
    const handY = playerY - cardHeight - 20;
    const center = (state.hand.length - 1) / 2;
    const enemyPlaceholderW = 100;
    const enemyPlaceholderH = 110;
    const enemyGap = 28;
    const enemyZoneStart = w * 0.52;
    const baselineBottom = h * 0.6;
    const enemyStartY = baselineBottom - enemyPlaceholderH;
    const totalEnemyWidth = state.enemies.length * enemyPlaceholderW + (state.enemies.length - 1) * enemyGap;
    const ex = enemyZoneStart + (w - enemyZoneStart - padding - totalEnemyWidth) / 2 + enemyPlaceholderW / 2;

    const selIdx = state.hand.indexOf(cardId);
    if (selIdx < 0) {
      this.bridge.playCard(cardId, enemyIndex);
      this.selectedCardId = null;
      this.hoveredEnemyIndex = null;
      this.redraw();
      this.cdr.markForCheck();
      return;
    }
    const arcN = state.hand.length > 1 ? (selIdx - center) / (state.hand.length - 1) : 0;
    const fromX = startX + selIdx * cardSpacing;
    const fromY = handY + arcAmplitude * (1 - 4 * arcN * arcN) - hoverLift;
    const toX = ex + enemyIndex * (enemyPlaceholderW + enemyGap);
    const toY = enemyStartY + enemyPlaceholderH / 2;

    const flyCard = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.roundRect(0, 0, cardWidth, cardHeight, 10).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0xe8c060 });
    flyCard.addChild(bg);
    flyCard.pivot.set(cardWidth / 2, cardHeight);
    flyCard.x = fromX;
    flyCard.y = fromY;
    this.app.stage.addChild(flyCard);

    const duration = 280;
    const startTime = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = 1 - (1 - t) * (1 - t);
      flyCard.x = fromX + (toX - fromX) * ease;
      flyCard.y = fromY + (toY - fromY) * ease;
      if (t >= 1) {
        this.app!.ticker.remove(tick);
        flyCard.destroy({ children: true });
        const oldState = state;
        this.bridge.playCard(cardId, enemyIndex);
        const newState = this.bridge.getState()!;
        this.selectedCardId = null;
        this.hoveredEnemyIndex = null;
        const toAdd: { type: 'damage' | 'block'; value: number; x: number; y: number; enemyIndex?: number }[] = [];
        if (oldState.enemies[enemyIndex] && newState.enemies[enemyIndex]) {
          const hpLost = oldState.enemies[enemyIndex].hp - newState.enemies[enemyIndex].hp;
          if (hpLost > 0) toAdd.push({ type: 'damage', value: hpLost, x: toX, y: toY, enemyIndex });
        }
        const blockGain = newState.playerBlock - oldState.playerBlock;
        if (blockGain > 0) {
          const playerZoneX = w * 0.18;
          const baselineBottom = h * 0.6;
          const playerPlaceholderH = 130;
          toAdd.push({ type: 'block', value: blockGain, x: playerZoneX, y: baselineBottom - playerPlaceholderH / 2 });
        }
        this.floatingNumbers = toAdd;
        this.redraw();
        this.cdr.markForCheck();
        if (toAdd.length > 0) {
          setTimeout(() => {
            this.floatingNumbers = [];
            this.redraw();
            this.cdr.markForCheck();
          }, 700);
        }
      }
    };
    this.app.ticker.add(tick);
  }

  canEndTurn(): boolean {
    const state = this.bridge.getState();
    return !!state && state.phase === 'player' && !state.combatResult && this._runPhase === 'combat';
  }

  onEndTurn(): void {
    if (!this.canEndTurn()) return;
    this.showingEnemyTurn = true;
    this.redraw();
    this.cdr.markForCheck();
    setTimeout(() => {
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

  restRemovableCards(): string[] {
    const state = this.bridge.getState();
    if (!state) return [];
    // Unique card IDs from deck so you remove by card type
    return Array.from(new Set(state.deck));
  }
}
