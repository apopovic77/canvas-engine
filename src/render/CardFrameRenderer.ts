import type { LayoutNode } from '../layout/LayoutNode'
import type { TextBlock } from '../domain/TextBlock'
import type { CardFrameStatePool } from './CardFrameState'
import { textBlockId } from '../domain/TextBlock'

/**
 * CardFrameRenderer — Canvas2D pass that draws the *frame* of each
 * TextBlock card: rounded rect outline, author-color stripe down the
 * left edge, selection/hover outlines, and the Counter-Salience focus
 * glow. The card's TEXT is rendered by the DOM overlay layer (see
 * Heptabase/Excalidraw split in src/domain/README.md).
 *
 * All visual state comes from two sources:
 *   - LayoutNode<TextBlock>: posX/posY/width/height (animated by
 *     FreeCanvasLayouter via the engine's existing
 *     InterpolatedProperty pool).
 *   - CardFrameState (from CardFrameStatePool): selectionStrength,
 *     hoverStrength, focusGlow — added in Phase 5a-prep so per-card
 *     interactive state lives on the same animation system.
 *
 * Render order in the CanvasRenderer frame (planned wiring):
 *   1. EdgeRenderer.render() — edges first, below cards
 *   2. CardFrameRenderer.render() — frames + stripes + glows
 *   3. (DOM overlay paints text on top, outside the canvas pass)
 *
 * Skeleton scope: minimum-viable frame + stripe + selection cue.
 * Full styling (per-block_type variant frames, drop shadows under
 * focused cards, hover-elevation, drag-shadow) is post-skeleton.
 */

export interface CardFrameRendererOptions {
  /** Rounded-rect corner radius in canvas units. */
  cornerRadius?: number
  /** Width of the author-color stripe on the left edge. */
  authorStripeWidth?: number
  /** Frame stroke at rest (alpha is multiplied by node opacity). */
  frameStroke?: string
  /** Card fill at rest. Use a translucent value to let edges show. */
  frameFill?: string
  /** Selection outline color (alpha modulated by selectionStrength). */
  selectionStroke?: string
  /** Focus-glow color (alpha modulated by focusGlow, sine-pulsed for
   *  tension blocks). */
  focusGlowStroke?: string
}

const DEFAULTS: Required<CardFrameRendererOptions> = {
  cornerRadius: 10,
  authorStripeWidth: 4,
  frameStroke: 'rgba(40, 40, 60, 0.35)',
  frameFill: 'rgba(255, 255, 255, 0.92)',
  selectionStroke: 'rgba(170, 59, 255, 0.85)',
  focusGlowStroke: 'rgba(255, 140, 66, 0.9)',
}

export class CardFrameRenderer {
  private readonly opts: Required<CardFrameRendererOptions>

  constructor(opts: CardFrameRendererOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  render(
    ctx: CanvasRenderingContext2D,
    nodes: LayoutNode<TextBlock>[],
    states: CardFrameStatePool,
  ): void {
    for (const node of nodes) {
      const x = node.posX.value ?? 0
      const y = node.posY.value ?? 0
      const w = node.width.value ?? 0
      const h = node.height.value ?? 0
      if (w <= 0 || h <= 0) continue

      const baseAlpha = node.opacity.value ?? 1
      if (baseAlpha <= 0.001) continue

      const id = textBlockId(node.data)
      const state = states.get(id)

      ctx.save()
      ctx.globalAlpha = baseAlpha

      this.drawRoundedRect(ctx, x, y, w, h, this.opts.cornerRadius)
      ctx.fillStyle = this.opts.frameFill
      ctx.fill()
      ctx.strokeStyle = this.opts.frameStroke
      ctx.lineWidth = 1
      ctx.stroke()

      // Author-color stripe on the left edge.
      const stripeColor = node.data.author.color
      if (stripeColor) {
        ctx.fillStyle = stripeColor
        this.drawRoundedRect(
          ctx,
          x,
          y,
          this.opts.authorStripeWidth,
          h,
          this.opts.cornerRadius / 2,
        )
        ctx.fill()
      }

      // Focus glow (Counter-Salience cue, sine-pulsed if active).
      const glow = state.focusGlow.value ?? 0
      if (glow > 0.01) {
        ctx.save()
        ctx.globalAlpha = baseAlpha * glow
        ctx.strokeStyle = this.opts.focusGlowStroke
        ctx.lineWidth = 3
        this.drawRoundedRect(
          ctx,
          x - 2,
          y - 2,
          w + 4,
          h + 4,
          this.opts.cornerRadius + 2,
        )
        ctx.stroke()
        ctx.restore()
      }

      // Selection outline.
      const sel = state.selectionStrength.value ?? 0
      if (sel > 0.01) {
        ctx.save()
        ctx.globalAlpha = baseAlpha * sel
        ctx.strokeStyle = this.opts.selectionStroke
        ctx.lineWidth = 2
        this.drawRoundedRect(
          ctx,
          x - 1,
          y - 1,
          w + 2,
          h + 2,
          this.opts.cornerRadius + 1,
        )
        ctx.stroke()
        ctx.restore()
      }

      // Hover cue — subtle, just a fill brightness bump.
      const hover = state.hoverStrength.value ?? 0
      if (hover > 0.01) {
        ctx.save()
        ctx.globalAlpha = baseAlpha * hover * 0.15
        ctx.fillStyle = '#ffffff'
        this.drawRoundedRect(ctx, x, y, w, h, this.opts.cornerRadius)
        ctx.fill()
        ctx.restore()
      }

      ctx.restore()
    }
  }

  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + w, y, x + w, y + h, radius)
    ctx.arcTo(x + w, y + h, x, y + h, radius)
    ctx.arcTo(x, y + h, x, y, radius)
    ctx.arcTo(x, y, x + w, y, radius)
    ctx.closePath()
  }
}
