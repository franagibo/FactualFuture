import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import { logger } from '../util/app-logger';

const FIGHT_LOCATION_PREFIX = '/assets/fight-location/';
const FIGHT_LOCATION_CONFIG_URL = '/assets/data/fight-location.json';
const ENEMY_PATH_PREFIX = '/assets/combat/enemies/';
const CARD_ART_PREFIX = '/assets/cards/';
/** Fallback when a card has no dedicated art image ({cardId}.png). Used for all cards until you add per-card art. */
const EMPTY_CARD_TEMPLATE_PATH = `${CARD_ART_PREFIX}empty_card_template.png`;

const EFFECTS_PREFIX = '/assets/effects/';
const HP_ICON_PATH = `${EFFECTS_PREFIX}hp.svg`;
const BLOCK_ICON_PATH = `${EFFECTS_PREFIX}block.svg`;

const PLAYER_CHARACTERS_PREFIX = '/assets/characters/';

/** Default static / idle image. Path: /assets/characters/{id}/{id}_static.png. Used when not playing shield/shooting animation. */
function getStaticImagePath(characterId: string): string {
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_static.png`;
}

/** Shield animation sprite sheet (6x6 grid). Path: /assets/characters/{id}/{id}_shield.png. Fallback for static pose if no _static.png. */
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
  /** Enemy id (or 'default') -> background filename. Loaded from fight-location.json. */
  private combatBgByEnemy: Record<string, string> = {};
  /** Cache of loaded combat bg textures by key (enemy id or 'default'). */
  private combatBgTextureCache = new Map<string, PIXI.Texture>();
  /** Key for current fight so getCombatBgTexture() returns the right one. */
  private currentCombatBgKey = 'default';
  /** Fallback card art when {cardId}.png is missing. Loaded with global combat assets. */
  private emptyCardTemplateTexture: PIXI.Texture | null = null;
  private playerTextures = new Map<string, PIXI.Texture>();
  private enemyTextures = new Map<string, PIXI.Texture>();
  /** Card id -> texture (or null if load failed; then UI uses empty_card_template). */
  private cardArtTextures = new Map<string, PIXI.Texture | null>();
  private shieldFrameTextures: PIXI.Texture[] = [];
  private shieldStartTime: number | null = null;
  private shieldResolve: (() => void) | null = null;
  private shootingFrameTextures: PIXI.Texture[] = [];
  private shootingStartTime: number | null = null;
  private shootingResolve: (() => void) | null = null;
  private hpIconTexture: PIXI.Texture | null = null;
  private blockIconTexture: PIXI.Texture | null = null;
  private globalLoadPromise: Promise<void> | null = null;

  /** Load only global combat assets (fight-location config + default bg + empty card template). Call once at app/game start. Failures are cached (no retries). */
  async loadGlobalCombatAssets(): Promise<void> {
    if (this.globalLoadPromise) return this.globalLoadPromise;
    this.globalLoadPromise = (async () => {
      try {
        const res = await fetch(this.resolveUrl(FIGHT_LOCATION_CONFIG_URL));
        const data = (await res.json()) as Record<string, string>;
        this.combatBgByEnemy = data ?? {};
      } catch {
        this.combatBgByEnemy = { default: 'background_fight2.png' };
      }
      const defaultFilename = this.combatBgByEnemy['default'] ?? 'background_fight2.png';
      try {
        const tex = (await PIXI.Assets.load(this.resolveUrl(FIGHT_LOCATION_PREFIX + defaultFilename))) as PIXI.Texture;
        this.combatBgTextureCache.set('default', tex);
        this.currentCombatBgKey = 'default';
      } catch {
        // Default bg failed; getCombatBgTexture() will return null and renderer will use fallback
      }
      try {
        this.emptyCardTemplateTexture = (await PIXI.Assets.load(this.resolveUrl(EMPTY_CARD_TEMPLATE_PATH))) as PIXI.Texture;
      } catch {
        this.emptyCardTemplateTexture = null;
      }
      try {
        this.hpIconTexture = (await PIXI.Assets.load(this.resolveUrl(HP_ICON_PATH))) as PIXI.Texture;
      } catch {
        this.hpIconTexture = null;
      }
      try {
        this.blockIconTexture = (await PIXI.Assets.load(this.resolveUrl(BLOCK_ICON_PATH))) as PIXI.Texture;
      } catch {
        this.blockIconTexture = null;
      }
    })();
    return this.globalLoadPromise;
  }

  /** Load combat assets for the current fight: global (bg) + character sheets + enemy textures. Safe to call multiple times. */
  async loadCombatAssets(characterId?: string, enemyIds?: string[]): Promise<void> {
    await this.loadGlobalCombatAssets();
    const bgKey = enemyIds?.[0] ?? 'default';
    const hasMapping = bgKey !== 'default' && this.combatBgByEnemy[bgKey] != null;
    const effectiveKey = hasMapping ? bgKey : 'default';
    const filename = this.combatBgByEnemy[effectiveKey] ?? 'background_fight2.png';
    if (!this.combatBgTextureCache.has(effectiveKey)) {
      try {
        const tex = (await PIXI.Assets.load(this.resolveUrl(FIGHT_LOCATION_PREFIX + filename))) as PIXI.Texture;
        this.combatBgTextureCache.set(effectiveKey, tex);
      } catch {
        // Per-enemy bg failed; getCombatBgTexture will fall back to default
      }
    }
    this.currentCombatBgKey = effectiveKey;
    const cid = characterId ?? DEFAULT_PLAYER_CHARACTER_ID;
    if (!this.playerTextures.has(cid)) {
      // Prefer dedicated static image ({id}_static.png) for default pose; fall back to first frame of shield sheet.
      try {
        const staticPath = this.resolveUrl(getStaticImagePath(cid));
        const staticTexture = (await PIXI.Assets.load(staticPath)) as PIXI.Texture;
        this.playerTextures.set(cid, staticTexture);
      } catch {
        // No static image; use first frame of shield sheet as fallback
      }
      try {
        const sheetPath = this.resolveUrl(getShieldSheetPath(cid));
        const sheetTexture = (await PIXI.Assets.load(sheetPath)) as PIXI.Texture;
        const frames = this.buildSheetFrames(sheetTexture);
        if (frames.length > 0) {
          if (!this.playerTextures.has(cid)) this.playerTextures.set(cid, frames[0]);
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

  /** Current fight's background texture (resolved by first enemy id or default). Fallback to default then null. */
  getCombatBgTexture(): PIXI.Texture | null {
    return this.combatBgTextureCache.get(this.currentCombatBgKey) ?? this.combatBgTextureCache.get('default') ?? null;
  }

  getHpIconTexture(): PIXI.Texture | null {
    return this.hpIconTexture;
  }

  getBlockIconTexture(): PIXI.Texture | null {
    return this.blockIconTexture;
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
        .catch((err) => {
          this.cardArtTextures.set(id, null);
          logger.warn('Card art load failed', path, err);
        });
      promises.push(p.then(() => {}));
    }
    if (promises.length) {
      await Promise.all(promises);
    }
  }

  /**
   * Returns card art texture for a card. Association: /assets/cards/{cardId}.png.
   * If that image is missing or not yet loaded, returns the fallback empty_card_template.png.
   */
  getCardArtTexture(cardId: string): PIXI.Texture | null {
    const tex = this.cardArtTextures.get(cardId);
    if (tex) return tex;
    return this.emptyCardTemplateTexture;
  }

  /** Returns the current player character texture (static image or first frame of shield sheet). */
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
