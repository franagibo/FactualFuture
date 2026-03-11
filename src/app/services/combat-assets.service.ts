import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';

const COMBAT_BG_PATH = '/assets/combat/combat-bg.jpg';
const ENEMY_PATH_PREFIX = '/assets/combat/enemies/';
const CARD_ART_PREFIX = '/assets/cards/';

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
  private cardArtTextures = new Map<string, PIXI.Texture | null>();
  private shieldFrameTextures: PIXI.Texture[] = [];
  private shieldStartTime: number | null = null;
  private shieldResolve: (() => void) | null = null;
  private shootingFrameTextures: PIXI.Texture[] = [];
  private shootingStartTime: number | null = null;
  private shootingResolve: (() => void) | null = null;
  private globalLoadPromise: Promise<void> | null = null;

  /** Load only global combat assets (background). Call once at app/game start. Failures are cached (no retries). */
  async loadGlobalCombatAssets(): Promise<void> {
    if (this.globalLoadPromise) return this.globalLoadPromise;
    this.globalLoadPromise = (async () => {
      try {
        this.combatBgTexture = (await PIXI.Assets.load(this.resolveUrl(COMBAT_BG_PATH))) as PIXI.Texture;
      } catch {
        this.combatBgTexture = null;
      }
    })();
    return this.globalLoadPromise;
  }

  /** Load combat assets for the current fight: global (bg) + character sheets + enemy textures. Safe to call multiple times. */
  async loadCombatAssets(characterId?: string, enemyIds?: string[]): Promise<void> {
    await this.loadGlobalCombatAssets();
    const cid = characterId ?? DEFAULT_PLAYER_CHARACTER_ID;
    if (!this.playerTextures.has(cid)) {
      try {
        const sheetPath = this.resolveUrl(getShieldSheetPath(cid));
        const sheetTexture = (await PIXI.Assets.load(sheetPath)) as PIXI.Texture;
        const frames = this.buildSheetFrames(sheetTexture);
        if (frames.length > 0) {
          this.playerTextures.set(cid, frames[0]);
          if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shieldFrameTextures = frames;
        }
      } catch {
        if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shieldFrameTextures = [];
      }
      try {
        const shootingPath = this.resolveUrl(getShootingSheetPath(cid));
        const shootingTexture = (await PIXI.Assets.load(shootingPath)) as PIXI.Texture;
        const frames = this.buildSheetFrames(shootingTexture);
        if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shootingFrameTextures = frames;
      } catch {
        if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shootingFrameTextures = [];
      }
    }
    for (const id of enemyIds ?? []) {
      await this.loadEnemyTexture(id);
    }
  }

  private async doLoad(): Promise<void> {
    await this.loadCombatAssets(DEFAULT_PLAYER_CHARACTER_ID, []);
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

  /**
   * Preload card art textures for the given card ids. Missing files are ignored and left as null.
   * Safe to call multiple times; already loaded ids are skipped.
   */
  async preloadCardArt(cardIds: string[]): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const id of cardIds) {
      if (this.cardArtTextures.has(id)) continue;
      const path = this.resolveUrl(`${CARD_ART_PREFIX}${id}.png`);
      const p = PIXI.Assets.load(path)
        .then((tex) => {
          this.cardArtTextures.set(id, tex as PIXI.Texture);
        })
        .catch(() => {
          this.cardArtTextures.set(id, null);
        });
      promises.push(p.then(() => {}));
    }
    if (promises.length) {
      await Promise.all(promises);
    }
  }

  /** Returns card art texture for a given card id, or null if not available. */
  getCardArtTexture(cardId: string): PIXI.Texture | null {
    return this.cardArtTextures.get(cardId) ?? null;
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
