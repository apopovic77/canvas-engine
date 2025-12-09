/**
 * Geographic Types for TileMap System
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';

/**
 * WGS84 Geographic coordinate (latitude/longitude)
 */
export interface LatLng {
  /** Latitude in degrees (-90 to 90) */
  lat: number;
  /** Longitude in degrees (-180 to 180) */
  lng: number;
}

/**
 * UTM coordinate (Universal Transverse Mercator)
 */
export interface UTMCoord {
  /** Meters east of zone origin */
  easting: number;
  /** Meters north of equator */
  northing: number;
  /** UTM zone (1-60) */
  zone: number;
  /** Hemisphere indicator */
  hemisphere: 'N' | 'S';
}

/**
 * Pixel coordinate on image
 */
export interface PixelCoord {
  x: number;
  y: number;
}

/**
 * Calibration point mapping pixel to GPS coordinate
 */
export interface CalibrationPoint {
  /** Pixel position on the image */
  pixel: PixelCoord;
  /** Geographic coordinate (WGS84) */
  latLng: LatLng;
}

/**
 * Configuration for GeoTransform
 */
export interface GeoTransformConfig {
  /** Exactly 3 calibration points for affine transformation */
  calibrationPoints: [CalibrationPoint, CalibrationPoint, CalibrationPoint];
  /** Original image dimensions */
  imageSize: { width: number; height: number };
}

/**
 * Geographic bounds (bounding box)
 */
export interface GeoBounds {
  topLeft: LatLng;
  topRight: LatLng;
  bottomLeft: LatLng;
  bottomRight: LatLng;
}

/**
 * Simple min/max bounds
 */
export interface LatLngBounds {
  north: number;  // max lat
  south: number;  // min lat
  east: number;   // max lng
  west: number;   // min lng
}

/**
 * Common interface for geo transformation classes
 * Both GeoTransform (3-point) and MultiPointGeoTransform implement this
 */
export interface IGeoTransform {
  /**
   * Convert geographic coordinate to pixel position
   * @param latLng Geographic coordinate (WGS84)
   * @returns Pixel position on the image
   */
  latLngToPixel(latLng: LatLng): Vector2;

  /**
   * Convert pixel position to geographic coordinate
   * @param pixel Pixel position on the image
   * @returns Geographic coordinate (WGS84)
   */
  pixelToLatLng(pixel: Vector2): LatLng;
}
