import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { GameBridgeService } from '../services/game-bridge.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  template: `
    <div class="menu-wrap">
      <div class="menu-panel">
        <h1 class="menu-title">Slay the Spire Like</h1>
        <div class="menu-actions">
          @if (showContinue) {
            <button type="button" class="menu-btn menu-btn-primary" (click)="onContinue()">
              <span class="menu-btn-inner">Continue</span>
            </button>
          }
          <button type="button" class="menu-btn menu-btn-primary" (click)="onPlay()">
            <span class="menu-btn-inner">New Game</span>
          </button>
          <button type="button" class="menu-btn" (click)="onSettings()">
            <span class="menu-btn-inner">Settings</span>
          </button>
          @if (isElectron()) {
            <button type="button" class="menu-btn" (click)="onQuit()">
              <span class="menu-btn-inner">Quit</span>
            </button>
          }
        </div>
      </div>
      @if (showSettings) {
        <div class="settings-backdrop" (click)="closeSettings()"></div>
        <div class="settings-modal">
          <div class="settings-title">Settings</div>
          @if (isElectron()) {
            <div class="settings-section">
              <div class="settings-label">Display</div>
              <div class="settings-options">
                <button type="button" class="menu-btn" [class.active]="fullscreen" (click)="setFullScreen(true)">
                  Fullscreen
                </button>
                <button type="button" class="menu-btn" [class.active]="!fullscreen" (click)="setFullScreen(false)">
                  Windowed
                </button>
              </div>
            </div>
          }
          <div class="settings-section">
            <div class="settings-label">Resolution</div>
            <div class="settings-options">
              <button type="button" class="menu-btn" (click)="setResolution(1920, 1080)">1920 x 1080</button>
              <button type="button" class="menu-btn" (click)="setResolution(1600, 900)">1600 x 900</button>
              <button type="button" class="menu-btn" (click)="setResolution(1280, 720)">1280 x 720</button>
            </div>
          </div>
          <button type="button" class="menu-btn settings-close" (click)="closeSettings()">Close</button>
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
      .menu-wrap {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #1a1a2e url('/assets/main-menu.jpg') center center no-repeat;
        background-size: cover;
      }
      .menu-panel {
        background: rgba(12, 10, 24, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(180, 140, 255, 0.35);
        border-radius: 16px;
        padding: 2.5rem 3rem;
        box-shadow:
          0 0 40px rgba(80, 50, 140, 0.4),
          0 8px 32px rgba(0, 0, 0, 0.6),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        animation: panel-in 0.6s ease-out;
      }
      @keyframes panel-in {
        from {
          opacity: 0;
          transform: scale(0.96) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .menu-title {
        font-size: 2.5rem;
        margin: 0 0 2.5rem;
        color: #fff;
        font-weight: 700;
        text-align: center;
        text-shadow:
          0 0 20px rgba(200, 160, 255, 0.5),
          0 2px 4px rgba(0, 0, 0, 0.8);
        letter-spacing: 0.02em;
        animation: title-glow 3s ease-in-out infinite;
      }
      @keyframes title-glow {
        0%, 100% { text-shadow: 0 0 20px rgba(200, 160, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.8); }
        50% { text-shadow: 0 0 28px rgba(220, 180, 255, 0.7), 0 2px 4px rgba(0, 0, 0, 0.8); }
      }
      .menu-actions {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: 240px;
      }
      .menu-actions .menu-btn {
        animation: btn-in 0.5s ease-out backwards;
      }
      .menu-actions .menu-btn:nth-child(1) { animation-delay: 0.15s; }
      .menu-actions .menu-btn:nth-child(2) { animation-delay: 0.22s; }
      .menu-actions .menu-btn:nth-child(3) { animation-delay: 0.29s; }
      .menu-actions .menu-btn:nth-child(4) { animation-delay: 0.36s; }
      .menu-actions .menu-btn:nth-child(5) { animation-delay: 0.43s; }
      @keyframes btn-in {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .menu-btn {
        position: relative;
        padding: 14px 28px;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        color: #fff;
        border: none;
        border-radius: 10px;
        background: linear-gradient(180deg, #3d3560 0%, #2a2345 100%);
        box-shadow:
          0 4px 0 #1a1630,
          0 6px 16px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.15);
        transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
        overflow: hidden;
      }
      .menu-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 10px;
        padding: 1px;
        background: linear-gradient(180deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 50%, transparent 100%);
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
      .menu-btn-inner {
        position: relative;
        z-index: 1;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }
      .menu-btn:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow:
          0 6px 0 #1a1630,
          0 10px 24px rgba(0, 0, 0, 0.45),
          0 0 20px rgba(140, 100, 220, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
        filter: brightness(1.08);
      }
      .menu-btn:active {
        transform: translateY(1px) scale(0.99);
        box-shadow:
          0 2px 0 #1a1630,
          0 2px 8px rgba(0, 0, 0, 0.4),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
      }
      .menu-btn-primary {
        background: linear-gradient(180deg, #5a4a9e 0%, #3d3270 50%, #2d2555 100%);
        box-shadow:
          0 4px 0 #1e1838,
          0 6px 20px rgba(0, 0, 0, 0.45),
          0 0 16px rgba(120, 80, 200, 0.25),
          inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .menu-btn-primary:hover {
        box-shadow:
          0 6px 0 #1e1838,
          0 10px 28px rgba(0, 0, 0, 0.5),
          0 0 28px rgba(150, 110, 255, 0.45),
          inset 0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .settings-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 100;
        animation: fade-in 0.2s ease;
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .settings-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(18, 18, 28, 0.98);
        padding: 20px 24px;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
        color: #eee;
        min-width: 220px;
        z-index: 101;
        animation: panel-in 0.25s ease-out;
      }
      .settings-title {
        font-size: 1.25rem;
        margin-bottom: 1rem;
      }
      .settings-section {
        margin-bottom: 1rem;
      }
      .settings-label {
        font-size: 0.75rem;
        color: #aaa;
        margin-bottom: 0.5rem;
      }
      .settings-options {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .settings-options .menu-btn {
        min-width: 160px;
      }
      .settings-options .menu-btn.active {
        background: linear-gradient(180deg, #5a4a9e 0%, #3d3270 100%);
        box-shadow: 0 0 16px rgba(120, 80, 200, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
      }
      .settings-close {
        margin-top: 0.5rem;
        width: 100%;
      }
    `,
  ],
})
export class MainMenuComponent implements OnInit {
  public showSettings = false;
  showContinue = false;
  fullscreen = true;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.bridge.hasSavedRun().then((has) => {
      this.showContinue = has;
      this.cdr.markForCheck();
    });
  }

  isElectron(): boolean {
    return typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined';
  }

  onPlay(): void {
    this.bridge.clearState();
    this.bridge.clearSavedRun();
    this.router.navigate(['/game']);
  }

  async onContinue(): Promise<void> {
    const ok = await this.bridge.loadRun();
    if (ok) this.router.navigate(['/game']);
    else this.cdr.markForCheck();
  }

  async onSettings(): Promise<void> {
    this.showSettings = true;
    if (this.isElectron()) {
      const api = (window as unknown as { electronAPI?: { getSettings?: () => Promise<{ fullscreen?: boolean }> } }).electronAPI;
      const settings = await api?.getSettings?.();
      this.fullscreen = settings?.fullscreen !== false;
      this.cdr.markForCheck();
    }
  }

  setFullScreen(fullscreen: boolean): void {
    const api = (window as unknown as { electronAPI?: { setFullScreen?: (v: boolean) => void } }).electronAPI;
    if (api?.setFullScreen) api.setFullScreen(fullscreen);
    this.fullscreen = fullscreen;
    this.cdr.markForCheck();
  }

  closeSettings(): void {
    this.showSettings = false;
  }

  setResolution(width: number, height: number): void {
    const w = width | 0;
    const h = height | 0;
    const api = (window as unknown as { electronAPI?: { setWindowSize?: (w: number, h: number) => void } }).electronAPI;
    if (api?.setWindowSize) api.setWindowSize(w, h);
    this.closeSettings();
  }

  onQuit(): void {
    const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
    if (api?.quit) api.quit();
  }
}
