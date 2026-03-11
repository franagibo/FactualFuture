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
    this.sound.startSoundtrack();
    this.mapAssets.loadMapAssets().catch(() => {});
  }

  @HostListener('document:click')
  onAppClick(): void {
    if (this.sound.isClickSoundEnabled()) this.sound.playClick();
  }
}
