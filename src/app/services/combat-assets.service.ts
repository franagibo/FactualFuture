import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';

const COMBAT_BG_PATH = '/assets/combat/combat-bg.jpg';
const PLAYER_PATH = '/assets/combat/player.png';
const ENEMY_PATH_PREFIX = '/assets/combat/enemies/';

@Injectable({ providedIn: 'root' })
export class CombatAssetsService {
  private combatBgTexture: PIXI.Texture | null = null;
  private playerTexture: PIXI.Texture | null = null;
  private enemyTextures = new Map<string, PIXI.Texture>();
  private loadPromise: Promise<void> | null = null;

  /** Load combat background and optional player/enemy sprites. Safe to call multiple times. */
  async loadCombatAssets(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    try {
      this.combatBgTexture = (await PIXI.Assets.load(this.resolveUrl(COMBAT_BG_PATH))) as PIXI.Texture;
    } catch {
      this.combatBgTexture = null;
    }
    try {
      this.playerTexture = (await PIXI.Assets.load(this.resolveUrl(PLAYER_PATH))) as PIXI.Texture;
    } catch {
      this.playerTexture = null;
    }
  }

  getCombatBgTexture(): PIXI.Texture | null {
    return this.combatBgTexture;
  }

  getPlayerTexture(): PIXI.Texture | null {
    return this.playerTexture;
  }

  /** Returns texture for enemy by id if loaded (e.g. /assets/combat/enemies/slime.png). Load on demand. */
  getEnemyTexture(id: string): PIXI.Texture | null {
    return this.enemyTextures.get(id) ?? null;
  }

  /** Preload texture for an enemy id. Call when entering combat with known enemy ids. */
  async loadEnemyTexture(id: string): Promise<void> {
    if (this.enemyTextures.has(id)) return;
    const path = `${ENEMY_PATH_PREFIX}${id}.png`;
    try {
      const tex = (await PIXI.Assets.load(this.resolveUrl(path))) as PIXI.Texture;
      this.enemyTextures.set(id, tex);
    } catch {
      // fallback to Graphics in renderer
    }
  }

  private resolveUrl(path: string): string {
    if (typeof window === 'undefined') return path;
    return path.startsWith('/') ? window.location.origin + path : path;
  }
}
