/**
 * Multi-Point Geographic Transformation
 *
 * Uses Delaunay triangulation to interpolate between many calibration points,
 * enabling accurate mapping for maps with non-linear distortions.
 *
 * Unlike the standard 3-point affine GeoTransform, this class handles:
 * - Artistic map distortions
 * - Non-uniform scaling
 * - Local warping effects
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';
import { DelaunayTriangulation, Triangle } from './DelaunayTriangulation';
import { UTMConverter } from './UTMConverter';
import { CalibrationPoint, LatLng, GeoBounds, LatLngBounds } from './GeoTypes';

/**
 * Configuration for MultiPointGeoTransform
 */
export interface MultiPointGeoTransformConfig {
  /** Array of calibration points (minimum 3, recommended 10+) */
  calibrationPoints: CalibrationPoint[];
  /** Image dimensions */
  imageSize: { width: number; height: number };
  /** Use UTM coordinates for better accuracy */
  useUTM?: boolean;
  /** Force specific UTM zone (auto-detected if not set) */
  utmZone?: number;
}

/**
 * Multi-Point Geographic Transform using Delaunay Triangulation
 *
 * Provides accurate coordinate mapping for distorted maps by:
 * 1. Creating a triangle mesh from calibration points
 * 2. Using barycentric interpolation within each triangle
 *
 * Usage:
 * ```typescript
 * const transform = new MultiPointGeoTransform({
 *   calibrationPoints: [
 *     { pixel: { x: 100, y: 200 }, latLng: { lat: 46.5, lng: 14.3 } },
 *     { pixel: { x: 500, y: 300 }, latLng: { lat: 46.6, lng: 14.4 } },
 *     // ... more points
 *   ],
 *   imageSize: { width: 10000, height: 8000 },
 *   useUTM: true,
 * });
 *
 * const pixel = transform.latLngToPixel({ lat: 46.55, lng: 14.35 });
 * ```
 */
export class MultiPointGeoTransform {
  private readonly config: MultiPointGeoTransformConfig;
  private readonly useUTM: boolean;
  private readonly utmZone: number;
  private readonly utmHemisphere: 'N' | 'S';

  /** Triangulation in geo/UTM space (for GPS → Pixel lookup) */
  private readonly geoTriangulation: DelaunayTriangulation;
  /** Triangulation in pixel space (for Pixel → GPS lookup) */
  private readonly pixelTriangulation: DelaunayTriangulation;

  /** Geo/UTM coordinates of calibration points */
  private readonly geoPoints: Vector2[];
  /** Pixel coordinates of calibration points */
  private readonly pixelPoints: Vector2[];

  /**
   * Create a multi-point geo transform
   * @param config Configuration with calibration points and image size
   */
  constructor(config: MultiPointGeoTransformConfig) {
    if (config.calibrationPoints.length < 3) {
      throw new Error('At least 3 calibration points are required');
    }

    this.config = config;
    this.useUTM = config.useUTM ?? true;

    // Determine UTM zone from first calibration point
    const firstLatLng = config.calibrationPoints[0].latLng;
    this.utmZone = config.utmZone ?? UTMConverter.getZone(firstLatLng.lng);
    this.utmHemisphere = firstLatLng.lat >= 0 ? 'N' : 'S';

    // Convert calibration points to Vector2 arrays
    this.pixelPoints = config.calibrationPoints.map(
      (p) => new Vector2(p.pixel.x, p.pixel.y)
    );

    // Convert lat/lng to geo points (UTM or direct)
    if (this.useUTM) {
      this.geoPoints = config.calibrationPoints.map((p) => {
        const utm = UTMConverter.toUTM(p.latLng);
        return new Vector2(utm.easting, utm.northing);
      });
    } else {
      this.geoPoints = config.calibrationPoints.map(
        (p) => new Vector2(p.latLng.lng, p.latLng.lat)
      );
    }

    // Create triangulations
    this.geoTriangulation = new DelaunayTriangulation(this.geoPoints);
    this.pixelTriangulation = new DelaunayTriangulation(this.pixelPoints);

    console.log(
      `[MultiPointGeoTransform] Created with ${config.calibrationPoints.length} points, ` +
      `${this.geoTriangulation.getTriangles().length} triangles, ` +
      `UTM Zone ${this.utmZone}${this.utmHemisphere}`
    );
  }

