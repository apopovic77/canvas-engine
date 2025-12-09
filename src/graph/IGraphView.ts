import { Vector2 } from 'arkturian-typescript-utils';
import { ForceGraphNode } from './ForceGraphNode';
import { PinPoint } from './PinPoint';
import { EdgeConstraint } from './EdgeConstraint';

/**
 * Context passed to all view render methods
 */
export interface GraphRenderContext {
  ctx: CanvasRenderingContext2D;
  viewport: {
    scale: number;
    offset: Vector2;
  };
  /** Convenience accessor for viewport.scale */
  scale: number;
  time: number; // Current time in seconds (for animations)
}

/**
 * Interface for rendering nodes (planets)
 *
 * Implement this to customize how nodes are drawn.
 * The view receives the current visual position (interpolated)
 * and can render the node however it wants.
 */
export interface INodeView<T = any> {
  /**
   * Render a single node
   * @param node - The node to render
   * @param context - Rendering context
   */
  render(node: ForceGraphNode<T>, context: GraphRenderContext): void;
}

/**
 * Interface for rendering pin points
 *
 * Implement this to customize how pins are drawn.
 * Pins are fixed points where edges are anchored.
 */
export interface IPinView {
  /**
   * Render a single pin point
   * @param pin - The pin to render
   * @param context - Rendering context
   */
  render(pin: PinPoint, context: GraphRenderContext): void;
}

/**
 * Interface for rendering edges (connections)
 *
 * Implement this to customize how edges are drawn.
 * Edges connect pins to nodes.
 */
export interface IEdgeView<T = any> {
  /**
   * Render a single edge
   * @param edge - The edge to render
   * @param context - Rendering context
   */
  render(edge: EdgeConstraint<T>, context: GraphRenderContext): void;
}

/**
 * Default node view - simple circle
 */
export class DefaultNodeView<T = any> implements INodeView<T> {
  public fillColor: string = '#4a90e2';
  public strokeColor: string = '#2c5aa0';
  public strokeWidth: number = 2;

  render(node: ForceGraphNode<T>, context: GraphRenderContext): void {
    if (!node.isVisible) return;

    const { ctx } = context;
    const pos = node.visualPosition.value;
    const radius = node.visualRadius.value ?? node.radius;
    const opacity = node.visualOpacity.value ?? 1;

    if (!pos) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Draw circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.fillColor;
    ctx.fill();
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * Default pin view - small dot
 */
export class DefaultPinView implements IPinView {
  public fillColor: string = '#e74c3c';
  public radius: number = 5;

  render(pin: PinPoint, context: GraphRenderContext): void {
    if (!pin.isVisible) return;

    const { ctx } = context;
    const pos = pin.position;

    ctx.save();

    // Draw pin (small circle)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.fillColor;
    ctx.fill();

    ctx.restore();
  }
}

/**
 * Default edge view - simple line
 */
export class DefaultEdgeView<T = any> implements IEdgeView<T> {
  public strokeColor: string = '#95a5a6';
  public strokeWidth: number = 1.5;

  render(edge: EdgeConstraint<T>, context: GraphRenderContext): void {
    if (!edge.isVisible) return;

    const { ctx } = context;
    const pinPos = edge.pin.position;
    const nodePos = edge.node.visualPosition.value;

    if (!nodePos) return;

    ctx.save();

    // Draw line from pin to node
    ctx.beginPath();
    ctx.moveTo(pinPos.x, pinPos.y);
    ctx.lineTo(nodePos.x, nodePos.y);
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.stroke();

    ctx.restore();
  }
}
