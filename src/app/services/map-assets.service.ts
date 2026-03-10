import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import type { MapNodeType } from '../../engine/types';

const MAP_BG_PATH = '/assets/map/power-core-level2.jpg';
const NODE_ICON_PATHS: Record<MapNodeType, string> = {
  combat: '/assets/map/nodes/combat.svg',
  elite: '/assets/map/nodes/elite.svg',
  rest: '/assets/map/nodes/rest.svg',
  shop: '/assets/map/nodes/shop.svg',
  event: '/assets/map/nodes/event.svg',
  boss: '/assets/map/nodes/boss.svg',
};

@Injectable({ providedIn: 'root' })
export class MapAssetsService {
  private mapBgTexture: PIXI.Texture | null = null;
  private nodeTextures = new Map<MapNodeType, PIXI.Texture>();
  private loadPromise: Promise<void> | null = null;

  /** Load map background and all node icons. Resolves when done; safe to call multiple times. */
  async loadMapAssets(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    try {
      this.mapBgTexture = (await PIXI.Assets.load(this.resolveUrl(MAP_BG_PATH))) as PIXI.Texture;
    } catch {
      this.mapBgTexture = null;
    }
    const types: MapNodeType[] = ['combat', 'elite', 'rest', 'shop', 'event', 'boss'];
    for (const type of types) {
      try {
        const tex = (await PIXI.Assets.load(this.resolveUrl(NODE_ICON_PATHS[type]))) as PIXI.Texture;
        this.nodeTextures.set(type, tex);
      } catch {
        // fallback in UI
      }
    }
  }

  getMapBgTexture(): PIXI.Texture | null {
    return this.mapBgTexture;
  }

  getNodeTexture(type: MapNodeType): PIXI.Texture | null {
    return this.nodeTextures.get(type) ?? null;
  }

  private resolveUrl(path: string): string {
    if (typeof window === 'undefined') return path;
    return path.startsWith('/') ? window.location.origin + path : path;
  }
}
