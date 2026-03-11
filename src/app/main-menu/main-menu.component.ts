import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import type { MetaState } from '../../engine/types';
import { GameBridgeService } from '../services/game-bridge.service';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [SettingsModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-wrap">
      <div class="menu-panel">
        <h1 class="menu-title">Slay the Spire Like</h1>
        @if (meta) {
          <div class="unlocks-section">
            <div class="unlocks-label">Unlocks</div>
            @if (meta.unlockedCards.length > 0 || meta.unlockedRelics.length > 0) {
              <div class="unlocks-list">
                @for (id of meta.unlockedCards; track id) {
                  <span class="unlock-item">{{ getCardDisplayName(id) }}</span>
                }
                @for (id of meta.unlockedRelics; track id) {
                  <span class="unlock-item">{{ getRelicDisplayName(id) }}</span>
                }
              </div>
            } @else {
              <div class="unlocks-hint">Reach sector 2 or win a run to unlock more content.</div>
            }
          </div>
        }
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
        <app-settings-modal closeButtonLabel="Close" (close)="closeSettings()" />
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
      .unlocks-section {
        margin-bottom: 1rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .unlocks-label {
        font-size: 0.75rem;
        color: #aaa;
        margin-bottom: 0.35rem;
      }
      .unlocks-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .unlock-item {
        font-size: 0.8rem;
        color: #ccc;
        background: rgba(80,70,120,0.4);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
      }
      .unlocks-hint {
        font-size: 0.8rem;
        color: #888;
      }
    `,
  ],
})
export class MainMenuComponent implements OnInit {
  public showSettings = false;
  showContinue = false;
  meta: MetaState | null = null;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.bridge.ensureDataLoaded();
    this.meta = this.bridge.getMeta();
    const has = await this.bridge.hasSavedRun();
    this.showContinue = has;
    this.cdr.markForCheck();
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
    this.router.navigate(['/game']);
  }

  async onContinue(): Promise<void> {
    const ok = await this.bridge.loadRun();
    if (ok) this.router.navigate(['/game']);
    else this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showSettings) {
      this.closeSettings();
    }
  }

  onSettings(): void {
    this.showSettings = true;
    this.cdr.markForCheck();
  }

  closeSettings(): void {
    this.showSettings = false;
    this.cdr.markForCheck();
  }

  onQuit(): void {
    const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
    if (api?.quit) api.quit();
  }
}
