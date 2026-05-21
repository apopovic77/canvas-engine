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
  /** Short slice of the text — first ~100 chars, plain. Full text is
   *  fetched by the DOM overlay layer from the CRDT, not held here. */
  text_preview: string
  char_count: number
  /** Slug of the heading that introduces this block, or null for
   *  pre-heading blocks. Used by section-grouping layouters. */
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
 * a stable id within the session.
 */
export function textBlockId(block: TextBlock): string {
  return block.block_id ?? `paragraph:${block.paragraph_index}`
}

/**
 * Edge between two TextBlocks. Mirrors `block_edges` on the server
 * (Content's Phase 4.1/4.2 — BlockEdge SQLAlchemy model + REST
 * endpoints, 5 edge_types). The canvas-side renders these as Bezier
 * connections; see EdgeRenderer.
 */
export type BlockEdgeType =
  | 'responds_to'
  | 'contradicts'
  | 'supports'
  | 'summarizes'
  | 'needs_review'
  | 'belongs_to'

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
