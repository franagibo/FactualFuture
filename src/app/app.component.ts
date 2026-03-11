import { Component, HostListener, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SoundService } from './services/sound.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [],
})
export class AppComponent implements OnInit {
  constructor(private sound: SoundService) {}

  ngOnInit(): void {
    this.sound.loadMutedPreference();
  }

  @HostListener('document:click')
  onAppClick(): void {
    this.sound.playClick();
  }
}
