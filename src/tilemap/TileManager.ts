/**
 * Tile Manager
 *
 * Manages tile loading, caching, and visibility determination.
 * Coordinates between QuadTree (spatial queries) and TileLoadQueue (loading).
 *
 * @module tilemap
 */

import { Vector2 } from 'arkturian-typescript-utils';
import {
  Tile,
  TileManifest,
  TileManagerConfig,
  TileLoadProgress,
  Rect,
  ZoomLevel,
  TileEventCallback,
  TileEvent
} from './TileTypes';
import { QuadTree } from './QuadTree';
import { TileLoadQueue } from './TileLoadQueue';

/**
 * Manages tiles for a tile pyramid
 */
export class TileManager {
  private readonly manifest: TileManifest;
  private readonly tiles: Map<string, Tile> = new Map();
  private readonly quadTrees: Map<number, QuadTree<Tile>> = new Map();
  private readonly loadQueue: TileLoadQueue;
  private readonly listeners: TileEventCallback[] = [];

  private currentZoom: number = 0;

  /**
   * Create a new TileManager
   */
  constructor(config: TileManagerConfig) {
    this.manifest = config.manifest;

    this.loadQueue = new TileLoadQueue(
      config.maxConcurrent ?? 4,
      config.loadTimeout ?? 30000,
      config.retryAttempts ?? 2
    );

    // Forward load queue events
    this.loadQueue.addEventListener((event) => {
      this.emit(event);
      if (event.type === 'tile:loaded' || event.type === 'tile:error') {
        this.emit({ type: 'progress:updated', progress: this.getProgress() });
      }
    });

    this.initializeTiles();
  }

  /**
   * Initialize all tiles and quadtrees
   */
  private initializeTiles(): void {
    const { zoomLevels, tileSize, baseUrl, format } = this.manifest;
    const urlPattern = this.manifest.urlPattern || '{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}';

    for (const level of zoomLevels) {
      // Create quadtree for this zoom level
      // IMPORTANT: Use original image dimensions, NOT level dimensions!
      // Tile bounds are calculated in world (original) coordinates
      const tree = new QuadTree<Tile>(
        { x: 0, y: 0, width: this.manifest.originalSize.width, height: this.manifest.originalSize.height },
        8,  // maxDepth
        4   // maxItems
      );

      // Create tiles for this zoom level
      for (let y = 0; y < level.rows; y++) {
        for (let x = 0; x < level.cols; x++) {
          const id = `${level.zoom}_${x}_${y}`;

          // Calculate tile bounds at full resolution
          const scaleFactor = 1 / level.scale;
          const tileWorldWidth = tileSize * scaleFactor;
          const tileWorldHeight = tileSize * scaleFactor;

          const bounds: Rect = {
            x: x * tileWorldWidth,
            y: y * tileWorldHeight,
            width: Math.min(tileWorldWidth, this.manifest.originalSize.width - x * tileWorldWidth),
            height: Math.min(tileWorldHeight, this.manifest.originalSize.height - y * tileWorldHeight),
          };

          // Build URL from pattern
          const url = urlPattern
            .replace('{baseUrl}', baseUrl)
            .replace('{zoom}', String(level.zoom))
            .replace('{x}', String(x))
            .replace('{y}', String(y))
            .replace('{format}', format);

          const tile: Tile = {
            id,
            zoom: level.zoom,
            x,
            y,
            bounds,
            url,
            state: 'pending',
          };

          this.tiles.set(id, tile);
          tree.insert(bounds, tile);
        }
      }

      this.quadTrees.set(level.zoom, tree);
    }
  }

