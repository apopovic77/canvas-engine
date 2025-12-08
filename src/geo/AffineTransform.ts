/**
 * 2D Affine Transformation Matrix
 *
 * Implements the affine transformation:
 *
 * | a  b  tx |   | x |   | a*x + b*y + tx |
 * | c  d  ty | × | y | = | c*x + d*y + ty |
 * | 0  0  1  |   | 1 |   |       1        |
 *
 * Used for mapping between coordinate systems (pixel ↔ geographic).
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';

/**
 * Immutable 2D Affine Transformation
 */
export class AffineTransform {
  /**
   * Creates identity transform
   */
  static identity(): AffineTransform {
    return new AffineTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Creates translation transform
   */
  static translate(tx: number, ty: number): AffineTransform {
    return new AffineTransform(1, 0, 0, 1, tx, ty);
  }

  /**
   * Creates scale transform
   */
  static scale(sx: number, sy: number): AffineTransform {
    return new AffineTransform(sx, 0, 0, sy, 0, 0);
  }

  /**
   * Creates rotation transform (radians)
   */
  static rotate(angle: number): AffineTransform {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new AffineTransform(cos, -sin, sin, cos, 0, 0);
  }

  /**
   * Create affine transform from 3 point pairs using least squares
   *
   * Given 3 source points and 3 target points, computes the affine
   * transformation that maps source to target.
   *
   * The system of equations:
   * x' = a*x + b*y + tx
   * y' = c*x + d*y + ty
   *
   * For 3 points, we solve:
   * | x'₁ |   | x₁ y₁ 1 |   | a  |
   * | x'₂ | = | x₂ y₂ 1 | × | b  |
   * | x'₃ |   | x₃ y₃ 1 |   | tx |
   *
   * And similarly for y'.
   */
  static fromPointPairs(
    source: [Vector2, Vector2, Vector2],
    target: [Vector2, Vector2, Vector2]
  ): AffineTransform {
    // Build matrix A: [x, y, 1] for each point
    const [s0, s1, s2] = source;
    const [t0, t1, t2] = target;

    // Matrix A
    const A = [
      [s0.x, s0.y, 1],
      [s1.x, s1.y, 1],
      [s2.x, s2.y, 1],
    ];

    // Target vectors
    const bx = [t0.x, t1.x, t2.x];
    const by = [t0.y, t1.y, t2.y];

    // Solve using Cramer's rule (3x3 system)
    const det = AffineTransform.det3(A);

    if (Math.abs(det) < 1e-10) {
      throw new Error('Calibration points are collinear - cannot compute affine transform');
    }

    // Solve for [a, b, tx]
    const a = AffineTransform.det3(AffineTransform.replaceCol(A, 0, bx)) / det;
    const b = AffineTransform.det3(AffineTransform.replaceCol(A, 1, bx)) / det;
    const tx = AffineTransform.det3(AffineTransform.replaceCol(A, 2, bx)) / det;

    // Solve for [c, d, ty]
    const c = AffineTransform.det3(AffineTransform.replaceCol(A, 0, by)) / det;
    const d = AffineTransform.det3(AffineTransform.replaceCol(A, 1, by)) / det;
    const ty = AffineTransform.det3(AffineTransform.replaceCol(A, 2, by)) / det;

    return new AffineTransform(a, b, c, d, tx, ty);
  }

  /**
   * Compute determinant of 3x3 matrix
   */
  private static det3(m: number[][]): number {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }

  /**
   * Replace column in matrix (for Cramer's rule)
   */
  private static replaceCol(m: number[][], col: number, values: number[]): number[][] {
    return m.map((row, i) => row.map((val, j) => (j === col ? values[i] : val)));
  }

  /**
   * @param a Scale X with X
   * @param b Shear X with Y
   * @param c Shear Y with X
   * @param d Scale Y with Y
   * @param tx Translation X
   * @param ty Translation Y
   */
  constructor(
    readonly a: number,
    readonly b: number,
    readonly c: number,
    readonly d: number,
    readonly tx: number,
    readonly ty: number
  ) {}

  /**
   * Apply transformation to a point
   */
  apply(point: Vector2): Vector2 {
    return new Vector2(
      this.a * point.x + this.b * point.y + this.tx,
      this.c * point.x + this.d * point.y + this.ty
    );
  }

  /**
   * Apply transformation to x/y values
   */
  applyXY(x: number, y: number): { x: number; y: number } {
    return {
      x: this.a * x + this.b * y + this.tx,
      y: this.c * x + this.d * y + this.ty,
    };
  }

  /**
   * Get inverse transformation
   *
   * The inverse of:
   * | a  b  tx |     | d/det  -b/det  (b*ty-d*tx)/det |
   * | c  d  ty | = 1 | -c/det  a/det  (c*tx-a*ty)/det |
   * | 0  0  1  |     | 0       0       1              |
   */
  invert(): AffineTransform {
    const det = this.a * this.d - this.b * this.c;

    // Use relative tolerance for large scale differences (e.g., pixel→GPS)
    // Absolute tolerance of 1e-10 is too strict when coefficients are ~1e-6
    if (Math.abs(det) < Number.EPSILON * 100) {
      throw new Error('Transform is singular - cannot invert');
    }

    const invDet = 1 / det;

    return new AffineTransform(
      this.d * invDet,                     // a'
      -this.b * invDet,                    // b'
      -this.c * invDet,                    // c'
      this.a * invDet,                     // d'
      (this.b * this.ty - this.d * this.tx) * invDet,  // tx'
      (this.c * this.tx - this.a * this.ty) * invDet   // ty'
    );
  }

  /**
   * Compose with another transformation (this * other)
   *
   * Result applies 'other' first, then 'this'.
   */
  compose(other: AffineTransform): AffineTransform {
    return new AffineTransform(
      this.a * other.a + this.b * other.c,
      this.a * other.b + this.b * other.d,
      this.c * other.a + this.d * other.c,
      this.c * other.b + this.d * other.d,
      this.a * other.tx + this.b * other.ty + this.tx,
      this.c * other.tx + this.d * other.ty + this.ty
    );
  }

  /**
   * Get the determinant of the transformation matrix
   */
  getDeterminant(): number {
    return this.a * this.d - this.b * this.c;
  }

  /**
   * Check if transform is invertible
   */
  isInvertible(): boolean {
    return Math.abs(this.getDeterminant()) > Number.EPSILON * 100;
  }

  /**
   * Get scale factor (average of x and y scale)
   */
  getScale(): number {
    const scaleX = Math.sqrt(this.a * this.a + this.c * this.c);
    const scaleY = Math.sqrt(this.b * this.b + this.d * this.d);
    return (scaleX + scaleY) / 2;
  }

  /**
   * Get rotation angle in radians
   */
  getRotation(): number {
    return Math.atan2(this.c, this.a);
  }

  /**
   * Convert to array [a, b, c, d, tx, ty]
   */
  toArray(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.tx, this.ty];
  }

  /**
   * Create from array [a, b, c, d, tx, ty]
   */
  static fromArray(arr: [number, number, number, number, number, number]): AffineTransform {
    return new AffineTransform(arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]);
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return `AffineTransform(a=${this.a.toFixed(6)}, b=${this.b.toFixed(6)}, c=${this.c.toFixed(6)}, d=${this.d.toFixed(6)}, tx=${this.tx.toFixed(2)}, ty=${this.ty.toFixed(2)})`;
  }
}
