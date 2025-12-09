/**
 * Thin Plate Spline Geographic Transformation
 *
 * Provides smooth, continuous interpolation between calibration points
 * without the discontinuities of Delaunay triangulation.
 *
 * TPS minimizes the "bending energy" of the transformation surface,
 * resulting in the smoothest possible interpolation that passes
 * exactly through all control points.
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';
import { UTMConverter } from './UTMConverter';
import { CalibrationPoint, LatLng, GeoBounds, LatLngBounds, IGeoTransform } from './GeoTypes';

/**
 * Configuration for ThinPlateSplineTransform
 */
export interface TPSTransformConfig {
  /** Array of calibration points (minimum 3, recommended 4-10) */
  calibrationPoints: CalibrationPoint[];
  /** Image dimensions */
  imageSize: { width: number; height: number };
  /** Use UTM coordinates for better accuracy */
  useUTM?: boolean;
  /** Force specific UTM zone (auto-detected if not set) */
  utmZone?: number;
  /** Regularization parameter (0 = exact interpolation, >0 = smoothing) */
  lambda?: number;
}

/**
 * Thin Plate Spline Geographic Transform
 *
 * Algorithm:
 * 1. Build radial basis function matrix K where K[i,j] = U(||p_i - p_j||)
 * 2. Build affine matrix P = [[1, x_0, y_0], [1, x_1, y_1], ...]
 * 3. Solve the linear system for weights and affine coefficients
 * 4. Transform points using: f(x,y) = a_0 + a_1*x + a_2*y + Σ w_i * U(||p - p_i||)
 *
 * The radial basis function U(r) = r² * log(r) (r² * ln(r) for 2D TPS)
 */
export class ThinPlateSplineTransform implements IGeoTransform {
  private readonly config: TPSTransformConfig;
  private readonly useUTM: boolean;
  private readonly utmZone: number;
  private readonly utmHemisphere: 'N' | 'S';
  private readonly lambda: number;

  /** Control points in geo/UTM space */
  private readonly geoPoints: Vector2[];
  /** Control points in pixel space */
  private readonly pixelPoints: Vector2[];

  /** TPS weights and affine coefficients for geo→pixel (X component) */
  private readonly geoToPixelX: { weights: number[]; affine: [number, number, number] };
  /** TPS weights and affine coefficients for geo→pixel (Y component) */
  private readonly geoToPixelY: { weights: number[]; affine: [number, number, number] };

  /** TPS weights and affine coefficients for pixel→geo (X/easting component) */
  private readonly pixelToGeoX: { weights: number[]; affine: [number, number, number] };
  /** TPS weights and affine coefficients for pixel→geo (Y/northing component) */
  private readonly pixelToGeoY: { weights: number[]; affine: [number, number, number] };

  /**
   * Create a Thin Plate Spline geo transform
   */
  constructor(config: TPSTransformConfig) {
    if (config.calibrationPoints.length < 3) {
      throw new Error('At least 3 calibration points are required');
    }

    this.config = config;
    this.useUTM = config.useUTM ?? true;
    this.lambda = config.lambda ?? 0; // Exact interpolation by default

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

    // Solve TPS for geo→pixel transformation
    const geoToPixel = this.solveTPS(this.geoPoints, this.pixelPoints);
    this.geoToPixelX = geoToPixel.x;
    this.geoToPixelY = geoToPixel.y;

    // Solve TPS for pixel→geo transformation
    const pixelToGeo = this.solveTPS(this.pixelPoints, this.geoPoints);
    this.pixelToGeoX = pixelToGeo.x;
    this.pixelToGeoY = pixelToGeo.y;

    console.log(
      `[ThinPlateSplineTransform] Created with ${config.calibrationPoints.length} points, ` +
      `UTM Zone ${this.utmZone}${this.utmHemisphere}, lambda=${this.lambda}`
    );
  }

  /**
   * Radial basis function for TPS: U(r) = r² * log(r)
   * Returns 0 when r = 0 to avoid NaN
   */
  private U(r: number): number {
    if (r < 1e-10) return 0;
    return r * r * Math.log(r);
  }

  /**
   * Solve the TPS system for a set of source→target point mappings
   * Returns weights and affine coefficients for both X and Y components
   */
  private solveTPS(
    sourcePoints: Vector2[],
    targetPoints: Vector2[]
  ): {
    x: { weights: number[]; affine: [number, number, number] };
    y: { weights: number[]; affine: [number, number, number] };
  } {
    const n = sourcePoints.length;

    // Build the K matrix (n x n) - radial basis function values
    const K: number[][] = [];
    for (let i = 0; i < n; i++) {
      K[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) {
          K[i][j] = this.lambda; // Regularization on diagonal
        } else {
          const dx = sourcePoints[i].x - sourcePoints[j].x;
          const dy = sourcePoints[i].y - sourcePoints[j].y;
          const r = Math.sqrt(dx * dx + dy * dy);
          K[i][j] = this.U(r);
        }
      }
    }

    // Build the P matrix (n x 3) - affine component [1, x, y]
    const P: number[][] = [];
    for (let i = 0; i < n; i++) {
      P[i] = [1, sourcePoints[i].x, sourcePoints[i].y];
    }

