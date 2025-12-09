/**
 * Geographic Transformation using 3-point Calibration
 *
 * Maps between pixel coordinates and geographic (lat/lng) coordinates
 * using an affine transformation derived from 3 known reference points.
 *
 * Supports two modes:
 * - Direct: Lat/Lng → Pixel (simple, works for small areas)
 * - UTM: Lat/Lng → UTM → Pixel (accurate, works for projected maps)
 *
 * Use UTM mode when:
 * - Your map image uses a UTM projection
 * - You need accurate positioning over larger areas
 * - The direct mode shows positioning errors
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';
import { AffineTransform } from './AffineTransform';
import { UTMConverter } from './UTMConverter';
import {
  CalibrationPoint,
  GeoTransformConfig,
  GeoBounds,
  LatLng,
  LatLngBounds
} from './GeoTypes';

/**
 * Manual correction values for fine-tuning coordinate mapping
 */
export interface ManualCorrection {
  /** Scale factor for X axis (default: 1.0) */
  scaleX: number;
  /** Scale factor for Y axis (default: 1.0) */
  scaleY: number;
  /** Translation offset for X axis in pixels (default: 0) */
  translateX: number;
  /** Translation offset for Y axis in pixels (default: 0) */
  translateY: number;
}

/**
 * Extended configuration with UTM option and manual corrections
 */
export interface GeoTransformConfigExtended extends GeoTransformConfig {
  /**
   * Use UTM projection as intermediate step.
   * Enable this for maps that use UTM projection.
   */
  useUTM?: boolean;
  /**
   * Force a specific UTM zone. If not set, auto-detected from first calibration point.
   */
  utmZone?: number;
  /**
   * Manual correction values for fine-tuning.
   * Applied after the affine transformation.
   */
  manualCorrection?: ManualCorrection;
}

/**
 * Transforms between pixel coordinates and geographic coordinates
 * using 3-point affine calibration.
 *
 * Supports two modes:
 * - Direct mode: Lat/Lng directly mapped to pixels (simple but less accurate)
 * - UTM mode: Lat/Lng → UTM → Pixels (accurate for projected maps)
 */
export class GeoTransform {
  private readonly pixelToGeoMatrix: AffineTransform;
  private readonly geoToPixelMatrix: AffineTransform;
  private readonly config: GeoTransformConfigExtended;
  private readonly calibrationError: number;

  /** Whether UTM projection is enabled */
  private readonly useUTM: boolean;
  /** UTM zone for conversion (auto-detected or forced) */
  private readonly utmZone: number;
  /** Hemisphere for UTM (auto-detected from first calibration point) */
  private readonly utmHemisphere: 'N' | 'S';

  /** Manual correction values for fine-tuning */
  private manualCorrection: ManualCorrection;

