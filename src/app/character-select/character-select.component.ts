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
        <h1 class="char-title">Choose your character</h1>
        <p class="char-subtitle">Select a character to begin your run.</p>
        <div class="char-grid">
          @for (char of characters; track char.id) {
            <button
              type="button"
              class="char-card"
              (click)="onSelect(char)"
            >
            @if (getCharacterImageUrl(char.id)) {
                <div class="char-card-art-wrap">
                  <img class="char-card-art" [src]="getCharacterImageUrl(char.id)" alt="{{ char.name }}" />
                </div>
              }
              <div class="char-card-name">{{ char.name }}</div>
              <div class="char-card-desc">{{ char.description || 'No description.' }}</div>
              <div class="char-card-meta">
                <span class="char-meta-item">{{ char.startingMaxHp ?? 70 }} HP</span>
                @if (char.starterRelicId) {
                  <span class="char-meta-item">Starter: {{ getRelicName(char.starterRelicId) }}</span>
                }
              </div>
            </button>
          }
        </div>
        <div class="char-actions">
          <button type="button" class="char-btn char-btn-back" (click)="onBack()">
            <span class="char-btn-inner">Back</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
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
        background: #1a1a2e center center no-repeat;
        background-size: cover;
        padding: 2rem;
      }
      .char-wrap.bg-ready {
        background-image: url('/assets/main-menu.jpg');
      }
      .char-loading-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        background: #1a1a2e;
        z-index: 10;
      }
      .char-loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.15);
        border-top-color: #b48cff;
        border-radius: 50%;
        animation: char-loading-spin 0.8s linear infinite;
      }
      .char-loading-label {
        font-size: 1rem;
        color: #cccccc;
      }
      @keyframes char-loading-spin {
        to { transform: rotate(360deg); }
      }
      .char-panel {
        background: rgba(12, 10, 24, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(180, 140, 255, 0.35);
        border-radius: 16px;
        padding: 2rem 2.5rem;
        box-shadow:
          0 0 40px rgba(80, 50, 140, 0.4),
          0 8px 32px rgba(0, 0, 0, 0.6),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        max-width: 720px;
        width: 100%;
      }
      .char-title {
        font-size: 1.75rem;
        margin: 0 0 0.35rem;
        color: #fff;
        font-weight: 700;
        text-align: center;
        text-shadow: 0 0 20px rgba(200, 160, 255, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8);
      }
      .char-subtitle {
        font-size: 0.95rem;
        color: #aaa;
        margin: 0 0 1.5rem;
        text-align: center;
      }
      .char-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .char-card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        text-align: left;
        padding: 1.25rem;
        border: 1px solid rgba(180, 140, 255, 0.35);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(50, 42, 78, 0.75) 0%, rgba(28, 22, 48, 0.9) 100%);
        cursor: pointer;
        overflow: hidden;
        transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      }
      .char-card:hover {
        transform: translateY(-4px) scale(1.015);
        box-shadow: 0 12px 32px rgba(100, 70, 180, 0.45), 0 0 24px rgba(160, 120, 255, 0.2);
        border-color: rgba(200, 160, 255, 0.65);
      }
      .char-card:active {
        transform: translateY(-1px);
      }
      .char-card-art-wrap {
        width: 100%;
        height: 160px;
        overflow: hidden;
        border-radius: 8px 8px 0 0;
        margin: -1.25rem -1.25rem 0.75rem -1.25rem;
        width: calc(100% + 2.5rem);
        background: rgba(10, 8, 20, 0.8);
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .char-card-art {
        height: 160px;
        width: auto;
        object-fit: contain;
        object-position: bottom center;
        display: block;
        filter: drop-shadow(0 0 12px rgba(180, 140, 255, 0.3));
        transition: transform 0.2s ease, filter 0.2s ease;
      }
      .char-card:hover .char-card-art {
        transform: scale(1.04) translateY(-3px);
        filter: drop-shadow(0 0 20px rgba(200, 160, 255, 0.5));
      }
      .char-card-name {
        font-size: 1.2rem;
        font-weight: 700;
        color: #e8e0ff;
        margin-bottom: 0.5rem;
      }
      .char-card-desc {
        font-size: 0.85rem;
        color: #b0a8c8;
        line-height: 1.4;
        flex: 1;
        margin-bottom: 0.75rem;
      }
      .char-card-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
      }
      .char-meta-item {
        font-size: 0.8rem;
        color: #888;
      }
      .char-actions {
        display: flex;
        justify-content: center;
        gap: 0.75rem;
      }
      .char-btn {
        padding: 12px 24px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        color: #fff;
        border: none;
        border-radius: 10px;
        background: linear-gradient(180deg, #3d3560 0%, #2a2345 100%);
        box-shadow: 0 4px 0 #1a1630, 0 6px 16px rgba(0, 0, 0, 0.4);
        transition: transform 0.15s ease, box-shadow 0.2s ease;
      }
      .char-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 0 #1a1630, 0 10px 24px rgba(0, 0, 0, 0.45);
      }
      .char-btn-back {
        background: linear-gradient(180deg, #4a4050 0%, #2e2838 100%);
      }
    `,
  ],
})
export class CharacterSelectComponent implements OnInit {
  characters: CharacterDef[] = [];
  backgroundReady = false;

  constructor(
    private router: Router,
    private bridge: GameBridgeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.characters = this.bridge.getCharacters();
    this.loadBackground();
    this.cdr.markForCheck();
  }

  private loadBackground(): void {
    const img = new Image();
    img.onload = () => {
      this.backgroundReady = true;
      this.cdr.markForCheck();
    };
    img.onerror = () => {
      this.backgroundReady = true;
      this.cdr.markForCheck();
    };
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
