import { Injectable } from '@angular/core';

const AUDIO_BASE = '/assets/audio/';
const VFX_BASE = '/assets/vfx/';
const SOUNDTRACK_BASE = '/assets/soundtracks/';
const PATHS = {
  cardPlay: `${AUDIO_BASE}card-play.mp3`,
  hit: `${AUDIO_BASE}hit.mp3`,
  block: `${AUDIO_BASE}block.mp3`,
  turnStart: `${AUDIO_BASE}turn-start.mp3`,
  turnEnd: `${AUDIO_BASE}turn-end.mp3`,
  victory: `${AUDIO_BASE}victory.mp3`,
  defeat: `${AUDIO_BASE}defeat.mp3`,
  combatStart: `${AUDIO_BASE}combat-start.mp3`,
  click: `${VFX_BASE}click_sound.ogg`,
  soundtrack: `${SOUNDTRACK_BASE}song1.mp3`,
};

const STORAGE_KEY = 'game-sound-preferences';

export interface SoundPreferences {
  muted: boolean;
  musicVolume: number;
  effectsVolume: number;
  clickSoundEnabled: boolean;
}

const DEFAULT_PREFS: SoundPreferences = {
  muted: false,
  musicVolume: 0.6,
  effectsVolume: 0.7,
  clickSoundEnabled: true,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

@Injectable({ providedIn: 'root' })
export class SoundService {
  private muted = DEFAULT_PREFS.muted;
  private musicVolume = DEFAULT_PREFS.musicVolume;
  private effectsVolume = DEFAULT_PREFS.effectsVolume;
  private clickSoundEnabled = DEFAULT_PREFS.clickSoundEnabled;
  private soundtrackEl: HTMLAudioElement | null = null;

  setMuted(m: boolean): void {
    this.muted = m;
    this.applySoundtrackVolume();
    this.savePreferences();
  }

  isMuted(): boolean {
    return this.muted;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = clamp01(v);
    this.applySoundtrackVolume();
    this.savePreferences();
  }

  getEffectsVolume(): number {
    return this.effectsVolume;
  }

  setEffectsVolume(v: number): void {
    this.effectsVolume = clamp01(v);
    this.savePreferences();
  }

  isClickSoundEnabled(): boolean {
    return this.clickSoundEnabled;
  }

  setClickSoundEnabled(enabled: boolean): void {
    this.clickSoundEnabled = enabled;
    this.savePreferences();
  }

  /** Load all sound preferences from localStorage (call once at app init). */
  loadSoundPreferences(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw && localStorage.getItem('game-sound-muted') !== null) {
        this.muted = localStorage.getItem('game-sound-muted') === '1';
        this.savePreferences();
        raw = localStorage.getItem(STORAGE_KEY);
      }
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SoundPreferences>;
        if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
        if (typeof parsed.musicVolume === 'number') this.musicVolume = clamp01(parsed.musicVolume);
        if (typeof parsed.effectsVolume === 'number') this.effectsVolume = clamp01(parsed.effectsVolume);
        if (typeof parsed.clickSoundEnabled === 'boolean') this.clickSoundEnabled = parsed.clickSoundEnabled;
      }
      this.applySoundtrackVolume();
    } catch {}
  }

  private savePreferences(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          muted: this.muted,
          musicVolume: this.musicVolume,
          effectsVolume: this.effectsVolume,
          clickSoundEnabled: this.clickSoundEnabled,
        })
      );
    } catch {}
  }

  private applySoundtrackVolume(): void {
    if (!this.soundtrackEl) return;
    if (this.muted) {
      this.soundtrackEl.volume = 0;
    } else {
      this.soundtrackEl.volume = this.musicVolume;
    }
  }

  startSoundtrack(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.soundtrackEl) {
        this.soundtrackEl = new Audio();
        this.soundtrackEl.loop = true;
        const url = PATHS.soundtrack.startsWith('/') ? window.location.origin + PATHS.soundtrack : PATHS.soundtrack;
        this.soundtrackEl.src = url;
      }
      this.applySoundtrackVolume();
      this.soundtrackEl.play().catch((err) => { if (typeof console !== 'undefined' && console.warn) console.warn('[App] Soundtrack play failed', err); });
    } catch {}
  }

  stopSoundtrack(): void {
    try {
      if (this.soundtrackEl) {
        this.soundtrackEl.pause();
        this.soundtrackEl.currentTime = 0;
      }
    } catch {}
  }

  private play(path: string): void {
    if (this.muted || typeof window === 'undefined') return;
    try {
      const url = path.startsWith('/') ? window.location.origin + path : path;
      const audio = new Audio(url);
      audio.volume = this.effectsVolume;
      audio.play().catch((err) => { if (typeof console !== 'undefined' && console.warn) console.warn('[App] Effect play failed', path, err); });
    } catch {}
  }

  playCardPlay(): void {
    this.play(PATHS.cardPlay);
  }

  playHit(): void {
    this.play(PATHS.hit);
  }

  playBlock(): void {
    this.play(PATHS.block);
  }

  playTurnStart(): void {
    this.play(PATHS.turnStart);
  }

  playTurnEnd(): void {
    this.play(PATHS.turnEnd);
  }

  playVictory(): void {
    this.play(PATHS.victory);
  }

  playDefeat(): void {
    this.play(PATHS.defeat);
  }

  playCombatStart(): void {
    this.play(PATHS.combatStart);
  }

  /** UI click feedback. Only plays when click sound is enabled and not muted. */
  playClick(): void {
    if (!this.clickSoundEnabled || this.muted) return;
    this.play(PATHS.click);
  }
}
