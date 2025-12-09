/**
 * Delaunay Triangulation using Bowyer-Watson Algorithm
 *
 * Creates a triangle mesh from a set of points where no point
 * is inside the circumcircle of any triangle.
 *
 * Used for interpolating between calibration points on distorted maps.
 *
 * @module geo
 */

import { Vector2 } from 'arkturian-typescript-utils';

/**
 * A triangle defined by three vertex indices
 */
export interface Triangle {
  /** Index of first vertex */
  a: number;
  /** Index of second vertex */
  b: number;
  /** Index of third vertex */
  c: number;
}

/**
 * Circle defined by center and radius (for circumcircle calculations)
 */
interface Circle {
  center: Vector2;
  radiusSq: number; // Squared radius for faster comparisons
}

/**
 * Edge defined by two vertex indices
 */
interface Edge {
  a: number;
  b: number;
}

/**
 * Delaunay Triangulation implementation using Bowyer-Watson algorithm
 */
export class DelaunayTriangulation {
  /** Input points */
  private readonly points: Vector2[];
  /** Resulting triangles (indices into points array) */
  private triangles: Triangle[] = [];

  /**
   * Create Delaunay triangulation from points
   * @param points Array of 2D points to triangulate
   */
  constructor(points: Vector2[]) {
    if (points.length < 3) {
      throw new Error('At least 3 points are required for triangulation');
    }
    this.points = points;
    this.triangulate();
  }

  /**
   * Get all triangles in the triangulation
   */
  getTriangles(): Triangle[] {
    return [...this.triangles];
  }

  /**
   * Get the points used for triangulation
   */
  getPoints(): Vector2[] {
    return [...this.points];
  }

  /**
   * Find which triangle contains the given point
   * @param point Point to locate
   * @returns Triangle containing the point, or null if outside all triangles
   */
  findContainingTriangle(point: Vector2): Triangle | null {
    for (const tri of this.triangles) {
      if (this.isPointInTriangle(point, tri)) {
        return tri;
      }
    }
    return null;
  }

  /**
   * Get barycentric coordinates of a point within a triangle
   * @param point Point to calculate coordinates for
   * @param triangle Triangle to use
   * @returns Barycentric coordinates [u, v, w] where u + v + w = 1
   */
  getBarycentricCoords(point: Vector2, triangle: Triangle): [number, number, number] {
    const a = this.points[triangle.a];
    const b = this.points[triangle.b];
    const c = this.points[triangle.c];

    const v0 = new Vector2(c.x - a.x, c.y - a.y);
    const v1 = new Vector2(b.x - a.x, b.y - a.y);
    const v2 = new Vector2(point.x - a.x, point.y - a.y);

    const dot00 = v0.x * v0.x + v0.y * v0.y;
    const dot01 = v0.x * v1.x + v0.y * v1.y;
    const dot02 = v0.x * v2.x + v0.y * v2.y;
    const dot11 = v1.x * v1.x + v1.y * v1.y;
    const dot12 = v1.x * v2.x + v1.y * v2.y;

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    const w = 1 - u - v;

    return [w, v, u]; // Corresponds to weights for vertices a, b, c
  }

  /**
   * Check if a point is inside a triangle
   */
  private isPointInTriangle(point: Vector2, triangle: Triangle): boolean {
    const [u, v, w] = this.getBarycentricCoords(point, triangle);
    // Allow small negative values for points on edges
    const epsilon = -0.0001;
    return u >= epsilon && v >= epsilon && w >= epsilon;
  }

  /**
   * Bowyer-Watson triangulation algorithm
   */
  private triangulate(): void {
    // Create super-triangle that encompasses all points
    const superTriangle = this.createSuperTriangle();
    const superA = this.points.length;
    const superB = this.points.length + 1;
    const superC = this.points.length + 2;

    // Add super-triangle vertices temporarily
    this.points.push(superTriangle.a, superTriangle.b, superTriangle.c);

    // Initialize with super-triangle
    this.triangles = [{ a: superA, b: superB, c: superC }];

    // Add each point one by one
    for (let i = 0; i < superA; i++) {
      this.addPoint(i);
    }

    // Remove triangles that share vertices with super-triangle
    this.triangles = this.triangles.filter(
      (tri) =>
        tri.a < superA &&
        tri.b < superA &&
        tri.c < superA
    );

    // Remove super-triangle vertices
    this.points.splice(superA, 3);
  }

