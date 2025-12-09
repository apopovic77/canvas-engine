/**
 * Map Path (Polyline/Polygon)
 *
 * Defined by array of geographic coordinates, rendered as
 * connected line segments or filled polygon.
 *
 * @module map
 */

import { Vector2, InterpolatedProperty } from 'arkturian-typescript-utils';
import type { IGeoTransform, LatLng } from '../geo/GeoTypes';
import { UTMConverter } from '../geo/UTMConverter';
import { ViewportTransform } from '../utils/ViewportTransform';
import { MapFeature, PathOptions, DEFAULT_PATH_STYLE } from './MapTypes';

/**
 * Generate unique ID
 */
let pathIdCounter = 0;
function generatePathId(): string {
  return `path_${++pathIdCounter}_${Date.now()}`;
}

/**
 * Map path representing a polyline or polygon
 */
export class MapPath implements MapFeature {
  readonly id: string;
  readonly type = 'path' as const;

  // Points
  private _points: LatLng[];

  // Visual properties
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  strokeDash: number[];
  fillColor: string | null;
  fillOpacity: number;
  closed: boolean;
  smooth: boolean;
  smoothTension: number;

  // Animation
  readonly opacity: InterpolatedProperty<number>;
  readonly dashOffset: InterpolatedProperty<number>;

  // Helper to get current interpolated values
  private get currentOpacity(): number { return this.opacity.value ?? 1; }
  private get currentDashOffset(): number { return this.dashOffset.value ?? 0; }

  // State
  visible: boolean = true;
  zIndex: number = 0;
  metadata: Record<string, unknown> = {};

  // Hover state
  private _hovered: boolean = false;

  // Cached values
  private _cachedLength: number | null = null;

  /**
   * Create a new path
   */
  constructor(points: LatLng[], options: PathOptions = {}) {
    this.id = generatePathId();
    this._points = points.map(p => ({ ...p }));

    // Visual properties
    this.strokeColor = options.strokeColor ?? DEFAULT_PATH_STYLE.strokeColor;
    this.strokeWidth = options.strokeWidth ?? DEFAULT_PATH_STYLE.strokeWidth;
    this.strokeOpacity = options.strokeOpacity ?? DEFAULT_PATH_STYLE.strokeOpacity;
    this.strokeDash = options.strokeDash ?? [];
    this.fillColor = options.fillColor ?? null;
    this.fillOpacity = options.fillOpacity ?? DEFAULT_PATH_STYLE.fillOpacity;
    this.closed = options.closed ?? false;
    this.smooth = options.smooth ?? false;
    this.smoothTension = options.smoothTension ?? 0.3;
    this.zIndex = options.zIndex ?? 0;
    this.metadata = options.metadata ?? {};

    // Animation properties
    const animDuration = 0.2;
    this.opacity = new InterpolatedProperty('opacity', 1, null, animDuration);
    this.dashOffset = new InterpolatedProperty('dashOffset', 0, null, animDuration);
  }

  // === Points ===

  get points(): LatLng[] {
    return this._points.map(p => ({ ...p }));
  }

  set points(value: LatLng[]) {
    this._points = value.map(p => ({ ...p }));
    this._cachedLength = null;
  }

  /**
   * Get number of points
   */
  get pointCount(): number {
    return this._points.length;
  }

  /**
   * Add point to path
   */
  addPoint(latLng: LatLng, index?: number): void {
    if (index === undefined) {
      this._points.push({ ...latLng });
    } else {
      this._points.splice(index, 0, { ...latLng });
    }
    this._cachedLength = null;
  }

  /**
   * Remove point from path
   */
  removePoint(index: number): LatLng | undefined {
    if (index < 0 || index >= this._points.length) return undefined;
    this._cachedLength = null;
    return this._points.splice(index, 1)[0];
  }

  /**
   * Update point at index
   */
  updatePoint(index: number, latLng: LatLng): void {
    if (index >= 0 && index < this._points.length) {
      this._points[index] = { ...latLng };
      this._cachedLength = null;
    }
  }

  /**
   * Get pixel path using geo transform
   */
  getPixelPath(geoTransform: IGeoTransform): Vector2[] {
    return this._points.map(p => geoTransform.latLngToPixel(p));
  }

  /**
   * Get screen path using viewport transform
   */
  getScreenPath(
    geoTransform: IGeoTransform,
    viewport: ViewportTransform
  ): Vector2[] {
    return this.getPixelPath(geoTransform).map(p => viewport.worldToScreen(p));
  }

  // === Calculations ===

  /**
   * Get total path length in meters
   */
  getLength(): number {
    if (this._cachedLength !== null) return this._cachedLength;

    let length = 0;
    for (let i = 1; i < this._points.length; i++) {
      length += UTMConverter.distance(this._points[i - 1], this._points[i]);
    }

    if (this.closed && this._points.length > 2) {
      length += UTMConverter.distance(
        this._points[this._points.length - 1],
        this._points[0]
      );
    }

    this._cachedLength = length;
    return length;
  }

