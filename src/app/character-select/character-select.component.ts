import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameBridgeService } from '../services/game-bridge.service';
import { LanguageService } from '../services/language.service';
import type { CharacterDef } from '../../engine/loadData';

const CHARACTER_TIPS = [
  'Tip: Your starter relic defines your early game. Read it carefully.',
  'Tip: You can view your full deck at any time during a run.',
  'Tip: The map shows all possible paths — plan ahead before moving.',
  'Tip: Each character has unique card synergies. Explore them all.',
  'Tip: Losing is how you learn what to do differently next time.',
];

@Component({
  selector: 'app-character-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="char-wrap" [class.bg-ready]="backgroundReady">
      @if (!backgroundReady) {
        <div class="char-loading-overlay" aria-busy="true">
          <span class="char-loading-spinner"></span>
          <span class="char-loading-label">{{ lang.t().loadingLabel }}</span>
          <span class="char-loading-tip">{{ currentTip }}</span>
        </div>
      }
      <div class="char-panel">
        <div class="char-header">
          <h1 class="char-title">{{ lang.t().chooseCharacter }}</h1>
          <p class="char-subtitle">{{ lang.t().characterSubtitle }}</p>
        </div>
        <div class="char-grid">
          @for (char of characters; track char.id; let i = $index) {
            <button
              type="button"
              class="char-card"
              [class.char-card--selected]="selectedId === char.id"
              [style.animation-delay]="(i * 0.08) + 's'"
              (click)="onSelect(char)"
              [attr.aria-label]="char.name + ', ' + char.startingMaxHp + ' ' + lang.t().hp"
            >
              <div class="char-card-art-wrap">
                @if (getCharacterImageUrl(char.id)) {
                  <img class="char-card-art" [src]="getCharacterImageUrl(char.id)" [alt]="char.name" />
                } @else {
                  <div class="char-card-art-placeholder">{{ char.name[0] }}</div>
                }
                <div class="char-card-art-glow"></div>
              </div>
              <div class="char-card-body">
                <div class="char-card-name">{{ char.name }}</div>
                <div class="char-card-desc">{{ char.description || 'A mysterious warrior.' }}</div>
                <div class="char-card-meta">
                  <span class="char-meta-badge badge-hp">❤ {{ char.startingMaxHp ?? 70 }} {{ lang.t().hp }}</span>
                  @if (char.starterRelicId) {
                    <span class="char-meta-badge badge-relic">◆ {{ getRelicName(char.starterRelicId) }}</span>
                  }
                </div>
                <div class="char-card-cta">{{ lang.t().select }}</div>
              </div>
            </button>
          }
        </div>
        <div class="char-actions">
          <button type="button" class="char-btn char-btn-back" (click)="onBack()">
            {{ lang.t().back }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }

    .char-wrap {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      background: #09080a center center no-repeat;
      background-size: cover;
      padding: 2rem;
    }

    .char-wrap.bg-ready {
      background-image: url('/assets/main-menu.jpg');
    }

    .char-wrap::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.72) 100%);
      pointer-events: none;
      z-index: 0;
    }

    /* ── loading ── */
    .char-loading-overlay {
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

    .char-loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.08);
      border-top-color: #c8a030;
      border-radius: 50%;
      animation: charSpin 0.8s linear infinite;
    }

    @keyframes charSpin { to { transform: rotate(360deg); } }

    .char-loading-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1rem;
      color: #7a6030;
      letter-spacing: 0.06em;
    }

    .char-loading-tip {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.8rem;
      color: #4a3a18;
      font-style: italic;
      text-align: center;
      max-width: 320px;
      padding: 0 1rem;
      line-height: 1.5;
      animation: tipFadeIn 0.6s ease-out both;
    }

    @keyframes tipFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── panel ── */
    .char-panel {
      position: relative;
      z-index: 1;
      background: rgba(10, 8, 3, 0.92);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(158, 118, 34, 0.52);
      border-radius: 20px;
      padding: 2.2rem 2.5rem 2rem;
      box-shadow:
        0 0 60px rgba(80, 55, 10, 0.4),
        0 16px 50px rgba(0, 0, 0, 0.8),
        inset 0 1px 0 rgba(255, 240, 160, 0.05);
      max-width: 820px;
      width: 100%;
      animation: panelIn 0.45s cubic-bezier(0.34, 1.1, 0.64, 1);
    }

    .char-panel::before {
      content: '';
      position: absolute;
      top: 0; left: 10%; right: 10%;
      height: 2px;
      background: linear-gradient(90deg, transparent 0%, rgba(200,158,42,0.9) 50%, transparent 100%);
      border-radius: 20px 20px 0 0;
    }

    @keyframes panelIn {
      from { opacity: 0; transform: scale(0.94) translateY(12px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* ── header ── */
    .char-header {
      text-align: center;
      margin-bottom: 1.75rem;
    }

    .char-title {
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      margin: 0 0 0.35rem;
      color: #f4d98a;
      text-shadow: 0 0 28px rgba(200, 158, 42, 0.7), 0 2px 4px rgba(0,0,0,0.9);
    }

    .char-subtitle {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.85rem;
      color: #6a5428;
      margin: 0;
      letter-spacing: 0.04em;
    }

    /* ── character grid ── */
    .char-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 14px;
      margin-bottom: 1.75rem;
    }

    .char-card {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      text-align: left;
      padding: 0;
      border-radius: 14px;
      border: 1px solid rgba(158, 118, 34, 0.38);
      background: linear-gradient(175deg, rgba(28, 20, 8, 0.9) 0%, rgba(14, 10, 4, 0.97) 100%);
      cursor: pointer;
      overflow: hidden;
      transition: transform 0.18s ease, box-shadow 0.22s ease, border-color 0.18s ease;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,160,0.04);
      animation: charCardIn 0.38s cubic-bezier(0.34, 1.15, 0.64, 1) both;

      &:hover {
        transform: translateY(-5px) scale(1.015);
        box-shadow:
          0 14px 40px rgba(80, 55, 10, 0.5),
          0 0 28px rgba(180, 136, 30, 0.28);
        border-color: rgba(210, 160, 50, 0.7);
      }

      &:active { transform: translateY(-1px) scale(1.005); }

      &.char-card--selected {
        border-color: rgba(220, 168, 50, 0.9);
        box-shadow:
          0 0 0 2px rgba(200, 158, 42, 0.5),
          0 12px 36px rgba(0,0,0,0.5),
          0 0 32px rgba(180, 136, 30, 0.45);
        animation: charCardSelected 0.25s cubic-bezier(0.34, 1.4, 0.64, 1) both;
      }
    }

    @keyframes charCardIn {
      from { opacity: 0; transform: translateY(18px) scale(0.94); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes charCardSelected {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.03); }
      100% { transform: scale(1); }
    }

    /* ── art ── */
    .char-card-art-wrap {
      position: relative;
      width: 100%;
      height: 180px;
      overflow: hidden;
      background: linear-gradient(180deg, #0e0a04 0%, #1a1006 100%);
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .char-card-art {
      height: 175px;
      width: auto;
      object-fit: contain;
      object-position: bottom center;
      display: block;
      filter: drop-shadow(0 0 16px rgba(180, 138, 30, 0.35));
      transition: transform 0.22s ease, filter 0.22s ease;
    }

    .char-card:hover .char-card-art {
      transform: scale(1.05) translateY(-4px);
      filter: drop-shadow(0 0 28px rgba(220, 168, 50, 0.6));
    }

    .char-card-art-placeholder {
      height: 175px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 4rem;
      color: rgba(158, 118, 34, 0.45);
      font-family: 'Cinzel', serif;
    }

    .char-card-art-glow {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 60px;
      background: linear-gradient(0deg, rgba(14,10,4,0.97) 0%, transparent 100%);
      pointer-events: none;
    }

    /* ── body ── */
    .char-card-body {
      padding: 1rem 1.25rem 1.2rem;
    }

    .char-card-name {
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 1.1rem;
      font-weight: 700;
      color: #f0e8c0;
      margin-bottom: 0.4rem;
      letter-spacing: 0.03em;
    }

    .char-card-desc {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.82rem;
      color: #8a7040;
      line-height: 1.45;
      margin-bottom: 0.75rem;
    }

    .char-card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 0.85rem;
    }

    .char-meta-badge {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 12px;
      letter-spacing: 0.02em;
    }

    .badge-hp {
      background: rgba(180, 50, 50, 0.2);
      border: 1px solid rgba(220, 80, 80, 0.3);
      color: #f08080;
    }

    .badge-relic {
      background: rgba(130, 96, 10, 0.22);
      border: 1px solid rgba(200, 158, 30, 0.35);
      color: #e8c840;
    }

    .char-card-cta {
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 0.8rem;
      font-weight: 700;
      color: rgba(158, 120, 36, 0.65);
      letter-spacing: 0.1em;
      transition: color 0.15s;
    }

    .char-card:hover .char-card-cta {
      color: rgba(220, 168, 50, 0.95);
    }

    /* ── actions ── */
    .char-actions {
      display: flex;
      justify-content: center;
    }

    .char-btn {
      padding: 12px 28px;
      font-family: 'Cinzel', 'Palatino Linotype', Georgia, serif;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      cursor: pointer;
      color: #e8d8a0;
      border: 1px solid rgba(158, 118, 34, 0.48);
      border-radius: 12px;
      background: linear-gradient(160deg, #2c2210 0%, #1a1408 100%);
      box-shadow: 0 4px 0 #0e0a04, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,160,0.07);
      transition: transform 0.15s, box-shadow 0.2s, filter 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 0 #0e0a04, 0 10px 24px rgba(0,0,0,0.55), 0 0 20px rgba(180,136,30,0.3);
        filter: brightness(1.12);
        border-color: rgba(210, 160, 50, 0.65);
      }

      &:active { transform: translateY(1px); }
    }
  `],
})
export class CharacterSelectComponent implements OnInit, OnDestroy {
  characters: CharacterDef[] = [];
  backgroundReady = false;
  selectedId: string | null = null;
  currentTip = '';

  readonly lang = inject(LanguageService);

  private tipInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.pickTip();
    this.tipInterval = setInterval(() => this.pickTip(), 4000);
    try {
      await this.bridge.ensureDataLoaded();
    } catch {
      // data load failed, may show empty list
    }
    this.characters = this.bridge.getCharacters();
    this.loadBackground();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.tipInterval) clearInterval(this.tipInterval);
  }

  private pickTip(): void {
    this.currentTip = CHARACTER_TIPS[Math.floor(Math.random() * CHARACTER_TIPS.length)];
    this.cdr.markForCheck();
  }

  private loadBackground(): void {
    const img = new Image();
    img.onload = () => { this.backgroundReady = true; this.cdr.markForCheck(); };
    img.onerror = () => { this.backgroundReady = true; this.cdr.markForCheck(); };
    img.src = '/assets/main-menu.jpg';
  }

  getRelicName(relicId: string): string {
    return this.bridge.getRelicName(relicId);
  }

  private static readonly CHARACTER_ART: Record<string, string> = {
    gungirl: '/assets/characters/gungirl/portrait.png',
    verdant_machinist: '/assets/characters/verdant_machinist/portrait.png',
    chibi: '/assets/characters/chibi/portrait.png',
  };
  getCharacterImageUrl(charId: string): string {
    return CharacterSelectComponent.CHARACTER_ART[charId] ?? '';
  }

  onSelect(char: CharacterDef): void {
    this.selectedId = char.id;
    this.cdr.markForCheck();
    this.bridge.setPendingCharacter(char.id);
    setTimeout(() => this.router.navigate(['/game']), 280);
  }

  onBack(): void {
    this.router.navigate(['/']);
  }
}
