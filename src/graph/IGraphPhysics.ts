import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphNode } from './ForceGraphNode';
import { PinPoint } from './PinPoint';
import { BlockerNode } from './BlockerNode';
import { EdgeConstraint, EdgeType } from './EdgeConstraint';
import type { ForceSimulationConfig } from './ForceSimulation';

/**
 * IGraphPhysics — the engine-agnostic contract between graph consumers
 * (e.g. tile-map's POILabelManager) and a physics implementation.
 *
 * Two engines implement it:
 *  - ForceGraphManager  (legacy): force-based springs; edges are elastic
 *    constraints solved through forces, so lengths vary with load.
 *  - OrbitalGraphManager (2026-07): object-based model where a node bound
 *    to a pin has ONE degree of freedom — its angle. The edge length is a
 *    construction parameter, not a simulated quantity, so it can never
 *    stretch. Fixed stars (blockers/pins) emit anti-gravity that rotates
 *    bodies around their anchors.
 *
 * Consumers hold a reference typed as IGraphPhysics and can swap engines
 * via configuration without code changes.
 */
export interface IGraphPhysics<T = any> {
  // ── Structure ──────────────────────────────────────────────
  createNode(id: string, data: T, position: Vector2, radius?: number, mass?: number): ForceGraphNode<T>;
  createPin(id: string, position: Vector2, isVisible?: boolean): PinPoint;
  createEdge(id: string, pin: PinPoint, node: ForceGraphNode<T>, length?: number, type?: EdgeType, stiffness?: number): EdgeConstraint<T>;
  createBlocker(id: string, position: Vector2, radius?: number, repulsionStrength?: number): BlockerNode;

  getNode(id: string): ForceGraphNode<T> | undefined;
  getPin(id: string): PinPoint | undefined;
  getEdge(id: string): EdgeConstraint<T> | undefined;
  getBlocker(id: string): BlockerNode | undefined;
  getAllNodes(): ForceGraphNode<T>[];
  getAllEdges(): EdgeConstraint<T>[];
  getAllBlockers(): BlockerNode[];

  removeNode(id: string): boolean;
  removePin(id: string): boolean;
  removeEdge(id: string): boolean;
  removeBlocker(id: string): boolean;
  clear(): void;

  // ── Simulation ─────────────────────────────────────────────
  update(deltaTime: number): void;
  hasSettled(threshold?: number): boolean;
  getKineticEnergy(): number;
  setSimulationConfig(config: Partial<ForceSimulationConfig>): void;

  // ── Rendering ──────────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D, viewport?: { scale: number; offset: Vector2 }): void;
}
