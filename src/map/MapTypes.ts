/**
 * Map Feature Types
 *
 * Type definitions for map markers, paths, and layers.
 *
 * @module map
 */

/**
 * Base interface for map features
 */
export interface MapFeature {
  /** Unique identifier */
  id: string;
  /** Feature type */
  type: 'marker' | 'path' | 'polygon';
  /** Visibility state */
  visible: boolean;
  /** Z-index for rendering order */
  zIndex: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Marker icon anchor point (0-1, relative to icon size)
 */
export interface IconAnchor {
  x: number;  // 0 = left, 0.5 = center, 1 = right
  y: number;  // 0 = top, 0.5 = center, 1 = bottom
}

/**
 * Marker configuration options
 */
export interface MarkerOptions {
  /** Text label */
  label?: string;
  /** Icon URL or image element */
  icon?: string | HTMLImageElement;
  /** Icon size in pixels */
  iconSize?: { width: number; height: number };
  /** Icon anchor point (0-1, relative to icon) */
  iconAnchor?: IconAnchor;
  /** Marker color (for default marker) */
  color?: string;
  /** Opacity (0-1) */
  opacity?: number;
  /** Enable dragging */
  draggable?: boolean;
  /** Z-index for rendering order */
  zIndex?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Minimum viewport scale to show label (0 = always show) */
  labelMinScale?: number;
}

/**
 * Path/polyline configuration options
 */
export interface PathOptions {
  /** Stroke color */
  strokeColor?: string;
  /** Stroke width in pixels */
  strokeWidth?: number;
  /** Stroke opacity (0-1) */
  strokeOpacity?: number;
  /** Dash pattern (e.g., [5, 5] for dashed line) */
  strokeDash?: number[];
  /** Fill color (for closed paths) */
  fillColor?: string;
  /** Fill opacity (0-1) */
  fillOpacity?: number;
  /** Connect last to first point */
  closed?: boolean;
  /** Smooth curves through points (bezier) */
  smooth?: boolean;
  /** Smoothing tension (0-1) */
  smoothTension?: number;
  /** Z-index for rendering order */
  zIndex?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Layer configuration options
 */
export interface LayerOptions {
  /** Unique layer ID */
  id: string;
  /** Display name */
  name?: string;
  /** Initial visibility */
  visible?: boolean;
  /** Layer opacity (0-1) */
  opacity?: number;
  /** Z-index for layer ordering */
  zIndex?: number;
}

/**
 * Default marker style constants
 */
export const DEFAULT_MARKER_STYLE = {
  color: '#e74c3c',
  size: 24,
  iconAnchor: { x: 0.5, y: 1 },  // Bottom center
  labelOffset: { x: 0, y: -30 },
  labelColor: '#fff',
  labelFont: '12px sans-serif',
  hoverScale: 1.2,
  selectedScale: 1.3,
} as const;

/**
 * Default path style constants
 */
export const DEFAULT_PATH_STYLE = {
  strokeColor: '#3498db',
  strokeWidth: 3,
  strokeOpacity: 1,
  fillColor: 'rgba(52, 152, 219, 0.3)',
  fillOpacity: 0.3,
  hoverWidth: 5,
} as const;

/**
 * Interface for renderable map layers
 * Both MapLayer and custom layers (like POILabelManager) can implement this
 */
export interface IMapLayer {
  /** Unique layer ID */
  readonly id: string;
  /** Display name */
  name: string;
  /** Visibility state */
  visible: boolean;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Z-index for layer ordering */
  zIndex: number;
  /** Render the layer */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: unknown,
    viewport: unknown
  ): void;
  /** Update the layer (for animations/physics) */
  update(deltaTime: number): void;
}
