import { Vector2 } from 'arkturian-typescript-utils'
import type { ILayouter } from './LayoutEngine'
import type { LayoutNode } from './LayoutNode'
import type { TextBlock } from '../domain/TextBlock'

/**
 * FreeCanvasLayouter — first Text-domain layouter, MVP cut.
 *
 * Per Codex' Post #777 MVP-sequence (Z 365-404): start with a simple
 * canvas-prototype that renders paragraphs as cards the user can drag
 * manually. Section-grouping, edge-based auto-layout, and richer modes
 * (ArgumentMap, Timeline, ChatStream) come later as separate ILayouter
 * implementations on the same TextBlock domain.
 *
 * Behavior:
 *   - If a block carries `canvas_meta` (server already has spatial
 *     metadata for it), trust it: snap the LayoutNode to that position
 *     and size immediately. User drag-to-position then writes back to
 *     canvas_meta via the editor's CRDT.
 *   - If a block has no `canvas_meta` (fresh paragraph, never placed),
 *     apply a deterministic initial layout: stagger vertically by
 *     paragraph_index so new paragraphs don't all pile on origin. The
 *     user can then drag them where they want; the next save persists.
 *
 * Sizing defaults to a doc-card-sized box (320×160). Real card sizing
 * is the DOM-overlay layer's job — the engine just reserves the rect.
 *
 * Phase-5a-prep status: skeleton, not wired into a runtime call site
 * yet. Designed to compile + slot into the existing LayoutEngine<T>
 * pool model without modification to engine internals.
 */

const DEFAULT_CARD_WIDTH = 320
const DEFAULT_CARD_HEIGHT = 160
const DEFAULT_STAGGER_X = 360
const DEFAULT_STAGGER_Y = 200

export interface FreeCanvasLayouterOptions {
  defaultCardWidth?: number
  defaultCardHeight?: number
  /** Horizontal stride between unplaced cards in the initial layout. */
  staggerX?: number
  /** Vertical stride between unplaced cards in the initial layout. */
  staggerY?: number
  /** How many cards per row before wrapping in the initial layout. */
  initialColumns?: number
}

export class FreeCanvasLayouter implements ILayouter<TextBlock> {
  private readonly defaultCardWidth: number
  private readonly defaultCardHeight: number
  private readonly staggerX: number
  private readonly staggerY: number
  private readonly initialColumns: number

  constructor(opts: FreeCanvasLayouterOptions = {}) {
    this.defaultCardWidth = opts.defaultCardWidth ?? DEFAULT_CARD_WIDTH
    this.defaultCardHeight = opts.defaultCardHeight ?? DEFAULT_CARD_HEIGHT
    this.staggerX = opts.staggerX ?? DEFAULT_STAGGER_X
    this.staggerY = opts.staggerY ?? DEFAULT_STAGGER_Y
    this.initialColumns = opts.initialColumns ?? 3
  }

  compute(
    nodes: LayoutNode<TextBlock>[],
    _view: { width: number; height: number },
  ): void {
    let unplacedIndex = 0
    for (const node of nodes) {
      const block = node.data
      if (block.canvas_meta) {
        node.setTargets(
          new Vector2(block.canvas_meta.x, block.canvas_meta.y),
          new Vector2(block.canvas_meta.width, block.canvas_meta.height),
        )
        continue
      }
      const col = unplacedIndex % this.initialColumns
      const row = Math.floor(unplacedIndex / this.initialColumns)
      node.setTargets(
        new Vector2(col * this.staggerX, row * this.staggerY),
        new Vector2(this.defaultCardWidth, this.defaultCardHeight),
      )
      unplacedIndex += 1
    }
  }
}
