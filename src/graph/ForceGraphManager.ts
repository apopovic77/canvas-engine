import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphNode } from './ForceGraphNode';
import { PinPoint } from './PinPoint';
import { EdgeConstraint, EdgeType } from './EdgeConstraint';
import { BlockerNode } from './BlockerNode';
import { ForceSimulation, ForceSimulationConfig } from './ForceSimulation';
import {
  INodeView,
  IPinView,
  IEdgeView,
  DefaultNodeView,
  DefaultPinView,
  DefaultEdgeView,
  GraphRenderContext,
} from './IGraphView';

/**
 * Configuration for ForceGraphManager
 */
export interface ForceGraphConfig<T = any> {
  /**
   * Custom node renderer (optional)
   */
  nodeView?: INodeView<T>;

  /**
   * Custom pin renderer (optional)
   */
  pinView?: IPinView;

  /**
   * Custom edge renderer (optional)
   */
  edgeView?: IEdgeView<T>;

  /**
   * Physics simulation config (optional)
   */
  simulation?: ForceSimulationConfig;
}

/**
 * ForceGraphManager - Main orchestrator for force-based graph
 *
 * Manages:
 * - Nodes (planets) with physics
 * - Pins (fixed anchor points)
 * - Edges (connections between pins and nodes)
 * - Blockers (invisible repulsors)
 * - Simulation (physics engine)
 * - Rendering (via customizable views)
 *
 * Usage:
 * ```typescript
 * const manager = new ForceGraphManager();
 *
 * // Create nodes
 * const node1 = manager.createNode('node1', data, new Vector2(100, 100), 20);
 * const node2 = manager.createNode('node2', data, new Vector2(200, 100), 20);
 *
 * // Create pins
 * const pin1 = manager.createPin('pin1', new Vector2(100, 100));
 * const pin2 = manager.createPin('pin2', new Vector2(200, 100));
 *
 * // Connect nodes to pins
 * manager.createEdge('edge1', pin1, node1, 50, EdgeType.SPRING);
 * manager.createEdge('edge2', pin2, node2, 50, EdgeType.RIGID);
 *
 * // Create blocker
 * manager.createBlocker('blocker1', new Vector2(150, 100), 30);
 *
 * // Update & render
 * manager.update(deltaTime);
 * manager.render(ctx, viewport);
 * ```
 */
export class ForceGraphManager<T = any> {
  // Collections
  private nodes = new Map<string, ForceGraphNode<T>>();
  private pins = new Map<string, PinPoint>();
  private edges = new Map<string, EdgeConstraint<T>>();
  private blockers = new Map<string, BlockerNode>();

  // Simulation
  private simulation: ForceSimulation<T>;

  // Views
  private nodeView: INodeView<T>;
  private pinView: IPinView;
  private edgeView: IEdgeView<T>;

  // State
  private time: number = 0;

  constructor(config: ForceGraphConfig<T> = {}) {
    this.simulation = new ForceSimulation<T>(config.simulation);
    this.nodeView = config.nodeView ?? new DefaultNodeView<T>();
    this.pinView = config.pinView ?? new DefaultPinView();
    this.edgeView = config.edgeView ?? new DefaultEdgeView<T>();
  }

  // ==================== Node Management ====================

  /**
   * Create a new node (planet)
   */
  public createNode(
    id: string,
    data: T,
    position: Vector2 = new Vector2(0, 0),
    radius: number = 20,
    mass: number = 1
  ): ForceGraphNode<T> {
    const node = new ForceGraphNode<T>(id, data, position, radius, mass);
    this.nodes.set(id, node);
    this.updateSimulation();
    return node;
  }

  /**
   * Remove a node
   */
  public removeNode(id: string): boolean {
    const removed = this.nodes.delete(id);
    if (removed) {
      // Remove edges connected to this node
      const edgesToRemove: string[] = [];
      this.edges.forEach((edge, edgeId) => {
        if (edge.node.id === id) {
          edgesToRemove.push(edgeId);
        }
      });
      edgesToRemove.forEach((edgeId) => this.edges.delete(edgeId));

      this.updateSimulation();
    }
    return removed;
  }

  /**
   * Get node by ID
   */
  public getNode(id: string): ForceGraphNode<T> | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  public getAllNodes(): ForceGraphNode<T>[] {
    return Array.from(this.nodes.values());
  }

  // ==================== Pin Management ====================

  /**
   * Create a new pin (fixed anchor point)
   */
  public createPin(
    id: string,
    position: Vector2,
    isVisible: boolean = true
  ): PinPoint {
    const pin = new PinPoint(id, position, isVisible);
    this.pins.set(id, pin);
    return pin;
  }

  /**
   * Remove a pin
   */
  public removePin(id: string): boolean {
    const removed = this.pins.delete(id);
    if (removed) {
      // Remove edges connected to this pin
      const edgesToRemove: string[] = [];
      this.edges.forEach((edge, edgeId) => {
        if (edge.pin.id === id) {
          edgesToRemove.push(edgeId);
        }
      });
      edgesToRemove.forEach((edgeId) => this.edges.delete(edgeId));

      this.updateSimulation();
    }
    return removed;
  }

  /**
   * Get pin by ID
   */
  public getPin(id: string): PinPoint | undefined {
    return this.pins.get(id);
  }

  /**
   * Get all pins
   */
  public getAllPins(): PinPoint[] {
    return Array.from(this.pins.values());
  }

  // ==================== Edge Management ====================

  /**
   * Create an edge (connection between pin and node)
   */
  public createEdge(
    id: string,
    pin: PinPoint,
    node: ForceGraphNode<T>,
    length: number = 100,
    type: EdgeType = EdgeType.SPRING,
    stiffness: number = 0.1
  ): EdgeConstraint<T> {
    const edge = new EdgeConstraint<T>(id, pin, node, length, type, stiffness);
    this.edges.set(id, edge);
    this.updateSimulation();
    return edge;
  }

