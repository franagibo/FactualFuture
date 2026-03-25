import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import { logger } from '../util/app-logger';
import { ENEMY_ANIMATION_TIMING } from '../combat-canvas/constants/combat-timing.constants';

const FIGHT_LOCATION_PREFIX = '/assets/fight-location/';
const FIGHT_LOCATION_CONFIG_URL = '/assets/data/fight-location.json';
const ENEMY_PATH_PREFIX = '/assets/combat/enemies/';
const CARD_ART_PREFIX = '/assets/cards/';
/** Fallback when a card has no dedicated art image ({cardId}.png). Used for all cards until you add per-card art. */
const EMPTY_CARD_TEMPLATE_PATH = `${CARD_ART_PREFIX}empty_card.png`;

const EFFECTS_PREFIX = '/assets/effects/';
const HP_ICON_PATH = `${EFFECTS_PREFIX}hp.svg`;
const BLOCK_ICON_PATH = `${EFFECTS_PREFIX}block.svg`;

const HP_BAR_PREFIX = '/assets/UI/hp/';
const HP_BAR_BG_PATH = `${HP_BAR_PREFIX}BarV5_Bar.png`;
const HP_BAR_PROGRESS_PATH = `${HP_BAR_PREFIX}BarV5_ProgressBar.png`;
const HP_BAR_BORDER_PATH = `${HP_BAR_PREFIX}BarV5_ProgressBarBorder.png`;

const SHIELD_BAR_PREFIX = '/assets/UI/shield/';
const SHIELD_BAR_BG_PATH = `${SHIELD_BAR_PREFIX}BarV9_Bar.png`;
const SHIELD_BAR_PROGRESS_PATH = `${SHIELD_BAR_PREFIX}BarV9_ProgressBar.png`;
// Note: border asset version differs, but it's still the correct "frame" layer.
const SHIELD_BAR_BORDER_PATH = `${SHIELD_BAR_PREFIX}BarV6_ProgressBarBorder.png`;

const PLAYER_CHARACTERS_PREFIX = '/assets/characters/';
const BLOBBI_IDLE_SHEET_PATH = '/assets/characters/blobi/idle/blobbi.png';

// Optional UI atlas (if present). We can migrate more UI to atlases over time.
const UI_ATLAS_JSON = '/assets/UI/ui-atlas.json';
const UI_ATLAS_PNG = '/assets/UI/ui-atlas.png';

/** Default static / idle image. Gungirl: 5x5 idle sheet. Verdant Machinist: 5x5 4500×4500 idle sheet (verdant_machinist_idle.png.png). */
function getStaticImagePath(characterId: string): string {
  if (characterId === 'gungirl') {
    return `${PLAYER_CHARACTERS_PREFIX}gungirl/gungirl_idle.png`;
  }
  if (characterId === 'verdant_machinist') {
    return `${PLAYER_CHARACTERS_PREFIX}verdant_machinist/verdant_machinist_idle.png`;
  }
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_static.png`;
}

/** Shield animation sprite sheet. Path: /assets/characters/{id}/{id}_shield.png. Gungirl uses 5x5 grid; others 6x6. */
function getShieldSheetPath(characterId: string): string {
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_shield.png`;
}

/** Shooting animation sprite sheet. Path: /assets/characters/{id}/{id}_shooting.png. Gungirl uses 5x5 grid; others 6x6. */
function getShootingSheetPath(characterId: string): string {
  return `${PLAYER_CHARACTERS_PREFIX}${characterId}/${characterId}_shooting.png`;
}

/** Verdant Machinist uses strike sheet for Strike card (not shooting). */
function getStrikeSheetPath(characterId: string): string {
  if (characterId === 'verdant_machinist') {
    return `${PLAYER_CHARACTERS_PREFIX}verdant_machinist/verdant_machinist_strike.png`;
  }
  return getShootingSheetPath(characterId);
}

/** Verdant Machinist extra animation sheets. 5×5 grid. */
const VM_ANIMATION_NAMES = [
  'grow_seed', 'spell', 'summoning', 'commanding', 'evolve', 'detonate', 'drain',
] as const;
type VMAnimationName = (typeof VM_ANIMATION_NAMES)[number];
function getVMAnimationSheetPath(name: VMAnimationName): string {
  return `${PLAYER_CHARACTERS_PREFIX}verdant_machinist/verdant_machinist_${name}.png`;
}

/** Chibi idle animation: 18 frames in Idle/0_Dark_Oracle_Idle_000.png .. 017.png. Used when characterId is 'chibi'. */
const CHIBI_IDLE_FRAME_COUNT = 18;
/** Shorter = faster, smoother idle loop. ~50ms per frame ≈ 20 fps animation. */
const CHIBI_IDLE_FRAME_MS = 15;
function getChibiIdleFramePath(frameIndex: number): string {
  const pad = String(frameIndex).padStart(3, '0');
  return `${PLAYER_CHARACTERS_PREFIX}chibi/Idle/0_Dark_Oracle_Idle_${pad}.png`;
}

/** Chibi slashing animation (e.g. for strike card): 12 frames in Slashing/0_Dark_Oracle_Slashing_000.png .. 011.png. */
const CHIBI_SLASHING_FRAME_COUNT = 12;
function getChibiSlashingFramePath(frameIndex: number): string {
  const pad = String(frameIndex).padStart(3, '0');
  return `${PLAYER_CHARACTERS_PREFIX}chibi/Slashing/0_Dark_Oracle_Slashing_${pad}.png`;
}

