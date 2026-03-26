import {
  Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy,
  HostListener, ElementRef, ViewChild, AfterViewInit, inject
} from '@angular/core';
import { Router } from '@angular/router';
import type { MetaState } from '../../engine/types';
import { GameBridgeService } from '../services/game-bridge.service';
import { SoundService } from '../services/sound.service';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { AssetManifestService } from '../services/asset-manifest.service';
import { LanguageService } from '../services/language.service';
import { ConfirmDialogComponent } from '../components/confirm-dialog.component';

interface EmberParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; life: number; decay: number;
  color: string;
  kind: 'ember' | 'spark' | 'wisp';
  twinklePhase: number;
  twinkleSpeed: number;
}

const LOADING_TIPS = [
  'Block early — taking less damage across fights wins the run.',
  'Read every relic carefully. Some combos change your entire strategy.',
  'The map has multiple paths. Longer routes often yield more rewards.',
  'Exhaust cards permanently remove them from your deck for that run.',
  'Shop early. Removing weak cards from your deck is often better than adding new ones.',
  'Elites are hard, but their relics can be run-defining.',
  'Save your gold — running out mid-sector is dangerous.',
  'Strength buffs multiply with attacks that hit multiple times.',
  'High-cost cards are not always better. Efficiency per energy matters.',
  'Rest sites can also upgrade cards — sometimes that\'s worth more than healing.',
];

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [SettingsModalComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="menu-wrap" [class.bg-ready]="backgroundReady">
      <canvas #emberCanvas class="ember-canvas" aria-hidden="true"></canvas>

      @if (!backgroundReady) {
        <div class="menu-loading-overlay" aria-busy="true">
          <span class="menu-loading-spinner"></span>
          <span class="menu-loading-label">
            {{ lang.t().loadingLabel }}
            @if (assetProgress.total > 0) { {{ assetProgress.loaded }}/{{ assetProgress.total }} }
          </span>
          <span class="menu-loading-tip">{{ currentTip }}</span>
        </div>
      }

      <div class="menu-panel">
        <div class="menu-logo-area">
          <h1 class="menu-title">Slay the Spire Like</h1>
          <p class="menu-tagline">A deck-builder roguelike</p>
        </div>

        @if (meta) {
          <div class="unlocks-section">
            <div class="unlocks-label">{{ lang.t().unlocks }}</div>
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
              <div class="unlocks-hint">{{ lang.t().unlockHint }}</div>
            }
          </div>
        }

        @if (showDataLoadError) {
          <div class="menu-data-error">
            <p>{{ lang.t().dataError }}</p>
            <button type="button" class="menu-btn" (click)="onRetryDataLoad()">
              <span class="menu-btn-inner">{{ lang.t().retry }}</span>
            </button>
          </div>
        }

        <div class="menu-actions">
          @if (showContinue) {
            <button type="button" class="menu-btn menu-btn-primary" (click)="onContinue()">
              <span class="menu-btn-icon">▶</span>
              <span class="menu-btn-inner">{{ lang.t().continueGame }}</span>
            </button>
          }
          <button type="button" class="menu-btn menu-btn-primary" (click)="onPlay()">
            <span class="menu-btn-icon">⚔</span>
            <span class="menu-btn-inner">{{ lang.t().newGame }}</span>
          </button>
          <button type="button" class="menu-btn" (click)="onHowToPlay()">
            <span class="menu-btn-icon">?</span>
            <span class="menu-btn-inner">{{ lang.t().howToPlay }}</span>
          </button>
          <button type="button" class="menu-btn" (click)="onSettings()">
            <span class="menu-btn-icon">⚙</span>
            <span class="menu-btn-inner">{{ lang.t().settings }}</span>
          </button>
          <button type="button" class="menu-btn menu-btn-dim" (click)="onCredits()">
            <span class="menu-btn-icon">★</span>
            <span class="menu-btn-inner">{{ lang.t().credits }}</span>
          </button>
          @if (isElectron()) {
            <button type="button" class="menu-btn menu-btn-danger" (click)="onQuit()">
              <span class="menu-btn-icon">✕</span>
              <span class="menu-btn-inner">{{ lang.t().quit }}</span>
            </button>
          }
        </div>

        <div class="menu-footer">
          <span class="menu-version">v0.1.0</span>
        </div>
      </div>

      @if (showSettings) {
        <app-settings-modal [closeButtonLabel]="lang.t().close" (close)="closeSettings()" />
      }

      @if (showConfirm) {
        <app-confirm-dialog
          [title]="lang.t().confirmNewGame"
          [body]="lang.t().confirmNewGameBody"
          [labelConfirm]="lang.t().confirmYes"
          [labelCancel]="lang.t().confirmNo"
          (confirm)="onConfirmNewGame()"
          (cancel)="onCancelNewGame()"
        />
      }

      @if (showHowToPlay) {
        <div class="htp-backdrop" (click)="closeHowToPlay()"></div>
        <div class="htp-modal" (click)="$event.stopPropagation()">
          <h2 class="htp-title">{{ lang.t().howToPlayTitle }}</h2>
          <div class="htp-grid">
            <div class="htp-card">
              <div class="htp-card-icon">🃏</div>
              <div class="htp-card-title">{{ lang.t().htp1Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp1Body }}</div>
            </div>
            <div class="htp-card">
              <div class="htp-card-icon">⚡</div>
              <div class="htp-card-title">{{ lang.t().htp2Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp2Body }}</div>
            </div>
            <div class="htp-card">
              <div class="htp-card-icon">👁</div>
              <div class="htp-card-title">{{ lang.t().htp3Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp3Body }}</div>
            </div>
            <div class="htp-card">
              <div class="htp-card-icon">🗺</div>
              <div class="htp-card-title">{{ lang.t().htp4Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp4Body }}</div>
            </div>
            <div class="htp-card">
              <div class="htp-card-icon">💎</div>
              <div class="htp-card-title">{{ lang.t().htp5Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp5Body }}</div>
            </div>
            <div class="htp-card">
              <div class="htp-card-icon">🏆</div>
              <div class="htp-card-title">{{ lang.t().htp6Title }}</div>
              <div class="htp-card-body">{{ lang.t().htp6Body }}</div>
            </div>
          </div>
          <button type="button" class="htp-close-btn" (click)="closeHowToPlay()">{{ lang.t().close }}</button>
        </div>
      }

      @if (showCredits) {
        <div class="credits-backdrop" (click)="closeCredits()"></div>
        <div class="credits-modal" (click)="$event.stopPropagation()">
          <h2 class="credits-title">{{ lang.t().creditsTitle }}</h2>
          <div class="credits-list">
            <div class="credits-row">
              <span class="credits-role">{{ lang.t().creditsDev }}</span>
              <span class="credits-name">The Development Team</span>
            </div>
            <div class="credits-row">
              <span class="credits-role">{{ lang.t().creditsArt }}</span>
              <span class="credits-name">Concept & Visual Artists</span>
            </div>
            <div class="credits-row">
              <span class="credits-role">{{ lang.t().creditsMusic }}</span>
              <span class="credits-name">Audio Production Team</span>
            </div>
          </div>
          <div class="credits-engine">{{ lang.t().creditsEngine }}</div>
          <button type="button" class="htp-close-btn" (click)="closeCredits()">{{ lang.t().creditsClose }}</button>
        </div>
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
      background: #09080a center center no-repeat;
      background-size: cover;
    }

    .menu-wrap.bg-ready {
      background-image: url('/assets/main-menu.jpg');
    }

    .ember-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
    }

    .menu-wrap::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 100%);
      pointer-events: none;
      z-index: 1;
    }

    .menu-loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      background: #09080a;
      z-index: 10;
    }

    .menu-loading-spinner {
      width: 42px;
      height: 42px;
      border: 3px solid rgba(255, 255, 255, 0.08);
      border-top-color: #c8a030;
      border-radius: 50%;
      animation: menuSpin 0.8s linear infinite;
    }

    @keyframes menuSpin { to { transform: rotate(360deg); } }

    .menu-loading-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1rem;
      color: #7a6030;
      letter-spacing: 0.06em;
    }

    .menu-loading-tip {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.8rem;
      color: #4a3a18;
      font-style: italic;
      text-align: center;
      max-width: 340px;
      padding: 0 1rem;
      line-height: 1.5;
      animation: tipFadeIn 0.6s ease-out both;
    }

    @keyframes tipFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── panel ── */
    .menu-panel {
      position: relative;
      z-index: 2;
      background: rgba(10, 8, 3, 0.92);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(158, 118, 34, 0.52);
      border-radius: 20px;
      padding: 2.8rem 3.2rem 2rem;
      box-shadow:
        0 0 0 1px rgba(100, 74, 12, 0.18) inset,
        0 0 60px rgba(80, 55, 10, 0.45),
        0 10px 40px rgba(0, 0, 0, 0.75),
        inset 0 1px 0 rgba(255, 240, 180, 0.06);
      animation: panelIn 0.55s cubic-bezier(0.34, 1.1, 0.64, 1);
      min-width: 300px;
    }

    .menu-panel::before {
      content: '';
      position: absolute;
      top: 0; left: 10%; right: 10%;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, rgba(200,158,42,0.9) 50%, transparent 100%);
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
      color: #f4d98a;
      letter-spacing: 0.06em;
      text-shadow:
        0 0 28px rgba(200, 158, 42, 0.7),
        0 0 56px rgba(160, 112, 20, 0.35),
        0 3px 6px rgba(0, 0, 0, 0.9);
      animation: titleGlow 3.5s ease-in-out infinite;
    }

    @keyframes titleGlow {
      0%, 100% { text-shadow: 0 0 28px rgba(200,158,42,0.7), 0 0 56px rgba(160,112,20,0.35), 0 3px 6px rgba(0,0,0,0.9); }
      50%       { text-shadow: 0 0 40px rgba(230,180,55,0.9), 0 0 80px rgba(190,138,28,0.5), 0 3px 6px rgba(0,0,0,0.9); }
    }

    .menu-tagline {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      font-weight: 400;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #6a5428;
      margin: 0;
    }

    /* ── unlocks ── */
    .unlocks-section {
      margin-bottom: 1.25rem;
      padding: 0.75rem 1rem;
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      border: 1px solid rgba(158, 118, 34, 0.2);
    }

    .unlocks-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6a5428;
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
      color: #d4b87a;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
    }

    .unlock-card {
      background: rgba(80, 60, 14, 0.35);
      border: 1px solid rgba(160, 118, 36, 0.28);
    }

    .unlock-relic {
      background: rgba(120, 90, 10, 0.35);
      border: 1px solid rgba(200, 158, 30, 0.3);
      color: #e8d070;
    }

    .unlocks-hint {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      color: #4a3818;
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
    .menu-actions .menu-btn:nth-child(6) { animation: btnIn 0.45s 0.52s ease-out both; }

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
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 0.98rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      cursor: pointer;
      color: #e8d8a0;
      border: 1px solid rgba(158, 118, 34, 0.45);
      border-radius: 12px;
      background: linear-gradient(160deg, #2c2210 0%, #1a1408 100%);
      box-shadow:
        0 5px 0 #0e0a04,
        0 6px 18px rgba(0, 0, 0, 0.55),
        inset 0 1px 0 rgba(255, 240, 160, 0.08);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 12px;
        padding: 1px;
        background: linear-gradient(170deg, rgba(255,240,160,0.15) 0%, rgba(255,220,80,0.04) 50%, transparent 100%);
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
        0 8px 0 #0e0a04,
        0 12px 28px rgba(0, 0, 0, 0.6),
        0 0 22px rgba(180, 136, 30, 0.4),
        inset 0 1px 0 rgba(255, 240, 160, 0.14);
      filter: brightness(1.12);
      border-color: rgba(210, 160, 50, 0.65);
    }

    .menu-btn:active {
      transform: translateY(2px) scale(0.99);
      box-shadow: 0 2px 0 #0e0a04, 0 2px 8px rgba(0,0,0,0.5);
    }

    .menu-btn-primary {
      background: linear-gradient(160deg, #5a3e10 0%, #3c2808 45%, #2a1c04 100%);
      border-color: rgba(180, 136, 36, 0.6);
      color: #f4d98a;
      box-shadow:
        0 5px 0 #180f02,
        0 6px 22px rgba(0, 0, 0, 0.55),
        0 0 18px rgba(160, 112, 20, 0.22),
        inset 0 1px 0 rgba(255, 240, 160, 0.16);
      &:hover {
        box-shadow:
          0 8px 0 #180f02,
          0 12px 30px rgba(0, 0, 0, 0.6),
          0 0 36px rgba(200, 155, 40, 0.55),
          inset 0 1px 0 rgba(255, 240, 160, 0.22);
        border-color: rgba(220, 168, 50, 0.8);
      }
    }

    .menu-btn-dim {
      opacity: 0.7;
      &:hover { opacity: 1; }
    }

    .menu-btn-danger {
      background: linear-gradient(160deg, #6a2828 0%, #421515 100%);
      border-color: rgba(180, 60, 60, 0.4);
      color: #f0c0c0;
      box-shadow: 0 5px 0 #281010, 0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,200,200,0.08);
      &:hover {
        box-shadow: 0 8px 0 #281010, 0 12px 28px rgba(0,0,0,0.55), 0 0 22px rgba(200, 60, 60, 0.35);
        border-color: rgba(220, 80, 80, 0.6);
      }
    }

    .menu-btn-icon {
      font-size: 1em;
      opacity: 0.7;
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
      color: #3a2e12;
      letter-spacing: 0.1em;
    }

    /* ── How to Play modal ── */
    .htp-backdrop, .credits-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 1500;
    }

    .htp-modal, .credits-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1501;
      width: 92vw;
      max-width: 720px;
      max-height: 88vh;
      overflow-y: auto;
      background: rgba(10, 8, 3, 0.98);
      border: 1px solid rgba(158, 118, 34, 0.55);
      border-radius: 20px;
      padding: 2.2rem 2.4rem 2rem;
      box-shadow: 0 0 80px rgba(80,55,10,0.5), 0 20px 60px rgba(0,0,0,0.85);
      animation: modalIn 0.32s cubic-bezier(0.34,1.2,0.64,1) both;

      &::before {
        content: '';
        position: absolute;
        top: 0; left: 10%; right: 10%;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(200,158,42,0.9), transparent);
        border-radius: 20px 20px 0 0;
      }
    }

    @keyframes modalIn {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.9) translateY(16px); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1) translateY(0); }
    }

    .htp-title, .credits-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 1.5rem;
      font-weight: 700;
      color: #f4d98a;
      text-align: center;
      letter-spacing: 0.08em;
      margin-bottom: 1.75rem;
      text-shadow: 0 0 24px rgba(200,158,42,0.6), 0 2px 4px rgba(0,0,0,0.9);
    }

    .htp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 14px;
      margin-bottom: 1.75rem;
    }

    .htp-card {
      background: rgba(20,15,4,0.85);
      border: 1px solid rgba(158,118,34,0.28);
      border-radius: 14px;
      padding: 1.1rem 1.2rem;
      transition: transform 0.18s ease, box-shadow 0.2s ease;
      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(80,55,10,0.4), 0 0 16px rgba(180,136,30,0.2);
        border-color: rgba(200,158,42,0.45);
      }
    }

    .htp-card-icon {
      font-size: 1.8rem;
      margin-bottom: 0.6rem;
    }

    .htp-card-title {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 0.88rem;
      font-weight: 700;
      color: #f4d98a;
      margin-bottom: 0.5rem;
      letter-spacing: 0.04em;
    }

    .htp-card-body {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.8rem;
      color: #8a7040;
      line-height: 1.5;
    }

    .htp-close-btn {
      display: block;
      margin: 0 auto;
      padding: 12px 36px;
      font-family: 'Cinzel', Georgia, serif;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #e8d8a0;
      border: 1px solid rgba(158,118,34,0.5);
      border-radius: 12px;
      background: linear-gradient(160deg, #2c2210 0%, #1a1408 100%);
      cursor: pointer;
      box-shadow: 0 4px 0 #0e0a04, 0 5px 16px rgba(0,0,0,0.4);
      transition: transform 0.15s, filter 0.15s, box-shadow 0.18s;
      &:hover {
        transform: translateY(-2px);
        filter: brightness(1.12);
        border-color: rgba(210,160,50,0.65);
        box-shadow: 0 6px 0 #0e0a04, 0 8px 22px rgba(0,0,0,0.5), 0 0 18px rgba(180,136,30,0.35);
      }
      &:active { transform: translateY(0); }
    }

    /* ── Credits modal ── */
    .credits-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 1.5rem;
    }

    .credits-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 18px;
      background: rgba(20,15,4,0.85);
      border: 1px solid rgba(158,118,34,0.2);
      border-radius: 12px;
      animation: creditsRowIn 0.4s ease-out both;
    }

    .credits-row:nth-child(1) { animation-delay: 0.05s; }
    .credits-row:nth-child(2) { animation-delay: 0.12s; }
    .credits-row:nth-child(3) { animation-delay: 0.19s; }

    @keyframes creditsRowIn {
      from { opacity: 0; transform: translateX(-10px); }
      to   { opacity: 1; transform: translateX(0); }
    }

    .credits-role {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #6a5428;
    }

    .credits-name {
      font-family: 'Cinzel', Georgia, serif;
      font-size: 1rem;
      font-weight: 700;
      color: #f4d98a;
      letter-spacing: 0.04em;
    }

    .credits-engine {
      text-align: center;
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.78rem;
      color: #4a3818;
      margin-bottom: 1.5rem;
      font-style: italic;
    }
  `],
})
export class MainMenuComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('emberCanvas') emberCanvasRef!: ElementRef<HTMLCanvasElement>;

  public showSettings = false;
  showConfirm = false;
  showHowToPlay = false;
  showCredits = false;
  showContinue = false;
  meta: MetaState | null = null;
  backgroundReady = false;
  assetProgress = { loaded: 0, total: 0, label: '' };
  currentTip = '';

  readonly lang = inject(LanguageService);

  private emberParticles: EmberParticle[] = [];
  private emberAnimId: number | null = null;
  private emberResizeHandler: (() => void) | null = null;
  private emberCtx: CanvasRenderingContext2D | null = null;
  private tipInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private sound: SoundService,
    private assets: AssetManifestService,
    private cdr: ChangeDetectorRef
  ) { }

  showDataLoadError = false;

  ngAfterViewInit(): void {
    this.startEmberParticles();
  }

  ngOnDestroy(): void {
    if (this.emberAnimId != null) cancelAnimationFrame(this.emberAnimId);
    if (this.emberResizeHandler) window.removeEventListener('resize', this.emberResizeHandler);
    if (this.tipInterval) clearInterval(this.tipInterval);
    this.emberAnimId = null;
    this.emberCtx = null;
    this.emberParticles = [];
  }

  private pickTip(): void {
    this.currentTip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    this.cdr.markForCheck();
  }

  private makeEmber(canvas: HTMLCanvasElement, fromBottom = false): EmberParticle {
    const roll = Math.random();
    const kind: EmberParticle['kind'] = roll < 0.62 ? 'ember' : roll < 0.85 ? 'spark' : 'wisp';

    const emberColors = ['#ff6030', '#ff8040', '#ffaa50', '#ffcc60', '#ffd080', '#ff4420', '#ffa030', '#ff7010', '#ff5820', '#ffb840'];
    const sparkColors = ['#fff8e0', '#ffe8a0', '#ffffff', '#ffe0c0', '#ffd0a0'];
    const wispColors  = ['#ff3010', '#ff6620', '#c84400', '#ff9940', '#d06020', '#ff4c28'];

    const colorPalette = kind === 'ember' ? emberColors : kind === 'spark' ? sparkColors : wispColors;
    const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];

    const startY = fromBottom ? canvas.height + Math.random() * 30 : Math.random() * canvas.height;

    if (kind === 'spark') {
      return {
        x: Math.random() * canvas.width,
        y: startY,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 0.8 + Math.random() * 1.8,
        size: 0.5 + Math.random() * 1.0,
        life: 0.5 + Math.random() * 0.5,
        decay: 0.003 + Math.random() * 0.005,
        color,
        kind,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.08 + Math.random() * 0.14,
      };
    }

    if (kind === 'wisp') {
      return {
        x: Math.random() * canvas.width,
        y: startY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.18 + Math.random() * 0.45,
        size: 3.5 + Math.random() * 5.0,
        life: 0.12 + Math.random() * 0.22,
        decay: 0.0003 + Math.random() * 0.0008,
        color,
        kind,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.01 + Math.random() * 0.025,
      };
    }

    return {
      x: Math.random() * canvas.width,
      y: startY,
      vx: (Math.random() - 0.5) * 0.7,
      vy: 0.35 + Math.random() * 0.9,
      size: 0.8 + Math.random() * 2.8,
      life: 0.25 + Math.random() * 0.75,
      decay: 0.0008 + Math.random() * 0.0025,
      color,
      kind,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.04,
    };
  }

  private startEmberParticles(): void {
    const canvas = this.emberCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.emberCtx = ctx;

    const resize = (): void => {
      canvas.width = canvas.offsetWidth || window.innerWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    };
    resize();
    this.emberResizeHandler = resize;
    window.addEventListener('resize', resize);

    this.emberParticles = Array.from({ length: 120 }, () => this.makeEmber(canvas));

    let lastTime = 0;
    const animate = (ts: number): void => {
      if (!this.emberCtx || !canvas) return;
      const dt = Math.min((ts - lastTime) / 16.67, 3);
      lastTime = ts;
      this.emberCtx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < this.emberParticles.length; i++) {
        const p = this.emberParticles[i];
        p.twinklePhase += p.twinkleSpeed * dt;

        const windX = Math.sin(ts * 0.00055 + i * 0.37) * 0.28 + Math.cos(ts * 0.00031 + i * 0.19) * 0.18;
        p.x += (p.vx + windX) * dt;
        p.y -= p.vy * dt;
        p.life -= p.decay * dt;

        if (p.life <= 0 || p.y < -12) {
          this.emberParticles[i] = this.makeEmber(canvas, true);
          continue;
        }

        const twinkle = 0.75 + Math.sin(p.twinklePhase) * 0.25;

        this.emberCtx.save();

        if (p.kind === 'wisp') {
          const alpha = Math.min(p.life, 0.18) * twinkle;
          const radius = p.size * (0.4 + p.life * 0.6);
          const grad = this.emberCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
          grad.addColorStop(0, p.color + 'aa');
          grad.addColorStop(1, p.color + '00');
          this.emberCtx.globalAlpha = alpha;
          this.emberCtx.shadowBlur = 18;
          this.emberCtx.shadowColor = p.color;
          this.emberCtx.fillStyle = grad;
          this.emberCtx.beginPath();
          this.emberCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          this.emberCtx.fill();
        } else if (p.kind === 'spark') {
          const alpha = Math.min(p.life, 0.95) * twinkle;
          const radius = p.size * (0.3 + p.life * 0.7);
          this.emberCtx.globalAlpha = alpha;
          this.emberCtx.shadowBlur = 14;
          this.emberCtx.shadowColor = p.color;
          this.emberCtx.fillStyle = p.color;
          this.emberCtx.beginPath();
          this.emberCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          this.emberCtx.fill();
          if (p.life > 0.6) {
            this.emberCtx.globalAlpha = alpha * 0.4;
            this.emberCtx.beginPath();
            this.emberCtx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2);
            this.emberCtx.fill();
          }
        } else {
          const lifeRatio = Math.min(p.life, 1);
          const alpha = lifeRatio * (p.size > 2 ? 0.72 : 0.88) * twinkle;
          const radius = p.size * (0.5 + lifeRatio * 0.5);
          this.emberCtx.globalAlpha = alpha;
          this.emberCtx.shadowBlur = p.size > 2 ? 12 : 6;
          this.emberCtx.shadowColor = p.color;
          this.emberCtx.fillStyle = p.color;
          this.emberCtx.beginPath();
          this.emberCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          this.emberCtx.fill();
        }

        this.emberCtx.restore();
      }
      this.emberAnimId = requestAnimationFrame(animate);
    };
    this.emberAnimId = requestAnimationFrame(animate);
  }

  async ngOnInit(): Promise<void> {
    this.sound.startMainMenuSoundtrack();
    this.pickTip();
    this.tipInterval = setInterval(() => this.pickTip(), 4000);

    void this.assets.loadGroup('boot', [
      '/assets/UI/header/header-1440p.png',
      '/assets/UI/footer/footer.png',
      '/assets/UI/hp/BarV5_Bar.png',
      '/assets/UI/hp/BarV5_ProgressBar.png',
      '/assets/UI/hp/BarV5_ProgressBarBorder.png',
      '/assets/UI/shield/BarV9_Bar.png',
      '/assets/UI/shield/BarV9_ProgressBar.png',
      '/assets/UI/shield/BarV6_ProgressBarBorder.png'
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
    if (this.showContinue) {
      this.showConfirm = true;
      this.cdr.markForCheck();
    } else {
      this.startNewGame();
    }
  }

  onConfirmNewGame(): void {
    this.showConfirm = false;
    this.startNewGame();
  }

  onCancelNewGame(): void {
    this.showConfirm = false;
    this.cdr.markForCheck();
  }

  private startNewGame(): void {
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
    if (this.showHowToPlay) { this.closeHowToPlay(); return; }
    if (this.showCredits) { this.closeCredits(); return; }
    if (this.showConfirm) { this.onCancelNewGame(); return; }
    if (this.showSettings) this.closeSettings();
  }

  onSettings(): void { this.showSettings = true; this.cdr.markForCheck(); }
  closeSettings(): void { this.showSettings = false; this.cdr.markForCheck(); }

  onHowToPlay(): void { this.showHowToPlay = true; this.cdr.markForCheck(); }
  closeHowToPlay(): void { this.showHowToPlay = false; this.cdr.markForCheck(); }

  onCredits(): void { this.showCredits = true; this.cdr.markForCheck(); }
  closeCredits(): void { this.showCredits = false; this.cdr.markForCheck(); }

  onQuit(): void {
    const api = (window as unknown as { electronAPI?: { quit?: () => void } }).electronAPI;
    if (api?.quit) api.quit();
  }
}
