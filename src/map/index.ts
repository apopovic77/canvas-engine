/**
 * Map Module - Map Features (Markers, Paths, Layers)
 *
 * Provides components for map annotations:
 * - MapMarker for point features (POIs)
 * - MapPath for line/polygon features
 * - MapLayer for organizing features
 *
 * @module map
 */

// Types
export type {
  MapFeature,
  IconAnchor,
  MarkerOptions,
  PathOptions,
  LayerOptions,
  IMapLayer,
} from './MapTypes';

export {
  DEFAULT_MARKER_STYLE,
  DEFAULT_PATH_STYLE,
} from './MapTypes';

// Classes
export { MapMarker } from './MapMarker';
export { MapPath } from './MapPath';
export { MapLayer } from './MapLayer';
