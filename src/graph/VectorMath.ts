import { Vector2 } from 'arkturian-typescript-utils';

/**
 * Vector math utilities for force-based graph
 *
 * Since arkturian-typescript-utils Vector2 is minimal (only set, copy, equals),
 * we provide these helper functions for vector operations.
 */

/**
 * Clone a Vector2
 */
export function clone(v: Vector2): Vector2 {
  return new Vector2(v.x, v.y);
}

/**
 * Add two vectors: a + b
 */
export function add(a: Vector2, b: Vector2): Vector2 {
  return new Vector2(a.x + b.x, a.y + b.y);
}

/**
 * Subtract two vectors: a - b
 */
export function subtract(a: Vector2, b: Vector2): Vector2 {
  return new Vector2(a.x - b.x, a.y - b.y);
}

/**
 * Scale a vector: v * scalar
 */
export function scale(v: Vector2, scalar: number): Vector2 {
  return new Vector2(v.x * scalar, v.y * scalar);
}

/**
 * Get magnitude (length) of a vector
 */
export function magnitude(v: Vector2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Normalize a vector (make length = 1)
 * Returns zero vector if magnitude is ~0
 */
export function normalize(v: Vector2): Vector2 {
  const mag = magnitude(v);
  if (mag < 0.0001) return new Vector2(0, 0);
  return scale(v, 1 / mag);
}

/**
 * Get distance between two points
 */
export function distance(a: Vector2, b: Vector2): number {
  return magnitude(subtract(a, b));
}

/**
 * Multiply vector components: v * v (component-wise)
 */
export function multiply(a: Vector2, b: Vector2): Vector2 {
  return new Vector2(a.x * b.x, a.y * b.y);
}

/**
 * Dot product: a · b
 */
export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}
