/**
 * Map Layer
 *
 * Layer for organizing map features (markers and paths).
 * Layers can be shown/hidden, have opacity, and are rendered
 * in z-index order.
 *
 * @module map
 */

import { Vector2 } from 'arkturian-typescript-utils';
import { GeoTransform } from '../geo/GeoTransform';
import { LatLng } from '../geo/GeoTypes';
import { ViewportTransform } from '../utils/ViewportTransform';
import { MapFeature, LayerOptions, MarkerOptions, PathOptions } from './MapTypes';
import { MapMarker } from './MapMarker';
import { MapPath } from './MapPath';

/**
 * Layer for organizing map features
 */
export class MapLayer {
  readonly id: string;
  name: string;
  visible: boolean;
  opacity: number;
  zIndex: number;

  private readonly markers: Map<string, MapMarker> = new Map();
  private readonly paths: Map<string, MapPath> = new Map();

  /**
   * Create a new layer
   */
  constructor(options: LayerOptions) {
    this.id = options.id;
    this.name = options.name ?? options.id;
    this.visible = options.visible ?? true;
    this.opacity = options.opacity ?? 1;
    this.zIndex = options.zIndex ?? 0;
  }

  // === Markers ===

  /**
   * Add a marker to the layer
   */
  addMarker(marker: MapMarker): void {
    this.markers.set(marker.id, marker);
  }

  /**
   * Create and add a new marker
   */
  createMarker(latLng: LatLng, options?: MarkerOptions): MapMarker {
    const marker = new MapMarker(latLng, options);
    this.addMarker(marker);
    return marker;
  }

  /**
   * Remove a marker by ID
   */
  removeMarker(markerId: string): boolean {
    return this.markers.delete(markerId);
  }

  /**
   * Get marker by ID
   */
  getMarker(markerId: string): MapMarker | undefined {
    return this.markers.get(markerId);
  }

  /**
   * Get all markers
   */
  getMarkers(): MapMarker[] {
    return Array.from(this.markers.values());
  }

  /**
   * Clear all markers
   */
  clearMarkers(): void {
    this.markers.clear();
  }

  /**
   * Get marker count
   */
  get markerCount(): number {
    return this.markers.size;
  }

  // === Paths ===

  /**
   * Add a path to the layer
   */
  addPath(path: MapPath): void {
    this.paths.set(path.id, path);
  }

  /**
   * Create and add a new path
   */
  createPath(points: LatLng[], options?: PathOptions): MapPath {
    const path = new MapPath(points, options);
    this.addPath(path);
    return path;
  }

  /**
   * Remove a path by ID
   */
  removePath(pathId: string): boolean {
    return this.paths.delete(pathId);
  }

  /**
   * Get path by ID
   */
  getPath(pathId: string): MapPath | undefined {
    return this.paths.get(pathId);
  }

  /**
   * Get all paths
   */
  getPaths(): MapPath[] {
    return Array.from(this.paths.values());
  }

  /**
   * Clear all paths
   */
  clearPaths(): void {
    this.paths.clear();
  }

  /**
   * Get path count
   */
  get pathCount(): number {
    return this.paths.size;
  }

  // === All Features ===

  /**
   * Get all features (markers and paths)
   */
  getAllFeatures(): MapFeature[] {
    return [...this.getMarkers(), ...this.getPaths()];
  }

  /**
   * Get feature by ID
   */
  getFeature(id: string): MapFeature | undefined {
    return this.markers.get(id) ?? this.paths.get(id);
  }

  /**
   * Remove feature by ID
   */
  removeFeature(id: string): boolean {
    return this.markers.delete(id) || this.paths.delete(id);
  }

  /**
   * Clear all features
   */
  clear(): void {
    this.markers.clear();
    this.paths.clear();
  }

  /**
   * Get total feature count
   */
  get featureCount(): number {
    return this.markers.size + this.paths.size;
  }

  // === Rendering ===