/** Zombie placeholder: variants 1–3 under characters. Path: .../Zombie_Villager_X/PNG/PNG Sequences/{Idle|Hurt|Dying}/. Future: per-enemy folder with same names. */
const ZOMBIE_PLACEHOLDER_VARIANTS = [1, 2, 3] as const;
const ZOMBIE_IDLE_FRAME_COUNT = 18;
const ZOMBIE_HURT_FRAME_COUNT = 12;
const ZOMBIE_DYING_FRAME_COUNT = 15;

function getZombiePlaceholderFramePath(
  variantId: 1 | 2 | 3,
  animation: 'Idle' | 'Hurt' | 'Dying',
  frameIndex: number
): string {
  const pad = String(frameIndex).padStart(3, '0');
  return `${PLAYER_CHARACTERS_PREFIX}Zombie_Villager_${variantId}/PNG/PNG Sequences/${animation}/0_Zombie_Villager_${animation}_${pad}.png`;
}

const SHIELD_SHEET_COLS = 6;
const SHIELD_SHEET_ROWS = 6;

/** Frame duration (ms per frame) per player animation. Tweak these to speed up or slow down each animation. */
export const PLAYER_ANIMATION_FRAME_MS: Record<
  | 'shield'
  | 'shooting'
  | 'slashing'
  | 'vmGrowSeed'
  | 'vmSpell'
  | 'vmSummoning'
  | 'vmCommanding'
  | 'vmEvolve'
  | 'vmDetonate'
  | 'vmDrain',
  number
> = {
  shield: 55,
  shooting: 40,
  slashing: 10,
  vmGrowSeed: 44,
  vmSpell: 45,
  vmSummoning: 45,
  vmCommanding: 48,
  vmEvolve: 50,
  vmDetonate: 45,
  vmDrain: 50,
};

const SHIELD_FRAME_COUNT = SHIELD_SHEET_COLS * SHIELD_SHEET_ROWS;

/** Gungirl uses 5x5 sprite sheets for idle, shield and shooting (25 frames each). */
const GUNGIRL_SHEET_COLS = 5;
const GUNGIRL_SHEET_ROWS = 5;
/** Idle animation: ms per frame. ~60ms ≈ 25 frames in 1.5s loop. */
const GUNGIRL_IDLE_FRAME_MS = 60;

/** Verdant Machinist idle: 5×5 sheet, 4500×4500 px (900×900 per frame), 25 frames. */
const VM_IDLE_SHEET_COLS = 5;
const VM_IDLE_SHEET_ROWS = 5;
const VM_IDLE_FRAME_MS = 45;
const BLOBBI_IDLE_SHEET_COLS = 5;
const BLOBBI_IDLE_SHEET_ROWS = 5;
const BLOBBI_IDLE_FRAME_MS = 60;

/** Current player character id (one of many usable characters). Can later come from run state or selection. */
const DEFAULT_PLAYER_CHARACTER_ID = 'gungirl';

@Injectable({ providedIn: 'root' })
export class CombatAssetsService {
  /** Enemy id (or 'default') -> background filename. Loaded from fight-location.json. */
  private combatBgByEnemy: Record<string, string> = {};
  /** Optional pool of background filenames for random fight location. From fight-location.json "backgrounds" array. */
  private combatBgPool: string[] = [];
  /** Cache of loaded combat bg textures by key (enemy id, 'default', or filename from pool). */
  private combatBgTextureCache = new Map<string, PIXI.Texture>();
  /** Key for current fight so getCombatBgTexture() returns the right one. */
  private currentCombatBgKey = 'default';
  /** Signature of the fight we chose the current bg for; avoids re-randomizing on every redraw. */
  private currentCombatBgSignature = '';
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
  private hpBarBgTexture: PIXI.Texture | null = null;
  private hpBarProgressTexture: PIXI.Texture | null = null;
  private hpBarBorderTexture: PIXI.Texture | null = null;
  private shieldBarBgTexture: PIXI.Texture | null = null;
  private shieldBarProgressTexture: PIXI.Texture | null = null;
  private shieldBarBorderTexture: PIXI.Texture | null = null;
  private uiAtlasLoaded = false;
  private globalLoadPromise: Promise<void> | null = null;
  /** Character id last loaded in loadCombatAssets; used so getPlayerTexture returns the correct character. */
  private currentPlayerCharacterId = DEFAULT_PLAYER_CHARACTER_ID;
  /** Chibi idle animation frames (18). Populated when loading character 'chibi'. */
  private chibiIdleTextures: PIXI.Texture[] = [];
  /** Chibi slashing animation (12 frames). Played when chibi uses strike card. */
  private chibiSlashingTextures: PIXI.Texture[] = [];
  private slashingStartTime: number | null = null;
  private slashingResolve: (() => void) | null = null;
  /** Gungirl idle animation (5x5 = 25 frames from gungirl_idle.png). */
  private gungirlIdleTextures: PIXI.Texture[] = [];
  /** Verdant Machinist idle animation (5×5 = 25 frames, 4500×4500 px sheet). */
  private verdantMachinistIdleTextures: PIXI.Texture[] = [];
  /** Verdant Machinist animations (5×5 sheets). */
  private verdantMachinistGrowSeedTextures: PIXI.Texture[] = [];
  private verdantMachinistSpellTextures: PIXI.Texture[] = [];
  private verdantMachinistSummoningTextures: PIXI.Texture[] = [];
  private verdantMachinistCommandingTextures: PIXI.Texture[] = [];
  private verdantMachinistEvolveTextures: PIXI.Texture[] = [];
  private verdantMachinistDetonateTextures: PIXI.Texture[] = [];
  private verdantMachinistDrainTextures: PIXI.Texture[] = [];
  private vmGrowSeedStartTime: number | null = null;
  private vmGrowSeedResolve: (() => void) | null = null;
  private vmSpellStartTime: number | null = null;
  private vmSpellResolve: (() => void) | null = null;
  private vmSummoningStartTime: number | null = null;
  private vmSummoningResolve: (() => void) | null = null;
  private vmCommandingStartTime: number | null = null;
  private vmCommandingResolve: (() => void) | null = null;
  private vmEvolveStartTime: number | null = null;
  private vmEvolveResolve: (() => void) | null = null;
  private vmDetonateStartTime: number | null = null;
  private vmDetonateResolve: (() => void) | null = null;
  private vmDrainStartTime: number | null = null;
  private vmDrainResolve: (() => void) | null = null;

