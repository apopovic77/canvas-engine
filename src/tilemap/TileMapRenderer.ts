/**
 * Tile Map Renderer
 *
 * Main component for rendering tile-based maps.
 * Coordinates tile loading, rendering, and viewport management.
 *
 * @module tilemap
 */

import { Vector2, InterpolatedProperty } from 'arkturian-typescript-utils';
import { ViewportTransform } from '../utils/ViewportTransform';
import {
  TileManifest,
  TileMapRendererConfig,
  Tile,
  Rect,
  TileEvent,
  TileEventCallback,
  TileLoadProgress
} from './TileTypes';
import { TileManager } from './TileManager';
import { GeoTransform } from '../geo/GeoTransform';
import { GeoTransformConfig, LatLng } from '../geo/GeoTypes';

/**
 * Map event types
 */
export type MapEventType =
  | 'click'
  | 'zoom'
  | 'pan'
  | 'movestart'
  | 'moveend'
  | 'tileload'
  | 'tileerror'
  | 'ready';

/**
 * Map click event
 */
export interface MapClickEvent {
  type: 'click';
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  latLng?: LatLng;
}

/**
 * Map event callback
 */
export type MapEventCallback = (event: MapClickEvent | TileEvent | { type: string }) => void;

/**
 * Tile opacity for fade-in animation
 */
interface TileOpacity {
  property: InterpolatedProperty<number>;
  tile: Tile;
}

/**
 * Main tile map rendering component
 */
export class TileMapRenderer {
  // Canvas and rendering context
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Core components
  private readonly viewport: ViewportTransform;
  private readonly tileManager: TileManager;

  // Optional geo transform
  private geoTransform: GeoTransform | null = null;

  // Configuration
  private readonly config: TileMapRendererConfig;
  private readonly backgroundColor: string;
  private readonly fadeInDuration: number;
  private readonly debug: boolean;

  // Tile fade-in animations
  private readonly tileOpacities: Map<string, TileOpacity> = new Map();

  // Animation loop
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;

  // Event listeners
  private readonly eventListeners: Map<string, MapEventCallback[]> = new Map();

  // State
  private isMoving: boolean = false;
  private lastScale: number = 1;
  private lastOffsetX: number = 0;
  private lastOffsetY: number = 0;