  /**
   * Create a super-triangle that contains all points
   */
  private createSuperTriangle(): { a: Vector2; b: Vector2; c: Vector2 } {
    // Find bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const dx = maxX - minX;
    const dy = maxY - minY;
    const dmax = Math.max(dx, dy);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // Create large triangle around all points
    return {
      a: new Vector2(midX - 20 * dmax, midY - dmax),
      b: new Vector2(midX, midY + 20 * dmax),
      c: new Vector2(midX + 20 * dmax, midY - dmax),
    };
  }

  /**
   * Add a point to the triangulation (Bowyer-Watson step)
   */
  private addPoint(pointIndex: number): void {
    const point = this.points[pointIndex];
    const badTriangles: Triangle[] = [];

    // Find all triangles whose circumcircle contains the new point
    for (const tri of this.triangles) {
      const circle = this.getCircumcircle(tri);
      if (this.isPointInCircle(point, circle)) {
        badTriangles.push(tri);
      }
    }

    // Find the boundary polygon (edges not shared by bad triangles)
    const polygon: Edge[] = [];
    for (const tri of badTriangles) {
      const edges: Edge[] = [
        { a: tri.a, b: tri.b },
        { a: tri.b, b: tri.c },
        { a: tri.c, b: tri.a },
      ];

      for (const edge of edges) {
        // Check if this edge is shared with another bad triangle
        let shared = false;
        for (const other of badTriangles) {
          if (tri === other) continue;
          if (this.triangleHasEdge(other, edge)) {
            shared = true;
            break;
          }
        }
        if (!shared) {
          polygon.push(edge);
        }
      }
    }

    // Remove bad triangles
    this.triangles = this.triangles.filter((tri) => !badTriangles.includes(tri));

    // Create new triangles from polygon edges to new point
    for (const edge of polygon) {
      this.triangles.push({
        a: edge.a,
        b: edge.b,
        c: pointIndex,
      });
    }
  }

  /**
   * Calculate circumcircle of a triangle
   */
  private getCircumcircle(tri: Triangle): Circle {
    const a = this.points[tri.a];
    const b = this.points[tri.b];
    const c = this.points[tri.c];

    const ax = a.x, ay = a.y;
    const bx = b.x, by = b.y;
    const cx = c.x, cy = c.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

    if (Math.abs(d) < 1e-10) {
      // Degenerate triangle (collinear points)
      return {
        center: new Vector2((ax + bx + cx) / 3, (ay + by + cy) / 3),
        radiusSq: Infinity,
      };
    }

    const aSq = ax * ax + ay * ay;
    const bSq = bx * bx + by * by;
    const cSq = cx * cx + cy * cy;

    const ux = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
    const uy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;

    const center = new Vector2(ux, uy);
    const radiusSq = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);

    return { center, radiusSq };
  }

  /**
   * Check if a point is inside a circle
   */
  private isPointInCircle(point: Vector2, circle: Circle): boolean {
    const dx = point.x - circle.center.x;
    const dy = point.y - circle.center.y;
    const distSq = dx * dx + dy * dy;
    return distSq <= circle.radiusSq;
  }

  /**
   * Check if a triangle has an edge (in either direction)
   */
  private triangleHasEdge(tri: Triangle, edge: Edge): boolean {
    const triEdges = [
      [tri.a, tri.b],
      [tri.b, tri.c],
      [tri.c, tri.a],
    ];

    for (const [a, b] of triEdges) {
      if ((a === edge.a && b === edge.b) || (a === edge.b && b === edge.a)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the nearest triangle to a point (for points outside the mesh)
   * Uses distance to triangle centroid
   */
  findNearestTriangle(point: Vector2): Triangle | null {
    if (this.triangles.length === 0) return null;

    let nearest: Triangle | null = null;
    let minDist = Infinity;

    for (const tri of this.triangles) {
      const a = this.points[tri.a];
      const b = this.points[tri.b];
      const c = this.points[tri.c];

      // Centroid of triangle
      const cx = (a.x + b.x + c.x) / 3;
      const cy = (a.y + b.y + c.y) / 3;

      const dx = point.x - cx;
      const dy = point.y - cy;
      const dist = dx * dx + dy * dy;

      if (dist < minDist) {
        minDist = dist;
        nearest = tri;
      }
    }

    return nearest;
  }
}