  /** Placeholder enemy animations (Idle, Hurt, Dying) per Zombie_Villager variant. Loaded once when combat uses placeholders. */
  private zombiePlaceholderTextures: Record<
    1 | 2 | 3,
    { idle: PIXI.Texture[]; hurt: PIXI.Texture[]; dying: PIXI.Texture[] }
  > = { 1: { idle: [], hurt: [], dying: [] }, 2: { idle: [], hurt: [], dying: [] }, 3: { idle: [], hurt: [], dying: [] } };
  private zombiePlaceholderLoadPromise: Promise<void> | null = null;
  /** Acid slime uses the blobbi idle 5x5 sheet. */
  private acidSlimeIdleTextures: PIXI.Texture[] = [];

  /** Load only global combat assets (fight-location config + default bg + empty card template). Call once at app/game start. Failures are cached (no retries). */
  async loadGlobalCombatAssets(): Promise<void> {
    if (this.globalLoadPromise) return this.globalLoadPromise;
    this.globalLoadPromise = (async () => {
      try {
        const res = await fetch(this.resolveUrl(FIGHT_LOCATION_CONFIG_URL));
        const data = (await res.json()) as Record<string, unknown>;
        const raw = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
        this.combatBgByEnemy = {};
        for (const k of Object.keys(raw)) {
          if (k !== 'backgrounds' && typeof (raw as Record<string, unknown>)[k] === 'string') {
            this.combatBgByEnemy[k] = (raw as Record<string, string>)[k];
          }
        }
        if (Array.isArray(raw['backgrounds'])) {
          this.combatBgPool = (raw['backgrounds'] as unknown[]).filter((f): f is string => typeof f === 'string');
        } else {
          this.combatBgPool = [];
        }
      } catch {
        this.combatBgByEnemy = { default: 'background_level_1.png' };
        this.combatBgPool = [];
      }
      const defaultFilename = this.combatBgByEnemy['default'] ?? 'background_level_1.png';
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
      // Atlas is optional; if it fails we just fall back to direct loads.
      try {
        await PIXI.Assets.load(this.resolveUrl(UI_ATLAS_JSON));
        await PIXI.Assets.load(this.resolveUrl(UI_ATLAS_PNG));
        this.uiAtlasLoaded = true;
      } catch {
        this.uiAtlasLoaded = false;
      }
      try {
        this.hpBarBgTexture = (await PIXI.Assets.load(this.resolveUrl(HP_BAR_BG_PATH))) as PIXI.Texture;
      } catch {
        this.hpBarBgTexture = null;
      }
      try {
        this.hpBarProgressTexture = (await PIXI.Assets.load(this.resolveUrl(HP_BAR_PROGRESS_PATH))) as PIXI.Texture;
      } catch {
        this.hpBarProgressTexture = null;
      }
      try {
        this.hpBarBorderTexture = (await PIXI.Assets.load(this.resolveUrl(HP_BAR_BORDER_PATH))) as PIXI.Texture;
      } catch {
        this.hpBarBorderTexture = null;
      }
      try {
        this.shieldBarBgTexture = (await PIXI.Assets.load(this.resolveUrl(SHIELD_BAR_BG_PATH))) as PIXI.Texture;
      } catch {
        this.shieldBarBgTexture = null;
      }
      try {
        this.shieldBarProgressTexture = (await PIXI.Assets.load(this.resolveUrl(SHIELD_BAR_PROGRESS_PATH))) as PIXI.Texture;
      } catch {
        this.shieldBarProgressTexture = null;
      }
      try {
        this.shieldBarBorderTexture = (await PIXI.Assets.load(this.resolveUrl(SHIELD_BAR_BORDER_PATH))) as PIXI.Texture;
      } catch {
        this.shieldBarBorderTexture = null;
      }
    })();
    return this.globalLoadPromise;
  }