  /**
   * Create a GeoTransform from 3 calibration points
   *
   * @param config Configuration with 3 calibration points and image size
   * @throws Error if calibration points are collinear
   */
  constructor(config: GeoTransformConfigExtended) {
    this.config = config;
    this.useUTM = config.useUTM ?? false;

    // Initialize manual correction with defaults or from config
    this.manualCorrection = config.manualCorrection ?? {
      scaleX: 1.0,
      scaleY: 1.0,
      translateX: 0,
      translateY: 0,
    };

    // Validate calibration points
    if (config.calibrationPoints.length !== 3) {
      throw new Error('Exactly 3 calibration points are required');
    }

    // Determine UTM zone from first calibration point
    const firstLatLng = config.calibrationPoints[0].latLng;
    this.utmZone = config.utmZone ?? UTMConverter.getZone(firstLatLng.lng);
    this.utmHemisphere = firstLatLng.lat >= 0 ? 'N' : 'S';

    // Extract source (pixel) points
    const sourcePoints: [Vector2, Vector2, Vector2] = [
      new Vector2(config.calibrationPoints[0].pixel.x, config.calibrationPoints[0].pixel.y),
      new Vector2(config.calibrationPoints[1].pixel.x, config.calibrationPoints[1].pixel.y),
      new Vector2(config.calibrationPoints[2].pixel.x, config.calibrationPoints[2].pixel.y),
    ];

    // Extract target points - either UTM or direct Lat/Lng
    let targetPoints: [Vector2, Vector2, Vector2];

    if (this.useUTM) {
      // UTM mode: Convert calibration lat/lng to UTM coordinates
      // UTM uses Easting (X) and Northing (Y) in meters
      const utmPoints = config.calibrationPoints.map(p => {
        const utm = UTMConverter.toUTM(p.latLng);
        return new Vector2(utm.easting, utm.northing);
      });
      targetPoints = [utmPoints[0], utmPoints[1], utmPoints[2]];

      console.log(`[GeoTransform] UTM mode enabled, Zone ${this.utmZone}${this.utmHemisphere}`);
      console.log(`[GeoTransform] Calibration UTM points:`, targetPoints.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`));
    } else {
      // Direct mode: Use lat/lng directly (lng as X, lat as Y)
      targetPoints = [
        new Vector2(config.calibrationPoints[0].latLng.lng, config.calibrationPoints[0].latLng.lat),
        new Vector2(config.calibrationPoints[1].latLng.lng, config.calibrationPoints[1].latLng.lat),
        new Vector2(config.calibrationPoints[2].latLng.lng, config.calibrationPoints[2].latLng.lat),
      ];
    }

    // Compute forward transform (pixel → geo/UTM)
    this.pixelToGeoMatrix = AffineTransform.fromPointPairs(sourcePoints, targetPoints);

    // Compute inverse transform (geo/UTM → pixel)
    this.geoToPixelMatrix = this.pixelToGeoMatrix.invert();

    // Calculate calibration error (RMS)
    this.calibrationError = this.calculateCalibrationError();
  }

  /**
   * Convert pixel coordinate to geographic coordinate
   */
  pixelToLatLng(pixel: Vector2): LatLng {
    const result = this.pixelToGeoMatrix.apply(pixel);

    if (this.useUTM) {
      // UTM mode: result is (easting, northing), convert back to lat/lng
      return UTMConverter.toLatLng({
        easting: result.x,
        northing: result.y,
        zone: this.utmZone,
        hemisphere: this.utmHemisphere,
      });
    } else {
      // Direct mode: result is (lng, lat)
      return {
        lat: result.y,
        lng: result.x,
      };
    }
  }

  /**
   * Convert pixel x/y to geographic coordinate
   */
  pixelXYToLatLng(x: number, y: number): LatLng {
    return this.pixelToLatLng(new Vector2(x, y));
  }

  /**
   * Convert geographic coordinate to pixel coordinate
   * Manual corrections (scale, translate) are applied after the affine transform.
   */
  latLngToPixel(latLng: LatLng): Vector2 {
    let pixel: Vector2;

    if (this.useUTM) {
      // UTM mode: convert lat/lng to UTM first, then to pixel
      const utm = UTMConverter.toUTM(latLng);
      const utmPoint = new Vector2(utm.easting, utm.northing);
      pixel = this.geoToPixelMatrix.apply(utmPoint);
    } else {
      // Direct mode: use lat/lng directly (lng as X, lat as Y)
      const geoPoint = new Vector2(latLng.lng, latLng.lat);
      pixel = this.geoToPixelMatrix.apply(geoPoint);
    }

    // Apply manual correction: scale around image center, then translate
    const { scaleX, scaleY, translateX, translateY } = this.manualCorrection;
    const centerX = this.config.imageSize.width / 2;
    const centerY = this.config.imageSize.height / 2;

    // Scale around center
    const scaledX = centerX + (pixel.x - centerX) * scaleX;
    const scaledY = centerY + (pixel.y - centerY) * scaleY;

    // Apply translation
    return new Vector2(scaledX + translateX, scaledY + translateY);
  }

  /**
   * Check if UTM mode is enabled
   */
  isUTMEnabled(): boolean {
    return this.useUTM;
  }

  /**
   * Get the UTM zone being used
   */
  getUTMZone(): number {
    return this.utmZone;
  }

  /**
   * Get the UTM hemisphere being used
   */
  getUTMHemisphere(): 'N' | 'S' {
    return this.utmHemisphere;
  }

  /**
   * Get current manual correction values
   */
  getManualCorrection(): ManualCorrection {
    return { ...this.manualCorrection };
  }

  /**
   * Set manual correction values for fine-tuning
   * @param correction Partial correction values (only provided values will be updated)
   */
  setManualCorrection(correction: Partial<ManualCorrection>): void {
    this.manualCorrection = {
      ...this.manualCorrection,
      ...correction,
    };
  }

  /**
   * Reset manual correction to default (no correction)
   */
  resetManualCorrection(): void {
    this.manualCorrection = {
      scaleX: 1.0,
      scaleY: 1.0,
      translateX: 0,
      translateY: 0,
    };
  }

  /**
   * Get the image corners in geographic coordinates
   */
  getGeoBounds(): GeoBounds {
    const { width, height } = this.config.imageSize;

    return {
      topLeft: this.pixelToLatLng(new Vector2(0, 0)),
      topRight: this.pixelToLatLng(new Vector2(width, 0)),
      bottomLeft: this.pixelToLatLng(new Vector2(0, height)),
      bottomRight: this.pixelToLatLng(new Vector2(width, height)),
    };
  }

  /**
   * Get min/max bounds of the image in geographic coordinates
   */
  getLatLngBounds(): LatLngBounds {
    const corners = this.getGeoBounds();
    const lats = [
      corners.topLeft.lat,
      corners.topRight.lat,
      corners.bottomLeft.lat,
      corners.bottomRight.lat,
    ];
    const lngs = [
      corners.topLeft.lng,
      corners.topRight.lng,
      corners.bottomLeft.lng,
      corners.bottomRight.lng,
    ];

    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs),
    };
  }

  /**
   * Check if a geographic coordinate is within the image bounds
   */
  isWithinBounds(latLng: LatLng): boolean {
    const pixel = this.latLngToPixel(latLng);
    const { width, height } = this.config.imageSize;

    return (
      pixel.x >= 0 &&
      pixel.x <= width &&
      pixel.y >= 0 &&
      pixel.y <= height
    );
  }

  /**
   * Check if a pixel coordinate is within the image bounds
   */
  isPixelWithinBounds(pixel: Vector2): boolean {
    const { width, height } = this.config.imageSize;
    return (
      pixel.x >= 0 &&
      pixel.x <= width &&
      pixel.y >= 0 &&
      pixel.y <= height
    );
  }

  /**
   * Get calibration accuracy (RMS error in pixels)
   *
   * Measures how well the transform reproduces the original calibration points.
   * Lower is better. A value of 0 means perfect calibration.
   */
  getCalibrationError(): number {
    return this.calibrationError;
  }

  /**
   * Calculate RMS error for calibration points
   */
  private calculateCalibrationError(): number {
    let sumSquaredError = 0;

    for (const point of this.config.calibrationPoints) {
      // Forward transform: pixel → geo
      const computedGeo = this.pixelToLatLng(
        new Vector2(point.pixel.x, point.pixel.y)
      );

      // Compare with actual geo coordinate
      const errorLat = computedGeo.lat - point.latLng.lat;
      const errorLng = computedGeo.lng - point.latLng.lng;

      // Convert geo error back to approximate pixel error
      // Using the inverse transform for the center point as reference
      const centerPixel = new Vector2(
        this.config.imageSize.width / 2,
        this.config.imageSize.height / 2
      );
      const centerGeo = this.pixelToLatLng(centerPixel);
      const offsetGeo = this.pixelToLatLng(new Vector2(centerPixel.x + 1, centerPixel.y));

      // Scale factor: how many pixels per degree (approximately)
      const pixelsPerDegreeLng = 1 / Math.abs(offsetGeo.lng - centerGeo.lng);
      const pixelsPerDegreeLat = 1 / Math.abs(
        this.pixelToLatLng(new Vector2(centerPixel.x, centerPixel.y + 1)).lat - centerGeo.lat
      );

      const errorPixelX = errorLng * pixelsPerDegreeLng;
      const errorPixelY = errorLat * pixelsPerDegreeLat;

      sumSquaredError += errorPixelX * errorPixelX + errorPixelY * errorPixelY;
    }

    return Math.sqrt(sumSquaredError / this.config.calibrationPoints.length);
  }

  /**
   * Get the scale of the transformation (meters per pixel, approximately)
   * Calculated at the center of the image.
   */
  getMetersPerPixel(): number {
    const center = new Vector2(
      this.config.imageSize.width / 2,
      this.config.imageSize.height / 2
    );

    const centerGeo = this.pixelToLatLng(center);
    const rightGeo = this.pixelToLatLng(new Vector2(center.x + 100, center.y));

    // Calculate distance in meters
    const R = 6371000; // Earth radius in meters
    const dLng = (rightGeo.lng - centerGeo.lng) * (Math.PI / 180);
    const lat = centerGeo.lat * (Math.PI / 180);

    // At this latitude, distance per degree of longitude
    const distanceMeters = R * Math.cos(lat) * Math.abs(dLng);

    return distanceMeters / 100;
  }

  /**
   * Get the image size
   */
  getImageSize(): { width: number; height: number } {
    return { ...this.config.imageSize };
  }

  /**
   * Get the calibration points
   */
  getCalibrationPoints(): CalibrationPoint[] {
    return [...this.config.calibrationPoints];
  }

  /**
   * Create a GeoTransform for a specific bounding box
   * (useful for maps with known geographic extent)
   *
   * @param bounds Geographic bounds
   * @param imageSize Image dimensions
   */
  static fromBounds(bounds: LatLngBounds, imageSize: { width: number; height: number }): GeoTransform {
    const { width, height } = imageSize;

    // Create 3 calibration points from corners
    const config: GeoTransformConfig = {
      calibrationPoints: [
        {
          pixel: { x: 0, y: 0 },
          latLng: { lat: bounds.north, lng: bounds.west },
        },
        {
          pixel: { x: width, y: 0 },
          latLng: { lat: bounds.north, lng: bounds.east },
        },
        {
          pixel: { x: 0, y: height },
          latLng: { lat: bounds.south, lng: bounds.west },
        },
      ],
      imageSize,
    };

    return new GeoTransform(config);
  }

  /**
   * Serialize to JSON-compatible object
   */
  toJSON(): GeoTransformConfig {
    return {
      calibrationPoints: this.config.calibrationPoints.map(p => ({
        pixel: { x: p.pixel.x, y: p.pixel.y },
        latLng: { lat: p.latLng.lat, lng: p.latLng.lng },
      })) as [CalibrationPoint, CalibrationPoint, CalibrationPoint],
      imageSize: { ...this.config.imageSize },
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json: GeoTransformConfig): GeoTransform {
    return new GeoTransform(json);
  }
}
