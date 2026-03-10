import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';

const COMBAT_BG_PATH = '/assets/combat/combat-bg.jpg';
const ENEMY_PATH_PREFIX = '/assets/combat/enemies/';

const PLAYER_CHARACTERS_PREFIX = '/assets/characters/';

/** Shield animation sprite sheet (6x6 grid). Path: /assets/characters/{id}/{id}_shield.png. First frame is used as static pose. */
function getShieldSheetPath(characterId: string): string {
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_shield.png`;
}

/** Shooting animation sprite sheet (6x6 grid). Path: /assets/characters/{id}/{id}_shooting.png. Used for strike/attack. */
function getShootingSheetPath(characterId: string): string {
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_shooting.png`;
}

const SHIELD_SHEET_COLS = 6;
const SHIELD_SHEET_ROWS = 6;
const SHIELD_FRAME_MS = 80;
const SHIELD_FRAME_COUNT = SHIELD_SHEET_COLS * SHIELD_SHEET_ROWS;

/** Current player character id (one of many usable characters). Can later come from run state or selection. */
const DEFAULT_PLAYER_CHARACTER_ID = 'gunboy';

@Injectable({ providedIn: 'root' })
export class CombatAssetsService {
  private combatBgTexture: PIXI.Texture | null = null;
  private playerTextures = new Map<string, PIXI.Texture>();
  private enemyTextures = new Map<string, PIXI.Texture>();
  private shieldFrameTextures: PIXI.Texture[] = [];
  private shieldStartTime: number | null = null;
  private shieldResolve: (() => void) | null = null;
  private shootingFrameTextures: PIXI.Texture[] = [];
  private shootingStartTime: number | null = null;
  private shootingResolve: (() => void) | null = null;
  private loadPromise: Promise<void> | null = null;

  /** Load combat background and shield sprite sheet (first frame = static pose). Safe to call multiple times. */
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
      const sheetPath = this.resolveUrl(getShieldSheetPath(DEFAULT_PLAYER_CHARACTER_ID));
      const sheetTexture = (await PIXI.Assets.load(sheetPath)) as PIXI.Texture;
      this.shieldFrameTextures = this.buildSheetFrames(sheetTexture);
      if (this.shieldFrameTextures.length > 0) {
        this.playerTextures.set(DEFAULT_PLAYER_CHARACTER_ID, this.shieldFrameTextures[0]);
      }
    } catch {
      this.shieldFrameTextures = [];
    }
    try {
      const shootingPath = this.resolveUrl(getShootingSheetPath(DEFAULT_PLAYER_CHARACTER_ID));
      const shootingTexture = (await PIXI.Assets.load(shootingPath)) as PIXI.Texture;
      this.shootingFrameTextures = this.buildSheetFrames(shootingTexture);
    } catch {
      this.shootingFrameTextures = [];
    }
  }

  private buildSheetFrames(sheetTexture: PIXI.Texture): PIXI.Texture[] {
    const source = sheetTexture.source;
    const sheetW = sheetTexture.width;
    const sheetH = sheetTexture.height;
    const frameW = Math.floor(sheetW / SHIELD_SHEET_COLS);
    const frameH = Math.floor(sheetH / SHIELD_SHEET_ROWS);
    const out: PIXI.Texture[] = [];
    for (let i = 0; i < SHIELD_FRAME_COUNT; i++) {
      const col = i % SHIELD_SHEET_COLS;
      const row = Math.floor(i / SHIELD_SHEET_COLS);
      const frame = new PIXI.Rectangle(col * frameW, row * frameH, frameW, frameH);
      out.push(new PIXI.Texture({ source, frame }));
    }
    return out;
  }

  getCombatBgTexture(): PIXI.Texture | null {
    return this.combatBgTexture;
  }

  /** Returns the current player character texture (first frame of shield sheet). */
  getPlayerTexture(): PIXI.Texture | null {
    return this.playerTextures.get(DEFAULT_PLAYER_CHARACTER_ID) ?? null;
  }

  /** Returns the current shield animation frame texture, or null if not playing or no frames. */
  getShieldVideoTexture(): PIXI.Texture | null {
    if (this.shieldFrameTextures.length === 0 || this.shieldStartTime == null) return null;
    const elapsed = Date.now() - this.shieldStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / SHIELD_FRAME_MS), SHIELD_FRAME_COUNT - 1);
    return this.shieldFrameTextures[frameIndex] ?? null;
  }

  /** Call each tick while shield is playing. Resolves the play promise when animation is done. */
  getShieldAnimationDone(): void {
    if (this.shieldStartTime == null || !this.shieldResolve) return;
    const elapsed = Date.now() - this.shieldStartTime;
    if (elapsed >= SHIELD_FRAME_COUNT * SHIELD_FRAME_MS) {
      this.shieldStartTime = null;
      const resolve = this.shieldResolve;
      this.shieldResolve = null;
      resolve();
    }
  }

  /** Plays the shield animation once (sprite sheet frames). Resolves when the animation ends. */
  playShieldAnimation(): Promise<void> {
    if (this.shieldFrameTextures.length === 0) return Promise.resolve();
    this.shieldStartTime = Date.now();
    return new Promise((resolve) => {
      this.shieldResolve = resolve;
    });
  }

  /** Returns the current shooting animation frame texture, or null if not playing or no frames. */
  getShootingTexture(): PIXI.Texture | null {
    if (this.shootingFrameTextures.length === 0 || this.shootingStartTime == null) return null;
    const elapsed = Date.now() - this.shootingStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / SHIELD_FRAME_MS), SHIELD_FRAME_COUNT - 1);
    return this.shootingFrameTextures[frameIndex] ?? null;
  }

  /** Call each tick while shooting is playing. Resolves the play promise when animation is done. */
  getShootingAnimationDone(): void {
    if (this.shootingStartTime == null || !this.shootingResolve) return;
    const elapsed = Date.now() - this.shootingStartTime;
    if (elapsed >= SHIELD_FRAME_COUNT * SHIELD_FRAME_MS) {
      this.shootingStartTime = null;
      const resolve = this.shootingResolve;
      this.shootingResolve = null;
      resolve();
    }
  }

  /** Plays the shooting animation once (sprite sheet frames). Resolves when the animation ends. */
  playShootingAnimation(): Promise<void> {
    if (this.shootingFrameTextures.length === 0) return Promise.resolve();
    this.shootingStartTime = Date.now();
    return new Promise((resolve) => {
      this.shootingResolve = resolve;
    });
  }

  /** Returns player texture for a given character id (for future character selection). */
  getPlayerTextureForCharacter(characterId: string): PIXI.Texture | null {
    return this.playerTextures.get(characterId) ?? null;
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
