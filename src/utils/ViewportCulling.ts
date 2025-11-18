import type { ViewportTransform } from './ViewportTransform';

/**
 * Rectangle in world coordinates
 */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Visible viewport bounds in world coordinates
 */
export interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Culling statistics for debugging
 */
export interface CullingStats {
  total: number;
  rendered: number;
  culled: number;
}

/**
 * Viewport Culling Utility
 *
 * Provides efficient viewport-based culling for canvas rendering.
 * Only renders items that are visible in the current viewport,
 * dramatically improving performance when zoomed in.
 *
 * @example
 * ```typescript
 * const culling = new ViewportCulling(viewport, canvasWidth, canvasHeight);
 *
 * items.forEach(item => {
 *   if (culling.isVisible(item)) {
 *     // Render item
 *     culling.incrementRendered();
 *   } else {
 *     culling.incrementCulled();
 *   }
 * });
 *
 * console.log(culling.getStats()); // { total: 1000, rendered: 50, culled: 950 }
 * ```
 */
export class ViewportCulling {
  private bounds: ViewportBounds;
  private stats: CullingStats = { total: 0, rendered: 0, culled: 0 };

  constructor(
    private viewport: ViewportTransform,
    private canvasWidth: number,
    private canvasHeight: number
  ) {
    this.bounds = this.calculateBounds();
  }

  /**
   * Calculate visible viewport bounds in world coordinates
   */
  private calculateBounds(): ViewportBounds {
    const topLeft = this.viewport.screenToWorld(0, 0);
    const bottomRight = this.viewport.screenToWorld(this.canvasWidth, this.canvasHeight);

    return {
      left: topLeft.x,
      right: bottomRight.x,
      top: topLeft.y,
      bottom: bottomRight.y,
    };
  }

  /**
   * Update viewport bounds (call when viewport changes)
   */
  updateBounds(): void {
    this.bounds = this.calculateBounds();
  }

  /**
   * Reset culling statistics
   */
  resetStats(): void {
    this.stats = { total: 0, rendered: 0, culled: 0 };
  }

  /**
   * Check if a rectangle is visible in the viewport
   *
   * @param rect - Rectangle in world coordinates
   * @returns true if rectangle intersects with viewport
   */
  isVisible(rect: WorldRect): boolean {
    this.stats.total++;

    // AABB (Axis-Aligned Bounding Box) intersection test
    return !(
      rect.x + rect.width < this.bounds.left ||
      rect.x > this.bounds.right ||
      rect.y + rect.height < this.bounds.top ||
      rect.y > this.bounds.bottom
    );
  }

  /**
   * Increment rendered count (for statistics)
   */
  incrementRendered(): void {
    this.stats.rendered++;
  }

  /**
   * Increment culled count (for statistics)
   */
  incrementCulled(): void {
    this.stats.culled++;
  }

  /**
   * Get culling statistics
   */
  getStats(): Readonly<CullingStats> {
    return { ...this.stats };
  }

  /**
   * Get current viewport bounds
   */
  getBounds(): Readonly<ViewportBounds> {
    return { ...this.bounds };
  }

  /**
   * Get culling efficiency as percentage (0-100)
   * Higher is better (more items culled)
   */
  getEfficiency(): number {
    if (this.stats.total === 0) return 0;
    return (this.stats.culled / this.stats.total) * 100;
  }
}
