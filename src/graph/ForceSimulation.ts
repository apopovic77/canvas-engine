import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphNode } from './ForceGraphNode';
import { BlockerNode } from './BlockerNode';
import { EdgeConstraint } from './EdgeConstraint';
import * as Vec from './VectorMath';

/**
 * Configuration for ForceSimulation
 */
export interface ForceSimulationConfig {
  /**
   * Repulsion strength between nodes (default: 100)
   * Higher = nodes push away harder
   */
  repulsionStrength?: number;

  /**
   * Minimum distance for repulsion (default: 1)
   * Prevents infinite force at distance 0
   */
  minRepulsionDistance?: number;

  /**
   * Maximum force magnitude (default: 1000)
   * Prevents extreme forces that cause instability
   */
  maxForce?: number;

  /**
   * Number of iterations per step (default: 1)
   * Higher = more stable but slower
   */
  iterations?: number;
}

/**
 * ForceSimulation - Physics engine for force-based graph layout
 *
 * Simulates:
 * 1. Node-Node repulsion (all nodes push each other away)
 * 2. Blocker-Node repulsion (blockers push nodes away)
 * 3. Edge constraints (springs or rigid connections to pins)
 *
 * Algorithm:
 * - Each step: Reset forces → Calculate repulsion → Apply constraints → Update physics
 * - Nodes have velocity & mass (Newtonian physics)
 * - Forces are accumulated and applied via F=ma
 */
export class ForceSimulation<T = any> {
  private nodes: ForceGraphNode<T>[] = [];
  private blockers: BlockerNode[] = [];
  private edges: EdgeConstraint<T>[] = [];
  private config: Required<ForceSimulationConfig>;

  constructor(config: ForceSimulationConfig = {}) {
    this.config = {
      repulsionStrength: config.repulsionStrength ?? 100,
      minRepulsionDistance: config.minRepulsionDistance ?? 1,
      maxForce: config.maxForce ?? 1000,
      iterations: config.iterations ?? 1,
    };
  }

  /**
   * Set nodes to simulate
   */
  public setNodes(nodes: ForceGraphNode<T>[]): void {
    this.nodes = nodes;
  }

  /**
   * Set blocker nodes
   */
  public setBlockers(blockers: BlockerNode[]): void {
    this.blockers = blockers;
  }

