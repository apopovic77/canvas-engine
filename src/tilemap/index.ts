/**
 * TileMap Module - Tile-based Map Rendering
 *
 * Provides efficient rendering of large images through tile pyramids:
 * - QuadTree for spatial indexing
 * - TileManager for tile loading and caching
 * - TileMapRenderer for rendering
 *
 * @module tilemap
 */

// Types
export type {
  Rect,
  TileState,
  Tile,
  ZoomLevel,
  TileManifest,
  TileLoadProgress,
  TileEventType,
  TileEvent,
  TileEventCallback,
  TileManagerConfig,
  TileMapRendererConfig,
} from './TileTypes';

// Classes
export { QuadTree } from './QuadTree';
export { TileLoadQueue } from './TileLoadQueue';
export { TileManager } from './TileManager';
export { TileMapRenderer, type MapEventType, type MapClickEvent, type MapEventCallback } from './TileMapRenderer';
