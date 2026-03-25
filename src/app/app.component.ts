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

  @HostListener('document:click', ['$event'])
  onAppClick(e: MouseEvent): void {
    this.sound.unlock();
    if (this.sound.isClickSoundEnabled()) this.sound.playClick();
    this.spawnButtonRipple(e);
  }

  private spawnButtonRipple(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest('button');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top  = (e.clientY - rect.top) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }
}
