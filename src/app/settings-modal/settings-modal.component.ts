import {
  Component,
  Output,
  EventEmitter,
  Input,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnInit,
  HostListener,
} from '@angular/core';
import { SoundService } from '../services/sound.service';
import { GameSettingsService } from '../services/game-settings.service';

export type SettingsCategory = 'audio' | 'graphics' | 'display';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.scss'],
})
export class SettingsModalComponent implements OnInit {
  @Input() closeButtonLabel = 'Close';

  @Output() close = new EventEmitter<void>();

  activeCategory: SettingsCategory = 'audio';

  fullscreen = true;

  private _electronChecked = false;

  constructor(
    public sound: SoundService,
    public gameSettings: GameSettingsService,
    public cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.sound.loadSoundPreferences();
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.onClose();
  }

  isElectron(): boolean {
    return typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== 'undefined';
  }

  get showDisplayCategory(): boolean {
    if (!this._electronChecked) {
      this._electronChecked = true;
      this.cdr.markForCheck();
    }
    return this.isElectron();
  }

  setCategory(cat: SettingsCategory): void {
    this.activeCategory = cat;
    if (cat === 'display' && this.isElectron()) {
      const api = (window as unknown as { electronAPI?: { getSettings?: () => Promise<{ fullscreen?: boolean }> } }).electronAPI;
      api?.getSettings?.().then((s) => {
        this.fullscreen = s?.fullscreen !== false;
        this.cdr.markForCheck();
      });
    }
    this.cdr.markForCheck();
  }

  onClose(): void {
    this.close.emit();
  }

  setMusicVolume(percent: number): void {
    this.sound.setMusicVolume(percent / 100);
    this.cdr.markForCheck();
  }

  setEffectsVolume(percent: number): void {
    this.sound.setEffectsVolume(percent / 100);
    this.cdr.markForCheck();
  }

  setMuted(muted: boolean): void {
    this.sound.setMuted(muted);
    this.cdr.markForCheck();
  }

  setClickSound(enabled: boolean): void {
    this.sound.setClickSoundEnabled(enabled);
    this.cdr.markForCheck();
  }

  setFullScreen(fullscreen: boolean): void {
    const api = (window as unknown as { electronAPI?: { setFullScreen?: (v: boolean) => void } }).electronAPI;
    if (api?.setFullScreen) api.setFullScreen(fullscreen);
    this.fullscreen = fullscreen;
    this.cdr.markForCheck();
  }

  setResolution(width: number, height: number): void {
    const api = (window as unknown as { electronAPI?: { setWindowSize?: (w: number, h: number) => void } }).electronAPI;
    if (api?.setWindowSize) api.setWindowSize(width | 0, height | 0);
    this.cdr.markForCheck();
  }

  get musicVolumePercent(): number {
    return Math.round(this.sound.getMusicVolume() * 100);
  }

  get effectsVolumePercent(): number {
    return Math.round(this.sound.getEffectsVolume() * 100);
  }
}
