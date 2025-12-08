# TileMap System - Specification & Design Document

**Project:** arkturian-canvas-engine - TileMap Extension
**Version:** 1.0.0
**Author:** Alex Popovic (Arkturian)
**Date:** 2025-12-07

---

## Table of Contents

1. [Overview](#1-overview)
2. [Use Case: Tscheppaschlucht](#2-use-case-tscheppaschlucht)
3. [Architecture](#3-architecture)
4. [Module Specifications](#4-module-specifications)
5. [Data Structures](#5-data-structures)
6. [API Design](#6-api-design)
7. [Python Tile Generator](#7-python-tile-generator)
8. [Implementation Plan](#8-implementation-plan)
9. [Future Extensions](#9-future-extensions)

---

## 1. Overview

### 1.1 Purpose

Extend the `arkturian-canvas-engine` with a generic tile-based map system similar to Google Maps/OpenStreetMap. The system supports:

- **Large Image Rendering:** Display massive images (400MB+) efficiently via tile pyramid
- **GPS Calibration:** Map pixel coordinates to real-world GPS coordinates
- **Map Features:** Markers (POIs) and Paths (routes) with lat/lng positioning
- **Smooth Interactions:** Pan, zoom with InterpolatedProperty animations

### 1.2 Design Principles

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each class has one clear purpose |
| **Open/Closed** | Extensible via interfaces, not modification |
| **Dependency Inversion** | Depend on abstractions (interfaces) |
| **Composition** | Combine modules, don't inherit deeply |
| **Generic First** | Build reusable components, not project-specific |

### 1.3 Key Features

- [x] Tile pyramid with configurable tile size and zoom levels
- [x] QuadTree for efficient spatial queries
- [x] 3-point GPS calibration (Affine Transformation)
- [x] WGS84 ↔ UTM coordinate conversion
- [x] MapMarker with lat/lng positioning
- [x] MapPath for routes/polylines
- [x] Prioritized tile loading (center-first)
- [x] IndexedDB tile caching
- [x] InterpolatedProperty for smooth animations

---

## 2. Use Case: Tscheppaschlucht

### 2.1 Scenario

A hiking trail map for the Tscheppaschlucht (gorge in Austria):

- **Source Image:** ~400MB, ~32000x24000 pixels
- **Tile Pyramid:** 6 zoom levels, 1024x1024 tiles
- **GPS Reference:** 3 known calibration points
- **Features:** Trail markers, viewpoints, info panels, hiking routes

### 2.2 User Interactions

```
┌─────────────────────────────────────────────────────────────┐
│                    MAP VIEWER                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                          ││
│  │     [Marker: Eingang]                                   ││
│  │           ●                                              ││
│  │            \                                             ││
│  │             \___  [Path: Wanderweg]                     ││
│  │                 \                                        ││
│  │                  ●  [Marker: Aussichtspunkt]            ││
│  │                   \                                      ││
│  │                    \_____●  [Marker: Wasserfall]        ││
│  │                                                          ││
│  └─────────────────────────────────────────────────────────┘│
│  [−] [+]  Zoom: 4/6   |   GPS: 46.5234°N, 14.2456°E        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

```
Source Image (400MB)
        ↓
  [Python Tile Generator]
        ↓
  tiles/
  ├── manifest.json
  ├── zoom_0/ (1 tile)
  ├── zoom_1/ (4 tiles)
  ├── ...
  └── zoom_5/ (768 tiles @ 1024x1024)
        ↓
  [TileMapRenderer]
        ↓
  Canvas Display with Markers & Paths
```

---

## 3. Architecture

### 3.1 Module Overview

```
arkturian-canvas-engine/
├── src/
│   ├── geo/                      # Geographic coordinate system
│   │   ├── index.ts
│   │   ├── GeoTypes.ts           # Type definitions
│   │   ├── GeoTransform.ts       # 3-point calibration
│   │   ├── AffineTransform.ts    # 2D affine matrix math
│   │   └── UTMConverter.ts       # WGS84 ↔ UTM
│   │
│   ├── tilemap/                  # Tile-based map rendering
│   │   ├── index.ts
│   │   ├── TileTypes.ts          # Type definitions
│   │   ├── QuadTree.ts           # Spatial data structure
│   │   ├── TileManager.ts        # Tile loading & caching
│   │   ├── TileLoadQueue.ts      # Prioritized loading
│   │   └── TileMapRenderer.ts    # Main renderer component
│   │
│   ├── map/                      # Map features (markers, paths)
│   │   ├── index.ts
│   │   ├── MapTypes.ts           # Type definitions
│   │   ├── MapMarker.ts          # POI marker
│   │   ├── MapPath.ts            # Polyline/route
│   │   ├── MapLayer.ts           # Layer management
│   │   └── MapFeatureRenderer.ts # Renders features on canvas
│   │
│   └── index.ts                  # Updated exports
│
├── tools/
│   └── tile-generator/           # Python tile generator
│       ├── README.md
│       ├── requirements.txt
│       ├── tile_generator.py
│       └── config.example.json
│
└── docs/
    └── TILEMAP_SPEC.md           # This document
```

### 3.2 Dependency Graph

```
                    ┌─────────────────┐
                    │  TileMapRenderer │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   TileManager   │ │  GeoTransform   │ │    MapLayer     │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    QuadTree     │ │ AffineTransform │ │   MapMarker     │
│  TileLoadQueue  │ │  UTMConverter   │ │    MapPath      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │
         ▼
┌─────────────────┐
│ ViewportTransform│  (existing)
│ IndexedDBCache   │  (existing)
└─────────────────┘
```

### 3.3 Integration with Existing Components

| Existing Component | Usage in TileMap |
|-------------------|------------------|
| `ViewportTransform` | Pan/zoom handling, screen ↔ world conversion |
| `ViewportCulling` | Determine visible tile bounds |
| `IndexedDBImageCache` | Cache loaded tile images |
| `ImageLoadQueue` | Base for TileLoadQueue |
| `InterpolatedProperty` | Smooth marker/path animations |
| `Vector2` | Coordinate representation |

---

## 4. Module Specifications

### 4.1 Geo Module (`src/geo/`)

#### 4.1.1 GeoTypes.ts

```typescript
/**
 * WGS84 Geographic coordinate (latitude/longitude)
 */
export interface LatLng {
  lat: number;  // Latitude in degrees (-90 to 90)
  lng: number;  // Longitude in degrees (-180 to 180)
}

/**
 * UTM coordinate (Universal Transverse Mercator)
 */
export interface UTMCoord {
  easting: number;   // Meters east of zone origin
  northing: number;  // Meters north of equator
  zone: number;      // UTM zone (1-60)
  hemisphere: 'N' | 'S';
}

/**
 * Calibration point mapping pixel to GPS coordinate
 */
export interface CalibrationPoint {
  pixel: { x: number; y: number };
  latLng: LatLng;
}

/**
 * Configuration for GeoTransform
 */
export interface GeoTransformConfig {
  calibrationPoints: [CalibrationPoint, CalibrationPoint, CalibrationPoint];
  imageSize: { width: number; height: number };
}
```

#### 4.1.2 AffineTransform.ts

```typescript
/**
 * 2D Affine Transformation Matrix
 *
 * | a  b  tx |   | x |   | a*x + b*y + tx |
 * | c  d  ty | × | y | = | c*x + d*y + ty |
 * | 0  0  1  |   | 1 |   |       1        |
 *
 * Used for mapping between coordinate systems.
 */
export class AffineTransform {
  // Matrix coefficients
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;

  constructor(a: number, b: number, c: number, d: number, tx: number, ty: number);

  /**
   * Create affine transform from 3 point pairs
   * Solves the system of equations to find transformation matrix
   */
  static fromPointPairs(
    source: [Vector2, Vector2, Vector2],
    target: [Vector2, Vector2, Vector2]
  ): AffineTransform;

  /**
   * Apply transformation to a point
   */
  apply(point: Vector2): Vector2;

  /**
   * Get inverse transformation
   */
  invert(): AffineTransform;

  /**
   * Compose with another transformation
   */
  compose(other: AffineTransform): AffineTransform;
}
```

#### 4.1.3 GeoTransform.ts

```typescript
/**
 * Geographic Transformation using 3-point calibration
 *
 * Maps between pixel coordinates and geographic (lat/lng) coordinates
 * using an affine transformation derived from 3 known reference points.
 */
export class GeoTransform {
  private readonly pixelToGeoMatrix: AffineTransform;
  private readonly geoToPixelMatrix: AffineTransform;
  private readonly config: GeoTransformConfig;

  constructor(config: GeoTransformConfig);

  /**
   * Convert pixel coordinate to geographic coordinate
   */
  pixelToLatLng(pixel: Vector2): LatLng;

  /**
   * Convert geographic coordinate to pixel coordinate
   */
  latLngToPixel(latLng: LatLng): Vector2;

  /**
   * Get the image bounds in geographic coordinates
   */
  getGeoBounds(): {
    topLeft: LatLng;
    topRight: LatLng;
    bottomLeft: LatLng;
    bottomRight: LatLng;
  };

  /**
   * Check if a geographic coordinate is within the image bounds
   */
  isWithinBounds(latLng: LatLng): boolean;

  /**
   * Get calibration accuracy (RMS error in pixels)
   */
  getCalibrationError(): number;
}
```

#### 4.1.4 UTMConverter.ts

```typescript
/**
 * WGS84 ↔ UTM Coordinate Converter
 *
 * UTM is useful for:
 * - Distance calculations (coordinates in meters)
 * - Area calculations
 * - Local projections with minimal distortion
 */
export class UTMConverter {
  // WGS84 ellipsoid constants
  private static readonly a = 6378137;           // Semi-major axis
  private static readonly f = 1 / 298.257223563; // Flattening

  /**
   * Convert WGS84 to UTM
   */
  static toUTM(latLng: LatLng): UTMCoord;

  /**
   * Convert UTM to WGS84
   */
  static toLatLng(utm: UTMCoord): LatLng;

  /**
   * Calculate distance between two points in meters
   */
  static distance(p1: LatLng, p2: LatLng): number;

  /**
   * Calculate bearing from p1 to p2 in degrees
   */
  static bearing(p1: LatLng, p2: LatLng): number;

  /**
   * Get UTM zone for a given longitude
   */
  static getZone(lng: number): number;
}
```

---

### 4.2 TileMap Module (`src/tilemap/`)

#### 4.2.1 TileTypes.ts

```typescript
/**
 * Single tile in the tile pyramid
 */
export interface Tile {
  id: string;           // Unique ID: "z_x_y"
  zoom: number;         // Zoom level (0 = most zoomed out)
  x: number;            // Column index
  y: number;            // Row index
  bounds: Rect;         // World-space bounds in pixels
  url: string;          // URL to tile image
  state: TileState;
  image?: HTMLImageElement;
}

export type TileState = 'pending' | 'loading' | 'loaded' | 'error';

/**
 * Tile manifest describing the tile pyramid
 */
export interface TileManifest {
  // Original image dimensions
  originalSize: {
    width: number;
    height: number;
  };

  // Tile configuration
  tileSize: number;       // e.g., 1024
  format: 'jpg' | 'png' | 'webp';
  quality?: number;       // JPEG quality (1-100)

  // Zoom levels
  zoomLevels: ZoomLevel[];

  // Base URL for tiles
  baseUrl: string;

  // URL pattern: "{baseUrl}/{zoom}/tile_{x}_{y}.{format}"
  urlPattern?: string;
}

export interface ZoomLevel {
  zoom: number;         // 0-based zoom level
  scale: number;        // Scale factor (1.0 = full resolution)
  cols: number;         // Number of tile columns
  rows: number;         // Number of tile rows
  width: number;        // Total width at this zoom
  height: number;       // Total height at this zoom
}

/**
 * Rectangle in world coordinates
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

#### 4.2.2 QuadTree.ts

```typescript
/**
 * Generic QuadTree for spatial queries
 *
 * Used for efficient tile visibility determination and
 * spatial indexing of map features.
 *
 * @template T - Type of data stored in nodes
 */
export class QuadTree<T> {
  readonly bounds: Rect;
  readonly maxDepth: number;
  readonly maxItems: number;

  private children: QuadTree<T>[] | null = null;
  private items: Array<{ bounds: Rect; data: T }> = [];

  constructor(bounds: Rect, maxDepth?: number, maxItems?: number);

  /**
   * Insert item with bounds
   */
  insert(bounds: Rect, data: T): void;

  /**
   * Query items intersecting with given bounds
   */
  query(bounds: Rect): T[];

  /**
   * Remove item
   */
  remove(data: T): boolean;

  /**
   * Clear all items
   */
  clear(): void;

  /**
   * Get all items
   */
  all(): T[];

  /**
   * Subdivide node into 4 children
   */
  private subdivide(): void;

  /**
   * Check if bounds intersect
   */
  private intersects(a: Rect, b: Rect): boolean;
}
```

#### 4.2.3 TileManager.ts

```typescript
/**
 * Manages tile loading, caching, and visibility
 */
export class TileManager {
  private readonly manifest: TileManifest;
  private readonly tiles: Map<string, Tile> = new Map();
  private readonly quadTrees: Map<number, QuadTree<Tile>> = new Map();
  private readonly loadQueue: TileLoadQueue;
  private readonly cache: IndexedDBImageCache;

  constructor(manifest: TileManifest, cacheConfig?: CacheConfig);

  /**
   * Initialize tiles and quadtrees for all zoom levels
   */
  initialize(): Promise<void>;

  /**
   * Get optimal zoom level for given viewport scale
   */
  getOptimalZoom(viewportScale: number): number;

  /**
   * Get visible tiles for given viewport bounds and zoom
   */
  getVisibleTiles(viewportBounds: Rect, zoom: number): Tile[];

  /**
   * Load a tile image
   */
  loadTile(tile: Tile): Promise<HTMLImageElement>;

  /**
   * Cancel pending loads for tiles no longer visible
   */
  cancelInvisibleLoads(visibleTileIds: Set<string>): void;

  /**
   * Get tile by ID
   */
  getTile(id: string): Tile | undefined;

  /**
   * Get loading progress
   */
  getProgress(): { loaded: number; total: number; loading: number };

  /**
   * Clear cache
   */
  clearCache(): Promise<void>;
}
```

#### 4.2.4 TileLoadQueue.ts

```typescript
/**
 * Priority queue for tile loading
 *
 * Prioritizes tiles based on:
 * 1. Distance from viewport center
 * 2. Zoom level (current zoom first)
 * 3. Visibility duration
 */
export class TileLoadQueue {
  private readonly queue: PriorityQueue<Tile>;
  private readonly loading: Map<string, AbortController> = new Map();
  private readonly maxConcurrent: number;

  constructor(maxConcurrent?: number);

  /**
   * Add tile to load queue with priority
   */
  enqueue(tile: Tile, priority: number): void;

  /**
   * Cancel loading for specific tile
   */
  cancel(tileId: string): void;

  /**
   * Cancel all pending loads
   */
  cancelAll(): void;

  /**
   * Process queue (called on animation frame)
   */
  process(): void;

  /**
   * Calculate priority for tile
   * Lower number = higher priority
   */
  static calculatePriority(
    tile: Tile,
    viewportCenter: Vector2,
    currentZoom: number
  ): number;
}
```

#### 4.2.5 TileMapRenderer.ts

```typescript
/**
 * Main tile map rendering component
 *
 * Coordinates tile loading, rendering, and map features.
 */
export class TileMapRenderer {
  // Core components
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly viewport: ViewportTransform;
  private readonly tileManager: TileManager;

  // Optional geo transform (for GPS support)
  private geoTransform: GeoTransform | null = null;

  // Map feature layers
  private readonly layers: MapLayer[] = [];

  // Animation
  private readonly tileOpacity: Map<string, InterpolatedProperty<number>> = new Map();
  private animationFrameId: number | null = null;

  constructor(config: TileMapRendererConfig);

  /**
   * Initialize with manifest
   */
  async initialize(manifest: TileManifest): Promise<void>;

  /**
   * Set geo calibration for GPS support
   */
  setGeoTransform(config: GeoTransformConfig): void;

  /**
   * Start render loop
   */
  start(): void;

  /**
   * Stop render loop
   */
  stop(): void;

  /**
   * Main render function
   */
  render(): void;

  /**
   * Render visible tiles
   */
  private renderTiles(): void;

  /**
   * Render map feature layers
   */
  private renderLayers(): void;

  // === Map Feature API ===

  /**
   * Add a new layer
   */
  addLayer(layer: MapLayer): void;

  /**
   * Remove a layer
   */
  removeLayer(layerId: string): void;

  /**
   * Add marker at geographic position
   */
  addMarker(latLng: LatLng, options?: MarkerOptions): MapMarker;

  /**
   * Add path with geographic coordinates
   */
  addPath(points: LatLng[], options?: PathOptions): MapPath;

  // === Viewport API ===

  /**
   * Pan to geographic position
   */
  panTo(latLng: LatLng, animate?: boolean): void;

  /**
   * Zoom to level
   */
  zoomTo(level: number, animate?: boolean): void;

  /**
   * Fit bounds to show all given coordinates
   */
  fitBounds(bounds: LatLng[], padding?: number): void;

  /**
   * Get current center in geographic coordinates
   */
  getCenter(): LatLng | null;

  /**
   * Get current zoom level
   */
  getZoom(): number;

  // === Events ===

  /**
   * Subscribe to map events
   */
  on(event: MapEvent, callback: MapEventCallback): void;

  /**
   * Unsubscribe from events
   */
  off(event: MapEvent, callback: MapEventCallback): void;
}

export interface TileMapRendererConfig {
  canvas: HTMLCanvasElement;
  manifest: TileManifest;
  geoTransform?: GeoTransformConfig;
  maxConcurrentLoads?: number;
  cacheEnabled?: boolean;
  cacheName?: string;
}

export type MapEvent =
  | 'click'
  | 'zoom'
  | 'pan'
  | 'movestart'
  | 'moveend'
  | 'tileload'
  | 'tileerror';
```

---

### 4.3 Map Module (`src/map/`)

#### 4.3.1 MapTypes.ts

```typescript
/**
 * Base interface for map features
 */
export interface MapFeature {
  id: string;
  type: 'marker' | 'path' | 'polygon';
  visible: boolean;
  zIndex: number;
  metadata?: Record<string, unknown>;
}

/**
 * Marker configuration
 */
export interface MarkerOptions {
  label?: string;
  icon?: string | HTMLImageElement;
  iconSize?: { width: number; height: number };
  iconAnchor?: { x: number; y: number };  // 0-1, relative to icon
  color?: string;
  opacity?: number;
  draggable?: boolean;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Path/polyline configuration
 */
export interface PathOptions {
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  strokeDash?: number[];
  fillColor?: string;      // For closed paths
  fillOpacity?: number;
  closed?: boolean;        // Connect last to first point
  smooth?: boolean;        // Smooth curves through points
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Layer configuration
 */
export interface LayerOptions {
  id: string;
  name?: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}
```

#### 4.3.2 MapMarker.ts

```typescript
/**
 * Map marker (Point of Interest)
 *
 * Positioned using geographic coordinates, rendered at calculated
 * pixel position with smooth animations.
 */
export class MapMarker implements MapFeature {
  readonly id: string;
  readonly type = 'marker' as const;

  // Position
  private _latLng: LatLng;

  // Visual properties
  label: string;
  icon: HTMLImageElement | null = null;
  color: string;

  // Animation properties
  readonly opacity: InterpolatedProperty<number>;
  readonly scale: InterpolatedProperty<number>;
  readonly offsetX: InterpolatedProperty<number>;
  readonly offsetY: InterpolatedProperty<number>;

  // State
  visible: boolean = true;
  zIndex: number = 0;
  metadata: Record<string, unknown> = {};

  // Interaction
  private _draggable: boolean = false;
  private _hovered: boolean = false;
  private _selected: boolean = false;

  constructor(latLng: LatLng, options?: MarkerOptions);

  // === Position ===

  get latLng(): LatLng;
  set latLng(value: LatLng);

  /**
   * Get pixel position using geo transform
   */
  getPixelPosition(geoTransform: GeoTransform): Vector2;

  /**
   * Get screen position using viewport transform
   */
  getScreenPosition(
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): Vector2;

  // === Rendering ===

  /**
   * Render marker on canvas
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): void;

  /**
   * Check if point hits this marker
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): boolean;

  // === Interaction ===

  get hovered(): boolean;
  set hovered(value: boolean);

  get selected(): boolean;
  set selected(value: boolean);

  get draggable(): boolean;
  set draggable(value: boolean);

  // === Animation ===

  /**
   * Update interpolated properties
   */
  update(deltaTime: number): void;

  /**
   * Animate marker appearing
   */
  animateIn(): void;

  /**
   * Animate marker disappearing
   */
  animateOut(): Promise<void>;
}
```

#### 4.3.3 MapPath.ts

```typescript
/**
 * Map path (polyline or polygon)
 *
 * Defined by array of geographic coordinates, rendered as
 * connected line segments or filled polygon.
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

  // Animation
  readonly opacity: InterpolatedProperty<number>;
  readonly dashOffset: InterpolatedProperty<number>;

  // State
  visible: boolean = true;
  zIndex: number = 0;
  metadata: Record<string, unknown> = {};

  constructor(points: LatLng[], options?: PathOptions);

  // === Points ===

  get points(): LatLng[];
  set points(value: LatLng[]);

  /**
   * Add point to path
   */
  addPoint(latLng: LatLng, index?: number): void;

  /**
   * Remove point from path
   */
  removePoint(index: number): void;

  /**
   * Get pixel path using geo transform
   */
  getPixelPath(geoTransform: GeoTransform): Vector2[];

  // === Calculations ===

  /**
   * Get total path length in meters
   */
  getLength(): number;

  /**
   * Get path bounds
   */
  getBounds(): { min: LatLng; max: LatLng };

  /**
   * Get point at distance along path
   */
  getPointAtDistance(distance: number): LatLng;

  // === Rendering ===

  /**
   * Render path on canvas
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): void;

  /**
   * Check if point is near path (for selection)
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: GeoTransform,
    viewport: ViewportTransform,
    tolerance?: number
  ): boolean;

  // === Animation ===

  /**
   * Animate path drawing (dash animation)
   */
  animateDraw(duration: number): Promise<void>;
}
```

#### 4.3.4 MapLayer.ts

```typescript
/**
 * Layer for organizing map features
 *
 * Layers can be shown/hidden, have opacity, and are rendered
 * in z-index order.
 */
export class MapLayer {
  readonly id: string;
  name: string;
  visible: boolean;
  opacity: number;
  zIndex: number;

  private readonly markers: Map<string, MapMarker> = new Map();
  private readonly paths: Map<string, MapPath> = new Map();

  constructor(options: LayerOptions);

  // === Markers ===

  addMarker(marker: MapMarker): void;
  removeMarker(markerId: string): void;
  getMarker(markerId: string): MapMarker | undefined;
  getMarkers(): MapMarker[];
  clearMarkers(): void;

  // === Paths ===

  addPath(path: MapPath): void;
  removePath(pathId: string): void;
  getPath(pathId: string): MapPath | undefined;
  getPaths(): MapPath[];
  clearPaths(): void;

  // === All Features ===

  getAllFeatures(): MapFeature[];
  clear(): void;

  // === Rendering ===

  /**
   * Render all features in this layer
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): void;

  /**
   * Update all animated features
   */
  update(deltaTime: number): void;

  /**
   * Hit test all features
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): MapFeature | null;
}
```

---

## 5. Data Structures

### 5.1 Tile Manifest Example

```json
{
  "originalSize": {
    "width": 32000,
    "height": 24000
  },
  "tileSize": 1024,
  "format": "jpg",
  "quality": 85,
  "baseUrl": "/tiles",
  "urlPattern": "{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}",
  "zoomLevels": [
    {
      "zoom": 0,
      "scale": 0.03125,
      "cols": 1,
      "rows": 1,
      "width": 1000,
      "height": 750
    },
    {
      "zoom": 1,
      "scale": 0.0625,
      "cols": 2,
      "rows": 2,
      "width": 2000,
      "height": 1500
    },
    {
      "zoom": 2,
      "scale": 0.125,
      "cols": 4,
      "rows": 3,
      "width": 4000,
      "height": 3000
    },
    {
      "zoom": 3,
      "scale": 0.25,
      "cols": 8,
      "rows": 6,
      "width": 8000,
      "height": 6000
    },
    {
      "zoom": 4,
      "scale": 0.5,
      "cols": 16,
      "rows": 12,
      "width": 16000,
      "height": 12000
    },
    {
      "zoom": 5,
      "scale": 1.0,
      "cols": 32,
      "rows": 24,
      "width": 32000,
      "height": 24000
    }
  ]
}
```

### 5.2 Calibration Config Example

```json
{
  "calibrationPoints": [
    {
      "pixel": { "x": 1200, "y": 800 },
      "latLng": { "lat": 46.51234, "lng": 14.23456 }
    },
    {
      "pixel": { "x": 16000, "y": 12000 },
      "latLng": { "lat": 46.52345, "lng": 14.24567 }
    },
    {
      "pixel": { "x": 30000, "y": 22000 },
      "latLng": { "lat": 46.53456, "lng": 14.25678 }
    }
  ],
  "imageSize": {
    "width": 32000,
    "height": 24000
  }
}
```

### 5.3 GPX Import Format (Future)

```xml
<?xml version="1.0"?>
<gpx version="1.1">
  <wpt lat="46.51234" lon="14.23456">
    <name>Eingang Tscheppaschlucht</name>
    <desc>Startpunkt der Wanderung</desc>
  </wpt>
  <trk>
    <name>Wanderweg</name>
    <trkseg>
      <trkpt lat="46.51234" lon="14.23456"/>
      <trkpt lat="46.51345" lon="14.23567"/>
      <trkpt lat="46.51456" lon="14.23678"/>
    </trkseg>
  </trk>
</gpx>
```

---

## 6. API Design

### 6.1 React Hook (Convenience Layer)

```typescript
/**
 * React hook for TileMap integration
 */
export function useTileMap(
  canvasRef: RefObject<HTMLCanvasElement>,
  config: TileMapConfig
): UseTileMapResult {
  const [renderer, setRenderer] = useState<TileMapRenderer | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [center, setCenter] = useState<LatLng | null>(null);
  const [zoom, setZoom] = useState(0);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const r = new TileMapRenderer({
      canvas: canvasRef.current,
      ...config
    });

    r.on('tileload', () => {
      const p = r.tileManager.getProgress();
      setProgress(p.loaded / p.total);
    });

    r.on('moveend', () => {
      setCenter(r.getCenter());
      setZoom(r.getZoom());
    });

    r.initialize(config.manifest).then(() => {
      setLoading(false);
      r.start();
    });

    setRenderer(r);

    return () => r.stop();
  }, [canvasRef, config]);

  return {
    renderer,
    loading,
    progress,
    center,
    zoom,
    // Convenience methods
    panTo: (latLng: LatLng) => renderer?.panTo(latLng, true),
    zoomIn: () => renderer?.zoomTo(zoom + 1, true),
    zoomOut: () => renderer?.zoomTo(zoom - 1, true),
    addMarker: (latLng: LatLng, options?: MarkerOptions) =>
      renderer?.addMarker(latLng, options),
    addPath: (points: LatLng[], options?: PathOptions) =>
      renderer?.addPath(points, options),
  };
}

interface UseTileMapResult {
  renderer: TileMapRenderer | null;
  loading: boolean;
  progress: number;
  center: LatLng | null;
  zoom: number;
  panTo: (latLng: LatLng) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  addMarker: (latLng: LatLng, options?: MarkerOptions) => MapMarker | undefined;
  addPath: (points: LatLng[], options?: PathOptions) => MapPath | undefined;
}
```

### 6.2 Usage Example

```typescript
import {
  TileMapRenderer,
  GeoTransform,
  MapMarker,
  MapPath
} from 'arkturian-canvas-engine';

// Initialize
const renderer = new TileMapRenderer({
  canvas: document.getElementById('map') as HTMLCanvasElement,
  manifest: await fetch('/tiles/manifest.json').then(r => r.json()),
  geoTransform: {
    calibrationPoints: [
      { pixel: { x: 1200, y: 800 }, latLng: { lat: 46.512, lng: 14.234 } },
      { pixel: { x: 16000, y: 12000 }, latLng: { lat: 46.523, lng: 14.245 } },
      { pixel: { x: 30000, y: 22000 }, latLng: { lat: 46.534, lng: 14.256 } },
    ],
    imageSize: { width: 32000, height: 24000 }
  }
});

await renderer.initialize();
renderer.start();

// Add markers
const entrance = renderer.addMarker(
  { lat: 46.512, lng: 14.234 },
  { label: 'Eingang', icon: '/icons/entrance.png' }
);

const waterfall = renderer.addMarker(
  { lat: 46.523, lng: 14.245 },
  { label: 'Wasserfall', icon: '/icons/waterfall.png' }
);

// Add hiking trail
const trail = renderer.addPath(
  [
    { lat: 46.512, lng: 14.234 },
    { lat: 46.515, lng: 14.238 },
    { lat: 46.520, lng: 14.242 },
    { lat: 46.523, lng: 14.245 },
  ],
  { strokeColor: '#e74c3c', strokeWidth: 3 }
);

// Navigate
renderer.panTo({ lat: 46.520, lng: 14.240 }, true);

// Events
renderer.on('click', (event) => {
  console.log('Clicked at:', event.latLng);
  if (event.feature) {
    console.log('Feature:', event.feature.id);
  }
});
```

---

## 7. Python Tile Generator

### 7.1 Location

```
arkturian-canvas-engine/
└── tools/
    └── tile-generator/
        ├── README.md
        ├── requirements.txt
        ├── tile_generator.py
        └── config.example.json
```

### 7.2 Requirements

```
# requirements.txt
Pillow>=10.0.0
numpy>=1.24.0
tqdm>=4.65.0
```

### 7.3 Configuration

```json
{
  "input": "/path/to/large-image.jpg",
  "output": "/path/to/tiles",
  "tileSize": 1024,
  "format": "jpg",
  "quality": 85,
  "zoomLevels": "auto",
  "minZoom": 0,
  "maxZoom": null,
  "backgroundColor": "#000000",
  "parallel": true,
  "threads": 4
}
```

### 7.4 CLI Interface

```bash
# Basic usage
python tile_generator.py input.jpg output_dir/

# With options
python tile_generator.py input.jpg output_dir/ \
  --tile-size 1024 \
  --format jpg \
  --quality 85 \
  --zoom-levels auto \
  --parallel \
  --threads 4

# From config file
python tile_generator.py --config config.json
```

### 7.5 Algorithm

```python
def generate_tiles(config: Config) -> TileManifest:
    """
    Generate tile pyramid from large image.

    Algorithm:
    1. Load image (memory-mapped for large files)
    2. Calculate zoom levels based on image size and tile size
    3. For each zoom level (from max to min):
       a. Resize image to target size
       b. Divide into grid of tiles
       c. Save each tile
    4. Generate manifest.json

    Optimization:
    - Use memory-mapped files for 400MB+ images
    - Process tiles in parallel
    - Generate lower zoom levels from higher ones (faster)
    """
    pass
```

### 7.6 Output Structure

```
output/
├── manifest.json
├── zoom_0/
│   └── tile_0_0.jpg
├── zoom_1/
│   ├── tile_0_0.jpg
│   ├── tile_0_1.jpg
│   ├── tile_1_0.jpg
│   └── tile_1_1.jpg
├── zoom_2/
│   └── ... (16 tiles)
├── zoom_3/
│   └── ... (48 tiles)
├── zoom_4/
│   └── ... (192 tiles)
└── zoom_5/
    └── ... (768 tiles)
```

---

## 8. Implementation Plan

### 8.1 Phase 1: Core Geo Module

| Task | Est. | Priority |
|------|------|----------|
| `GeoTypes.ts` - Type definitions | 0.5h | High |
| `AffineTransform.ts` - Matrix math | 2h | High |
| `GeoTransform.ts` - 3-point calibration | 2h | High |
| `UTMConverter.ts` - Coordinate conversion | 2h | Medium |
| Unit tests for geo module | 1h | High |

### 8.2 Phase 2: TileMap Module

| Task | Est. | Priority |
|------|------|----------|
| `TileTypes.ts` - Type definitions | 0.5h | High |
| `QuadTree.ts` - Spatial indexing | 2h | High |
| `TileLoadQueue.ts` - Priority loading | 1.5h | High |
| `TileManager.ts` - Tile management | 3h | High |
| `TileMapRenderer.ts` - Main renderer | 4h | High |
| Integration with ViewportTransform | 1h | High |
| Unit tests for tilemap module | 2h | High |

### 8.3 Phase 3: Map Features Module

| Task | Est. | Priority |
|------|------|----------|
| `MapTypes.ts` - Type definitions | 0.5h | High |
| `MapMarker.ts` - Marker implementation | 2h | High |
| `MapPath.ts` - Path implementation | 2h | High |
| `MapLayer.ts` - Layer management | 1.5h | High |
| `MapFeatureRenderer.ts` - Feature rendering | 2h | High |
| Hit testing for markers/paths | 1.5h | Medium |
| Unit tests for map module | 1.5h | High |

### 8.4 Phase 4: Python Tile Generator

| Task | Est. | Priority |
|------|------|----------|
| Basic tile generation | 2h | High |
| Multi-zoom level support | 1.5h | High |
| Memory optimization for large images | 2h | High |
| Parallel processing | 1h | Medium |
| CLI interface | 1h | Medium |
| Documentation | 0.5h | Medium |

### 8.5 Phase 5: Integration & Polish

| Task | Est. | Priority |
|------|------|----------|
| React hook `useTileMap` | 1.5h | High |
| Update `index.ts` exports | 0.5h | High |
| README documentation | 1h | High |
| Example project | 2h | Medium |
| Performance optimization | 2h | Medium |

### 8.6 Total Estimate

| Phase | Hours |
|-------|-------|
| Phase 1: Geo | 7.5h |
| Phase 2: TileMap | 14h |
| Phase 3: Map Features | 11h |
| Phase 4: Tile Generator | 8h |
| Phase 5: Integration | 7h |
| **Total** | **47.5h** |

---

## 9. Future Extensions

### 9.1 Planned

- [ ] GPX file import/export
- [ ] GeoJSON support
- [ ] Offline tile caching (Service Worker)
- [ ] Clustering for many markers
- [ ] Heat map layer
- [ ] Elevation profile from path

### 9.2 Potential

- [ ] 3D terrain view (Three.js integration)
- [ ] Real-time GPS tracking
- [ ] Route planning/navigation
- [ ] Tile generation from drone imagery
- [ ] Multi-layer comparison (historical maps)

---

## Appendix A: Mathematical Background

### A.1 Affine Transformation

The 2D affine transformation maps points using:

```
x' = a*x + b*y + tx
y' = c*x + d*y + ty
```

Given 3 source points (x₁,y₁), (x₂,y₂), (x₃,y₃) and their corresponding target points (x'₁,y'₁), (x'₂,y'₂), (x'₃,y'₃), we solve:

```
| x'₁ |   | x₁ y₁ 1 |   | a  tx |
| x'₂ | = | x₂ y₂ 1 | × | b  ty |
| x'₃ |   | x₃ y₃ 1 |   | 1  0  |
```

### A.2 UTM Conversion

UTM uses Transverse Mercator projection with:
- 60 zones of 6° longitude each
- Central meridian at zone center
- Scale factor 0.9996 at central meridian

Key formulas involve ellipsoid geometry of WGS84.

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-07
