// Core rendering
export { CanvasRenderer } from './render/CanvasRenderer';

// Viewport & Transform
export { ViewportTransform } from './utils/ViewportTransform';
export type { ContentBounds } from './utils/ViewportTransform';

// Viewport Culling
export { ViewportCulling } from './utils/ViewportCulling';
export type { WorldRect, ViewportBounds, CullingStats } from './utils/ViewportCulling';

// Layout System
export { LayoutService } from './services/LayoutService';
export { ViewportService } from './services/ViewportService';

// Layout Engines
export { PivotLayouter } from './layout/PivotLayouter';
export { HeroLayouter } from './layout/HeroLayouter';
export { PivotGroup } from './layout/PivotGroup';
export { LayoutEngine } from './layout/LayoutEngine';
export type { ILayouter } from './layout/LayoutEngine';
export { DayStackLayouter } from './layout/DayStackLayouter';
export type { DayStackLayoutConfig, DayAxisLabel } from './layout/DayStackLayouter';

// Components
export { AppPreloaderWrapper } from './components/AppPreloaderWrapper';

// React Hooks
export { useLODTransitions } from './hooks/useLODTransitions';
export type { LODMode, LODTransitionState } from './hooks/useLODTransitions';

export { useInactivityTimer } from './hooks/useInactivityTimer';

export { useImageCache } from './hooks/useImageCache';
export type { HighResImageConfig } from './hooks/useImageCache';

// ============================================================
// TileMap System
// ============================================================

// Geo Module - Geographic Coordinate Transformations
export {
  AffineTransform,
  UTMConverter,
  GeoTransform,
} from './geo';

export type {
  LatLng,
  UTMCoord,
  PixelCoord,
  CalibrationPoint,
  GeoTransformConfig,
  GeoBounds,
  LatLngBounds,
} from './geo';

// TileMap Module - Tile-based Map Rendering
export {
  QuadTree,
  TileLoadQueue,
  TileManager,
  TileMapRenderer,
} from './tilemap';

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
  MapEventType,
  MapClickEvent,
  MapEventCallback,
} from './tilemap';

// Map Module - Map Features (Markers, Paths, Layers)
export {
  MapMarker,
  MapPath,
  MapLayer,
  DEFAULT_MARKER_STYLE,
  DEFAULT_PATH_STYLE,
} from './map';

export type {
  MapFeature,
  IconAnchor,
  MarkerOptions,
  PathOptions,
  LayerOptions,
} from './map';

// ============================================================
// Force-Based Graph System
// ============================================================

export { ForceGraphManager } from './graph/ForceGraphManager';
export type { ForceGraphConfig } from './graph/ForceGraphManager';

export { ForceGraphNode } from './graph/ForceGraphNode';
export { PinPoint } from './graph/PinPoint';
export { EdgeConstraint, EdgeType } from './graph/EdgeConstraint';
export { BlockerNode } from './graph/BlockerNode';
export { ForceSimulation } from './graph/ForceSimulation';
export type { ForceSimulationConfig } from './graph/ForceSimulation';

export type { INodeView, IPinView, IEdgeView, GraphRenderContext } from './graph/IGraphView';
export { DefaultNodeView, DefaultPinView, DefaultEdgeView } from './graph/IGraphView';

// Re-export Vector2 for convenience
export { Vector2 } from 'arkturian-typescript-utils';