  /**
   * Add event listener
   */
  addEventListener(callback: TileEventCallback): void {
    this.listeners.push(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(callback: TileEventCallback): void {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit event
   */
  private emit(event: TileEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Get optimal zoom level for given viewport scale
   *
   * @param viewportScale Current viewport scale (1 = 100%, 2 = 200%, etc)
   * @returns Optimal zoom level index
   */
  getOptimalZoom(viewportScale: number): number {
    const { zoomLevels } = this.manifest;

    // Find the zoom level where tile pixels roughly match screen pixels
    // Higher viewportScale means we're zoomed in and need higher resolution tiles
    for (let i = zoomLevels.length - 1; i >= 0; i--) {
      const level = zoomLevels[i];
      // If viewport scale exceeds this level's scale, use this level
      if (viewportScale >= level.scale) {
        return level.zoom;
      }
    }

    // Default to lowest zoom
    return 0;
  }

  /**
   * Get visible tiles for given viewport bounds and zoom
   *
   * @param viewportBounds Viewport bounds in world (original image) coordinates
   * @param zoom Zoom level
   * @returns Array of visible tiles
   */
  getVisibleTiles(viewportBounds: Rect, zoom: number): Tile[] {
    const tree = this.quadTrees.get(zoom);
    if (!tree) {
      return [];
    }

    return tree.query(viewportBounds);
  }

  /**
   * Request loading of visible tiles
   *
   * @param viewportBounds Viewport bounds in world coordinates
   * @param zoom Target zoom level
   * @param viewportCenter Center of viewport for priority calculation
   */
  requestTiles(viewportBounds: Rect, zoom: number, viewportCenter: Vector2): void {
    // Update current zoom
    if (zoom !== this.currentZoom) {
      this.currentZoom = zoom;
      this.emit({ type: 'zoom:changed', zoom });
    }

    // Get visible tiles at requested zoom
    const visibleTiles = this.getVisibleTiles(viewportBounds, zoom);
    const visibleIds = new Set(visibleTiles.map(t => t.id));

    // Cancel non-visible tile loads
    this.loadQueue.cancelNotVisible(visibleIds);

    // Enqueue visible tiles
    for (const tile of visibleTiles) {
      if (tile.state === 'pending' || tile.state === 'error') {
        const priority = TileLoadQueue.calculatePriority(tile, viewportCenter, zoom);
        this.loadQueue.enqueue(tile, priority);
      }
    }

    // Also preload adjacent zoom levels (one higher resolution)
    if (zoom < this.manifest.zoomLevels.length - 1) {
      const higherZoom = zoom + 1;
      const higherTiles = this.getVisibleTiles(viewportBounds, higherZoom);

      for (const tile of higherTiles) {
        if (tile.state === 'pending') {
          // Lower priority for preload
          const priority = TileLoadQueue.calculatePriority(tile, viewportCenter, higherZoom) + 500;
          this.loadQueue.enqueue(tile, priority);
        }
      }
    }

    // Process queue
    this.loadQueue.process();
  }

  /**
   * Get tile by ID
   */
  getTile(id: string): Tile | undefined {
    return this.tiles.get(id);
  }

  /**
   * Get all tiles at a zoom level
   */
  getTilesAtZoom(zoom: number): Tile[] {
    const tree = this.quadTrees.get(zoom);
    return tree ? tree.all() : [];
  }

  /**
   * Get zoom level configuration
   */
  getZoomLevel(zoom: number): ZoomLevel | undefined {
    return this.manifest.zoomLevels.find(l => l.zoom === zoom);
  }

  /**
   * Get all zoom levels
   */
  getZoomLevels(): ZoomLevel[] {
    return [...this.manifest.zoomLevels];
  }

  /**
   * Get current loading progress
   */
  getProgress(): TileLoadProgress {
    let loaded = 0;
    let loading = 0;
    let errors = 0;
    let total = 0;

    // Count tiles at current zoom
    const tree = this.quadTrees.get(this.currentZoom);
    if (tree) {
      const allTiles = tree.all();
      total = allTiles.length;

      for (const tile of allTiles) {
        switch (tile.state) {
          case 'loaded':
            loaded++;
            break;
          case 'loading':
            loading++;
            break;
          case 'error':
            errors++;
            break;
        }
      }
    }

    return { loaded, total, loading, errors };
  }

  /**
   * Get tiles to render (loaded tiles at optimal zoom, with fallback)
   *
   * For tiles not yet loaded, returns lower-resolution tiles as fallback.
   * IMPORTANT: Always includes fallback tiles to prevent flicker during fade-in.
   * The renderer decides which fallbacks to show based on actual opacity.
   */
  getTilesToRender(viewportBounds: Rect, zoom: number): Tile[] {
    const result: Tile[] = [];
    const addedIds = new Set<string>();

    // Get tiles at requested zoom
    const requestedTiles = this.getVisibleTiles(viewportBounds, zoom);

    for (const tile of requestedTiles) {
      if (tile.state === 'loaded' && tile.image) {
        result.push(tile);
        addedIds.add(tile.id);
      }
    }

    // ALWAYS add fallback tiles for smooth transitions
    // The renderer will use them until target tiles are fully faded in
    for (let fallbackZoom = zoom - 1; fallbackZoom >= 0; fallbackZoom--) {
      const fallbackTiles = this.getVisibleTiles(viewportBounds, fallbackZoom);

      for (const tile of fallbackTiles) {
        if (tile.state === 'loaded' && tile.image && !addedIds.has(tile.id)) {
          result.push(tile);
          addedIds.add(tile.id);
        }
      }
    }

    return result;
  }

  /**
   * Cancel all pending loads
   */
  cancelAll(): void {
    this.loadQueue.cancelAll();
  }

  /**
   * Reset all tile states to pending
   */
  reset(): void {
    this.cancelAll();
    for (const tile of this.tiles.values()) {
      tile.state = 'pending';
      tile.image = undefined;
    }
  }

  /**
   * Get the manifest
   */
  getManifest(): TileManifest {
    return this.manifest;
  }

  /**
   * Get original image size
   */
  getOriginalSize(): { width: number; height: number } {
    return { ...this.manifest.originalSize };
  }

  /**
   * Get tile size
   */
  getTileSize(): number {
    return this.manifest.tileSize;
  }

  /**
   * Get max zoom level
   */
  getMaxZoom(): number {
    return this.manifest.zoomLevels.length - 1;
  }

  /**
   * Get min zoom level
   */
  getMinZoom(): number {
    return 0;
  }

  /**
   * Get status of a specific tile
   */
  getTileStatus(zoom: number, col: number, row: number): string {
    const tree = this.quadTrees.get(zoom);
    if (!tree) return 'no-tree';

    const tiles = tree.all();
    for (const tile of tiles) {
      if (tile.x === col && tile.y === row) {
        return tile.state;
      }
    }
    return 'not-found';
  }

  /**
   * Update loop - call each frame to process queue
   */
  update(): void {
    this.loadQueue.process();
  }
}
