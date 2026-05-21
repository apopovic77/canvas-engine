// Core rendering
export { CanvasRenderer } from './render/CanvasRenderer';

// Viewport & Transform
export { ViewportTransform } from './utils/ViewportTransform';
export type { ContentBounds } from './utils/ViewportTransform';

// Layout System
export { LayoutService } from './services/LayoutService';
export { ViewportService } from './services/ViewportService';

// Layout Engines
export { PivotLayouter } from './layout/PivotLayouter';
export { HeroLayouter } from './layout/HeroLayouter';
export { PivotGroup } from './layout/PivotGroup';

// Text-domain (Phase 5a prep — skeleton, not yet runtime-wired)
export { FreeCanvasLayouter } from './layout/FreeCanvasLayouter';
export type { FreeCanvasLayouterOptions } from './layout/FreeCanvasLayouter';
export { EdgeRenderer } from './render/EdgeRenderer';
export type { EdgeRendererOptions, EdgeRenderStyle } from './render/EdgeRenderer';
export { EdgeState, EdgeStatePool } from './render/EdgeState';
export { CardFrameRenderer } from './render/CardFrameRenderer';
export type { CardFrameRendererOptions } from './render/CardFrameRenderer';
export { CardFrameState, CardFrameStatePool } from './render/CardFrameState';
export { textBlockId } from './domain/TextBlock';
export type {
  TextBlock,
  TextBlockAuthor,
  CanvasMeta,
  BlockType,
  BlockEdge,
  BlockEdgeType,
} from './domain/TextBlock';

// Components
export { AppPreloaderWrapper } from './components/AppPreloaderWrapper';

// React Hooks
export { useLODTransitions } from './hooks/useLODTransitions';
export type { LODMode, LODTransitionState } from './hooks/useLODTransitions';

export { useInactivityTimer } from './hooks/useInactivityTimer';

export { useImageCache } from './hooks/useImageCache';
export type { HighResImageConfig } from './hooks/useImageCache';

// Re-export Vector2 for convenience
export { Vector2 } from 'arkturian-typescript-utils';