  /**
   * Set edge constraints
   */
  public setEdges(edges: EdgeConstraint<T>[]): void {
    this.edges = edges;
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<ForceSimulationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Run one simulation step
   * @param deltaTime - Time step in seconds (e.g., 0.016 for 60fps)
   */
  public step(deltaTime: number): void {
    const dt = deltaTime / this.config.iterations;

    for (let i = 0; i < this.config.iterations; i++) {
      this.stepOnce(dt);
    }
  }

  /**
   * Run a single iteration of the simulation
   */
  private stepOnce(deltaTime: number): void {
    // 1. Reset all forces
    for (const node of this.nodes) {
      node.resetForces();
    }

    // 2. Calculate node-node repulsion
    this.calculateNodeRepulsion();

    // 3. Calculate blocker-node repulsion
    this.calculateBlockerRepulsion();

    // 4. Apply SPRING edge constraints (add forces before physics update)
    for (const edge of this.edges) {
      if (edge.type === 'spring') {
        edge.applyConstraint();
      }
    }

    // 5. Update physics for all nodes (velocity + position integration)
    for (const node of this.nodes) {
      node.updatePhysics(deltaTime);
    }

    // 6. Apply RIGID edge constraints AFTER physics — snap to exact distance
    //    and zero out velocity along the edge to prevent drift
    for (const edge of this.edges) {
      if (edge.type === 'rigid') {
        edge.applyConstraint();
        // Kill velocity to prevent the node from drifting away
        edge.node.velocity.x = 0;
        edge.node.velocity.y = 0;
      }
    }
  }

  /**
   * Calculate repulsion between all nodes
   */
  private calculateNodeRepulsion(): void {
    const { repulsionStrength, minRepulsionDistance, maxForce } = this.config;

    for (let i = 0; i < this.nodes.length; i++) {
      const nodeA = this.nodes[i];
      // Don't skip fixed nodes - they should still repel others!

      for (let j = i + 1; j < this.nodes.length; j++) {
        const nodeB = this.nodes[j];

        // Skip if BOTH nodes are fixed (no point calculating)
        if (nodeA.isFixed && nodeB.isFixed) continue;

        // Calculate repulsion force (A pushes away from B)
        const force = this.calculateRepulsionForce(
          nodeA.position,
          nodeB.position,
          nodeA.radius,
          nodeB.radius,
          repulsionStrength,
          minRepulsionDistance,
          maxForce
        );

        // Apply force to nodes that can move (Newton's 3rd law: equal and opposite)
        // Fixed nodes act as "immovable" force sources - they push others but don't move themselves
        if (!nodeA.isFixed) {
          nodeA.applyForce(force);
        }
        if (!nodeB.isFixed) {
          nodeB.applyForce(Vec.scale(force, -1));
        }
      }
    }
  }

  /**
   * Calculate repulsion from blockers to nodes
   */
  private calculateBlockerRepulsion(): void {
    const { minRepulsionDistance, maxForce } = this.config;

    for (const blocker of this.blockers) {
      for (const node of this.nodes) {
        if (node.isFixed) continue;

        // Blocker repulsion uses blocker's repulsionStrength
        const force = this.calculateRepulsionForce(
          node.position,
          blocker.position,
          node.radius,
          blocker.radius,
          blocker.repulsionStrength * 100, // Scale for better effect
          minRepulsionDistance,
          maxForce
        );

        node.applyForce(force);
        // Note: Blocker doesn't move (it's fixed), so no opposite force
      }
    }
  }

  /**
   * Apply all edge constraints
   */
  private applyEdgeConstraints(): void {
    for (const edge of this.edges) {
      edge.applyConstraint();
    }
  }

  /**
   * Calculate repulsion force between two positions
   * @returns Force vector to apply to position A (pushes A away from B)
   */
  private calculateRepulsionForce(
    posA: Vector2,
    posB: Vector2,
    radiusA: number,
    radiusB: number,
    strength: number,
    minDistance: number,
    maxForce: number
  ): Vector2 {
    const delta = Vec.subtract(posA, posB);
    const centerDistance = Vec.magnitude(delta);

    // Prevent division by zero
    if (centerDistance < 0.001) {
      // Nodes are on top of each other - push in random direction
      const randomAngle = Math.random() * Math.PI * 2;
      return new Vector2(
        Math.cos(randomAngle) * maxForce,
        Math.sin(randomAngle) * maxForce
      );
    }

    // Calculate surface-to-surface distance (negative means overlap!)
    const combinedRadius = radiusA + radiusB;
    const surfaceDistance = centerDistance - combinedRadius;

    let forceMagnitude: number;

    if (surfaceDistance < 0) {
      // OVERLAP! Apply strong collision force
      // Force increases linearly with overlap depth
      const overlapDepth = Math.abs(surfaceDistance);
      forceMagnitude = strength * (1 + overlapDepth / 10);
    } else {
      // No overlap - normal distance-based repulsion
      // Use surface distance (not center distance) for more accurate behavior
      const effectiveDistance = Math.max(surfaceDistance, minDistance);
      forceMagnitude = strength / effectiveDistance;
    }

    // Clamp force to prevent instability
    const clampedForce = Math.min(forceMagnitude, maxForce);

    // Direction: push A away from B
    const direction = Vec.scale(delta, 1 / centerDistance);

    return Vec.scale(direction, clampedForce);
  }

  /**
   * Get current kinetic energy (useful for determining if simulation has settled)
   */
  public getKineticEnergy(): number {
    let energy = 0;
    for (const node of this.nodes) {
      if (!node.isFixed) {
        const speed = Vec.magnitude(node.velocity);
        energy += 0.5 * node.mass * speed * speed;
      }
    }
    return energy;
  }

  /**
   * Check if simulation has settled (low kinetic energy)
   */
  public hasSettled(threshold: number = 0.1): boolean {
    return this.getKineticEnergy() < threshold;
  }
}
