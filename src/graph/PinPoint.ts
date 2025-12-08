import { Vector2 } from 'arkturian-typescript-utils';
import * as Vec from './VectorMath';

/**
 * PinPoint - Fixed anchor point for nodes
 *
 * Represents a fixed point in space where a node is "pinned" via EdgeConstraint.
 * Like a pin on a map - the pin stays fixed, the node can move around it
 * (constrained by the edge).
 */
export class PinPoint {
  public readonly id: string;
  public readonly position: Vector2;
  public isVisible: boolean;

  constructor(id: string, position: Vector2, isVisible: boolean = true) {
    this.id = id;
    this.position = Vec.clone(position);
    this.isVisible = isVisible;
  }

  /**
   * Get position (always returns fixed position)
   */
  public getPosition(): Vector2 {
    return Vec.clone(this.position);
  }
}
