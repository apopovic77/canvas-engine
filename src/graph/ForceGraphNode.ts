import { InterpolatedProperty, Vector2 } from 'arkturian-typescript-utils';
import * as Vec from './VectorMath';

/**
 * ForceGraphNode - A "planet" in the force-based graph
 *
 * Represents a movable node that:
 * - Experiences forces (repulsion from other nodes)
 * - Has physics properties (velocity, mass)
 * - Uses InterpolatedProperty for smooth rendering
 * - Can be connected to a PinPoint via EdgeConstraint
 */
export class ForceGraphNode<T = any> {
  public readonly id: string;
  public data: T;

  // Physics properties
  public position: Vector2;
  public velocity: Vector2;
  public force: Vector2;
  public mass: number;
  public radius: number;

  // Visual properties (smooth interpolation)
  public readonly visualPosition: InterpolatedProperty<Vector2>;
  public readonly visualRadius: InterpolatedProperty<number>;
  public readonly visualOpacity: InterpolatedProperty<number>;

  // State
  public isFixed: boolean; // If true, node doesn't move (but can still repel)
  public isVisible: boolean;

  constructor(
    id: string,
    data: T,
    position: Vector2 = new Vector2(0, 0),
    radius: number = 20,
    mass: number = 1
  ) {
    this.id = id;
    this.data = data;

    // Physics
    this.position = Vec.clone(position);
    this.velocity = new Vector2(0, 0);
    this.force = new Vector2(0, 0);
    this.mass = mass;
    this.radius = radius;

    // Visual (interpolated for smooth rendering)
    this.visualPosition = new InterpolatedProperty<Vector2>(
      'position',
      Vec.clone(position),
      Vec.clone(position),
      0.3
    );
    this.visualRadius = new InterpolatedProperty<number>(
      'radius',
      radius,
      radius,
      0.3
    );
    this.visualOpacity = new InterpolatedProperty<number>(
      'opacity',
      1,
      1,
      0.3
    );

    // State
    this.isFixed = false;
    this.isVisible = true;
  }

  /**
   * Apply force to this node (accumulated)
   */
  public applyForce(force: Vector2): void {
    this.force = Vec.add(this.force, force);
  }

  /**
   * Reset accumulated forces (call before simulation step)
   */
  public resetForces(): void {
    this.force = new Vector2(0, 0);
  }

  /**
   * Update physics (velocity, position) based on accumulated forces
   * @param deltaTime - Time step in seconds
   */
  public updatePhysics(deltaTime: number): void {
    if (this.isFixed) return;

    // F = ma → a = F/m
    const acceleration = Vec.scale(this.force, 1 / this.mass);

    // v = v + a*dt
    this.velocity = Vec.add(this.velocity, Vec.scale(acceleration, deltaTime));

    // Apply damping (friction)
    const damping = 0.9;
    this.velocity = Vec.scale(this.velocity, damping);

    // p = p + v*dt
    this.position = Vec.add(this.position, Vec.scale(this.velocity, deltaTime));

    // Update visual target (will smoothly interpolate)
    this.visualPosition.targetValue = Vec.clone(this.position);
  }

  /**
   * Set position immediately (no physics, no animation)
   */
  public setPositionImmediate(position: Vector2): void {
    this.position = Vec.clone(position);
    this.velocity = new Vector2(0, 0);
    this.visualPosition.setImmediate(Vec.clone(position));
  }

  /**
   * Set target position (will animate smoothly)
   */
  public setTargetPosition(position: Vector2): void {
    this.visualPosition.targetValue = Vec.clone(position);
  }
}