  /** Load combat assets for the current fight: global (bg) + character sheets + enemy textures. Safe to call multiple times. */
  async loadCombatAssets(characterId?: string, enemyIds?: string[]): Promise<void> {
    await this.loadGlobalCombatAssets();
    const signature = `${characterId ?? ''}|${(enemyIds ?? []).join(',')}`;
    const isNewFight = signature !== this.currentCombatBgSignature;

    let effectiveKey: string;
    let filename: string;
    if (this.combatBgPool.length > 0) {
      if (isNewFight) {
        filename = this.combatBgPool[Math.floor(Math.random() * this.combatBgPool.length)];
        effectiveKey = filename;
        this.currentCombatBgSignature = signature;
        this.currentCombatBgKey = effectiveKey;
      } else {
        effectiveKey = this.currentCombatBgKey;
        filename = this.combatBgPool.includes(effectiveKey) ? effectiveKey : this.combatBgPool[0];
      }
    } else {
      const bgKey = enemyIds?.[0] ?? 'default';
      const hasMapping = bgKey !== 'default' && this.combatBgByEnemy[bgKey] != null;
      effectiveKey = hasMapping ? bgKey : 'default';
      filename = this.combatBgByEnemy[effectiveKey] ?? 'background_level_1.png';
      if (isNewFight) {
        this.currentCombatBgSignature = signature;
        this.currentCombatBgKey = effectiveKey;
      }
    }
    if (!this.combatBgTextureCache.has(effectiveKey)) {
      try {
        const tex = (await PIXI.Assets.load(this.resolveUrl(FIGHT_LOCATION_PREFIX + filename))) as PIXI.Texture;
        this.combatBgTextureCache.set(effectiveKey, tex);
      } catch {
        // Per-enemy or random bg failed; getCombatBgTexture will fall back to default
      }
    }
    const cid = characterId ?? DEFAULT_PLAYER_CHARACTER_ID;
    this.currentPlayerCharacterId = cid;

    if (cid === 'chibi') {
      // Chibi uses a numbered idle animation (18 frames) instead of a single static image.
      if (this.chibiIdleTextures.length === 0) {
        for (let i = 0; i < CHIBI_IDLE_FRAME_COUNT; i++) {
          try {
            const path = this.resolveUrl(getChibiIdleFramePath(i));
            const tex = (await PIXI.Assets.load(path)) as PIXI.Texture;
            this.chibiIdleTextures.push(tex);
          } catch {
            logger.warn('Chibi idle frame load failed', getChibiIdleFramePath(i));
          }
        }
        if (this.chibiIdleTextures.length > 0) {
          this.playerTextures.set('chibi', this.chibiIdleTextures[0]);
        }
        if (this.chibiSlashingTextures.length === 0) {
          for (let i = 0; i < CHIBI_SLASHING_FRAME_COUNT; i++) {
            try {
              const path = this.resolveUrl(getChibiSlashingFramePath(i));
              const tex = (await PIXI.Assets.load(path)) as PIXI.Texture;
              this.chibiSlashingTextures.push(tex);
            } catch {
              logger.warn('Chibi slashing frame load failed', getChibiSlashingFramePath(i));
            }
          }
        }
      }
    } else if (!this.playerTextures.has(cid)) {
      if (cid === 'gungirl') {
        try {
          const idlePath = this.resolveUrl(getStaticImagePath(cid));
          const idleSheet = (await PIXI.Assets.load(idlePath)) as PIXI.Texture;
          this.gungirlIdleTextures = this.buildSheetFrames(idleSheet, GUNGIRL_SHEET_COLS, GUNGIRL_SHEET_ROWS);
          if (this.gungirlIdleTextures.length > 0) {
            this.playerTextures.set(cid, this.gungirlIdleTextures[0]);
          }
        } catch {
          this.gungirlIdleTextures = [];
        }
      }
      if (cid === 'verdant_machinist') {
        try {
          const idlePath = this.resolveUrl(getStaticImagePath(cid));
          const idleSheet = (await PIXI.Assets.load(idlePath)) as PIXI.Texture;
          this.verdantMachinistIdleTextures = this.buildSheetFrames(idleSheet, VM_IDLE_SHEET_COLS, VM_IDLE_SHEET_ROWS);
          if (this.verdantMachinistIdleTextures.length > 0) {
            this.playerTextures.set(cid, this.verdantMachinistIdleTextures[0]);
          }
        } catch {
          this.verdantMachinistIdleTextures = [];
        }
      }
      if (!this.playerTextures.has(cid)) {
        try {
          const staticPath = this.resolveUrl(getStaticImagePath(cid));
          const staticTexture = (await PIXI.Assets.load(staticPath)) as PIXI.Texture;
          this.playerTextures.set(cid, staticTexture);
        } catch {
          // No static image; use first frame of shield sheet as fallback
        }
      }
      try {
        const sheetPath = this.resolveUrl(getShieldSheetPath(cid));
        const sheetTexture = (await PIXI.Assets.load(sheetPath)) as PIXI.Texture;
        const cols = cid === 'gungirl' ? GUNGIRL_SHEET_COLS : cid === 'verdant_machinist' ? VM_IDLE_SHEET_COLS : SHIELD_SHEET_COLS;
        const rows = cid === 'gungirl' ? GUNGIRL_SHEET_ROWS : cid === 'verdant_machinist' ? VM_IDLE_SHEET_ROWS : SHIELD_SHEET_ROWS;
        const frames = this.buildSheetFrames(sheetTexture, cols, rows);
        if (frames.length > 0) {
          if (!this.playerTextures.has(cid)) this.playerTextures.set(cid, frames[0]);
          if (cid === DEFAULT_PLAYER_CHARACTER_ID || cid === 'verdant_machinist') this.shieldFrameTextures = frames;
        }
      } catch {
        if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shieldFrameTextures = [];
      }
      try {
        const strikeOrShootingPath = this.resolveUrl(getStrikeSheetPath(cid));
        const strikeOrShootingTexture = (await PIXI.Assets.load(strikeOrShootingPath)) as PIXI.Texture;
        const cols = cid === 'gungirl' ? GUNGIRL_SHEET_COLS : cid === 'verdant_machinist' ? VM_IDLE_SHEET_COLS : SHIELD_SHEET_COLS;
        const rows = cid === 'gungirl' ? GUNGIRL_SHEET_ROWS : cid === 'verdant_machinist' ? VM_IDLE_SHEET_ROWS : SHIELD_SHEET_ROWS;
        const frames = this.buildSheetFrames(strikeOrShootingTexture, cols, rows);
        if (cid === DEFAULT_PLAYER_CHARACTER_ID || cid === 'verdant_machinist') this.shootingFrameTextures = frames;
      } catch {
        if (cid === DEFAULT_PLAYER_CHARACTER_ID) this.shootingFrameTextures = [];
      }
      if (cid === 'verdant_machinist') {
        for (const name of VM_ANIMATION_NAMES) {
          try {
            const path = this.resolveUrl(getVMAnimationSheetPath(name));
            const sheet = (await PIXI.Assets.load(path)) as PIXI.Texture;
            const frames = this.buildSheetFrames(sheet, VM_IDLE_SHEET_COLS, VM_IDLE_SHEET_ROWS);
            switch (name) {
              case 'grow_seed': this.verdantMachinistGrowSeedTextures = frames; break;
              case 'spell': this.verdantMachinistSpellTextures = frames; break;
              case 'summoning': this.verdantMachinistSummoningTextures = frames; break;
              case 'commanding': this.verdantMachinistCommandingTextures = frames; break;
              case 'evolve': this.verdantMachinistEvolveTextures = frames; break;
              case 'detonate': this.verdantMachinistDetonateTextures = frames; break;
              case 'drain': this.verdantMachinistDrainTextures = frames; break;
            }
          } catch {
            switch (name) {
              case 'grow_seed': this.verdantMachinistGrowSeedTextures = []; break;
              case 'spell': this.verdantMachinistSpellTextures = []; break;
              case 'summoning': this.verdantMachinistSummoningTextures = []; break;
              case 'commanding': this.verdantMachinistCommandingTextures = []; break;
              case 'evolve': this.verdantMachinistEvolveTextures = []; break;
              case 'detonate': this.verdantMachinistDetonateTextures = []; break;
              case 'drain': this.verdantMachinistDrainTextures = []; break;
            }
          }
        }
      }
    }
    for (const id of enemyIds ?? []) {
      await this.loadEnemyTexture(id);
    }
    if ((enemyIds ?? []).some((id) => this.isAcidSlimeEnemy(id))) {
      await this.loadAcidSlimeAssets();
    }
    await this.loadZombiePlaceholderAssets();
  }

