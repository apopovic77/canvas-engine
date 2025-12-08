/**
 * Generic QuadTree for Spatial Queries
 *
 * A quadtree is a tree data structure in which each internal node
 * has exactly four children. Used for efficient spatial indexing
 * of tiles and map features.
 *
 * @module tilemap
 */

import { Rect } from './TileTypes';

/**
 * Item stored in the quadtree
 */
interface QuadTreeItem<T> {
  bounds: Rect;
  data: T;
}

/**
 * Generic QuadTree for spatial queries
 *
 * @template T Type of data stored in nodes
 *
 * @example
 * ```typescript
 * const tree = new QuadTree<Tile>({ x: 0, y: 0, width: 32000, height: 24000 });
 * tree.insert(tile.bounds, tile);
 * const visible = tree.query(viewportBounds);
 * ```
 */
export class QuadTree<T> {
  readonly bounds: Rect;
  readonly maxDepth: number;
  readonly maxItems: number;

  private children: QuadTree<T>[] | null = null;
  private items: QuadTreeItem<T>[] = [];
  private depth: number;

  /**
   * Create a new QuadTree
   *
   * @param bounds The bounds this node covers
   * @param maxDepth Maximum depth of the tree (default: 8)
   * @param maxItems Maximum items per node before subdivision (default: 4)
   * @param depth Current depth (internal use)
   */
  constructor(
    bounds: Rect,
    maxDepth: number = 8,
    maxItems: number = 4,
    depth: number = 0
  ) {
    this.bounds = bounds;
    this.maxDepth = maxDepth;
    this.maxItems = maxItems;
    this.depth = depth;
  }

  /**
   * Insert an item with bounds
   */
  insert(bounds: Rect, data: T): void {
    // If we have children, insert into appropriate child
    if (this.children !== null) {
      const index = this.getChildIndex(bounds);
      if (index !== -1) {
        this.children[index].insert(bounds, data);
        return;
      }
    }

    // Store in this node
    this.items.push({ bounds, data });

    // Check if we need to subdivide
    if (this.children === null && this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.subdivide();

      // Re-insert items into children
      const itemsToReinsert = [...this.items];
      this.items = [];

      for (const item of itemsToReinsert) {
        const index = this.getChildIndex(item.bounds);
        if (index !== -1) {
          this.children![index].insert(item.bounds, item.data);
        } else {
          // Item spans multiple children, keep in this node
          this.items.push(item);
        }
      }
    }
  }

  /**
   * Query items intersecting with given bounds
   */
  query(bounds: Rect): T[] {
    const results: T[] = [];
    this.queryInternal(bounds, results);
    return results;
  }

  /**
   * Internal query implementation
   */
  private queryInternal(bounds: Rect, results: T[]): void {
    // Check items in this node
    for (const item of this.items) {
      if (this.intersects(bounds, item.bounds)) {
        results.push(item.data);
      }
    }

    // Check children
    if (this.children !== null) {
      for (const child of this.children) {
        if (this.intersects(bounds, child.bounds)) {
          child.queryInternal(bounds, results);
        }
      }
    }
  }

  /**
   * Remove an item
   */
  remove(data: T): boolean {
    // Check this node's items
    const index = this.items.findIndex(item => item.data === data);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }

    // Check children
    if (this.children !== null) {
      for (const child of this.children) {
        if (child.remove(data)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
    if (this.children !== null) {
      for (const child of this.children) {
        child.clear();
      }
      this.children = null;
    }
  }

  /**
   * Get all items in the tree
   */
  all(): T[] {
    const results: T[] = [];
    this.allInternal(results);
    return results;
  }

  /**
   * Internal all implementation
   */
  private allInternal(results: T[]): void {
    for (const item of this.items) {
      results.push(item.data);
    }

    if (this.children !== null) {
      for (const child of this.children) {
        child.allInternal(results);
      }
    }
  }

  /**
   * Get count of all items
   */
  count(): number {
    let count = this.items.length;
    if (this.children !== null) {
      for (const child of this.children) {
        count += child.count();
      }
    }
    return count;
  }

  /**
   * Subdivide this node into 4 children
   */
  private subdivide(): void {
    const x = this.bounds.x;
    const y = this.bounds.y;
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;

    // NW, NE, SW, SE
    this.children = [
      new QuadTree<T>({ x, y, width: halfW, height: halfH }, this.maxDepth, this.maxItems, this.depth + 1),
      new QuadTree<T>({ x: x + halfW, y, width: halfW, height: halfH }, this.maxDepth, this.maxItems, this.depth + 1),
      new QuadTree<T>({ x, y: y + halfH, width: halfW, height: halfH }, this.maxDepth, this.maxItems, this.depth + 1),
      new QuadTree<T>({ x: x + halfW, y: y + halfH, width: halfW, height: halfH }, this.maxDepth, this.maxItems, this.depth + 1),
    ];
  }

  /**
   * Get child index for bounds (0-3) or -1 if spans multiple children
   */
  private getChildIndex(bounds: Rect): number {
    const midX = this.bounds.x + this.bounds.width / 2;
    const midY = this.bounds.y + this.bounds.height / 2;

    const left = bounds.x < midX;
    const right = bounds.x + bounds.width > midX;
    const top = bounds.y < midY;
    const bottom = bounds.y + bounds.height > midY;

    // Spans horizontal center
    if (left && right) return -1;
    // Spans vertical center
    if (top && bottom) return -1;

    if (top) {
      return left ? 0 : 1;  // NW or NE
    } else {
      return left ? 2 : 3;  // SW or SE
    }
  }

  /**
   * Check if two rectangles intersect
   */
  private intersects(a: Rect, b: Rect): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Check if a point is inside a rectangle
   */
  static pointInRect(x: number, y: number, rect: Rect): boolean {
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  /**
   * Check if two rectangles intersect (static helper)
   */
  static rectsIntersect(a: Rect, b: Rect): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  /**
   * Get the intersection of two rectangles
   */
  static intersection(a: Rect, b: Rect): Rect | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);

    if (right > x && bottom > y) {
      return { x, y, width: right - x, height: bottom - y };
    }

    return null;
  }

  /**
   * Create a rect that contains both input rects
   */
  static union(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);

    return { x, y, width: right - x, height: bottom - y };
  }
}
