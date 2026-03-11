import { Injectable } from '@angular/core';

const AUDIO_BASE = '/assets/audio/';
const VFX_BASE = '/assets/vfx/';
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

@Injectable({ providedIn: 'root' })
export class SoundService {
  private muted = false;

  setMuted(m: boolean): void {
    this.muted = m;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('game-sound-muted', m ? '1' : '0');
      } catch {}
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Load muted preference from localStorage (call once at app init). */
  loadMutedPreference(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      this.muted = localStorage.getItem('game-sound-muted') === '1';
    } catch {}
  }

  private play(path: string): void {
    if (this.muted || typeof window === 'undefined') return;
    try {
      const url = path.startsWith('/') ? window.location.origin + path : path;
      const audio = new Audio(url);
      audio.volume = 0.5;
      audio.play().catch(() => {});
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

  /** UI click feedback (e.g. buttons, links). */
  playClick(): void {
    this.play(PATHS.click);
  }
}
