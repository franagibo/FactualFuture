import { Injectable } from '@angular/core';
import { Howl, Howler } from 'howler';

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
};

/** Track filenames per context (under SOUNDTRACK_BASE/<context>/). Playlist is shuffled and looped. */
const SOUNDTRACK_PLAYLISTS: Record<string, string[]> = {
  main_menu: ['main.mp3'],
  map: ['node_selection.mp3', 'node_selection2.mp3'],
  combat: ['combat1.mp3', 'combat2.mp3', 'combat3.mp3'],
};

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

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

export type SoundtrackContext = 'main_menu' | 'map' | 'combat';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private muted = DEFAULT_PREFS.muted;
  private musicVolume = DEFAULT_PREFS.musicVolume;
  private effectsVolume = DEFAULT_PREFS.effectsVolume;
  private clickSoundEnabled = DEFAULT_PREFS.clickSoundEnabled;

  private soundtrack: Howl | null = null;
  private soundtrackFadeMs = 650;
  private currentContext: SoundtrackContext | null = null;
  private currentPlaylist: string[] = [];
  private playlistIndex = 0;
  private playlistBasePath = '';

  private sfx: Record<keyof typeof PATHS, Howl> | null = null;
  private unlocked = false;

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
    this.applySfxVolume();
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
      this.applySfxVolume();
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
    if (this.muted) {
      Howler.volume(0);
    } else {
      Howler.volume(1);
    }
    if (this.soundtrack) this.soundtrack.volume(this.musicVolume);
  }

  private applySfxVolume(): void {
    if (!this.sfx) return;
    for (const k of Object.keys(this.sfx) as (keyof typeof PATHS)[]) {
      this.sfx[k].volume(this.effectsVolume);
    }
  }

  /** Ensure Howler is ready (and create reusable Howl instances for SFX). */
  private ensureInit(): void {
    if (typeof window === 'undefined') return;
    if (!this.sfx) {
      this.sfx = {
        cardPlay: new Howl({ src: [PATHS.cardPlay], preload: true, volume: this.effectsVolume }),
        hit: new Howl({ src: [PATHS.hit], preload: true, volume: this.effectsVolume }),
        block: new Howl({ src: [PATHS.block], preload: true, volume: this.effectsVolume }),
        turnStart: new Howl({ src: [PATHS.turnStart], preload: true, volume: this.effectsVolume }),
        turnEnd: new Howl({ src: [PATHS.turnEnd], preload: true, volume: this.effectsVolume }),
        victory: new Howl({ src: [PATHS.victory], preload: true, volume: this.effectsVolume }),
        defeat: new Howl({ src: [PATHS.defeat], preload: true, volume: this.effectsVolume }),
        combatStart: new Howl({ src: [PATHS.combatStart], preload: true, volume: this.effectsVolume }),
        click: new Howl({ src: [PATHS.click], preload: true, volume: this.effectsVolume }),
      };
    }
    this.applySoundtrackVolume();
    this.applySfxVolume();
  }

  /** Call once after first user interaction to satisfy autoplay policies. */
  unlock(): void {
    this.ensureInit();
    this.unlocked = true;
  }

  private startPlaylist(context: SoundtrackContext): void {
    if (typeof window === 'undefined') return;
    this.ensureInit();
    const files = SOUNDTRACK_PLAYLISTS[context];
    if (!files?.length) return;
    try {
      this.currentContext = context;
      this.currentPlaylist = shuffleArray(files);
      this.playlistIndex = 0;
      this.playlistBasePath = `${SOUNDTRACK_BASE}${context}`;
      const path = `${this.playlistBasePath}/${this.currentPlaylist[0]}`;
      const url = path.startsWith('/') ? window.location.origin + path : path;
      const next = new Howl({
        src: [url],
        html5: true,
        loop: false,
        volume: this.musicVolume,
        onend: () => this.playNextTrack(),
      });
      // Crossfade (or hard swap if we have nothing playing yet)
      const prev = this.soundtrack;
      this.soundtrack = next;
      if (this.muted || !this.unlocked) return;
      next.play();
      if (prev) {
        prev.fade(prev.volume(), 0, this.soundtrackFadeMs);
        setTimeout(() => prev.unload(), this.soundtrackFadeMs + 50);
      }
    } catch {}
  }

  private playNextTrack(): void {
    if (typeof window === 'undefined') return;
    if (this.currentPlaylist.length === 0) return;
    this.playlistIndex = (this.playlistIndex + 1) % this.currentPlaylist.length;
    const path = `${this.playlistBasePath}/${this.currentPlaylist[this.playlistIndex]}`;
    const url = path.startsWith('/') ? window.location.origin + path : path;
    const next = new Howl({
      src: [url],
      html5: true,
      loop: false,
      volume: this.musicVolume,
      onend: () => this.playNextTrack(),
    });
    const prev = this.soundtrack;
    this.soundtrack = next;
    if (this.muted || !this.unlocked) return;
    next.play();
    if (prev) {
      prev.fade(prev.volume(), 0, this.soundtrackFadeMs);
      setTimeout(() => prev.unload(), this.soundtrackFadeMs + 50);
    }
  }

  /** Start main menu playlist (shuffled, full playlist on loop). */
  startMainMenuSoundtrack(): void {
    this.startPlaylist('main_menu');
  }

  /** Start map screen playlist (shuffled, full playlist on loop). */
  startMapSoundtrack(): void {
    this.startPlaylist('map');
  }

  /** Start combat playlist (shuffled, full playlist on loop). */
  startCombatSoundtrack(): void {
    this.startPlaylist('combat');
  }

  /** @deprecated Use startMainMenuSoundtrack() for main menu. Kept for compatibility. */
  startSoundtrack(): void {
    this.startMainMenuSoundtrack();
  }

  stopSoundtrack(): void {
    try {
      if (this.soundtrack) {
        const s = this.soundtrack;
        this.soundtrack = null;
        s.stop();
        s.unload();
      }
      this.currentContext = null;
      this.currentPlaylist = [];
    } catch {}
  }

  private playSfx(key: keyof typeof PATHS): void {
    if (this.muted || typeof window === 'undefined' || !this.unlocked) return;
    this.ensureInit();
    try {
      this.sfx?.[key]?.play();
    } catch {}
  }

  playCardPlay(): void {
    this.playSfx('cardPlay');
  }

  playHit(): void {
    this.playSfx('hit');
  }

  playBlock(): void {
    this.playSfx('block');
  }

  playTurnStart(): void {
    this.playSfx('turnStart');
  }

  playTurnEnd(): void {
    this.playSfx('turnEnd');
  }

  playVictory(): void {
    this.playSfx('victory');
  }

  playDefeat(): void {
    this.playSfx('defeat');
  }

  playCombatStart(): void {
    this.playSfx('combatStart');
  }

  /** UI click feedback. Only plays when click sound is enabled and not muted. */
  playClick(): void {
    if (!this.clickSoundEnabled || this.muted) return;
    this.playSfx('click');
  }
}
