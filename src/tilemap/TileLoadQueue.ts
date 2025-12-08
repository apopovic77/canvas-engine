/**
 * Priority Queue for Tile Loading
 *
 * Manages tile loading with priorities based on:
 * 1. Distance from viewport center
 * 2. Zoom level (current zoom first)
 * 3. Visibility state
 *
 * @module tilemap
 */

import { Vector2 } from 'arkturian-typescript-utils';
import { Tile, TileEventCallback, TileEvent } from './TileTypes';

/**
 * Priority queue entry
 */
interface QueueEntry {
  tile: Tile;
  priority: number;
}

/**
 * Priority queue for tile loading
 */
export class TileLoadQueue {
  private readonly queue: QueueEntry[] = [];
  private readonly loading: Map<string, AbortController> = new Map();
  private readonly maxConcurrent: number;
  private readonly loadTimeout: number;
  private readonly retryAttempts: number;
  private readonly retryCounts: Map<string, number> = new Map();
  private readonly listeners: TileEventCallback[] = [];

  /**
   * @param maxConcurrent Maximum concurrent loads (default: 4)
   * @param loadTimeout Load timeout in ms (default: 30000)
   * @param retryAttempts Retry attempts for failed loads (default: 2)
   */
  constructor(
    maxConcurrent: number = 4,
    loadTimeout: number = 30000,
    retryAttempts: number = 2
  ) {
    this.maxConcurrent = maxConcurrent;
    this.loadTimeout = loadTimeout;
    this.retryAttempts = retryAttempts;
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
   * Emit event to listeners
   */
  private emit(event: TileEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Add tile to load queue with priority
   * Lower priority number = higher priority
   */
  enqueue(tile: Tile, priority: number): void {
    // Skip if already loading or loaded
    if (tile.state === 'loading' || tile.state === 'loaded') {
      return;
    }

    // Check if already in queue
    const existingIndex = this.queue.findIndex(e => e.tile.id === tile.id);
    if (existingIndex !== -1) {
      // Update priority if lower
      if (priority < this.queue[existingIndex].priority) {
        this.queue[existingIndex].priority = priority;
        this.sortQueue();
      }
      return;
    }

    tile.priority = priority;
    tile.state = 'pending';
    this.queue.push({ tile, priority });
    this.sortQueue();
  }

  /**
   * Sort queue by priority (lower = higher priority)
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Cancel loading for specific tile
   */
  cancel(tileId: string): void {
    // Remove from queue
    const queueIndex = this.queue.findIndex(e => e.tile.id === tileId);
    if (queueIndex !== -1) {
      this.queue[queueIndex].tile.state = 'pending';
      this.queue.splice(queueIndex, 1);
    }

    // Cancel active load
    const controller = this.loading.get(tileId);
    if (controller) {
      controller.abort();
      this.loading.delete(tileId);
    }
  }

  /**
   * Cancel all pending and loading tiles
   */
  cancelAll(): void {
    // Clear queue
    for (const entry of this.queue) {
      entry.tile.state = 'pending';
    }
    this.queue.length = 0;

    // Cancel all active loads
    for (const [, controller] of this.loading) {
      controller.abort();
    }
    this.loading.clear();
  }

  /**
   * Cancel tiles not in the visible set
   */
  cancelNotVisible(visibleIds: Set<string>): void {
    // Remove non-visible from queue
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (!visibleIds.has(this.queue[i].tile.id)) {
        this.queue[i].tile.state = 'pending';
        this.queue.splice(i, 1);
      }
    }

    // Cancel non-visible active loads
    for (const [id, controller] of this.loading) {
      if (!visibleIds.has(id)) {
        controller.abort();
        this.loading.delete(id);
      }
    }
  }

  /**
   * Process queue - start loading tiles up to maxConcurrent
   */
  process(): void {
    while (this.loading.size < this.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        this.loadTile(entry.tile);
      }
    }
  }

  /**
   * Load a single tile
   */
  private async loadTile(tile: Tile): Promise<void> {
    const controller = new AbortController();
    this.loading.set(tile.id, controller);

    tile.state = 'loading';
    tile.loadStartTime = Date.now();

    this.emit({ type: 'tile:loading', tile });

    try {
      const image = await this.loadImage(tile.url, controller.signal);
      tile.image = image;
      tile.state = 'loaded';
      this.retryCounts.delete(tile.id);
      this.emit({ type: 'tile:loaded', tile });
    } catch (error) {
      if (controller.signal.aborted) {
        // Cancelled, don't retry
        tile.state = 'pending';
        return;
      }

      // Check retry count
      const retries = this.retryCounts.get(tile.id) || 0;
      if (retries < this.retryAttempts) {
        // Retry
        this.retryCounts.set(tile.id, retries + 1);
        tile.state = 'pending';
        this.enqueue(tile, (tile.priority || 0) + 1000); // Lower priority for retry
      } else {
        // Max retries exceeded
        tile.state = 'error';
        this.retryCounts.delete(tile.id);
        this.emit({
          type: 'tile:error',
          tile,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    } finally {
      this.loading.delete(tile.id);
    }
  }

  /**
   * Load image with timeout and abort support
   */
  private loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        img.src = '';
        reject(new Error('Aborted'));
      };

      signal.addEventListener('abort', onAbort);

      timeoutId = setTimeout(() => {
        cleanup();
        img.src = '';
        reject(new Error('Timeout'));
      }, this.loadTimeout);

      img.onload = () => {
        cleanup();
        resolve(img);
      };

      img.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load: ${url}`));
      };

      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  /**
   * Calculate priority for a tile
   * Lower number = higher priority
   *
   * @param tile The tile
   * @param viewportCenter Center of viewport in world coordinates
   * @param currentZoom Current display zoom level
   */
  static calculatePriority(
    tile: Tile,
    viewportCenter: Vector2,
    currentZoom: number
  ): number {
    // Distance from tile center to viewport center
    const tileCenterX = tile.bounds.x + tile.bounds.width / 2;
    const tileCenterY = tile.bounds.y + tile.bounds.height / 2;
    const dx = tileCenterX - viewportCenter.x;
    const dy = tileCenterY - viewportCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Normalize distance (assuming typical image size)
    const normalizedDistance = distance / 10000;

    // Zoom difference penalty
    const zoomDiff = Math.abs(tile.zoom - currentZoom);
    const zoomPenalty = zoomDiff * 100;

    // Current zoom gets priority
    const isCurrentZoom = tile.zoom === currentZoom ? 0 : 50;

    return normalizedDistance + zoomPenalty + isCurrentZoom;
  }

  /**
   * Get current queue length
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Get number of active loads
   */
  get activeLoads(): number {
    return this.loading.size;
  }

  /**
   * Check if queue is empty and no active loads
   */
  get isIdle(): boolean {
    return this.queue.length === 0 && this.loading.size === 0;
  }
}