  /** Load acid slime idle animation frames from blobbi 5x5 sheet. */
  private async loadAcidSlimeAssets(): Promise<void> {
    if (this.acidSlimeIdleTextures.length > 0) return;
    try {
      const sheet = (await PIXI.Assets.load(this.resolveUrl(BLOBBI_IDLE_SHEET_PATH))) as PIXI.Texture;
      this.acidSlimeIdleTextures = this.buildSheetFrames(
        sheet,
        BLOBBI_IDLE_SHEET_COLS,
        BLOBBI_IDLE_SHEET_ROWS
      );
    } catch {
      this.acidSlimeIdleTextures = [];
      logger.warn('Acid slime idle sheet load failed', BLOBBI_IDLE_SHEET_PATH);
    }
  }

  /** Load Idle, Hurt, Dying sequences for Zombie_Villager_1/2/3. Called from loadCombatAssets. Safe to call multiple times. */
  private async loadZombiePlaceholderAssets(): Promise<void> {
    if (this.zombiePlaceholderLoadPromise) return this.zombiePlaceholderLoadPromise;
    this.zombiePlaceholderLoadPromise = (async () => {
      for (const v of ZOMBIE_PLACEHOLDER_VARIANTS) {
        const idle: PIXI.Texture[] = [];
        for (let i = 0; i < ZOMBIE_IDLE_FRAME_COUNT; i++) {
          try {
            const tex = (await PIXI.Assets.load(this.resolveUrl(getZombiePlaceholderFramePath(v, 'Idle', i)))) as PIXI.Texture;
            idle.push(tex);
          } catch {
            if (i === 0) logger.warn('Zombie placeholder Idle load failed', getZombiePlaceholderFramePath(v, 'Idle', i));
            break;
          }
        }
        const hurt: PIXI.Texture[] = [];
        for (let i = 0; i < ZOMBIE_HURT_FRAME_COUNT; i++) {
          try {
            const tex = (await PIXI.Assets.load(this.resolveUrl(getZombiePlaceholderFramePath(v, 'Hurt', i)))) as PIXI.Texture;
            hurt.push(tex);
          } catch {
            if (i === 0) logger.warn('Zombie placeholder Hurt load failed', getZombiePlaceholderFramePath(v, 'Hurt', i));
            break;
          }
        }
        const dying: PIXI.Texture[] = [];
        for (let i = 0; i < ZOMBIE_DYING_FRAME_COUNT; i++) {
          try {
            const tex = (await PIXI.Assets.load(this.resolveUrl(getZombiePlaceholderFramePath(v, 'Dying', i)))) as PIXI.Texture;
            dying.push(tex);
          } catch {
            if (i === 0) logger.warn('Zombie placeholder Dying load failed', getZombiePlaceholderFramePath(v, 'Dying', i));
            break;
          }
        }
        this.zombiePlaceholderTextures[v] = { idle, hurt, dying };
      }
    })();
    return this.zombiePlaceholderLoadPromise;
  }

