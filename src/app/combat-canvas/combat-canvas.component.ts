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
import type { CardDef } from '../../engine/cardDef';
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

    // Player area (bottom): HP, block, energy
    const playerY = h - 100;
    const hpText = new PIXI.Text({
      text: `HP: ${state.playerHp}/${state.playerMaxHp}  Block: ${state.playerBlock}  Energy: ${state.energy}/${state.maxEnergy}`,
      style: { fontFamily: 'system-ui', fontSize: 18, fill: 0xeeeeee },
    });
    hpText.x = padding;
    hpText.y = playerY;
    stage.addChild(hpText);

    // Hand (cards as colored rectangles)
    const hand = state.hand;
    const cardWidth = 80;
    const cardHeight = 110;
    const gap = 10;
    const totalHandWidth = hand.length * cardWidth + (hand.length - 1) * gap;
    let startX = (w - totalHandWidth) / 2 + cardWidth / 2 + gap / 2;
    const handY = playerY - cardHeight - 20;

    this.cardSprites.clear();
    for (let i = 0; i < hand.length; i++) {
      const cardId = hand[i];
      const container = new PIXI.Container();
      const bg = new PIXI.Graphics();
      bg.roundRect(0, 0, cardWidth, cardHeight, 6).fill({ color: 0x2a2a4a }).stroke({ width: 2, color: 0x6a6a8a });
      container.addChild(bg);
      const costColor = state.energy >= (this.getCardCost(cardId) ?? 1) ? 0x88ff88 : 0xff8888;
      const costText = new PIXI.Text({
        text: String(this.getCardCost(cardId) ?? '?'),
        style: { fontFamily: 'system-ui', fontSize: 14, fill: costColor },
      });
      costText.x = 6;
      costText.y = 6;
      container.addChild(costText);
      const nameText = new PIXI.Text({
        text: this.getCardName(cardId).slice(0, 10),
        style: { fontFamily: 'system-ui', fontSize: 12, fill: 0xcccccc },
      });
      nameText.x = 6;
      nameText.y = 28;
      container.addChild(nameText);
      container.x = startX + i * (cardWidth + gap) - cardWidth / 2;
      container.y = handY;
      container.eventMode = 'static';
      container.cursor = 'pointer';
      const idx = i;
      container.on('pointerdown', () => this.onCardClick(cardId, idx));
      stage.addChild(container);
      this.cardSprites.set(`${cardId}-${idx}`, container);
    }

    // Enemies (top)
    const enemyStartY = 80;
    const enemies = state.enemies;
    const enemyW = 120;
    const enemyH = 90;
    const enemyGap = 30;
    const totalEnemyWidth = enemies.length * enemyW + (enemies.length - 1) * enemyGap;
    let ex = (w - totalEnemyWidth) / 2 + enemyW / 2 + enemyGap / 2;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const container = new PIXI.Container();
      const bg = new PIXI.Graphics();
      bg.roundRect(0, 0, enemyW, enemyH, 6).fill({ color: 0x3a2a2a }).stroke({ width: 2, color: 0x8a4a4a });
      container.addChild(bg);
      const nameT = new PIXI.Text({
        text: e.name,
        style: { fontFamily: 'system-ui', fontSize: 14, fill: 0xeeeeee },
      });
      nameT.x = 8;
      nameT.y = 8;
      container.addChild(nameT);
      const hpT = new PIXI.Text({
        text: `HP: ${e.hp}/${e.maxHp}  Block: ${e.block}`,
        style: { fontFamily: 'system-ui', fontSize: 12, fill: 0xcccccc },
      });
      hpT.x = 8;
      hpT.y = 28;
      container.addChild(hpT);
      const intentStr = e.intent ? `${e.intent.type} ${e.intent.value}` : '?';
      const intentT = new PIXI.Text({
        text: intentStr,
        style: { fontFamily: 'system-ui', fontSize: 11, fill: 0xffaa00 },
      });
      intentT.x = 8;
      intentT.y = 50;
      container.addChild(intentT);
      container.x = ex + i * (enemyW + enemyGap) - enemyW / 2;
      container.y = enemyStartY;
      stage.addChild(container);
    }

    this.cdr.markForCheck();
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
    const FLOOR_SPACING = 140;
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
    const BOTTOM_MARGIN = 72;
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
    const posById = new Map<string, { x: number; y: number }>();
    for (let f = 0; f <= maxFloor; f++) {
      const ids = floors[f] ?? [];
      if (!ids.length) continue;
      const y = contentBottomPadding + totalMapHeight - (f + 1) * FLOOR_SPACING;
      const gapX = Math.min(80, (w - padding * 2) / Math.max(1, ids.length));
      const rowWidth = (ids.length - 1) * gapX;
      const centerX = w / 2;
      for (let i = 0; i < ids.length; i++) {
        const n = nodes.find((x) => x.id === ids[i]);
        const lane = (n && (n as { lane?: number }).lane != null) ? (n as { lane: number }).lane : i;
        const jitter = (lane / laneCount - 0.5) * 16;
        const x = centerX - rowWidth / 2 + i * gapX + jitter;
        posById.set(ids[i], { x, y });
      }
    }
    for (const n of nodes) {
      if (n.type === 'boss' && (n as { floor: number }).floor === maxFloor + 1) {
        posById.set(n.id, { x: w / 2, y: contentBottomPadding + totalMapHeight - FLOOR_SPACING });
      }
    }

    this.mapAssets.loadMapAssets();
    const bgTex = this.mapAssets.getMapBgTexture();
    if (bgTex) {
      const bgSprite = new PIXI.Sprite(bgTex);
      bgSprite.width = w;
      bgSprite.height = h;
      stage.addChild(bgSprite);
    } else {
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, w, h).fill(0x1a1822);
      stage.addChild(bg);
    }

    const inset = NODE_RADIUS + 6;
    const strokeColor = 0x8899aa;
    const dashLen = 10;
    const gapLen = 6;

    const edgeGraphics = new PIXI.Graphics();
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
        edgeGraphics.moveTo(startX + ux * a, startY + uy * a);
        edgeGraphics.lineTo(startX + ux * b, startY + uy * b);
        edgeGraphics.stroke({ width: 2.5, color: strokeColor });
        dist += dashLen + gapLen;
      }
      const arrowBase = segLen - 16;
      const baseX = startX + ux * arrowBase;
      const baseY = startY + uy * arrowBase;
      const arrowLen = 12;
      edgeGraphics.moveTo(baseX - uy * arrowLen * 0.5, baseY + ux * arrowLen * 0.5);
      edgeGraphics.lineTo(endX, endY);
      edgeGraphics.lineTo(baseX + uy * arrowLen * 0.5, baseY - ux * arrowLen * 0.5);
      edgeGraphics.stroke({ width: 2.5, color: strokeColor });
    }
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

  private getCardCost(cardId: string): number {
    return this.bridge.getCardDef(cardId)?.cost ?? 0;
  }

  getCardName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

  onCardClick(cardId: string, _handIndex: number): void {
    const state = this.bridge.getState();
    if (!state || state.phase !== 'player' || state.combatResult || this._runPhase !== 'combat') return;
    const targetIndex = state.enemies.length > 0 ? 0 : undefined;
    this.bridge.playCard(cardId, targetIndex);
    this.redraw();
  }

  canEndTurn(): boolean {
    const state = this.bridge.getState();
    return !!state && state.phase === 'player' && !state.combatResult && this._runPhase === 'combat';
  }

  onEndTurn(): void {
    this.bridge.endTurn();
    this.redraw();
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