    // Build the full system matrix L (n+3 x n+3)
    // L = [ K   P  ]
    //     [ P^T 0  ]
    const L: number[][] = [];
    for (let i = 0; i < n + 3; i++) {
      L[i] = new Array(n + 3).fill(0);
    }

    // Fill K block
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        L[i][j] = K[i][j];
      }
    }

    // Fill P block (right side)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        L[i][n + j] = P[i][j];
      }
    }

    // Fill P^T block (bottom)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < n; j++) {
        L[n + i][j] = P[j][i];
      }
    }

    // Build target vectors (n+3 x 1)
    const bX: number[] = new Array(n + 3).fill(0);
    const bY: number[] = new Array(n + 3).fill(0);
    for (let i = 0; i < n; i++) {
      bX[i] = targetPoints[i].x;
      bY[i] = targetPoints[i].y;
    }

    // Solve L * w = b for both X and Y
    const solX = this.solveLinearSystem(L, bX);
    const solY = this.solveLinearSystem(L, bY);

    return {
      x: {
        weights: solX.slice(0, n),
        affine: [solX[n], solX[n + 1], solX[n + 2]] as [number, number, number],
      },
      y: {
        weights: solY.slice(0, n),
        affine: [solY[n], solY[n + 1], solY[n + 2]] as [number, number, number],
      },
    };
  }

  /**
   * Solve a linear system Ax = b using Gaussian elimination with partial pivoting
   */
  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = A.length;

    // Create augmented matrix
    const aug: number[][] = [];
    for (let i = 0; i < n; i++) {
      aug[i] = [...A[i], b[i]];
    }

    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(aug[col][col]);
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > maxVal) {
          maxVal = Math.abs(aug[row][col]);
          maxRow = row;
        }
      }

      // Swap rows
      if (maxRow !== col) {
        [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
      }

      // Check for singular matrix
      if (Math.abs(aug[col][col]) < 1e-12) {
        console.warn(`[TPS] Near-singular matrix at column ${col}`);
        continue;
      }

      // Eliminate column
      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / aug[col][col];
        for (let j = col; j <= n; j++) {
          aug[row][j] -= factor * aug[col][j];
        }
      }
    }

    // Back substitution
    const x: number[] = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug[i][n];
      for (let j = i + 1; j < n; j++) {
        sum -= aug[i][j] * x[j];
      }
      x[i] = Math.abs(aug[i][i]) > 1e-12 ? sum / aug[i][i] : 0;
    }

    return x;
  }

  /**
   * Apply TPS transformation to a point
   */
  private applyTPS(
    point: Vector2,
    sourcePoints: Vector2[],
    tpsX: { weights: number[]; affine: [number, number, number] },
    tpsY: { weights: number[]; affine: [number, number, number] }
  ): Vector2 {
    const n = sourcePoints.length;

    // Affine component: a0 + a1*x + a2*y
    let x = tpsX.affine[0] + tpsX.affine[1] * point.x + tpsX.affine[2] * point.y;
    let y = tpsY.affine[0] + tpsY.affine[1] * point.x + tpsY.affine[2] * point.y;

    // Radial basis component: Σ w_i * U(||p - p_i||)
    for (let i = 0; i < n; i++) {
      const dx = point.x - sourcePoints[i].x;
      const dy = point.y - sourcePoints[i].y;
      const r = Math.sqrt(dx * dx + dy * dy);
      const u = this.U(r);

      x += tpsX.weights[i] * u;
      y += tpsY.weights[i] * u;
    }

    return new Vector2(x, y);
  }

  /**
   * Convert geographic coordinate to pixel coordinate
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

    return this.applyTPS(geoPoint, this.geoPoints, this.geoToPixelX, this.geoToPixelY);
  }

  /**
   * Convert pixel coordinate to geographic coordinate
   */
  pixelToLatLng(pixel: Vector2): LatLng {
    const geoPoint = this.applyTPS(pixel, this.pixelPoints, this.pixelToGeoX, this.pixelToGeoY);

    // Convert back to lat/lng
    if (this.useUTM) {
      return UTMConverter.toLatLng({
        easting: geoPoint.x,
        northing: geoPoint.y,
        zone: this.utmZone,
        hemisphere: this.utmHemisphere,
      });
    } else {
      return { lat: geoPoint.y, lng: geoPoint.x };
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
   * Get the regularization parameter
   */
  getLambda(): number {
    return this.lambda;
  }

  // =========================================
  // Manual Correction Support (compatibility)
  // =========================================

  /** Manual correction is not supported for TPS transform */
  getManualCorrection(): { scaleX: number; scaleY: number; translateX: number; translateY: number } {
    return { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 };
  }

  /** Manual correction is not needed for TPS transform */
  setManualCorrection(_correction: Partial<{ scaleX: number; scaleY: number; translateX: number; translateY: number }>): void {
    console.warn('[ThinPlateSplineTransform] Manual correction not supported - adjust calibration points instead');
  }

  /** Manual correction is not supported */
  resetManualCorrection(): void {
    // No-op
  }
}
