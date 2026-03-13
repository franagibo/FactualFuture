import { Component, HostListener, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapAssetsService } from './services/map-assets.service';
import { SoundService } from './services/sound.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [],
})
export class AppComponent implements OnInit {
  constructor(
    private sound: SoundService,
    private mapAssets: MapAssetsService
  ) {}

  ngOnInit(): void {
    this.sound.loadSoundPreferences();
    this.mapAssets.loadMapAssets().catch((err) => { if (typeof console !== 'undefined' && console.warn) console.warn('[App] Map assets preload failed', err); });
    this.preloadMainMenuBackground();
  }

  private preloadMainMenuBackground(): void {
    const img = new Image();
    img.src = '/assets/main-menu.jpg';
  }

  @HostListener('document:click')
  onAppClick(): void {
    if (this.sound.isClickSoundEnabled()) this.sound.playClick();
  }
}
