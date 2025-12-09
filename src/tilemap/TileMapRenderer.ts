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
  TileLoadProgress,
  ZoomLevel
} from './TileTypes';
import { TileManager } from './TileManager';
import { GeoTransform, GeoTransformConfigExtended } from '../geo/GeoTransform';
import { MultiPointGeoTransform, MultiPointGeoTransformConfig } from '../geo/MultiPointGeoTransform';
import { ThinPlateSplineTransform, TPSTransformConfig } from '../geo/ThinPlateSplineTransform';
import type { LatLng, IGeoTransform } from '../geo/GeoTypes';
import { IMapLayer } from '../map/MapTypes';

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

  // Optional geo transform (supports both 3-point affine and multi-point triangulation)
  private geoTransform: IGeoTransform | null = null;

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

  // Fixed timestep for physics/logic (like real game engines)
  private static readonly FIXED_TIMESTEP = 1 / 30; // 30 fps for physics
  private static readonly MAX_ACCUMULATED_TIME = 0.1; // Prevent spiral of death
  private physicsAccumulator: number = 0;

  // Event listeners
  private readonly eventListeners: Map<string, MapEventCallback[]> = new Map();

  // State
  private isMoving: boolean = false;
  private lastScale: number = 1;
  private lastOffsetX: number = 0;
  private lastOffsetY: number = 0;

  // Debug: mouse position tracking
  private mouseScreenX: number = 0;
  private mouseScreenY: number = 0;

  // Map layers for markers, paths, and custom layers (e.g., POI labels)
  private readonly layers: Map<string, IMapLayer> = new Map();

  // Custom render callback for overlays (calibration mode, etc.)
  private customRenderCallback: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  private preLayerRenderCallback: ((ctx: CanvasRenderingContext2D) => void) | null = null;

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

    // Setup mousemove for debug info
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  /**
   * Handle mouse move for debug overlay
   */
  private handleMouseMove(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseScreenX = event.clientX - rect.left;
    this.mouseScreenY = event.clientY - rect.top;
  }

  /**
   * Set geo calibration for GPS support (3-point affine)
   * Use this for maps without significant distortion
   * @param config Configuration with 3 calibration points
   */
  setGeoTransform(config: GeoTransformConfigExtended): void {
    this.geoTransform = new GeoTransform(config);
  }

  /**
   * Set multi-point geo calibration for GPS support (Delaunay triangulation)
   * Use this for maps with non-linear distortions (artistic maps, etc.)
   * @param config Configuration with many calibration points (10+ recommended)
   */
  setMultiPointGeoTransform(config: MultiPointGeoTransformConfig): void {
    this.geoTransform = new MultiPointGeoTransform(config);
    console.log(`[TileMapRenderer] Multi-point geo transform set with ${config.calibrationPoints.length} points`);
  }

  /**
   * Set Thin Plate Spline geo calibration for GPS support
   * Use this for maps with non-linear distortions - provides smooth interpolation
   * @param config Configuration with calibration points (4+ recommended)
   */
  setTPSTransform(config: TPSTransformConfig): void {
    this.geoTransform = new ThinPlateSplineTransform(config);
    console.log(`[TileMapRenderer] TPS geo transform set with ${config.calibrationPoints.length} points`);
  }

  /**
   * Get current geo transform (either 3-point, multi-point, or TPS)
   */
  getGeoTransform(): IGeoTransform | null {
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
   *
   * Uses a semi-fixed timestep pattern like professional game engines:
   * - Rendering runs at full framerate (60-144fps)
   * - Physics/logic runs at fixed 30fps for stability and efficiency
   */
  private renderLoop(timestamp: number): void {
    if (!this.isRunning) return;

    const deltaTime = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    // Update viewport (runs at full framerate for smooth input)
    this.viewport.update();

    // Check for movement
    this.checkMovement();

    // Update tile manager
    this.tileManager.update();

    // Request tiles for current viewport
    this.requestVisibleTiles();

    // Update tile opacities (runs at full framerate for smooth fades)
    this.updateTileOpacities(deltaTime);

    // === Fixed Timestep for Physics/Logic ===
    // Accumulate time and run physics at fixed intervals
    this.physicsAccumulator += deltaTime;

    // Clamp to prevent "spiral of death" if frame takes too long
    if (this.physicsAccumulator > TileMapRenderer.MAX_ACCUMULATED_TIME) {
      this.physicsAccumulator = TileMapRenderer.MAX_ACCUMULATED_TIME;
    }

    // Run physics updates at fixed rate (30fps)
    while (this.physicsAccumulator >= TileMapRenderer.FIXED_TIMESTEP) {
      this.fixedUpdate(TileMapRenderer.FIXED_TIMESTEP);
      this.physicsAccumulator -= TileMapRenderer.FIXED_TIMESTEP;
    }

    // Render at full framerate
    this.render();

    // Continue loop
    this.animationFrameId = requestAnimationFrame(this.renderLoop.bind(this));
  }

  /**
   * Fixed update for physics and logic
   * Runs at 30fps regardless of render framerate
   */
  private fixedUpdate(dt: number): void {
    // Update layers (physics simulation for POI labels, markers, etc.)
    this.updateLayers(dt);
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

    // Pre-layer render callback (SVG overlays, etc. - rendered BEFORE labels)
    if (this.preLayerRenderCallback) {
      this.preLayerRenderCallback(ctx);
    }

    // Render layers (markers, paths, custom layers like POI labels)
    this.renderLayers();

    // Custom render callback (calibration overlays, etc.)
    if (this.customRenderCallback) {
      this.customRenderCallback(ctx);
    }

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
    const tileSize = this.tileManager.getTileSize();

    // Sort tiles by zoom (lower zoom first for proper layering)
    tiles.sort((a, b) => a.zoom - b.zoom);

    for (const tile of tiles) {
      if (!tile.image) continue;

      const opacity = this.getTileOpacity(tile);
      if (opacity <= 0) continue;

      // Get zoom level to calculate actual source dimensions
      const zoomLevel = this.tileManager.getZoomLevel(tile.zoom);
      if (!zoomLevel) continue;

      // Calculate source rectangle (actual content, not padding)
      // Edge tiles have content smaller than tileSize
      const srcWidth = Math.min(tileSize, Math.round(tile.bounds.width * zoomLevel.scale));
      const srcHeight = Math.min(tileSize, Math.round(tile.bounds.height * zoomLevel.scale));

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

      // Draw tile with source clipping to avoid stretching padded areas
      this.ctx.drawImage(
        tile.image,
        0, 0, srcWidth, srcHeight,  // Source rectangle (only valid content)
        screenTopLeft.x, screenTopLeft.y, screenWidth, screenHeight  // Destination
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
    const zoomLevel = this.tileManager.getZoomLevel(zoom);
    const tileSize = this.tileManager.getTileSize();
    const { originalSize } = this.config.manifest;

    // Get mouse world position
    const mouseWorld = this.viewport.screenToWorld(
      new Vector2(this.mouseScreenX, this.mouseScreenY)
    );

    // Calculate tile at mouse position
    let tileCol = -1;
    let tileRow = -1;
    let tileWorldSize = tileSize;
    if (zoomLevel) {
      const scaleFactor = 1 / zoomLevel.scale;
      tileWorldSize = tileSize * scaleFactor;
      tileCol = Math.floor(mouseWorld.x / tileWorldSize);
      tileRow = Math.floor(mouseWorld.y / tileWorldSize);
    }

    // Draw debug panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(10, 10, 320, 180);

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    let y = 28;
    const lineHeight = 16;

    ctx.fillText(`Zoom Level: ${zoom} / ${this.tileManager.getMaxZoom()}`, 20, y); y += lineHeight;
    ctx.fillText(`Viewport Scale: ${this.viewport.scale.toFixed(4)}`, 20, y); y += lineHeight;
    if (zoomLevel) {
      ctx.fillText(`Zoom Scale: ${zoomLevel.scale.toFixed(4)} (${zoomLevel.cols}x${zoomLevel.rows} tiles)`, 20, y); y += lineHeight;
    }
    ctx.fillText(`Tile Size: ${tileSize}px (world: ${tileWorldSize.toFixed(0)}px)`, 20, y); y += lineHeight;
    ctx.fillText(`Original: ${originalSize.width}x${originalSize.height}`, 20, y); y += lineHeight;
    ctx.fillText(`Tiles: ${progress.loaded}/${progress.total} (${progress.loading} loading)`, 20, y); y += lineHeight;

    y += 8;
    ctx.fillStyle = '#0f0';
    ctx.fillText(`Mouse World: ${mouseWorld.x.toFixed(0)}, ${mouseWorld.y.toFixed(0)}`, 20, y); y += lineHeight;
    const tileStatus = this.tileManager.getTileStatus(zoom, tileCol, tileRow);
    ctx.fillText(`Expected Tile: tile_${tileCol}_${tileRow}.jpg (zoom_${zoom}) [${tileStatus}]`, 20, y); y += lineHeight;

    // Draw crosshair at mouse position
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.mouseScreenX, 0);
    ctx.lineTo(this.mouseScreenX, this.canvas.height);
    ctx.moveTo(0, this.mouseScreenY);
    ctx.lineTo(this.canvas.width, this.mouseScreenY);
    ctx.stroke();

    // Draw tile grid overlay (for current zoom level)
    if (zoomLevel && this.viewport.scale > 0.01) {
      this.renderTileGrid(zoomLevel, tileWorldSize);
    }
  }

  /**
   * Render tile grid overlay for debugging
   */
  private renderTileGrid(zoomLevel: ZoomLevel, tileWorldSize: number): void {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';

    for (let col = 0; col < zoomLevel.cols; col++) {
      for (let row = 0; row < zoomLevel.rows; row++) {
        const worldX = col * tileWorldSize;
        const worldY = row * tileWorldSize;
        const screenPos = this.viewport.worldToScreen(new Vector2(worldX, worldY));
        const screenSize = tileWorldSize * this.viewport.scale;

        // Only draw if tile is visible
        if (screenPos.x + screenSize < 0 || screenPos.x > this.canvas.width ||
            screenPos.y + screenSize < 0 || screenPos.y > this.canvas.height) {
          continue;
        }

        // Draw tile border
        ctx.strokeRect(screenPos.x, screenPos.y, screenSize, screenSize);

        // Draw tile label (only if tile is large enough)
        if (screenSize > 50) {
          ctx.fillText(`${col},${row}`, screenPos.x + 4, screenPos.y + 14);
        }
      }
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

  // === Layer Management ===

  /**
   * Add a layer to the renderer
   */
  addLayer(layer: IMapLayer): void {
    this.layers.set(layer.id, layer);
  }

  /**
   * Remove a layer by ID
   */
  removeLayer(layerId: string): boolean {
    return this.layers.delete(layerId);
  }

  /**
   * Get a layer by ID
   */
  getLayer(layerId: string): IMapLayer | undefined {
    return this.layers.get(layerId);
  }

  /**
   * Get all layers sorted by z-index
   */
  getLayers(): IMapLayer[] {
    return Array.from(this.layers.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Update all layers (for animations/physics)
   */
  private updateLayers(deltaTime: number): void {
    for (const layer of this.layers.values()) {
      if (layer.visible) {
        layer.update(deltaTime);
      }
    }
  }

  /**
   * Render all layers
   */
  private renderLayers(): void {
    if (!this.geoTransform) return;

    const sortedLayers = this.getLayers();
    for (const layer of sortedLayers) {
      if (layer.visible && layer.opacity > 0) {
        layer.render(this.ctx, this.geoTransform, this.viewport);
      }
    }
  }

  /**
   * Set pre-layer render callback for overlays (SVG overlays, etc.)
   * Called BEFORE layers are rendered (appears below labels/markers)
   */
  setPreLayerRenderCallback(callback: ((ctx: CanvasRenderingContext2D) => void) | null): void {
    this.preLayerRenderCallback = callback;
  }

  /**
   * Set custom render callback for overlays (calibration mode, etc.)
   * Called AFTER layers are rendered, before debug overlay (appears above labels)
   */
  setCustomRenderCallback(callback: ((ctx: CanvasRenderingContext2D) => void) | null): void {
    this.customRenderCallback = callback;
  }

  /**
   * Destroy renderer and clean up
   */
  destroy(): void {
    this.stop();
    this.tileManager.cancelAll();
    this.eventListeners.clear();
    this.tileOpacities.clear();
    this.layers.clear();
    this.customRenderCallback = null;
    this.preLayerRenderCallback = null;
  }
}
