/**
 * TextBlock — collaborative-text-document domain entity for the canvas
 * engine. Parallel to Product (the Retail/Catalog domain that the
 * engine was originally built for), but for documents where each
 * paragraph is a positioned card on a 2D canvas.
 *
 * Mirrors the server-side fields that `content-app` writes into the
 * paragraph-attrs of its CRDT doc:
 *
 *   - block_id, block_type, author_id, author_name, author_color
 *     → set by ParagraphWithAuthor V2.4 on every paragraph
 *
 *   - canvas_meta (x, y, width, height, collapsed, group_id)
 *     → planned per Codex' MVP cut in Post #777 Z 365-404; not yet
 *       on the server. When it lands, this struct receives it.
 *
 *   - text_preview / char_count / paragraph_index
 *     → already exposed by the field_map endpoint; useful for the
 *       canvas-side without round-tripping the editor's CRDT.
 *
 * The engine treats this as opaque T inside LayoutNode<TextBlock>.
 * Rendering of the TEXT itself is intentionally NOT this struct's
 * job — that lives in a DOM overlay layer (see EdgeRenderer.ts head
 * comment for the Heptabase/Excalidraw split rationale). This struct
 * carries only what the layouter and the edge-renderer need to know.
 *
 * Phase-5a-prep status: structural skeleton, not wired into a runtime
 * call site yet. Lands real once `canvas_meta` exists server-side and
 * the content-app routes a `<CanvasView>` mode toggle to the engine.
 */

export type BlockType =
  | 'doc_content'
  | 'chat_response'
  | 'annotation'
  | 'question'
  | 'synthesis'
  | 'system_note'

export interface CanvasMeta {
  x: number
  y: number
  width: number
  height: number
  collapsed?: boolean
  group_id?: string | null
}

export interface TextBlockAuthor {
  id: string
  name: string
  /** Pre-computed HSL color from server (deterministic per author_id). */
  color: string
}

export interface TextBlock {
  /** UUID assigned by the server on first commit. May be null until
   *  lazy-on-write stamps it; canvas-side fallback uses paragraph_index
   *  as transient identity. */
  block_id: string | null
  /** Position index in the linear doc — stable across CRDT splits as
   *  long as no paragraphs are inserted before it. Use as fallback id
   *  when block_id is null. */
  paragraph_index: number
  block_type: BlockType
  author: TextBlockAuthor
  /** Short slice of the text — first ~100 chars, plain. Lives here
   *  (rather than only in the CRDT / DOM overlay) so the canvas can
   *  render search-results, hover-tooltips, and small preview cards
   *  WITHOUT triggering a CRDT round-trip per block. The DOM overlay
   *  still owns the full editable text — this is a fast path for
   *  canvas-side ephemeral UI. */
  text_preview: string
  char_count: number
  /** Slug of the heading that introduces this block, or null for
   *  pre-heading blocks. Format matches `field_map`'s `section` nodes
   *  (`section:<heading-slug>`), so canvas-side grouping can join
   *  directly against the field_map response without a translation
   *  step. Used by section-grouping layouters. */
  in_section_id: string | null
  /** Position + size on the canvas. Null when the doc has not yet
   *  received canvas-meta from the server — the layouter is expected
   *  to assign a default position in that case (initial layout pass). */
  canvas_meta: CanvasMeta | null
}

/**
 * Stable identity helper for use with `LayoutEngine.sync(items, idOf)`.
 * Prefer the server-assigned block_id; fall back to a paragraph_index-
 * derived key so a brand-new paragraph (not yet committed) still has
 * a key within the session.
 *
 * The fallback key uses `_paragraph_<idx>` instead of `paragraph:<idx>`
 * — the colon would conflict with CSS pseudo-class syntax in the DOM
 * overlay's `[data-block-id="..."]` selectors, and a leading underscore
 * makes the transient nature visually obvious next to UUID-shaped real
 * block_ids.
 *
 * IMPORTANT: the fallback identity is only stable for the lifetime of
 * the session AND only until a paragraph is inserted in front of this
 * one (which shifts every following paragraph_index). Treat fallback
 * keys as ephemeral — once the server stamps a real block_id, swap to
 * it on the next sync tick (LayoutEngine's pool will rebuild the
 * affected nodes, which is acceptable since fallback-keyed nodes have
 * not yet held canvas_meta from the server).
 */
export function textBlockId(block: TextBlock): string {
  return block.block_id ?? `_paragraph_${block.paragraph_index}`
}

/**
 * Edge between two TextBlocks. Mirrors `block_edges` on the server
 * (Content's Phase 4.1/4.2 — BlockEdge SQLAlchemy model + REST
 * endpoints). Five edge_types are authoritative per Server-Spec
 * Post #795 + the live CHECK constraint:
 *
 *   edge_type IN ('replies_to', 'contradicts', 'extends',
 *                 'references', 'synthesizes')
 *
 * The canvas-side renders these as Bezier connections; see
 * EdgeRenderer.
 *
 * NOTE: this set differs intentionally from the brainstorm list in
 * Post #777 Z 376-381 (`responds_to/supports/summarizes/needs_review/
 * belongs_to`). That was Codex' MVP brainstorm; the server-side
 * vocabulary settled differently during Phase 4 implementation.
 * Always mirror the server CHECK constraint here.
 */
export type BlockEdgeType =
  | 'replies_to'
  | 'contradicts'
  | 'extends'
  | 'references'
  | 'synthesizes'

export interface BlockEdge {
  edge_id: string
  from_block_id: string
  to_block_id: string
  edge_type: BlockEdgeType
  author_id: string
  created_at: string
  /** Optional human-written label on the edge (e.g. "siehe Z 405"). */
  label?: string | null
}
