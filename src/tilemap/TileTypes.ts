/**
 * TileMap Types
 *
 * Type definitions for the tile-based map rendering system.
 *
 * @module tilemap
 */

/**
 * Rectangle in world coordinates
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tile state in loading pipeline
 */
export type TileState = 'pending' | 'loading' | 'loaded' | 'error';

/**
 * Single tile in the tile pyramid
 */
export interface Tile {
  /** Unique ID: "z_x_y" */
  id: string;
  /** Zoom level (0 = most zoomed out) */
  zoom: number;
  /** Column index */
  x: number;
  /** Row index */
  y: number;
  /** World-space bounds in original image pixels */
  bounds: Rect;
  /** URL to tile image */
  url: string;
  /** Current loading state */
  state: TileState;
  /** Loaded image element */
  image?: HTMLImageElement;
  /** Timestamp when loading started */
  loadStartTime?: number;
  /** Priority for loading (lower = higher priority) */
  priority?: number;
}

/**
 * Zoom level configuration
 */
export interface ZoomLevel {
  /** 0-based zoom level */
  zoom: number;
  /** Scale factor (1.0 = full resolution) */
  scale: number;
  /** Number of tile columns */
  cols: number;
  /** Number of tile rows */
  rows: number;
  /** Total width at this zoom */
  width: number;
  /** Total height at this zoom */
  height: number;
}

/**
 * Tile manifest describing the tile pyramid
 */
export interface TileManifest {
  /** Original image dimensions */
  originalSize: {
    width: number;
    height: number;
  };

  /** Tile size in pixels (e.g., 1024) */
  tileSize: number;

  /** Image format */
  format: 'jpg' | 'png' | 'webp';

  /** JPEG quality (1-100, for jpg format) */
  quality?: number;

  /** Base URL for tiles */
  baseUrl: string;

  /** URL pattern (default: "{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}") */
  urlPattern?: string;

  /** Zoom level configurations */
  zoomLevels: ZoomLevel[];
}

/**
 * Tile loading progress
 */
export interface TileLoadProgress {
  /** Number of tiles loaded */
  loaded: number;
  /** Total number of tiles at current zoom */
  total: number;
  /** Number of tiles currently loading */
  loading: number;
  /** Number of tiles that failed to load */
  errors: number;
}

/**
 * Event types for tile loading
 */
export type TileEventType =
  | 'tile:loading'
  | 'tile:loaded'
  | 'tile:error'
  | 'zoom:changed'
  | 'progress:updated';

/**
 * Tile event payload
 */
export interface TileEvent {
  type: TileEventType;
  tile?: Tile;
  zoom?: number;
  progress?: TileLoadProgress;
  error?: Error;
}

/**
 * Tile event callback
 */
export type TileEventCallback = (event: TileEvent) => void;

/**
 * Configuration for TileManager
 */
export interface TileManagerConfig {
  /** Tile manifest */
  manifest: TileManifest;
  /** Maximum concurrent tile loads (default: 4) */
  maxConcurrent?: number;
  /** Enable IndexedDB caching (default: true) */
  cacheEnabled?: boolean;
  /** Cache database name */
  cacheName?: string;
  /** Tile load timeout in ms (default: 30000) */
  loadTimeout?: number;
  /** Retry failed loads (default: 2) */
  retryAttempts?: number;
}

/**
 * Configuration for TileMapRenderer
 */
export interface TileMapRendererConfig {
  /** Canvas element */
  canvas: HTMLCanvasElement;
  /** Tile manifest */
  manifest: TileManifest;
  /** Maximum concurrent tile loads */
  maxConcurrentLoads?: number;
  /** Enable tile caching */
  cacheEnabled?: boolean;
  /** Cache name for IndexedDB */
  cacheName?: string;
  /** Show debug overlay */
  debug?: boolean;
  /** Background color */
  backgroundColor?: string;
  /** Tile fade-in duration in ms */
  fadeInDuration?: number;
}
