import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphNode } from './ForceGraphNode';
import { PinPoint } from './PinPoint';
import * as Vec from './VectorMath';

/**
 * Edge behavior type
 */
export enum EdgeType {
  /**
   * Spring - Pulls node back to pin with elastic force
   * Node can move freely but is pulled back
   */
  SPRING = 'spring',

  /**
   * Rigid - Maintains fixed distance from pin
   * Node stays at exact distance (like a rod)
   */
  RIGID = 'rigid',
}

/**
 * EdgeConstraint - Connection between PinPoint and ForceGraphNode
 *
 * Represents the "pin needle" that connects a fixed point to a planet.
 * - One end is FIXED (the pin point)
 * - Other end is MOVABLE (the planet/node)
 * - Can be spring-like (elastic) or rigid (fixed distance)
 * - Length is configurable
 */
export class EdgeConstraint<T = any> {
  public readonly id: string;
  public readonly pin: PinPoint;
  public readonly node: ForceGraphNode<T>;

  public type: EdgeType;
  public length: number; // Desired/rest length
  public stiffness: number; // For spring: how strong the pull (0-1)
  public isVisible: boolean;

  constructor(
    id: string,
    pin: PinPoint,
    node: ForceGraphNode<T>,
    length: number = 100,
    type: EdgeType = EdgeType.SPRING,
    stiffness: number = 0.1
  ) {
    this.id = id;
    this.pin = pin;
    this.node = node;
    this.length = length;
    this.type = type;
    this.stiffness = Math.max(0, Math.min(1, stiffness)); // Clamp 0-1
    this.isVisible = true;
  }

  /**
   * Apply constraint force to the node
   * Called by ForceSimulation during physics update
   */
  public applyConstraint(): void {
    const pinPos = this.pin.getPosition();
    const nodePos = this.node.position;

    // Vector from pin to node
    const delta = Vec.subtract(nodePos, pinPos);
    const currentLength = Vec.magnitude(delta);

    if (currentLength < 0.001) return; // Avoid division by zero

    const direction = Vec.scale(delta, 1 / currentLength); // Normalize

    if (this.type === EdgeType.SPRING) {
      // Spring force: F = -k * (currentLength - restLength)
      const displacement = currentLength - this.length;
      const forceMagnitude = -this.stiffness * displacement * 100; // Scale for better feel

      const force = Vec.scale(direction, forceMagnitude);
      this.node.applyForce(force);
    } else if (this.type === EdgeType.RIGID) {
      // Rigid constraint: Snap node to exact distance (true rigid, not force-based)
      const targetPos = Vec.add(pinPos, Vec.scale(direction, this.length));
      this.node.position.x = targetPos.x;
      this.node.position.y = targetPos.y;
    }
  }

  /**
   * Get current distance between pin and node
   */
  public getCurrentLength(): number {
    return Vec.magnitude(Vec.subtract(this.node.position, this.pin.position));
  }
}