  /**
   * Create a new TileMapRenderer
   */
  constructor(config: TileMapRendererConfig) {
    this.config = config;
    this.canvas = config.canvas;
    this.backgroundColor = config.backgroundColor ?? '#1a1a2e';
    this.fadeInDuration = config.fadeInDuration ?? 200;
    this.debug = config.debug ?? false;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;

    // Initialize viewport
    this.viewport = new ViewportTransform(this.canvas);

    // Initialize tile manager
    this.tileManager = new TileManager({
      manifest: config.manifest,
      maxConcurrent: config.maxConcurrentLoads ?? 4,
      cacheEnabled: config.cacheEnabled ?? true,
      cacheName: config.cacheName,
    });

    // Forward tile events
    this.tileManager.addEventListener((event) => {
      if (event.type === 'tile:loaded') {
        this.emit('tileload', event);
        this.createTileFadeIn(event.tile!);
      } else if (event.type === 'tile:error') {
        this.emit('tileerror', event);
      }
    });

    // Set content bounds
    const { originalSize } = config.manifest;
    this.viewport.setContentBounds({
      width: originalSize.width,
      height: originalSize.height,
      minX: 0,
      minY: 0,
      maxX: originalSize.width,
      maxY: originalSize.height,
    });

    // Setup click handler
    this.canvas.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * Set geo calibration for GPS support
   */
  setGeoTransform(config: GeoTransformConfig): void {
    this.geoTransform = new GeoTransform(config);
  }

  /**
   * Get current geo transform
   */
  getGeoTransform(): GeoTransform | null {
    return this.geoTransform;
  }

  /**
   * Start the render loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));

    this.emit('ready', { type: 'ready' });
  }

  /**
   * Stop the render loop
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main render loop
   */
  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return;

    const deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    // Update viewport
    this.viewport.update();

    // Check for movement
    this.checkMovement();

    // Update tile manager
    this.tileManager.update();

    // Request tiles for current viewport
    this.requestVisibleTiles();

    // Update tile opacities
    this.updateTileOpacities(deltaTime);

    // Render
    this.render();

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));
  }

  /**
   * Check if viewport has moved
   */
  private checkMovement(): void {
    const moved = (
      this.viewport.scale !== this.lastScale ||
      this.viewport.offset.x !== this.lastOffsetX ||
      this.viewport.offset.y !== this.lastOffsetY
    );

    if (moved && !this.isMoving) {
      this.isMoving = true;
      this.emit('movestart', { type: 'movestart' });
    } else if (!moved && this.isMoving) {
      this.isMoving = false;
      this.emit('moveend', { type: 'moveend' });
    }

    this.lastScale = this.viewport.scale;
    this.lastOffsetX = this.viewport.offset.x;
    this.lastOffsetY = this.viewport.offset.y;
  }

  /**
   * Request tiles for current viewport
   */
  private requestVisibleTiles(): void {
    const viewportBounds = this.getViewportWorldBounds();
    const zoom = this.tileManager.getOptimalZoom(this.viewport.scale);
    const center = this.getViewportWorldCenter();

    this.tileManager.requestTiles(viewportBounds, zoom, center);
  }

  /**
   * Get viewport bounds in world coordinates
   */
  private getViewportWorldBounds(): Rect {
    const topLeft = this.viewport.screenToWorld(new Vector2(0, 0));
    const bottomRight = this.viewport.screenToWorld(
      new Vector2(this.canvas.width, this.canvas.height)
    );

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  /**
   * Get viewport center in world coordinates
   */
  private getViewportWorldCenter(): Vector2 {
    return this.viewport.screenToWorld(
      new Vector2(this.canvas.width / 2, this.canvas.height / 2)
    );
  }

  /**
   * Create fade-in animation for tile
   */
  private createTileFadeIn(tile: Tile): void {
    if (this.tileOpacities.has(tile.id)) {
      return;
    }

    const property = new InterpolatedProperty('opacity', 0, null, this.fadeInDuration / 1000);
    property.targetValue = 1;

    this.tileOpacities.set(tile.id, { property, tile });
  }

  /**
   * Update tile opacity animations
   * Note: InterpolatedProperty handles its own interpolation internally
   */
  private updateTileOpacities(_deltaTime: number): void {
    for (const [id, opacity] of this.tileOpacities) {
      // InterpolatedProperty auto-updates when value is accessed

      // Remove completed animations
      if ((opacity.property.value ?? 0) >= 0.99) {
        this.tileOpacities.delete(id);
      }
    }
  }

  /**
   * Get tile opacity (for fade-in)
   */
  private getTileOpacity(tile: Tile): number {
    const opacity = this.tileOpacities.get(tile.id);
    if (opacity) {
      return opacity.property.value ?? 0;
    }
    return tile.state === 'loaded' ? 1 : 0;
  }

  /**
   * Main render function
   */
  render(): void {
    const { ctx, canvas } = this;

    // Clear canvas
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render tiles
    this.renderTiles();

    // Debug overlay
    if (this.debug) {
      this.renderDebug();
    }
  }

  /**
   * Render visible tiles
   */
  private renderTiles(): void {
    const viewportBounds = this.getViewportWorldBounds();
    const zoom = this.tileManager.getOptimalZoom(this.viewport.scale);
    const tiles = this.tileManager.getTilesToRender(viewportBounds, zoom);

    // Sort tiles by zoom (lower zoom first for proper layering)
    tiles.sort((a, b) => a.zoom - b.zoom);

    for (const tile of tiles) {
      if (!tile.image) continue;

      const opacity = this.getTileOpacity(tile);
      if (opacity <= 0) continue;

      // Convert tile bounds to screen coordinates
      const screenTopLeft = this.viewport.worldToScreen(
        new Vector2(tile.bounds.x, tile.bounds.y)
      );
      const screenBottomRight = this.viewport.worldToScreen(
        new Vector2(
          tile.bounds.x + tile.bounds.width,
          tile.bounds.y + tile.bounds.height
        )
      );

      const screenWidth = screenBottomRight.x - screenTopLeft.x;
      const screenHeight = screenBottomRight.y - screenTopLeft.y;

      // Apply opacity
      this.ctx.globalAlpha = opacity;

      // Draw tile
      this.ctx.drawImage(
        tile.image,
        screenTopLeft.x,
        screenTopLeft.y,
        screenWidth,
        screenHeight
      );
    }

    // Reset alpha
    this.ctx.globalAlpha = 1;
  }

  /**
   * Render debug overlay
   */
  private renderDebug(): void {
    const { ctx } = this;
    const progress = this.tileManager.getProgress();
    const zoom = this.tileManager.getOptimalZoom(this.viewport.scale);
    const center = this.getViewportWorldCenter();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 100);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`Zoom: ${zoom} / ${this.tileManager.getMaxZoom()}`, 20, 30);
    ctx.fillText(`Scale: ${this.viewport.scale.toFixed(3)}`, 20, 45);
    ctx.fillText(`Tiles: ${progress.loaded}/${progress.total} (${progress.loading} loading)`, 20, 60);
    ctx.fillText(`Center: ${center.x.toFixed(0)}, ${center.y.toFixed(0)}`, 20, 75);

    if (this.geoTransform) {
      const latLng = this.geoTransform.pixelToLatLng(center);
      ctx.fillText(`GPS: ${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`, 20, 90);
    }
  }

  /**
   * Handle canvas click
   */
  private handleClick(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const worldPos = this.viewport.screenToWorld(new Vector2(screenX, screenY));

    const clickEvent: MapClickEvent = {
      type: 'click',
      screenX,
      screenY,
      worldX: worldPos.x,
      worldY: worldPos.y,
    };

    if (this.geoTransform) {
      clickEvent.latLng = this.geoTransform.pixelToLatLng(worldPos);
    }

    this.emit('click', clickEvent);
  }

  // === Event System ===

  /**
   * Subscribe to map events
   */
  on(event: string, callback: MapEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, callback: MapEventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data: MapClickEvent | TileEvent | { type: string }): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        callback(data);
      }
    }
  }

  // === Navigation API ===

  /**
   * Pan to geographic position
   */
  panTo(latLng: LatLng, animate: boolean = true): void {
    if (!this.geoTransform) {
      console.warn('GeoTransform not configured');
      return;
    }

    const pixel = this.geoTransform.latLngToPixel(latLng);
    this.panToPixel(pixel.x, pixel.y, animate);
  }

  /**
   * Pan to pixel position
   */
  panToPixel(x: number, y: number, _animate: boolean = true): void {
    this.viewport.centerOn(x, y);
    this.emit('pan', { type: 'pan' });
  }

  /**
   * Zoom to level
   */
  zoomTo(level: number, animate: boolean = true): void {
    const zoomLevel = this.tileManager.getZoomLevel(level);
    if (!zoomLevel) return;

    // Scale factor for this zoom level
    const targetScale = zoomLevel.scale;
    this.viewport.setTargetScale(targetScale);

    this.emit('zoom', { type: 'zoom' });
  }

  /**
   * Zoom in
   */
  zoomIn(animate: boolean = true): void {
    const currentZoom = this.tileManager.getOptimalZoom(this.viewport.scale);
    this.zoomTo(Math.min(currentZoom + 1, this.tileManager.getMaxZoom()), animate);
  }

  /**
   * Zoom out
   */
  zoomOut(animate: boolean = true): void {
    const currentZoom = this.tileManager.getOptimalZoom(this.viewport.scale);
    this.zoomTo(Math.max(currentZoom - 1, 0), animate);
  }

  /**
   * Fit bounds to show all given coordinates
   */
  fitBounds(bounds: LatLng[], padding: number = 50): void {
    if (!this.geoTransform || bounds.length === 0) return;

    // Convert to pixels and find min/max
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const latLng of bounds) {
      const pixel = this.geoTransform.latLngToPixel(latLng);
      minX = Math.min(minX, pixel.x);
      minY = Math.min(minY, pixel.y);
      maxX = Math.max(maxX, pixel.x);
      maxY = Math.max(maxY, pixel.y);
    }

    // Calculate scale to fit
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    const availableWidth = this.canvas.width - padding * 2;
    const availableHeight = this.canvas.height - padding * 2;

    const scaleX = availableWidth / boundsWidth;
    const scaleY = availableHeight / boundsHeight;
    const scale = Math.min(scaleX, scaleY);

    // Center on bounds
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.viewport.setTargetScale(scale);
    this.viewport.centerOn(centerX, centerY);
  }

  /**
   * Get current center in geographic coordinates
   */
  getCenter(): LatLng | null {
    if (!this.geoTransform) return null;
    const center = this.getViewportWorldCenter();
    return this.geoTransform.pixelToLatLng(center);
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.tileManager.getOptimalZoom(this.viewport.scale);
  }

  /**
   * Get loading progress
   */
  getProgress(): TileLoadProgress {
    return this.tileManager.getProgress();
  }

  /**
   * Get viewport transform
   */
  getViewport(): ViewportTransform {
    return this.viewport;
  }

  /**
   * Get tile manager
   */
  getTileManager(): TileManager {
    return this.tileManager;
  }

  /**
   * Resize canvas
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.viewport.viewportWidth = width;
    this.viewport.viewportHeight = height;
  }

  /**
   * Destroy renderer and clean up
   */
  destroy(): void {
    this.stop();
    this.tileManager.cancelAll();
    this.eventListeners.clear();
    this.tileOpacities.clear();
  }
}
