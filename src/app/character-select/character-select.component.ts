import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GameBridgeService } from '../services/game-bridge.service';
import type { CharacterDef } from '../../engine/loadData';

@Component({
  selector: 'app-character-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="char-wrap" [class.bg-ready]="backgroundReady">
      @if (!backgroundReady) {
        <div class="char-loading-overlay" aria-busy="true">
          <span class="char-loading-spinner"></span>
          <span class="char-loading-label">Loading…</span>
        </div>
      }
      <div class="char-panel">
      <div class="char-header">
          <h1 class="char-title">Choose Your Character</h1>
          <p class="char-subtitle">Each character begins with a unique starter deck.</p>
        </div>
        <div class="char-grid">
          @for (char of characters; track char.id) {
            <button
              type="button"
              class="char-card"
              (click)="onSelect(char)"
            >
            <div class="char-card-art-wrap">
            @if (getCharacterImageUrl(char.id)) {
              <img class="char-card-art" [src]="getCharacterImageUrl(char.id)" alt="{{ char.name }}" />
                } @else {
                  <div class="char-card-art-placeholder">{{ char.name[0] }}</div>
                }
                <div class="char-card-art-glow"></div>
              </div>
              <div class="char-card-body">
                <div class="char-card-name">{{ char.name }}</div>
                <div class="char-card-desc">{{ char.description || 'A mysterious warrior.' }}</div>
                <div class="char-card-meta">
                  <span class="char-meta-badge badge-hp">❤ {{ char.startingMaxHp ?? 70 }} HP</span>
                  @if (char.starterRelicId) {
                    <span class="char-meta-badge badge-relic">◆ {{ getRelicName(char.starterRelicId) }}</span>
                  }
                </div>
                <div class="char-card-cta">Select →</div>
              </div>
            </button>
          }
        </div>
        <div class="char-actions">
          <button type="button" class="char-btn char-btn-back" (click)="onBack()">
          ← Back
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
      background: #07050f center center no-repeat;
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
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) 100%);
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
      background: #07050f;
      z-index: 10;
    }

    .char-loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #b48cff;
      border-radius: 50%;
      animation: charSpin 0.8s linear infinite;
    }

    @keyframes charSpin { to { transform: rotate(360deg); } }

    .char-loading-label {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1rem;
      color: #6a6090;
      letter-spacing: 0.06em;
    }

    /* ── panel ── */
    .char-panel {
      position: relative;
      z-index: 1;
      background: rgba(7, 4, 16, 0.9);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(140, 100, 220, 0.38);
      border-radius: 20px;
      padding: 2.2rem 2.5rem 2rem;
      box-shadow:
        0 0 60px rgba(60, 30, 120, 0.5),
        0 16px 50px rgba(0, 0, 0, 0.75),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      max-width: 820px;
      width: 100%;
      animation: panelIn 0.45s cubic-bezier(0.34, 1.1, 0.64, 1);
    }

    .char-panel::before {
      content: '';
      position: absolute;
      top: 0; left: 10%; right: 10%;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, rgba(180,140,255,0.8) 50%, transparent 100%);
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
      letter-spacing: 0.04em;
      margin: 0 0 0.35rem;
      color: #fff;
      text-shadow: 0 0 24px rgba(180, 140, 255, 0.5), 0 2px 4px rgba(0,0,0,0.8);
    }

    .char-subtitle {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.85rem;
      color: #5a5278;
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
      border: 1px solid rgba(140, 100, 220, 0.32);
      border-radius: 14px;
      background: linear-gradient(175deg, rgba(38, 28, 68, 0.85) 0%, rgba(18, 13, 38, 0.95) 100%);
      cursor: pointer;
      overflow: hidden;
      transition: transform 0.18s ease, box-shadow 0.22s ease, border-color 0.18s ease;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);

      &:hover {
        transform: translateY(-5px) scale(1.015);
        box-shadow:
          0 14px 40px rgba(80, 50, 160, 0.45),
          0 0 28px rgba(140, 100, 255, 0.25);
        border-color: rgba(190, 150, 255, 0.65);
      }

      &:active { transform: translateY(-1px) scale(1.005); }
    }

    /* ── art ── */
    .char-card-art-wrap {
      position: relative;
      width: 100%;
      height: 180px;
      overflow: hidden;
      background: linear-gradient(180deg, #0a0618 0%, #12083a 100%);
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
      filter: drop-shadow(0 0 16px rgba(160, 120, 255, 0.35));
      transition: transform 0.22s ease, filter 0.22s ease;
    }

    .char-card:hover .char-card-art {
      transform: scale(1.05) translateY(-4px);
      filter: drop-shadow(0 0 28px rgba(190, 150, 255, 0.6));
    }

    .char-card-art-placeholder {
      height: 175px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 4rem;
      color: rgba(140, 100, 220, 0.4);
      font-family: 'Cinzel', serif;
    }

    .char-card-art-glow {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 60px;
      background: linear-gradient(0deg, rgba(18,10,40,0.95) 0%, transparent 100%);
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
      color: #e8e0ff;
      margin-bottom: 0.4rem;
      letter-spacing: 0.02em;
    }

    .char-card-desc {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.82rem;
      color: #8880a8;
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
      background: rgba(180, 140, 0, 0.15);
      border: 1px solid rgba(220, 180, 0, 0.3);
      color: #e8c840;
    }

    .char-card-cta {
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 0.82rem;
      font-weight: 700;
      color: rgba(160, 130, 255, 0.6);
      letter-spacing: 0.08em;
      transition: color 0.15s;
    }

    .char-card:hover .char-card-cta {
      color: rgba(200, 170, 255, 0.9);
    }

    /* ── actions ── */
    .char-actions {
      display: flex;
      justify-content: center;
    }

    .char-btn {
      padding: 12px 28px;
      font-family: 'Exo 2', system-ui, sans-serif;
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
      color: #fff;
      border: 1px solid rgba(120, 90, 200, 0.3);
      border-radius: 12px;
      background: linear-gradient(160deg, #3a3068 0%, #26204c 100%);
      box-shadow: 0 4px 0 #151030, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.12);
      transition: transform 0.15s, box-shadow 0.2s, filter 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 0 #151030, 0 10px 24px rgba(0,0,0,0.45), 0 0 20px rgba(100,70,200,0.25);
        filter: brightness(1.1);
      }

      &:active { transform: translateY(1px); }
    }
  `],
})
export class CharacterSelectComponent implements OnInit {
  characters: CharacterDef[] = [];
  backgroundReady = false;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.bridge.ensureDataLoaded();
    } catch {
      // data load failed, may show empty list
    }
    this.characters = this.bridge.getCharacters();
    this.loadBackground();
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
    gungirl: '/assets/characters/gungirl/gungirl_idle.png',
    verdant_machinist: '/assets/characters/verdant_machinist/munui.png',
  };
  getCharacterImageUrl(charId: string): string {
    return CharacterSelectComponent.CHARACTER_ART[charId] ?? '';
  }

  onSelect(char: CharacterDef): void {
    this.bridge.setPendingCharacter(char.id);
    this.router.navigate(['/game']);
  }

  onBack(): void {
    this.router.navigate(['/']);
  }
}