  /**
   * Remove an edge
   */
  public removeEdge(id: string): boolean {
    const removed = this.edges.delete(id);
    if (removed) {
      this.updateSimulation();
    }
    return removed;
  }

  /**
   * Get edge by ID
   */
  public getEdge(id: string): EdgeConstraint<T> | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all edges
   */
  public getAllEdges(): EdgeConstraint<T>[] {
    return Array.from(this.edges.values());
  }

  // ==================== Blocker Management ====================

  /**
   * Create a blocker (invisible repulsor)
   */
  public createBlocker(
    id: string,
    position: Vector2,
    radius: number = 30,
    repulsionStrength: number = 1.0
  ): BlockerNode {
    const blocker = new BlockerNode(id, position, radius, repulsionStrength);
    this.blockers.set(id, blocker);
    this.updateSimulation();
    return blocker;
  }

  /**
   * Remove a blocker
   */
  public removeBlocker(id: string): boolean {
    const removed = this.blockers.delete(id);
    if (removed) {
      this.updateSimulation();
    }
    return removed;
  }

  /**
   * Get blocker by ID
   */
  public getBlocker(id: string): BlockerNode | undefined {
    return this.blockers.get(id);
  }

  /**
   * Get all blockers
   */
  public getAllBlockers(): BlockerNode[] {
    return Array.from(this.blockers.values());
  }

  // ==================== Simulation ====================

  /**
   * Update simulation (pass arrays to ForceSimulation)
   */
  private updateSimulation(): void {
    this.simulation.setNodes(Array.from(this.nodes.values()));
    this.simulation.setEdges(Array.from(this.edges.values()));
    this.simulation.setBlockers(Array.from(this.blockers.values()));
  }

  /**
   * Update physics simulation
   * @param deltaTime - Time step in seconds (e.g., 0.016 for 60fps)
   */
  public update(deltaTime: number): void {
    this.time += deltaTime;
    this.simulation.step(deltaTime);
  }

  /**
   * Update simulation config
   */
  public setSimulationConfig(config: Partial<ForceSimulationConfig>): void {
    this.simulation.setConfig(config);
  }

  /**
   * Get current kinetic energy (useful for detecting settlement)
   */
  public getKineticEnergy(): number {
    return this.simulation.getKineticEnergy();
  }

  /**
   * Check if simulation has settled
   */
  public hasSettled(threshold: number = 0.1): boolean {
    return this.simulation.hasSettled(threshold);
  }

  // ==================== Rendering ====================

  /**
   * Render the entire graph
   * @param ctx - Canvas rendering context
   * @param viewport - Viewport transform (scale, offset)
   */
  public render(
    ctx: CanvasRenderingContext2D,
    viewport: { scale: number; offset: Vector2 } = {
      scale: 1,
      offset: new Vector2(0, 0),
    }
  ): void {
    const context: GraphRenderContext = {
      ctx,
      viewport,
      scale: viewport.scale, // Convenience accessor
      time: this.time,
    };

    // Apply viewport transform
    ctx.save();
    ctx.translate(viewport.offset.x, viewport.offset.y);
    ctx.scale(viewport.scale, viewport.scale);

    // Viewport culling bounds (in world coordinates)
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const cullMargin = 200; // generous margin for labels extending beyond node position
    const worldMinX = (-viewport.offset.x - cullMargin) / viewport.scale;
    const worldMinY = (-viewport.offset.y - cullMargin) / viewport.scale;
    const worldMaxX = (canvasW - viewport.offset.x + cullMargin) / viewport.scale;
    const worldMaxY = (canvasH - viewport.offset.y + cullMargin) / viewport.scale;

    const isVisible = (x: number, y: number) =>
      x >= worldMinX && x <= worldMaxX && y >= worldMinY && y <= worldMaxY;

    // Render edges first (background) — cull by either endpoint
    for (const edge of this.edges.values()) {
      const np = edge.node.position;
      const pp = edge.pin.position;
      if (isVisible(np.x, np.y) || isVisible(pp.x, pp.y)) {
        this.edgeView.render(edge, context);
      }
    }

    // Render pins — cull by position
    for (const pin of this.pins.values()) {
      const pp = pin.position;
      if (isVisible(pp.x, pp.y)) {
        this.pinView.render(pin, context);
      }
    }

    // Render nodes (foreground) — cull by position
    for (const node of this.nodes.values()) {
      const np = node.position;
      if (isVisible(np.x, np.y)) {
        this.nodeView.render(node, context);
      }
    }

    // Note: Blockers are not rendered (they're invisible)

    ctx.restore();
  }

  /**
   * Set custom node view
   */
  public setNodeView(view: INodeView<T>): void {
    this.nodeView = view;
  }

  /**
   * Set custom pin view
   */
  public setPinView(view: IPinView): void {
    this.pinView = view;
  }

  /**
   * Set custom edge view
   */
  public setEdgeView(view: IEdgeView<T>): void {
    this.edgeView = view;
  }

  // ==================== Utility ====================

  /**
   * Clear all nodes, pins, edges, blockers
   */
  public clear(): void {
    this.nodes.clear();
    this.pins.clear();
    this.edges.clear();
    this.blockers.clear();
    this.updateSimulation();
  }

  /**
   * Get statistics
   */
  public getStats() {
    return {
      nodes: this.nodes.size,
      pins: this.pins.size,
      edges: this.edges.size,
      blockers: this.blockers.size,
      kineticEnergy: this.getKineticEnergy(),
      hasSettled: this.hasSettled(),
    };
  }
}