  private async doLoad(): Promise<void> {
    await this.loadCombatAssets(DEFAULT_PLAYER_CHARACTER_ID, []);
  }

  private buildSheetFrames(sheetTexture: PIXI.Texture, cols: number = SHIELD_SHEET_COLS, rows: number = SHIELD_SHEET_ROWS): PIXI.Texture[] {
    const source = sheetTexture.source;
    const sheetW = sheetTexture.width;
    const sheetH = sheetTexture.height;
    const frameCount = cols * rows;
    const frameW = Math.floor(sheetW / cols);
    const frameH = Math.floor(sheetH / rows);
    const out: PIXI.Texture[] = [];
    for (let i = 0; i < frameCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
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

  getHpBarBgTexture(): PIXI.Texture | null {
    return this.hpBarBgTexture;
  }

  getHpBarProgressTexture(): PIXI.Texture | null {
    return this.hpBarProgressTexture;
  }

  getHpBarBorderTexture(): PIXI.Texture | null {
    return this.hpBarBorderTexture;
  }

  getShieldBarBgTexture(): PIXI.Texture | null {
    return this.shieldBarBgTexture;
  }

  getShieldBarProgressTexture(): PIXI.Texture | null {
    return this.shieldBarProgressTexture;
  }

  getShieldBarBorderTexture(): PIXI.Texture | null {
    return this.shieldBarBorderTexture;
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

  /** Returns the current player character texture. For chibi/gungirl, uses idle animation frame from time; otherwise static/first frame. */
  getPlayerTexture(animationTimeMs?: number): PIXI.Texture | null {
    const cid = this.currentPlayerCharacterId;
    if (cid === 'chibi' && this.chibiIdleTextures.length > 0) {
      const t = animationTimeMs ?? 0;
      const index = Math.floor((t / CHIBI_IDLE_FRAME_MS) % this.chibiIdleTextures.length);
      return this.chibiIdleTextures[index] ?? this.chibiIdleTextures[0];
    }
    if (cid === 'gungirl' && this.gungirlIdleTextures.length > 0) {
      const t = animationTimeMs ?? 0;
      const index = Math.floor((t / GUNGIRL_IDLE_FRAME_MS) % this.gungirlIdleTextures.length);
      return this.gungirlIdleTextures[index] ?? this.gungirlIdleTextures[0];
    }
    if (cid === 'verdant_machinist' && this.verdantMachinistIdleTextures.length > 0) {
      const t = animationTimeMs ?? 0;
      const index = Math.floor((t / VM_IDLE_FRAME_MS) % this.verdantMachinistIdleTextures.length);
      return this.verdantMachinistIdleTextures[index] ?? this.verdantMachinistIdleTextures[0];
    }
    return this.playerTextures.get(cid) ?? null;
  }

  /** Returns the current shield animation frame texture, or null if not playing or no frames. */
  getShieldVideoTexture(): PIXI.Texture | null {
    if (this.shieldFrameTextures.length === 0 || this.shieldStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.shield;
    const elapsed = Date.now() - this.shieldStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.shieldFrameTextures.length - 1);
    return this.shieldFrameTextures[frameIndex] ?? null;
  }

  /** Call each tick while shield is playing. Resolves the play promise when animation is done. */
  getShieldAnimationDone(): void {
    if (this.shieldStartTime == null || !this.shieldResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.shield;
    const elapsed = Date.now() - this.shieldStartTime;
    const durationMs = this.shieldFrameTextures.length * frameMs;
    if (elapsed >= durationMs) {
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
    const frameMs = PLAYER_ANIMATION_FRAME_MS.shooting;
    const elapsed = Date.now() - this.shootingStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.shootingFrameTextures.length - 1);
    return this.shootingFrameTextures[frameIndex] ?? null;
  }

  /** Call each tick while shooting is playing. Resolves the play promise when animation is done. */
  getShootingAnimationDone(): void {
    if (this.shootingStartTime == null || !this.shootingResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.shooting;
    const elapsed = Date.now() - this.shootingStartTime;
    const durationMs = this.shootingFrameTextures.length * frameMs;
    if (elapsed >= durationMs) {
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

  /** Returns current chibi slashing frame, or null if not playing or no frames. */
  getSlashingTexture(): PIXI.Texture | null {
    if (this.chibiSlashingTextures.length === 0 || this.slashingStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.slashing;
    const elapsed = Date.now() - this.slashingStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.chibiSlashingTextures.length - 1);
    return this.chibiSlashingTextures[frameIndex] ?? null;
  }

  /** Call each tick while slashing is playing. Resolves the play promise when animation is done. */
  getSlashingAnimationDone(): void {
    if (this.slashingStartTime == null || !this.slashingResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.slashing;
    const elapsed = Date.now() - this.slashingStartTime;
    const durationMs = this.chibiSlashingTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.slashingStartTime = null;
      const resolve = this.slashingResolve;
      this.slashingResolve = null;
      resolve();
    }
  }

  /** Plays the chibi slashing animation once (e.g. for strike card). Resolves when the animation ends. */
  playSlashingAnimation(): Promise<void> {
    if (this.chibiSlashingTextures.length === 0) return Promise.resolve();
    this.slashingStartTime = Date.now();
    return new Promise((resolve) => {
      this.slashingResolve = resolve;
    });
  }

  /** Verdant Machinist: grow_seed / spell / summoning animation getters and play. */
  getVMGrowSeedTexture(): PIXI.Texture | null {
    if (this.verdantMachinistGrowSeedTextures.length === 0 || this.vmGrowSeedStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmGrowSeed;
    const elapsed = Date.now() - this.vmGrowSeedStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistGrowSeedTextures.length - 1);
    return this.verdantMachinistGrowSeedTextures[frameIndex] ?? null;
  }

  getVMSpellTexture(): PIXI.Texture | null {
    if (this.verdantMachinistSpellTextures.length === 0 || this.vmSpellStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmSpell;
    const elapsed = Date.now() - this.vmSpellStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistSpellTextures.length - 1);
    return this.verdantMachinistSpellTextures[frameIndex] ?? null;
  }

  getVMSummoningTexture(): PIXI.Texture | null {
    if (this.verdantMachinistSummoningTextures.length === 0 || this.vmSummoningStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmSummoning;
    const elapsed = Date.now() - this.vmSummoningStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistSummoningTextures.length - 1);
    return this.verdantMachinistSummoningTextures[frameIndex] ?? null;
  }

  playVMGrowSeedAnimation(): Promise<void> {
    if (this.verdantMachinistGrowSeedTextures.length === 0) return Promise.resolve();
    this.vmGrowSeedStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmGrowSeedResolve = resolve;
    });
  }

  playVMSpellAnimation(): Promise<void> {
    if (this.verdantMachinistSpellTextures.length === 0) return Promise.resolve();
    this.vmSpellStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmSpellResolve = resolve;
    });
  }

  playVMSummoningAnimation(): Promise<void> {
    if (this.verdantMachinistSummoningTextures.length === 0) return Promise.resolve();
    this.vmSummoningStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmSummoningResolve = resolve;
    });
  }

  getVMGrowSeedAnimationDone(): void {
    if (this.vmGrowSeedStartTime == null || !this.vmGrowSeedResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmGrowSeed;
    const elapsed = Date.now() - this.vmGrowSeedStartTime;
    const durationMs = this.verdantMachinistGrowSeedTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmGrowSeedStartTime = null;
      const resolve = this.vmGrowSeedResolve;
      this.vmGrowSeedResolve = null;
      resolve();
    }
  }

  getVMSpellAnimationDone(): void {
    if (this.vmSpellStartTime == null || !this.vmSpellResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmSpell;
    const elapsed = Date.now() - this.vmSpellStartTime;
    const durationMs = this.verdantMachinistSpellTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmSpellStartTime = null;
      const resolve = this.vmSpellResolve;
      this.vmSpellResolve = null;
      resolve();
    }
  }

  getVMSummoningAnimationDone(): void {
    if (this.vmSummoningStartTime == null || !this.vmSummoningResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmSummoning;
    const elapsed = Date.now() - this.vmSummoningStartTime;
    const durationMs = this.verdantMachinistSummoningTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmSummoningStartTime = null;
      const resolve = this.vmSummoningResolve;
      this.vmSummoningResolve = null;
      resolve();
    }
  }

  getVMCommandingTexture(): PIXI.Texture | null {
    if (this.verdantMachinistCommandingTextures.length === 0 || this.vmCommandingStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmCommanding;
    const elapsed = Date.now() - this.vmCommandingStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistCommandingTextures.length - 1);
    return this.verdantMachinistCommandingTextures[frameIndex] ?? null;
  }

  getVMEvolveTexture(): PIXI.Texture | null {
    if (this.verdantMachinistEvolveTextures.length === 0 || this.vmEvolveStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmEvolve;
    const elapsed = Date.now() - this.vmEvolveStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistEvolveTextures.length - 1);
    return this.verdantMachinistEvolveTextures[frameIndex] ?? null;
  }

  getVMDetonateTexture(): PIXI.Texture | null {
    if (this.verdantMachinistDetonateTextures.length === 0 || this.vmDetonateStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmDetonate;
    const elapsed = Date.now() - this.vmDetonateStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistDetonateTextures.length - 1);
    return this.verdantMachinistDetonateTextures[frameIndex] ?? null;
  }

  getVMDrainTexture(): PIXI.Texture | null {
    if (this.verdantMachinistDrainTextures.length === 0 || this.vmDrainStartTime == null) return null;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmDrain;
    const elapsed = Date.now() - this.vmDrainStartTime;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), this.verdantMachinistDrainTextures.length - 1);
    return this.verdantMachinistDrainTextures[frameIndex] ?? null;
  }

  playVMCommandingAnimation(): Promise<void> {
    if (this.verdantMachinistCommandingTextures.length === 0) return Promise.resolve();
    this.vmCommandingStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmCommandingResolve = resolve;
    });
  }

  playVMEvolveAnimation(): Promise<void> {
    if (this.verdantMachinistEvolveTextures.length === 0) return Promise.resolve();
    this.vmEvolveStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmEvolveResolve = resolve;
    });
  }

  playVMDetonateAnimation(): Promise<void> {
    if (this.verdantMachinistDetonateTextures.length === 0) return Promise.resolve();
    this.vmDetonateStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmDetonateResolve = resolve;
    });
  }

  playVMDrainAnimation(): Promise<void> {
    if (this.verdantMachinistDrainTextures.length === 0) return Promise.resolve();
    this.vmDrainStartTime = Date.now();
    return new Promise((resolve) => {
      this.vmDrainResolve = resolve;
    });
  }

  getVMCommandingAnimationDone(): void {
    if (this.vmCommandingStartTime == null || !this.vmCommandingResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmCommanding;
    const elapsed = Date.now() - this.vmCommandingStartTime;
    const durationMs = this.verdantMachinistCommandingTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmCommandingStartTime = null;
      const resolve = this.vmCommandingResolve;
      this.vmCommandingResolve = null;
      resolve();
    }
  }

  getVMEvolveAnimationDone(): void {
    if (this.vmEvolveStartTime == null || !this.vmEvolveResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmEvolve;
    const elapsed = Date.now() - this.vmEvolveStartTime;
    const durationMs = this.verdantMachinistEvolveTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmEvolveStartTime = null;
      const resolve = this.vmEvolveResolve;
      this.vmEvolveResolve = null;
      resolve();
    }
  }

  getVMDetonateAnimationDone(): void {
    if (this.vmDetonateStartTime == null || !this.vmDetonateResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmDetonate;
    const elapsed = Date.now() - this.vmDetonateStartTime;
    const durationMs = this.verdantMachinistDetonateTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmDetonateStartTime = null;
      const resolve = this.vmDetonateResolve;
      this.vmDetonateResolve = null;
      resolve();
    }
  }

  getVMDrainAnimationDone(): void {
    if (this.vmDrainStartTime == null || !this.vmDrainResolve) return;
    const frameMs = PLAYER_ANIMATION_FRAME_MS.vmDrain;
    const elapsed = Date.now() - this.vmDrainStartTime;
    const durationMs = this.verdantMachinistDrainTextures.length * frameMs;
    if (elapsed >= durationMs) {
      this.vmDrainStartTime = null;
      const resolve = this.vmDrainResolve;
      this.vmDrainResolve = null;
      resolve();
    }
  }

  /** Returns player texture for a given character id (for future character selection). */
  getPlayerTextureForCharacter(characterId: string): PIXI.Texture | null {
    return this.playerTextures.get(characterId) ?? null;
  }

  /**
   * Returns current frame texture for placeholder enemy animation (Zombie_Villager variants).
   * idle: loops using nowMs. hurt/dying: one-shot from animationStartMs; past duration returns last frame.
   */
  getEnemyAnimationTexture(
    variantId: 1 | 2 | 3,
    animation: 'idle' | 'hurt' | 'dying',
    nowMs: number,
    animationStartMs?: number
  ): PIXI.Texture | null {
    const key = animation === 'idle' ? 'idle' : animation === 'hurt' ? 'hurt' : 'dying';
    const frames = this.zombiePlaceholderTextures[variantId][key];
    if (!frames?.length) return null;
    const frameMs = ENEMY_ANIMATION_TIMING.frameMs;
    if (animation === 'idle') {
      const frameIndex = Math.floor((nowMs / frameMs) % frames.length);
      return frames[frameIndex] ?? frames[0];
    }
    const start = animationStartMs ?? 0;
    const elapsed = nowMs - start;
    const duration = animation === 'hurt' ? ENEMY_ANIMATION_TIMING.hurtDurationMs : ENEMY_ANIMATION_TIMING.dyingDurationMs;
    const frameIndex = Math.min(Math.floor(elapsed / frameMs), frames.length - 1);
    return frames[Math.max(0, frameIndex)] ?? frames[frames.length - 1];
  }

  /**
   * Returns enemy-specific animation frame when available.
   * Acid slimes use blobbi 5x5 idle animation and ignore hurt/dying variants for now.
   */
  getEnemyAnimationTextureById(enemyId: string, nowMs: number): PIXI.Texture | null {
    if (!this.isAcidSlimeEnemy(enemyId) || this.acidSlimeIdleTextures.length === 0) return null;
    const frameIndex = Math.floor((nowMs / BLOBBI_IDLE_FRAME_MS) % this.acidSlimeIdleTextures.length);
    return this.acidSlimeIdleTextures[frameIndex] ?? this.acidSlimeIdleTextures[0] ?? null;
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

  private isAcidSlimeEnemy(enemyId: string): boolean {
    return enemyId === 'acid_slime_s' || enemyId === 'acid_slime_m' || enemyId === 'acid_slime_l';
  }
}
