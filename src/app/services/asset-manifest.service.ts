import { Injectable } from '@angular/core';
import * as PIXI from 'pixi.js';
import { logger } from '../util/app-logger';

export type AssetGroup = 'boot' | 'ui' | 'combat';

export interface LoadProgress {
  group: AssetGroup;
  loaded: number;
  total: number;
  label?: string;
}

@Injectable({ providedIn: 'root' })
export class AssetManifestService {
  private progress: LoadProgress = { group: 'boot', loaded: 0, total: 0 };

  getProgress(): LoadProgress {
    return this.progress;
  }

  /** Load a list of URLs with simple progress accounting. */
  async loadGroup(group: AssetGroup, urls: string[]): Promise<void> {
    this.progress = { group, loaded: 0, total: urls.length };
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    for (const url0 of urls) {
      const url = url0.startsWith('/') ? origin + url0 : url0;
      try {
        await PIXI.Assets.load(url);
      } catch (err) {
        logger.warn('[Assets] load failed', url, err);
      } finally {
        this.progress = { ...this.progress, loaded: this.progress.loaded + 1, label: url0 };
      }
    }
  }
}

