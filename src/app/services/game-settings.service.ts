import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'game-settings';

export type VfxIntensity = 'full' | 'reduced' | 'off';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';
export type TextSize = 'small' | 'normal' | 'large';
export type HandLayoutMode = 'default' | 'compact';

export interface GameSettings {
  vfxIntensity: VfxIntensity;
  animationSpeed: AnimationSpeed;
  textSize: TextSize;
  handLayout: HandLayoutMode;
  reducedMotion: boolean;
}

const DEFAULTS: GameSettings = {
  vfxIntensity: 'full',
  animationSpeed: 'normal',
  textSize: 'normal',
  handLayout: 'default',
  reducedMotion: false,
};

/** Multiplier for animation duration (card fly, etc.): higher = faster. */
export function animationSpeedMultiplier(speed: AnimationSpeed): number {
  switch (speed) {
    case 'slow': return 0.7;
    case 'fast': return 1.5;
    default: return 1;
  }
}

/** Scale factor for card and overlay text. */
export function textSizeScale(size: TextSize): number {
  switch (size) {
    case 'small': return 0.85;
    case 'large': return 1.2;
    default: return 1;
  }
}

@Injectable({ providedIn: 'root' })
export class GameSettingsService {
  private readonly stored = signal<GameSettings>(this.load());

  vfxIntensity = computed(() => this.stored().vfxIntensity);
  animationSpeed = computed(() => this.stored().animationSpeed);
  textSize = computed(() => this.stored().textSize);
  handLayout = computed(() => this.stored().handLayout);
  reducedMotion = computed(() => this.stored().reducedMotion);
  animationSpeedMultiplier = computed(() => animationSpeedMultiplier(this.stored().animationSpeed));
  textScale = computed(() => textSizeScale(this.stored().textSize));

  setVfxIntensity(value: VfxIntensity): void {
    this.update({ vfxIntensity: value });
  }

  setAnimationSpeed(value: AnimationSpeed): void {
    this.update({ animationSpeed: value });
  }

  setTextSize(value: TextSize): void {
    this.update({ textSize: value });
  }

  setHandLayout(value: HandLayoutMode): void {
    this.update({ handLayout: value });
  }

  setReducedMotion(value: boolean): void {
    this.update({ reducedMotion: value });
  }

  getSettings(): GameSettings {
    return this.stored();
  }

  private load(): GameSettings {
    if (typeof localStorage === 'undefined') return { ...DEFAULTS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        vfxIntensity: this.validVfx(parsed.vfxIntensity),
        animationSpeed: this.validSpeed(parsed.animationSpeed),
        textSize: this.validTextSize(parsed.textSize),
        handLayout: parsed.handLayout === 'compact' ? 'compact' : 'default',
        reducedMotion: Boolean(parsed.reducedMotion),
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private update(partial: Partial<GameSettings>): void {
    const next = { ...this.stored(), ...partial };
    this.stored.set(next);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    }
  }

  private validVfx(v?: string): VfxIntensity {
    return v === 'reduced' || v === 'off' ? v : 'full';
  }

  private validSpeed(v?: string): AnimationSpeed {
    return v === 'slow' || v === 'fast' ? v : 'normal';
  }

  private validTextSize(v?: string): TextSize {
    return v === 'small' || v === 'large' ? v : 'normal';
  }
}
