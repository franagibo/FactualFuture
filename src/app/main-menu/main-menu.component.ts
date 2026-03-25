import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import type { MetaState } from '../../engine/types';
import { GameBridgeService } from '../services/game-bridge.service';
import { SoundService } from '../services/sound.service';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { AssetManifestService } from '../services/asset-manifest.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [SettingsModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-wrap" [class.bg-ready]="backgroundReady">
      @if (!backgroundReady) {
        <div class="menu-loading-overlay" aria-busy="true">
          <span class="menu-loading-spinner"></span>
          <span class="menu-loading-label">
            Loading… @if (assetProgress.total > 0) { {{ assetProgress.loaded }}/{{ assetProgress.total }} }
          </span>
        </div>
      }
      <div class="menu-panel">
      <div class="menu-logo-area">
          <h1 class="menu-title">Slay the Spire Like</h1>
          <p class="menu-tagline">A deck-builder roguelike</p>
        </div>
        @if (meta) {
          <div class="unlocks-section">
            <div class="unlocks-label">Unlocks</div>
            @if (meta.unlockedCards.length > 0 || meta.unlockedRelics.length > 0) {
              <div class="unlocks-list">
                @for (id of meta.unlockedCards; track id) {
                  <span class="unlock-item unlock-card">{{ getCardDisplayName(id) }}</span>
                }
                @for (id of meta.unlockedRelics; track id) {
                  <span class="unlock-item unlock-relic">{{ getRelicDisplayName(id) }}</span>
                }
              </div>
            } @else {
              <div class="unlocks-hint">Reach sector 2 or win a run to unlock more content.</div>
            }
          </div>
        }
        @if (showDataLoadError) {
          <div class="menu-data-error">
            <p>Data failed to load. Check the console for details.</p>
            <button type="button" class="menu-btn" (click)="onRetryDataLoad()">
              <span class="menu-btn-inner">Retry</span>
            </button>
          </div>
        }
        <div class="menu-actions">
          @if (showContinue) {
            <button type="button" class="menu-btn menu-btn-primary" (click)="onContinue()">
            <span class="menu-btn-icon">▶</span>
              <span class="menu-btn-inner">Continue</span>
            </button>
          }
          <button type="button" class="menu-btn menu-btn-primary" (click)="onPlay()">
          <span class="menu-btn-icon">⚔</span>
            <span class="menu-btn-inner">New Game</span>
          </button>
          <button type="button" class="menu-btn" (click)="onSettings()">
          <span class="menu-btn-icon">⚙</span>
            <span class="menu-btn-inner">Settings</span>
          </button>
          @if (isElectron()) {
            <button type="button" class="menu-btn menu-btn-danger" (click)="onQuit()">
            <span class="menu-btn-icon">✕</span>
              <span class="menu-btn-inner">Quit</span>
            </button>
          }
        </div>
        
        <div class="menu-footer">
          <span class="menu-version">v0.1.0</span>
        </div>
      </div>
      @if (showSettings) {
        <app-settings-modal closeButtonLabel="Close" (close)="closeSettings()" />
      }
    </div>
  `,
   styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .menu-wrap {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      background: #07050f center center no-repeat;
      background-size: cover;
    }

    .menu-wrap.bg-ready {
      background-image: url('/assets/main-menu.jpg');
    }

    /* vignette overlay */
    .menu-wrap::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.65) 100%);
      pointer-events: none;
      z-index: 0;
    }

    .menu-loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      background: #07050f;
      z-index: 10;
    }

    .menu-loading-spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #b48cff;
      border-radius: 50%;
      animation: menuSpin 0.8s linear infinite;
    }

    @keyframes menuSpin { to { transform: rotate(360deg); } }

    .menu-loading-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1rem;
      color: #6a6090;
      letter-spacing: 0.06em;
    }

    /* ── panel ── */
    .menu-panel {
      position: relative;
      z-index: 1;
      background: rgba(7, 4, 16, 0.88);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(140, 100, 220, 0.38);
      border-radius: 20px;
      padding: 2.8rem 3.2rem 2rem;
      box-shadow:
        0 0 0 1px rgba(80, 50, 160, 0.12) inset,
        0 0 60px rgba(60, 30, 120, 0.5),
        0 10px 40px rgba(0, 0, 0, 0.7),
        inset 0 1px 0 rgba(255, 255, 255, 0.07);
      animation: panelIn 0.55s cubic-bezier(0.34, 1.1, 0.64, 1);
      min-width: 300px;
    }

    /* top accent stripe */
    .menu-panel::before {
      content: '';
      position: absolute;
      top: 0; left: 10%; right: 10%;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, rgba(180,140,255,0.8) 50%, transparent 100%);
      border-radius: 20px 20px 0 0;
    }

    @keyframes panelIn {
      from { opacity: 0; transform: scale(0.94) translateY(14px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* ── logo area ── */
    .menu-logo-area {
      text-align: center;
      margin-bottom: 2rem;
    }

    .menu-title {
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 2.2rem;
      font-weight: 900;
      margin: 0 0 0.3rem;
      color: #fff;
      letter-spacing: 0.04em;
      text-shadow:
        0 0 30px rgba(190, 150, 255, 0.65),
        0 0 60px rgba(120, 80, 200, 0.3),
        0 3px 6px rgba(0, 0, 0, 0.8);
      animation: titleGlow 3.5s ease-in-out infinite;
    }

    @keyframes titleGlow {
      0%, 100% { text-shadow: 0 0 30px rgba(190,150,255,0.65), 0 0 60px rgba(120,80,200,0.3), 0 3px 6px rgba(0,0,0,0.8); }
      50%        { text-shadow: 0 0 40px rgba(210,170,255,0.85), 0 0 80px rgba(140,90,220,0.5), 0 3px 6px rgba(0,0,0,0.8); }
    }

    .menu-tagline {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      font-weight: 400;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #5a5280;
      margin: 0;
    }

    /* ── unlocks ── */
    .unlocks-section {
      margin-bottom: 1.25rem;
      padding: 0.75rem 1rem;
      background: rgba(0,0,0,0.25);
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .unlocks-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #5a5278;
      margin-bottom: 0.4rem;
    }

    .unlocks-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .unlock-item {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      color: #c8c0e8;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
    }

    .unlock-card {
      background: rgba(80, 60, 140, 0.35);
      border: 1px solid rgba(120, 90, 200, 0.25);
    }

    .unlock-relic {
      background: rgba(120, 90, 20, 0.35);
      border: 1px solid rgba(200, 150, 30, 0.25);
      color: #e8d880;
    }

    .unlocks-hint {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      color: #4a4268;
      font-style: italic;
    }

    /* ── error ── */
    .menu-data-error {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      background: rgba(160, 60, 60, 0.18);
      border: 1px solid rgba(220, 80, 80, 0.4);
      border-radius: 10px;
      color: #f0b0b0;
      font-family: 'Exo 2', system-ui, sans-serif;
      p { margin: 0 0 0.5rem 0; }
    }

    /* ── action buttons ── */
    .menu-actions {
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
    }

    .menu-actions .menu-btn:nth-child(1) { animation: btnIn 0.45s 0.12s ease-out both; }
    .menu-actions .menu-btn:nth-child(2) { animation: btnIn 0.45s 0.20s ease-out both; }
    .menu-actions .menu-btn:nth-child(3) { animation: btnIn 0.45s 0.28s ease-out both; }
    .menu-actions .menu-btn:nth-child(4) { animation: btnIn 0.45s 0.36s ease-out both; }
    .menu-actions .menu-btn:nth-child(5) { animation: btnIn 0.45s 0.44s ease-out both; }

    @keyframes btnIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .menu-btn {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 24px;
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
      color: #fff;
      border: none;
      border-radius: 12px;
      background: linear-gradient(160deg, #3a3068 0%, #26204c 100%);
      box-shadow:
        0 5px 0 #151030,
        0 6px 18px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.13);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 12px;
        padding: 1px;
        background: linear-gradient(170deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 50%, transparent 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
    }

    .menu-btn:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow:
        0 8px 0 #151030,
        0 12px 28px rgba(0, 0, 0, 0.5),
        0 0 22px rgba(120, 90, 220, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.18);
      filter: brightness(1.1);
    }

    .menu-btn:active {
      transform: translateY(2px) scale(0.99);
      box-shadow: 0 2px 0 #151030, 0 2px 8px rgba(0,0,0,0.4);
    }

    .menu-btn-primary {
      background: linear-gradient(160deg, #5840a8 0%, #3c2888 45%, #2c1870 100%);
      box-shadow:
        0 5px 0 #1a1040,
        0 6px 22px rgba(0, 0, 0, 0.5),
        0 0 18px rgba(100, 70, 200, 0.22),
        inset 0 1px 0 rgba(255, 255, 255, 0.18);

      &:hover {
        box-shadow:
          0 8px 0 #1a1040,
          0 12px 30px rgba(0, 0, 0, 0.55),
          0 0 32px rgba(140, 100, 255, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.22);
      }
    }

    .menu-btn-danger {
      background: linear-gradient(160deg, #6a2828 0%, #421515 100%);
      box-shadow: 0 5px 0 #281010, 0 6px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1);

      &:hover {
        box-shadow: 0 8px 0 #281010, 0 12px 28px rgba(0,0,0,0.5), 0 0 22px rgba(200, 60, 60, 0.3);
      }
    }

    .menu-btn-icon {
      font-size: 1em;
      opacity: 0.75;
    }

    .menu-btn-inner {
      position: relative;
      z-index: 1;
    }

    /* ── footer ── */
    .menu-footer {
      margin-top: 1.5rem;
      text-align: center;
    }

    .menu-version {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.65rem;
      color: #2e2850;
      letter-spacing: 0.1em;
    }
  `],
})
export class MainMenuComponent implements OnInit {
  public showSettings = false;
  showContinue = false;
  meta: MetaState | null = null;
  backgroundReady = false;
  assetProgress = { loaded: 0, total: 0, label: '' };

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private sound: SoundService,
    private assets: AssetManifestService,
    private cdr: ChangeDetectorRef
  ) { }

  showDataLoadError = false;

  async ngOnInit(): Promise<void> {
    this.sound.startMainMenuSoundtrack();
    // Boot preload: small UI set so the first combat/map feels instant.
    void this.assets.loadGroup('boot', [
      '/assets/UI/header/header-1440p.png',
      '/assets/UI/footer/footer.png',
      '/assets/UI/hp/BarV5_Bar.png',
      '/assets/UI/hp/BarV5_ProgressBar.png',
      '/assets/UI/hp/BarV5_ProgressBarBorder.png',
      '/assets/UI/shield/BarV9_Bar.png',
      '/assets/UI/shield/BarV9_ProgressBar.png',
      '/assets/UI/shield/BarV6_ProgressBarBorder.png',
      '/assets/cards/empty_card.png',
    ]).finally(() => {
      this.assetProgress = { ...this.assets.getProgress(), label: this.assets.getProgress().label ?? '' } as unknown as { loaded: number; total: number; label: string };
      this.cdr.markForCheck();
    });
    this.loadBackgroundImage();
    try {
      await this.bridge.ensureDataLoaded();
    } catch {
      this.showDataLoadError = true;
      this.cdr.markForCheck();
      return;
    }
    this.meta = this.bridge.getMeta();
    const has = await this.bridge.hasSavedRun();
    this.showContinue = has;
    this.assetProgress = { ...this.assets.getProgress(), label: this.assets.getProgress().label ?? '' } as unknown as { loaded: number; total: number; label: string };
    this.cdr.markForCheck();
  }

  async onRetryDataLoad(): Promise<void> {
    this.bridge.clearDataLoadError();
    this.showDataLoadError = false;
    this.cdr.markForCheck();
    try {
      await this.bridge.ensureDataLoaded();
      this.meta = this.bridge.getMeta();
      const has = await this.bridge.hasSavedRun();
      this.showContinue = has;
    } catch {
      this.showDataLoadError = true;
    }
    this.cdr.markForCheck();
  }

  private loadBackgroundImage(): void {
    const img = new Image();
    img.onload = () => { this.backgroundReady = true; this.cdr.markForCheck(); };
    img.onerror = () => { this.backgroundReady = true; this.cdr.markForCheck(); };
    img.src = '/assets/main-menu.jpg';
  }

  getCardDisplayName(cardId: string): string {
    return this.bridge.getCardDef(cardId)?.name ?? cardId;
  }

  getRelicDisplayName(relicId: string): string {
    return this.bridge.getRelicName(relicId);
  }

  isElectron(): boolean {
    return typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined';
  }

  onPlay(): void {
    this.bridge.clearState();
    this.bridge.clearSavedRun();
    this.router.navigate(['/select-character']);
  }

  async onContinue(): Promise<void> {
    const ok = await this.bridge.loadRun();
    if (ok) this.router.navigate(['/game']);
    else this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showSettings) this.closeSettings();
  }

  onSettings(): void { this.showSettings = true; this.cdr.markForCheck(); }
  closeSettings(): void { this.showSettings = false; this.cdr.markForCheck(); }

  onQuit(): void {
    const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
    if (api?.quit) api.quit();
  }
}