  /**
   * Convert geographic coordinate to pixel coordinate
   * Uses triangulation interpolation for non-linear mapping
   */
  latLngToPixel(latLng: LatLng): Vector2 {
    // Convert to geo point (UTM or direct)
    let geoPoint: Vector2;
    if (this.useUTM) {
      const utm = UTMConverter.toUTM(latLng);
      geoPoint = new Vector2(utm.easting, utm.northing);
    } else {
      geoPoint = new Vector2(latLng.lng, latLng.lat);
    }

    // Find containing triangle in geo space
    let triangle = this.geoTriangulation.findContainingTriangle(geoPoint);

    // If point is outside mesh, use nearest triangle (extrapolation)
    if (!triangle) {
      triangle = this.geoTriangulation.findNearestTriangle(geoPoint);
      if (!triangle) {
        // Fallback: return center of image
        console.warn('[MultiPointGeoTransform] Point outside all triangles, using fallback');
        return new Vector2(this.config.imageSize.width / 2, this.config.imageSize.height / 2);
      }
    }

    // Get barycentric coordinates in geo triangle
    const bary = this.geoTriangulation.getBarycentricCoords(geoPoint, triangle);

    // Interpolate pixel position using barycentric coordinates
    const pixelA = this.pixelPoints[triangle.a];
    const pixelB = this.pixelPoints[triangle.b];
    const pixelC = this.pixelPoints[triangle.c];

    const x = bary[0] * pixelA.x + bary[1] * pixelB.x + bary[2] * pixelC.x;
    const y = bary[0] * pixelA.y + bary[1] * pixelB.y + bary[2] * pixelC.y;

    return new Vector2(x, y);
  }

  /**
   * Convert pixel coordinate to geographic coordinate
   * Uses triangulation interpolation for non-linear mapping
   */
  pixelToLatLng(pixel: Vector2): LatLng {
    // Find containing triangle in pixel space
    let triangle = this.pixelTriangulation.findContainingTriangle(pixel);

    // If point is outside mesh, use nearest triangle
    if (!triangle) {
      triangle = this.pixelTriangulation.findNearestTriangle(pixel);
      if (!triangle) {
        console.warn('[MultiPointGeoTransform] Pixel outside all triangles, using fallback');
        return { lat: 0, lng: 0 };
      }
    }

    // Get barycentric coordinates in pixel triangle
    const bary = this.pixelTriangulation.getBarycentricCoords(pixel, triangle);

    // Interpolate geo position using barycentric coordinates
    const geoA = this.geoPoints[triangle.a];
    const geoB = this.geoPoints[triangle.b];
    const geoC = this.geoPoints[triangle.c];

    const geoX = bary[0] * geoA.x + bary[1] * geoB.x + bary[2] * geoC.x;
    const geoY = bary[0] * geoA.y + bary[1] * geoB.y + bary[2] * geoC.y;

    // Convert back to lat/lng
    if (this.useUTM) {
      return UTMConverter.toLatLng({
        easting: geoX,
        northing: geoY,
        zone: this.utmZone,
        hemisphere: this.utmHemisphere,
      });
    } else {
      return { lat: geoY, lng: geoX };
    }
  }

  /**
   * Convert pixel x/y to geographic coordinate
   */
  pixelXYToLatLng(x: number, y: number): LatLng {
    return this.pixelToLatLng(new Vector2(x, y));
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
   * Check if a geographic coordinate is within the calibrated area
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
   * Get number of triangles in the mesh
   */
  getTriangleCount(): number {
    return this.geoTriangulation.getTriangles().length;
  }

  /**
   * Get triangles for visualization/debugging
   * Returns triangles in pixel coordinates
   */
  getPixelTriangles(): Array<{ a: Vector2; b: Vector2; c: Vector2 }> {
    const triangles = this.pixelTriangulation.getTriangles();
    return triangles.map((tri) => ({
      a: this.pixelPoints[tri.a],
      b: this.pixelPoints[tri.b],
      c: this.pixelPoints[tri.c],
    }));
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

  // =========================================
  // Manual Correction Support (compatibility)
  // =========================================

  /** Manual correction is not supported for multi-point transform */
  getManualCorrection(): { scaleX: number; scaleY: number; translateX: number; translateY: number } {
    return { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };
  }

  /** Manual correction is not needed for multi-point transform */
  setManualCorrection(_correction: Partial<{ scaleX: number; scaleY: number; translateX: number; translateY: number }>): void {
    console.warn('[MultiPointGeoTransform] Manual correction not supported - use more calibration points instead');
  }

  /** Manual correction is not supported */
  resetManualCorrection(): void {
    // No-op
  }
}
