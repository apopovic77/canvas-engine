import { Vector2 } from 'arkturian-typescript-utils';
import * as Vec from './VectorMath';

/**
 * BlockerNode - Invisible node that only repels other nodes
 *
 * Used to create "forbidden zones" in the layout:
 * - Fixed position (never moves)
 * - Repels other nodes (negative force)
 * - Not visible (no rendering)
 * - Cannot experience forces (doesn't move)
 *
 * Use case: Place blockers to prevent nodes from overlapping certain areas
 */
export class BlockerNode {
  public readonly id: string;
  public readonly position: Vector2;
  public readonly radius: number;
  public readonly repulsionStrength: number; // How strongly it repels

  constructor(
    id: string,
    position: Vector2,
    radius: number = 30,
    repulsionStrength: number = 1.0
  ) {
    this.id = id;
    this.position = Vec.clone(position);
    this.radius = radius;
    this.repulsionStrength = repulsionStrength;
  }

  /**
   * Get position (always returns fixed position)
   */
  public getPosition(): Vector2 {
    return Vec.clone(this.position);
  }
}
