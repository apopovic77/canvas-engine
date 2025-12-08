/**
 * Geo Module - Geographic Coordinate Transformations
 *
 * Provides tools for mapping between pixel and geographic coordinates:
 * - 3-point affine calibration (GeoTransform)
 * - WGS84 ↔ UTM conversion (UTMConverter)
 * - Affine matrix math (AffineTransform)
 *
 * @module geo
 */

// Types
export type {
  LatLng,
  UTMCoord,
  PixelCoord,
  CalibrationPoint,
  GeoTransformConfig,
  GeoBounds,
  LatLngBounds,
} from './GeoTypes';

// Classes
export { AffineTransform } from './AffineTransform';
export { UTMConverter } from './UTMConverter';
export { GeoTransform } from './GeoTransform';
