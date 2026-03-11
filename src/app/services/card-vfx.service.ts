import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as PIXI from 'pixi.js';

const CARD_VFX_URL = '/assets/data/card-vfx.json';
const VFX_MANIFEST_URL = '/assets/data/vfx-manifest.json';
const VFX_SPRITESHEET_PREFIX = '/assets/vfx/';

export interface VfxManifestEntry {
  frameCount: number;
  frameW: number;
  frameH: number;
  frameMs: number;
  scale?: number;
}

/** Data-driven card → VFX mapping and VFX asset loading. Add entries to card-vfx.json and vfx-manifest.json to support new card effects. */
@Injectable({ providedIn: 'root' })
export class CardVfxService {
  private cardToVfx: Record<string, string> = {};
  private manifest: Record<string, VfxManifestEntry> = {};
  private frameCache = new Map<string, PIXI.Texture[]>();
  private configLoadPromise: Promise<void> | null = null;

  constructor(private http: HttpClient) {}

  /** Load card-vfx and vfx-manifest JSON. Safe to call multiple times; runs once. */
  async loadConfig(): Promise<void> {
    if (this.configLoadPromise) return this.configLoadPromise;
    this.configLoadPromise = (async () => {
      try {
        const [cardVfx, vfxManifest] = await Promise.all([
          firstValueFrom(this.http.get<Record<string, string>>(CARD_VFX_URL)),
          firstValueFrom(this.http.get<Record<string, VfxManifestEntry>>(VFX_MANIFEST_URL)),
        ]);
        this.cardToVfx = cardVfx ?? {};
        this.manifest = vfxManifest ?? {};
      } catch {
        this.cardToVfx = {};
        this.manifest = {};
      }
    })();
    return this.configLoadPromise;
  }

  /** VFX id for this card when played (e.g. impact on enemy). Null if no VFX or config not loaded. */
  getVfxIdForCard(cardId: string): string | null {
    return this.cardToVfx[cardId] ?? null;
  }

  /** Manifest entry for a VFX id. Null if unknown or not loaded. */
  getVfxMeta(vfxId: string): VfxManifestEntry | null {
    return this.manifest[vfxId] ?? null;
  }

  /** Cached frame textures for this VFX. Returns [] if not loaded yet; call preloadVfxForCards or loadVfx first. */
  getVfxFrames(vfxId: string): PIXI.Texture[] {
    return this.frameCache.get(vfxId) ?? [];
  }

  /** Load spritesheet for a single VFX id and cache frame textures. No-op if already cached. */
  async loadVfx(vfxId: string): Promise<void> {
    if (this.frameCache.has(vfxId)) return;
    const meta = this.manifest[vfxId];
    if (!meta) return;
    const url = this.resolveUrl(`${VFX_SPRITESHEET_PREFIX}${vfxId}/spritesheet.png`);
    try {
      const texture = (await PIXI.Assets.load(url)) as PIXI.Texture;
      const frames = this.buildStripFrames(texture, meta.frameCount, meta.frameW, meta.frameH);
      this.frameCache.set(vfxId, frames);
    } catch {
      this.frameCache.set(vfxId, []);
    }
  }

  /** Preload VFX spritesheets for all cards that have a mapping. Call when entering combat with these card ids. */
  async preloadVfxForCards(cardIds: string[]): Promise<void> {
    await this.loadConfig();
    const vfxIds = new Set<string>();
    for (const cardId of cardIds) {
      const vfxId = this.cardToVfx[cardId];
      if (vfxId) vfxIds.add(vfxId);
    }
    await Promise.all([...vfxIds].map((id) => this.loadVfx(id)));
  }

  private buildStripFrames(
    sheetTexture: PIXI.Texture,
    cols: number,
    frameW: number,
    frameH: number
  ): PIXI.Texture[] {
    const source = sheetTexture.source;
    const out: PIXI.Texture[] = [];
    for (let i = 0; i < cols; i++) {
      const frame = new PIXI.Rectangle(i * frameW, 0, frameW, frameH);
      out.push(new PIXI.Texture({ source, frame }));
    }
    return out;
  }

  private resolveUrl(path: string): string {
    if (typeof window === 'undefined') return path;
    return path.startsWith('/') ? window.location.origin + path : path;
  }
}
