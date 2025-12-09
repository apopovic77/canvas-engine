/**
 * Geo Module - Geographic Coordinate Transformations
 *
 * Provides tools for mapping between pixel and geographic coordinates:
 * - 3-point affine calibration (GeoTransform)
 * - Multi-point triangulation calibration (MultiPointGeoTransform)
 * - WGS84 ↔ UTM conversion (UTMConverter)
 * - Affine matrix math (AffineTransform)
 * - Delaunay triangulation (DelaunayTriangulation)
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
  IGeoTransform,
} from './GeoTypes';

export type { GeoTransformConfigExtended, ManualCorrection } from './GeoTransform';
export type { MultiPointGeoTransformConfig } from './MultiPointGeoTransform';
export type { TPSTransformConfig } from './ThinPlateSplineTransform';
export type { Triangle } from './DelaunayTriangulation';

// Classes
export { AffineTransform } from './AffineTransform';
export { UTMConverter } from './UTMConverter';
export { GeoTransform } from './GeoTransform';
export { MultiPointGeoTransform } from './MultiPointGeoTransform';
export { ThinPlateSplineTransform } from './ThinPlateSplineTransform';
export { DelaunayTriangulation } from './DelaunayTriangulation';
