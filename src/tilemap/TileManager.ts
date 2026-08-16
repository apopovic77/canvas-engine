/**
 * Tile Manager
 *
 * Manages tile loading, caching, and visibility determination.
 *
 * Two operating modes, selected by the manifest:
 *
 * - **Eager** (default, `manifest.lazy` unset): every Tile object of every
 *   zoom level is instantiated in the constructor and indexed in per-level
 *   QuadTrees. Right for photographed pyramids (a 54k-px scan is a few
 *   thousand tiles) and required by legacy consumers that iterate the
 *   `tiles` map right after construction to rewrite URLs.
 *
 * - **Lazy** (`manifest.lazy: true`): tiles are materialized on demand when
 *   a viewport query first touches their grid cell. A regular grid needs no
 *   spatial index — visibility is O(1) index math — so deep geographic
 *   pyramids (a full-region OSM window can exceed 5 million cells) cost
 *   only what the camera actually looks at. A `maxResidentTiles` LRU cap
 *   bounds memory on long pans. URL synthesis happens at materialization
 *   time, either from `urlPattern` or via an injected `urlResolver`
 *   (see setUrlResolver — the hook OSM-style sources use to map
 *   window-local z/x/y to global tile-server addresses).
 *
 * Lazy levels may carry `coverage` rects (world px): grid cells outside
 * every rect are treated as nonexistent. That is what makes variable-depth
 * pyramids possible — a region-wide base with deeper levels only where
 * deep data was actually baked — without hammering the server with 404s.
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
  private readonly lazy: boolean;
  private readonly maxResidentTiles: number;
  private urlResolver: ((zoom: number, x: number, y: number) => string) | null;

  private currentZoom: number = 0;
  /** Monotonic LRU clock — bumped per visibility query, stamped on touched tiles. */
  private touchClock: number = 0;

  /**
   * Create a new TileManager
   */
  constructor(config: TileManagerConfig) {
    this.manifest = config.manifest;
    this.lazy = config.manifest.lazy === true;
    this.maxResidentTiles = config.maxResidentTiles ?? 4096;
    this.urlResolver = config.urlResolver ?? null;

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

    if (!this.lazy) {
      this.initializeTiles();
    }
  }

  /**
   * Eager mode: initialize all tiles and quadtrees up front.
   */
  private initializeTiles(): void {
    const { zoomLevels } = this.manifest;

    for (const level of zoomLevels) {
      // Create quadtree for this zoom level
      // IMPORTANT: Use original image dimensions, NOT level dimensions!
      // Tile bounds are calculated in world (original) coordinates
      const tree = new QuadTree<Tile>(
        { x: 0, y: 0, width: this.manifest.originalSize.width, height: this.manifest.originalSize.height },
        8,  // maxDepth
        4   // maxItems
      );

      for (let y = 0; y < level.rows; y++) {
        for (let x = 0; x < level.cols; x++) {
          const tile = this.createTile(level, x, y);
          this.tiles.set(tile.id, tile);
          tree.insert(tile.bounds, tile);
        }
      }

      this.quadTrees.set(level.zoom, tree);
    }
  }

  /**
   * Build a Tile object for a grid cell (both modes share this).
   */
  private createTile(level: ZoomLevel, x: number, y: number): Tile {
    const { tileSize, baseUrl, format } = this.manifest;
    const urlPattern = this.manifest.urlPattern || '{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}';

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

    const url = this.urlResolver
      ? this.urlResolver(level.zoom, x, y)
      : urlPattern
          .replace('{baseUrl}', baseUrl)
          .replace('{zoom}', String(level.zoom))
          .replace('{x}', String(x))
          .replace('{y}', String(y))
          .replace('{format}', format);

    return {
      id: `${level.zoom}_${x}_${y}`,
      zoom: level.zoom,
      x,
      y,
      bounds,
      url,
      state: 'pending',
    };
  }

  /**
   * Inject/replace the URL synthesizer (window-local z/x/y → fetchable URL).
   *
   * Also rewrites every already-materialized tile so the call order
   * "construct renderer → set resolver" stays race-free in both modes.
   * OSM-style sources use this instead of iterating the tiles map — in lazy
   * mode there is nothing to iterate at construction time.
   */
  setUrlResolver(resolver: (zoom: number, x: number, y: number) => string): void {
    this.urlResolver = resolver;
    for (const tile of this.tiles.values()) {
      if (tile.state === 'pending' || tile.state === 'error') {
        tile.url = resolver(tile.zoom, tile.x, tile.y);
      }
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
   * Lazy mode materializes the touched grid cells on the fly.
   *
   * @param viewportBounds Viewport bounds in world (original image) coordinates
   * @param zoom Zoom level
   * @returns Array of visible tiles
   */
  getVisibleTiles(viewportBounds: Rect, zoom: number): Tile[] {
    if (!this.lazy) {
      const tree = this.quadTrees.get(zoom);
      if (!tree) {
        return [];
      }
      return tree.query(viewportBounds);
    }
    return this.queryLazy(viewportBounds, zoom, true);
  }

  /**
   * Lazy grid query. `materialize: false` only returns cells that already
   * exist — used by render-fallback lookups so painting coarser/finer
   * stand-ins never allocates tiles the camera did not request.
   */
  private queryLazy(viewportBounds: Rect, zoom: number, materialize: boolean): Tile[] {
    const level = this.manifest.zoomLevels.find(l => l.zoom === zoom);
    if (!level) {
      return [];
    }

    const scaleFactor = 1 / level.scale;
    const tileWorld = this.manifest.tileSize * scaleFactor;

    const x0 = Math.max(0, Math.floor(viewportBounds.x / tileWorld));
    const y0 = Math.max(0, Math.floor(viewportBounds.y / tileWorld));
    const x1 = Math.min(level.cols - 1, Math.floor((viewportBounds.x + viewportBounds.width) / tileWorld));
    const y1 = Math.min(level.rows - 1, Math.floor((viewportBounds.y + viewportBounds.height) / tileWorld));
    if (x1 < x0 || y1 < y0) {
      return [];
    }

    this.touchClock++;
    const result: Tile[] = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (level.coverage && !this.cellInCoverage(level, tileWorld, x, y)) {
          continue;
        }
        const id = `${zoom}_${x}_${y}`;
        let tile = this.tiles.get(id);
        if (!tile) {
          if (!materialize) {
            continue;
          }
          tile = this.createTile(level, x, y);
          this.tiles.set(id, tile);
        }
        tile.lastTouch = this.touchClock;
        result.push(tile);
      }
    }
    return result;
  }

  /** Does the grid cell intersect at least one coverage rect of its level? */
  private cellInCoverage(level: ZoomLevel, tileWorld: number, x: number, y: number): boolean {
    const cx = x * tileWorld;
    const cy = y * tileWorld;
    for (const rect of level.coverage!) {
      if (cx < rect.x + rect.width && cx + tileWorld > rect.x &&
          cy < rect.y + rect.height && cy + tileWorld > rect.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * Lazy mode: bound resident tile objects. Evicts the least-recently-seen
   * tiles that are neither part of the current query round nor loading.
   */
  private evictStaleTiles(): void {
    if (!this.lazy || this.tiles.size <= this.maxResidentTiles) {
      return;
    }
    const candidates: Tile[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.state !== 'loading' && (tile.lastTouch ?? 0) < this.touchClock) {
        candidates.push(tile);
      }
    }
    candidates.sort((a, b) => (a.lastTouch ?? 0) - (b.lastTouch ?? 0));
    const excess = this.tiles.size - this.maxResidentTiles;
    for (let i = 0; i < excess && i < candidates.length; i++) {
      const tile = candidates[i];
      tile.image = undefined;
      this.tiles.delete(tile.id);
    }
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

    // Also get preload tiles (higher zoom) - include in visibleIds to prevent cancel loop
    let preloadTiles: Tile[] = [];
    if (zoom < this.manifest.zoomLevels.length - 1) {
      const higherZoom = zoom + 1;
      preloadTiles = this.getVisibleTiles(viewportBounds, higherZoom);
      // Add preload tile IDs to visible set so they don't get canceled
      for (const tile of preloadTiles) {
        visibleIds.add(tile.id);
      }
    }

    // Cancel non-visible tile loads (now excludes preload tiles)
    this.loadQueue.cancelNotVisible(visibleIds);

    // Enqueue visible tiles
    for (const tile of visibleTiles) {
      if (tile.state === 'pending' || tile.state === 'error') {
        const priority = TileLoadQueue.calculatePriority(tile, viewportCenter, zoom);
        this.loadQueue.enqueue(tile, priority);
      }
    }

    // Enqueue preload tiles with lower priority
    for (const tile of preloadTiles) {
      if (tile.state === 'pending') {
        const priority = TileLoadQueue.calculatePriority(tile, viewportCenter, zoom + 1) + 500;
        this.loadQueue.enqueue(tile, priority);
      }
    }

    this.evictStaleTiles();

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
   * Get all tiles at a zoom level.
   *
   * Lazy mode returns only the tiles materialized so far — enumerating a
   * full deep level would defeat the point of laziness.
   */
  getTilesAtZoom(zoom: number): Tile[] {
    if (!this.lazy) {
      const tree = this.quadTrees.get(zoom);
      return tree ? tree.all() : [];
    }
    const result: Tile[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.zoom === zoom) {
        result.push(tile);
      }
    }
    return result;
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
   *
   * Counts the tiles at the current zoom level (in lazy mode that is the
   * requested working set, not the — potentially millions-large — full grid).
   */
  getProgress(): TileLoadProgress {
    let loaded = 0;
    let loading = 0;
    let errors = 0;
    let total = 0;

    for (const tile of this.getTilesAtZoom(this.currentZoom)) {
      total++;
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

    // Get tiles at requested zoom (materialized by the requestTiles pass)
    const requestedTiles = this.lazy
      ? this.queryLazy(viewportBounds, zoom, false)
      : this.getVisibleTiles(viewportBounds, zoom);

    for (const tile of requestedTiles) {
      if (tile.state === 'loaded' && tile.image) {
        result.push(tile);
        addedIds.add(tile.id);
      }
    }

    // ALWAYS add fallback tiles for smooth transitions
    // The renderer will use them until target tiles are fully faded in.
    // Fallback lookups never materialize: they can only paint what exists.
    const lookup = (bounds: Rect, z: number): Tile[] =>
      this.lazy ? this.queryLazy(bounds, z, false) : this.getVisibleTiles(bounds, z);

    // Fallback DOWN: lower zoom levels (coarser tiles covering larger areas)
    for (let fallbackZoom = zoom - 1; fallbackZoom >= 0; fallbackZoom--) {
      for (const tile of lookup(viewportBounds, fallbackZoom)) {
        if (tile.state === 'loaded' && tile.image && !addedIds.has(tile.id)) {
          result.push(tile);
          addedIds.add(tile.id);
        }
      }
    }

    // Fallback UP: higher zoom levels (finer tiles from previous zoom-in)
    // These cover the viewport when zooming OUT and lower-res tiles aren't loaded yet.
    // Without this, zooming out causes a flash of empty background.
    // Only check +1 and +2 to avoid rendering hundreds of tiny tiles.
    const maxZoom = this.manifest.zoomLevels.length - 1;
    const maxFallbackUp = Math.min(zoom + 2, maxZoom);
    for (let fallbackZoom = zoom + 1; fallbackZoom <= maxFallbackUp; fallbackZoom++) {
      for (const tile of lookup(viewportBounds, fallbackZoom)) {
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
    if (this.lazy) {
      // Materialized tiles are pure cache — dropping them is the cheapest reset.
      this.tiles.clear();
      return;
    }
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

  /** Count how many tiles are visible at a given zoom level */
  getVisibleTileCount(viewportBounds: Rect, zoom: number): number {
    return this.getVisibleTiles(viewportBounds, zoom).length;
  }

  /**
   * Get status of a specific tile
   */
  getTileStatus(zoom: number, col: number, row: number): string {
    const tile = this.tiles.get(`${zoom}_${col}_${row}`);
    if (tile) {
      return tile.state;
    }
    if (this.lazy) {
      return this.manifest.zoomLevels.some(l => l.zoom === zoom) ? 'not-materialized' : 'no-tree';
    }
    return this.quadTrees.has(zoom) ? 'not-found' : 'no-tree';
  }

  /**
   * Update loop - call each frame to process queue
   */
  update(): void {
    this.loadQueue.process();
  }
}
