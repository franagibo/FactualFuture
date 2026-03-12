import { signal, type Signal } from '@angular/core';
import type { GameState, RunPhase, MapNodeType } from '../../../engine/types';
import type { GameBridgeService } from '../../services/game-bridge.service';
import type { MapAssetsService } from '../../services/map-assets.service';
import type { ChangeDetectorRef } from '@angular/core';
import type { NgZone } from '@angular/core';
import * as PIXI from 'pixi.js';
import { COMBAT_TIMING } from '../constants/combat-timing.constants';
import type { MapViewContext } from '../renderers/map-view.renderer';
import { logger } from '../../util/app-logger';

/** Host callbacks and getters required by MapPhaseController (provided by the component). */
export interface MapPhaseHost {
  getBridge(): GameBridgeService;
  getMapAssets(): MapAssetsService;
  getApp(): PIXI.Application | null;
  getZone(): NgZone;
  getCdr(): ChangeDetectorRef;
  redraw(): void;
  requestTemplateUpdate(): void;
  scheduleCanvasLayoutFix(opts?: { scrollToBottom?: boolean }): void;
}

/**
 * Holds map-phase state and builds the map view context.
 * Used by the game canvas component so map logic lives outside the main component file.
 */
export class MapPhaseController {
  /** Total height of map content (px) for scroll. */
  mapContentHeight = 0;
  private _mapReady = signal(false);
  /** True when map assets are loaded and map has been drawn. */
  readonly mapReady: Signal<boolean> = this._mapReady;
  private _mapLoadError = signal(false);
  /** True when map load failed or timed out. */
  readonly mapLoadError: Signal<boolean> = this._mapLoadError;
  private mapLoadScheduled = false;
  /** Map node id currently hovered (for tooltip). */
  private hoveredNodeId: string | null = null;

  constructor(private host: MapPhaseHost) {}

  getMapContentHeight(): number {
    return this.mapContentHeight;
  }

  getHoveredNodeId(): string | null {
    return this.hoveredNodeId;
  }

  setHoveredNode(id: string | null): void {
    this.hoveredNodeId = id;
  }

  /** Call when map has been drawn (assets loaded and drawMapView completed). */
  setMapReady(ready: boolean): void {
    this._mapReady.set(ready);
  }

  /** Builds the context passed to drawMapView. */
  buildMapContext(state: GameState, runPhase: RunPhase | undefined): MapViewContext {
    const bridge = this.host.getBridge();
    const mapAssets = this.host.getMapAssets();
    return {
      getAvailableNextNodes: () => bridge.getAvailableNextNodes(),
      getNodeTexture: (type: MapNodeType) => mapAssets.getNodeTexture(type),
      getMapBgTexture: () => mapAssets.getMapBgTexture(),
      onMapContentHeight: (height: number) => {
        const prev = this.mapContentHeight;
        this.mapContentHeight = height;
        const app = this.host.getApp();
        if (height > 0 && height !== prev && app) {
          this.host.getZone().run(() => this.host.getCdr().detectChanges());
          app.resize();
          requestAnimationFrame(() => {
            if (this.host.getApp()) this.host.redraw();
          });
        }
      },
      markForCheck: () => this.host.requestTemplateUpdate(),
      onChooseNode:
        runPhase === 'map'
          ? (nodeId: string) => {
              bridge.chooseNode(nodeId);
              this.host.redraw();
            }
          : () => {},
      loadMapAssets: () => mapAssets.loadMapAssets(),
      hoveredNodeId: this.hoveredNodeId,
      onNodePointerOver: (nodeId: string) => {
        if (this.hoveredNodeId === nodeId) return;
        this.hoveredNodeId = nodeId;
        this.host.redraw();
      },
      onNodePointerOut: () => {
        if (this.hoveredNodeId === null) return;
        this.hoveredNodeId = null;
        this.host.redraw();
      },
    };
  }

  /** Starts map asset load if not yet started; on completion sets mapReady and runs layout fix. */
  ensureMapLoadThenReveal(): void {
    if (this.mapLoadScheduled) return;
    const mapAssets = this.host.getMapAssets();
    this.mapLoadScheduled = true;
    this._mapLoadError.set(false);
    const timeoutId = window.setTimeout(() => {
      if (!mapAssets.isMapLoaded()) {
        this.mapLoadScheduled = false;
        this._mapLoadError.set(true);
        this.host.getZone().run(() => this.host.getCdr().detectChanges());
      }
    }, COMBAT_TIMING.mapLoadTimeoutMs);
    mapAssets.loadMapAssets()
      .then(() => {
        window.clearTimeout(timeoutId);
        this.mapLoadScheduled = false;
        this._mapLoadError.set(false);
        this._mapReady.set(true);
        this.host.getZone().run(() => this.host.getCdr().detectChanges());
        this.host.scheduleCanvasLayoutFix({ scrollToBottom: true });
      })
      .catch((err) => {
        window.clearTimeout(timeoutId);
        this.mapLoadScheduled = false;
        this._mapLoadError.set(true);
        logger.warn('Map assets load failed', err);
        this.host.getZone().run(() => this.host.getCdr().detectChanges());
      });
  }

  /** Retry map load and clear error (e.g. user clicked Retry). */
  retryMapLoad(): void {
    this._mapLoadError.set(false);
    this._mapReady.set(false);
    this.mapLoadScheduled = false;
    this.ensureMapLoadThenReveal();
  }

  /** Draws a loading state on the stage while map assets are loading. */
  drawMapLoadingState(stage: PIXI.Container, w: number, h: number): void {
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, w, h).fill(0x1a1822);
    bg.zIndex = 0;
    stage.addChild(bg);
    const text = new PIXI.Text({
      text: 'Loading map…',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: 28,
        fill: 0xcccccc,
      },
    });
    text.anchor.set(0.5, 0.5);
    text.x = w / 2;
    text.y = h / 2;
    text.zIndex = 1;
    stage.addChild(text);
  }

  /** Call when leaving map phase (e.g. entering combat) to reset map state. */
  resetOnLeaveMap(): void {
    this._mapReady.set(false);
    this._mapLoadError.set(false);
    this.mapLoadScheduled = false;
  }
}
