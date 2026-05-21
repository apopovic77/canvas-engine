import type { LayoutNode } from '../layout/LayoutNode'
import type { ViewportTransform } from '../utils/ViewportTransform'
import type { BlockEdge, BlockEdgeType, TextBlock } from '../domain/TextBlock'
import type { EdgeStatePool } from './EdgeState'

/**
 * EdgeRenderer — Bezier connections between TextBlock cards on the
 * canvas. Companion to FreeCanvasLayouter; integrates into the same
 * CanvasRenderer pass that draws the card frames.
 *
 * Architecture note — Heptabase/Excalidraw split:
 *   The TEXT inside each card is rendered by a DOM overlay layer (NOT
 *   `ctx.fillText` on the canvas). Canvas2D pixel-text would lose
 *   Browser-native text-selection, A11y/Screen-Reader, copy-paste,
 *   font-rendering quality, hyphenation, and bidi — all of which the
 *   doc-mode editor (TipTap) already gives us for free.
 *
 *   So this canvas-side pass owns:
 *     - Card frame strokes (rounded rect outline, optional fill)
 *     - Author-color stripe down the left edge of each card
 *     - Bezier edges between cards (this file)
 *     - Selection / hover outlines
 *
 *   The DOM overlay owns:
 *     - The actual paragraph text (TipTap NodeView or static prose)
 *     - Edit affordances, mention pills, annotation underlines
 *
 *   Edges are drawn UNDER cards (z-order) so they don't intrude on the
 *   text. The DOM overlay sits on top with `pointer-events: auto`
 *   only inside the card rect; edges remain pickable in the gaps.
 *
 * Phase-5a-prep status: skeleton with stable signatures. Not wired
 * into CanvasRenderer.render() yet — that integration lands when the
 * content-app routes a `<CanvasView>` mode and the engine receives
 * its first real `block_edges` payload.
 */

export interface EdgeRenderStyle {
  stroke: string
  lineWidth: number
  /** Optional dash pattern. Empty/undefined = solid. */
  lineDash?: number[]
  /** Multiplier on lineWidth at the destination end for arrowhead. */
  arrowSize?: number
}

const DEFAULT_EDGE_STYLES: Record<BlockEdgeType, EdgeRenderStyle> = {
  responds_to: { stroke: 'rgba(80, 120, 200, 0.7)', lineWidth: 1.5, arrowSize: 8 },
  supports: { stroke: 'rgba(80, 180, 120, 0.7)', lineWidth: 2, arrowSize: 8 },
  contradicts: {
    stroke: 'rgba(220, 90, 90, 0.75)',
    lineWidth: 2,
    lineDash: [6, 4],
    arrowSize: 9,
  },
  summarizes: { stroke: 'rgba(170, 100, 220, 0.7)', lineWidth: 2.5, arrowSize: 10 },
  needs_review: {
    stroke: 'rgba(255, 165, 60, 0.75)',
    lineWidth: 2,
    lineDash: [4, 4],
    arrowSize: 8,
  },
  belongs_to: {
    stroke: 'rgba(140, 140, 140, 0.55)',
    lineWidth: 1,
    lineDash: [2, 3],
  },
}

export interface EdgeRendererOptions {
  styles?: Partial<Record<BlockEdgeType, EdgeRenderStyle>>
}

export class EdgeRenderer {
  private readonly styles: Record<BlockEdgeType, EdgeRenderStyle>

  constructor(opts: EdgeRendererOptions = {}) {
    this.styles = { ...DEFAULT_EDGE_STYLES, ...opts.styles }
  }

  /**
   * Draw all edges between the given nodes onto the canvas context.
   *
   * Nodes are indexed by their block_id (or paragraph_index fallback —
   * same key as textBlockId() produces). Edges referencing missing
   * nodes are silently skipped (e.g. cross-doc edges from a future
   * federation-wide field_map).
   *
   * Call order in the CanvasRenderer frame:
   *   1. EdgeRenderer.render() — edges first, below cards
   *   2. Card frames + author stripes
   *   3. (DOM overlay handles text on top, outside the canvas pass)
   */
  render(
    ctx: CanvasRenderingContext2D,
    nodes: LayoutNode<TextBlock>[],
    edges: BlockEdge[],
    viewport: ViewportTransform,
    states?: EdgeStatePool,
  ): void {
    const byId = new Map<string, LayoutNode<TextBlock>>()
    for (const n of nodes) {
      const block = n.data
      const key = block.block_id ?? `paragraph:${block.paragraph_index}`
      byId.set(key, n)
    }

    for (const edge of edges) {
      const from = byId.get(edge.from_block_id)
      const to = byId.get(edge.to_block_id)
      if (!from || !to) continue
      this.drawEdge(ctx, from, to, edge, viewport, states)
    }
  }

  private drawEdge(
    ctx: CanvasRenderingContext2D,
    from: LayoutNode<TextBlock>,
    to: LayoutNode<TextBlock>,
    edge: BlockEdge,
    _viewport: ViewportTransform,
    states?: EdgeStatePool,
  ): void {
    const style = this.styles[edge.edge_type]
    if (!style) return

    // Per-edge interpolated state — optional. When the caller passes
    // an EdgeStatePool, we read animated opacity + thickness from
    // there; without it, edges render at full opacity using the
    // static type-defined lineWidth.
    const state = states?.get(edge.edge_id)
    const opacity = state?.opacity.value ?? 1
    if (opacity <= 0.001) return
    const thickness = state?.thickness.value ?? style.lineWidth

    const fromX = (from.posX.value ?? 0) + (from.width.value ?? 0) / 2
    const fromY = (from.posY.value ?? 0) + (from.height.value ?? 0) / 2
    const toX = (to.posX.value ?? 0) + (to.width.value ?? 0) / 2
    const toY = (to.posY.value ?? 0) + (to.height.value ?? 0) / 2

    // Bezier control points: pull horizontally toward the midpoint
    // so the curve has shape even on near-horizontal connections.
    const dx = toX - fromX
    const ctrlOffset = Math.max(40, Math.abs(dx) * 0.4)
    const cp1x = fromX + ctrlOffset
    const cp1y = fromY
    const cp2x = toX - ctrlOffset
    const cp2y = toY

    ctx.save()
    ctx.globalAlpha = opacity
    ctx.strokeStyle = style.stroke
    ctx.lineWidth = thickness
    if (style.lineDash) ctx.setLineDash(style.lineDash)
    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toX, toY)
    ctx.stroke()
    if (style.arrowSize) {
      this.drawArrowhead(ctx, cp2x, cp2y, toX, toY, style)
    }
    ctx.restore()
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    style: EdgeRenderStyle,
  ): void {
    const size = style.arrowSize ?? 8
    const angle = Math.atan2(toY - fromY, toX - fromX)
    const x1 = toX - size * Math.cos(angle - Math.PI / 6)
    const y1 = toY - size * Math.sin(angle - Math.PI / 6)
    const x2 = toX - size * Math.cos(angle + Math.PI / 6)
    const y2 = toY - size * Math.sin(angle + Math.PI / 6)
    ctx.fillStyle = style.stroke
    ctx.beginPath()
    ctx.moveTo(toX, toY)
    ctx.lineTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.closePath()
    ctx.fill()
  }
}