  /**
   * Get path bounds
   */
  getBounds(): { min: LatLng; max: LatLng } {
    if (this._points.length === 0) {
      return { min: { lat: 0, lng: 0 }, max: { lat: 0, lng: 0 } };
    }

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const p of this._points) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    }

    return {
      min: { lat: minLat, lng: minLng },
      max: { lat: maxLat, lng: maxLng },
    };
  }

  /**
   * Get center point
   */
  getCenter(): LatLng {
    const bounds = this.getBounds();
    return {
      lat: (bounds.min.lat + bounds.max.lat) / 2,
      lng: (bounds.min.lng + bounds.max.lng) / 2,
    };
  }

  /**
   * Get point at distance along path
   */
  getPointAtDistance(distance: number): LatLng {
    if (this._points.length === 0) {
      throw new Error('Path has no points');
    }
    if (this._points.length === 1) {
      return { ...this._points[0] };
    }

    let traveled = 0;
    for (let i = 1; i < this._points.length; i++) {
      const segmentLength = UTMConverter.distance(this._points[i - 1], this._points[i]);

      if (traveled + segmentLength >= distance) {
        // Interpolate within this segment
        const t = (distance - traveled) / segmentLength;
        return {
          lat: this._points[i - 1].lat + t * (this._points[i].lat - this._points[i - 1].lat),
          lng: this._points[i - 1].lng + t * (this._points[i].lng - this._points[i - 1].lng),
        };
      }

      traveled += segmentLength;
    }

    // Past end of path
    return { ...this._points[this._points.length - 1] };
  }

  // === Rendering ===

  /**
   * Render path on canvas
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: IGeoTransform,
    viewport: ViewportTransform
  ): void {
    if (!this.visible || this._points.length < 2 || this.currentOpacity <= 0) {
      return;
    }

    const screenPath = this.getScreenPath(geoTransform, viewport);
    const opacityVal = this.currentOpacity;

    ctx.save();
    ctx.globalAlpha = opacityVal;

    // Create path
    ctx.beginPath();

    if (this.smooth && screenPath.length > 2) {
      this.drawSmoothPath(ctx, screenPath);
    } else {
      this.drawLinearPath(ctx, screenPath);
    }

    if (this.closed) {
      ctx.closePath();
    }

    // Fill (if closed and fill color set)
    if (this.closed && this.fillColor) {
      ctx.fillStyle = this.fillColor;
      ctx.globalAlpha = opacityVal * this.fillOpacity;
      ctx.fill();
      ctx.globalAlpha = opacityVal;
    }

    // Stroke
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this._hovered ? this.strokeWidth + 2 : this.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacityVal * this.strokeOpacity;

    if (this.strokeDash.length > 0) {
      ctx.setLineDash(this.strokeDash);
      ctx.lineDashOffset = this.currentDashOffset;
    }

    ctx.stroke();

    ctx.restore();
  }

  /**
   * Draw linear path
   */
  private drawLinearPath(ctx: CanvasRenderingContext2D, points: Vector2[]): void {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  }

  /**
   * Draw smooth bezier path through points
   */
  private drawSmoothPath(ctx: CanvasRenderingContext2D, points: Vector2[]): void {
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      // Calculate control points using Catmull-Rom
      const tension = this.smoothTension;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  /**
   * Check if point is near path (for selection)
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: IGeoTransform,
    viewport: ViewportTransform,
    tolerance: number = 10
  ): boolean {
    if (!this.visible || this._points.length < 2) return false;

    const screenPath = this.getScreenPath(geoTransform, viewport);

    // Check distance to each segment
    for (let i = 1; i < screenPath.length; i++) {
      const dist = this.pointToSegmentDistance(
        screenPoint,
        screenPath[i - 1],
        screenPath[i]
      );
      if (dist <= tolerance + this.strokeWidth / 2) {
        return true;
      }
    }

    // Check closed path segment
    if (this.closed && screenPath.length > 2) {
      const dist = this.pointToSegmentDistance(
        screenPoint,
        screenPath[screenPath.length - 1],
        screenPath[0]
      );
      if (dist <= tolerance + this.strokeWidth / 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate distance from point to line segment
   */
  private pointToSegmentDistance(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) {
      // Segment is a point
      return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    }

    // Project point onto segment
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const projX = a.x + t * dx;
    const projY = a.y + t * dy;

    return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
  }

  // === Interaction ===

  get hovered(): boolean {
    return this._hovered;
  }

  set hovered(value: boolean) {
    this._hovered = value;
  }

  // === Animation ===

  /**
   * Update interpolated properties (called each frame)
   * Note: InterpolatedProperty handles its own interpolation internally
   */
  update(_deltaTime: number): void {
    // InterpolatedProperty auto-updates when value is accessed
    // This method is here for compatibility with layer update loops
  }

  /**
   * Animate path drawing (dash animation)
   */
  async animateDraw(duration: number = 1000): Promise<void> {
    const length = this.getScreenPathLength();
    this.strokeDash = [length, length];
    this.dashOffset.setImmediate(length);
    this.dashOffset.setDuration(duration / 1000);
    this.dashOffset.targetValue = 0;

    return new Promise(resolve => {
      const checkComplete = () => {
        if (Math.abs(this.currentDashOffset) < 1) {
          this.strokeDash = [];
          resolve();
        } else {
          requestAnimationFrame(checkComplete);
        }
      };
      setTimeout(checkComplete, 50);
    });
  }

  /**
   * Get approximate screen path length (for animation)
   */
  private getScreenPathLength(): number {
    // Approximate using pixel distance
    // This is used for dash animation, doesn't need to be exact
    return this.getLength() / 10; // Rough estimate
  }

  /**
   * Clone path
   */
  clone(): MapPath {
    return new MapPath(this._points, {
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      strokeOpacity: this.strokeOpacity,
      strokeDash: [...this.strokeDash],
      fillColor: this.fillColor ?? undefined,
      fillOpacity: this.fillOpacity,
      closed: this.closed,
      smooth: this.smooth,
      smoothTension: this.smoothTension,
      zIndex: this.zIndex,
      metadata: { ...this.metadata },
    });
  }
}
