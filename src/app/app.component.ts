import { Component, HostListener, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapAssetsService } from './services/map-assets.service';
import { SoundService } from './services/sound.service';
import { GameSettingsService } from './services/game-settings.service';
import { ToastComponent } from './components/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #sparkle id="cursor-sparkle-canvas" aria-hidden="true" style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8888;"></canvas>
    <router-outlet />
    <app-toast />
    @if (showFps) {
      <div class="fps-counter" aria-live="polite" aria-label="Frames per second">{{ fps }} fps</div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .fps-counter {
      position: fixed;
      bottom: 10px;
      left: 12px;
      z-index: 9990;
      font-family: 'Exo 2', monospace, system-ui;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: rgba(180, 255, 140, 0.75);
      background: rgba(0,0,0,0.55);
      padding: 3px 8px;
      border-radius: 6px;
      pointer-events: none;
      text-shadow: 0 0 8px rgba(100,255,60,0.5);
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('sparkle') sparkleRef!: ElementRef<HTMLCanvasElement>;

  private sound = inject(SoundService);
  private mapAssets = inject(MapAssetsService);
  private gameSettings = inject(GameSettingsService);
  private cdr = inject(ChangeDetectorRef);

  fps = 0;
  get showFps(): boolean { return this.gameSettings.showFps(); }

  private sparkleCtx: CanvasRenderingContext2D | null = null;
  private sparkleParticles: SparkleParticle[] = [];
  private sparkleAnimId: number | null = null;
  private mouseX = -999;
  private mouseY = -999;
  private sparkleResizeHandler: (() => void) | null = null;

  private fpsFrames = 0;
  private fpsLast = performance.now();
  private fpsAnimId: number | null = null;

  ngOnInit(): void {
    this.sound.loadSoundPreferences();
    this.mapAssets.loadMapAssets().catch((err) => { if (typeof console !== 'undefined' && console.warn) console.warn('[App] Map assets preload failed', err); });
    this.preloadMainMenuBackground();
    this.startFpsLoop();
  }

  ngAfterViewInit(): void {
    this.initSparkle();
  }

  ngOnDestroy(): void {
    if (this.sparkleAnimId != null) cancelAnimationFrame(this.sparkleAnimId);
    if (this.sparkleResizeHandler) window.removeEventListener('resize', this.sparkleResizeHandler);
    if (this.fpsAnimId != null) cancelAnimationFrame(this.fpsAnimId);
  }

  private preloadMainMenuBackground(): void {
    const img = new Image();
    img.src = '/assets/main-menu.jpg';
  }

  private startFpsLoop(): void {
    const loop = (): void => {
      this.fpsAnimId = requestAnimationFrame(loop);
      this.fpsFrames++;
      const now = performance.now();
      if (now - this.fpsLast >= 500) {
        const newFps = Math.round(this.fpsFrames * 1000 / (now - this.fpsLast));
        if (newFps !== this.fps) {
          this.fps = newFps;
          this.cdr.markForCheck();
        }
        this.fpsFrames = 0;
        this.fpsLast = now;
      }
    };
    this.fpsAnimId = requestAnimationFrame(loop);
  }

  private initSparkle(): void {
    const canvas = this.sparkleRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.sparkleCtx = ctx;

    const resize = (): void => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    this.sparkleResizeHandler = resize;
    window.addEventListener('resize', resize);

    const animate = (): void => {
      this.sparkleAnimId = requestAnimationFrame(animate);
      if (!this.sparkleCtx || !canvas) return;
      this.sparkleCtx.clearRect(0, 0, canvas.width, canvas.height);

      if (Math.random() < 0.45 && this.mouseX > 0) {
        this.sparkleParticles.push(makeSparkle(this.mouseX, this.mouseY));
      }

      for (let i = this.sparkleParticles.length - 1; i >= 0; i--) {
        const p = this.sparkleParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.life -= p.decay;
        if (p.life <= 0) { this.sparkleParticles.splice(i, 1); continue; }
        const alpha = p.life * 0.9;
        this.sparkleCtx.save();
        this.sparkleCtx.globalAlpha = alpha;
        this.sparkleCtx.fillStyle = p.color;
        this.sparkleCtx.shadowBlur = 6;
        this.sparkleCtx.shadowColor = p.color;
        drawStar(this.sparkleCtx, p.x, p.y, p.size * p.life);
        this.sparkleCtx.restore();
      }
    };
    this.sparkleAnimId = requestAnimationFrame(animate);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  @HostListener('document:click', ['$event'])
  onAppClick(e: MouseEvent): void {
    this.sound.unlock();
    if (this.sound.isClickSoundEnabled()) this.sound.playClick();
    this.spawnButtonRipple(e);
    for (let i = 0; i < 6; i++) {
      this.sparkleParticles.push(makeSparkle(e.clientX, e.clientY, true));
    }
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

interface SparkleParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  life: number;
  decay: number;
  color: string;
}

const SPARKLE_COLORS = ['#f0c840', '#ffd060', '#ffaa30', '#ffffff', '#c8a0ff', '#80e8ff'];

function makeSparkle(x: number, y: number, burst = false): SparkleParticle {
  const angle = Math.random() * Math.PI * 2;
  const speed = burst ? (0.5 + Math.random() * 2.5) : (0.1 + Math.random() * 0.8);
  return {
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - (burst ? 1.5 : 0.5),
    size: burst ? (1.5 + Math.random() * 3) : (0.8 + Math.random() * 1.8),
    life: 0.5 + Math.random() * 0.5,
    decay: burst ? (0.022 + Math.random() * 0.018) : (0.018 + Math.random() * 0.022),
    color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
  };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const spikes = 4;
  const inner = r * 0.4;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    if (i === 0) ctx.moveTo(x + Math.cos(angle) * rad, y + Math.sin(angle) * rad);
    else ctx.lineTo(x + Math.cos(angle) * rad, y + Math.sin(angle) * rad);
  }
  ctx.closePath();
  ctx.fill();
}