  /**
   * Render all features in this layer
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): void {
    if (!this.visible || this.opacity <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.opacity;

    // Render paths first (below markers)
    const paths = this.getPaths().sort((a, b) => a.zIndex - b.zIndex);
    for (const path of paths) {
      path.render(ctx, geoTransform, viewport);
    }

    // Render markers on top
    const markers = this.getMarkers().sort((a, b) => a.zIndex - b.zIndex);
    for (const marker of markers) {
      marker.render(ctx, geoTransform, viewport);
    }

    ctx.restore();
  }

  /**
   * Update all animated features
   */
  update(deltaTime: number): void {
    for (const marker of this.markers.values()) {
      marker.update(deltaTime);
    }
    for (const path of this.paths.values()) {
      path.update(deltaTime);
    }
  }

  /**
   * Hit test all features at screen point
   * Returns the topmost hit feature
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): MapFeature | null {
    if (!this.visible) return null;

    // Test markers first (they're on top)
    const markers = this.getMarkers().sort((a, b) => b.zIndex - a.zIndex);
    for (const marker of markers) {
      if (marker.hitTest(screenPoint, geoTransform, viewport)) {
        return marker;
      }
    }

    // Test paths
    const paths = this.getPaths().sort((a, b) => b.zIndex - a.zIndex);
    for (const path of paths) {
      if (path.hitTest(screenPoint, geoTransform, viewport)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Get all features within bounds
   */
  getFeaturesInBounds(
    bounds: { min: LatLng; max: LatLng },
    geoTransform: GeoTransform
  ): MapFeature[] {
    const result: MapFeature[] = [];

    // Check markers
    for (const marker of this.markers.values()) {
      const latLng = marker.latLng;
      if (
        latLng.lat >= bounds.min.lat &&
        latLng.lat <= bounds.max.lat &&
        latLng.lng >= bounds.min.lng &&
        latLng.lng <= bounds.max.lng
      ) {
        result.push(marker);
      }
    }

    // Check paths (include if any point is in bounds)
    for (const path of this.paths.values()) {
      for (const point of path.points) {
        if (
          point.lat >= bounds.min.lat &&
          point.lat <= bounds.max.lat &&
          point.lng >= bounds.min.lng &&
          point.lng <= bounds.max.lng
        ) {
          result.push(path);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Show the layer
   */
  show(): void {
    this.visible = true;
  }

  /**
   * Hide the layer
   */
  hide(): void {
    this.visible = false;
  }

  /**
   * Toggle layer visibility
   */
  toggle(): boolean {
    this.visible = !this.visible;
    return this.visible;
  }

  /**
   * Get bounds containing all features
   */
  getBounds(): { min: LatLng; max: LatLng } | null {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    let hasPoints = false;

    // Include marker positions
    for (const marker of this.markers.values()) {
      const latLng = marker.latLng;
      minLat = Math.min(minLat, latLng.lat);
      maxLat = Math.max(maxLat, latLng.lat);
      minLng = Math.min(minLng, latLng.lng);
      maxLng = Math.max(maxLng, latLng.lng);
      hasPoints = true;
    }

    // Include path bounds
    for (const path of this.paths.values()) {
      const pathBounds = path.getBounds();
      minLat = Math.min(minLat, pathBounds.min.lat);
      maxLat = Math.max(maxLat, pathBounds.max.lat);
      minLng = Math.min(minLng, pathBounds.min.lng);
      maxLng = Math.max(maxLng, pathBounds.max.lng);
      hasPoints = true;
    }

    if (!hasPoints) return null;

    return {
      min: { lat: minLat, lng: minLng },
      max: { lat: maxLat, lng: maxLng },
    };
  }

  /**
   * Clone layer with all features
   */
  clone(newId?: string): MapLayer {
    const layer = new MapLayer({
      id: newId ?? `${this.id}_clone`,
      name: this.name,
      visible: this.visible,
      opacity: this.opacity,
      zIndex: this.zIndex,
    });

    for (const marker of this.markers.values()) {
      layer.addMarker(marker.clone());
    }

    for (const path of this.paths.values()) {
      layer.addPath(path.clone());
    }

    return layer;
  }
}
