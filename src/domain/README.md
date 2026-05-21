# Text-Block Domain (Phase 5a Prep)

Skeleton for the second domain on the canvas engine: collaborative-text
documents where each paragraph is a positioned card on a 2D canvas.

The original domain is **Product** (Retail/Catalog visualisation —
`PivotLayouter`, `HeroLayouter`, `PosterLayouter`, etc., operating on
`ProductAttribute` + `PivotDimension`). This new domain reuses the
engine's `LayoutNode<T>` pool, `InterpolatedProperty`-backed
animations, and `ViewportTransform` zoom/pan — none of that needs to
change.

## Heptabase / Excalidraw split

The text inside each card is **NOT** rendered by the canvas pixel
context. Canvas2D `fillText` would lose:

- Browser-native text-selection
- Screen-Reader / A11y tree
- Copy-paste of formatted text
- Hyphenation, line-breaking, bidi
- OpenType features and font-rendering quality

All of those are already free in the doc-mode editor (TipTap +
ProseMirror). Throwing them away to render text in the canvas would
be a regression.

So:

- **Canvas-side (this engine)** owns the *frames*: card outlines,
  author-color stripes, Bezier edges between cards, selection +
  hover affordances. All pixel-rendered via `CanvasRenderer` and
  `EdgeRenderer`.
- **DOM-overlay (lives in `content-app`)** owns the *text*: a layer
  of absolutely-positioned DOM nodes sync'd to the canvas viewport
  transform. Each card's text content renders there as normal HTML
  / TipTap NodeView. `pointer-events: auto` only inside the card
  rect so edges stay pickable in the gaps.

The viewport transform is the shared coordinate system. As the user
pans/zooms the canvas, the DOM overlay applies the inverse-or-equiv
transform to its children so the text stays glued to the canvas
positions. Heptabase, Excalidraw, and Logseq-Canvas all use this
pattern; it's the proven path.

## Files in this skeleton

- `domain/TextBlock.ts` — entity types (`TextBlock`, `BlockEdge`,
  `CanvasMeta`, `BlockType`, `BlockEdgeType`). Mirrors what the
  server stamps on paragraph-attrs (`block_id`, `block_type`,
  `author_*`) plus the planned `canvas_meta` extension and Content's
  Phase 4.1/4.2 `BlockEdge` model.
- `layout/FreeCanvasLayouter.ts` — first ILayouter<TextBlock>. If a
  block has `canvas_meta`, snap to it; otherwise stagger as initial
  layout. Matches Codex' MVP cut in Post #777 Z 365-404 (Cards →
  Edges → Auto-Layout, in that order). Layout positions flow through
  `LayoutNode<TextBlock>`'s built-in InterpolatedProperty pool so card
  movement animates by default.
- `render/EdgeRenderer.ts` — Bezier connections with per-edge-type
  styling (default styles for the six `block_edges` edge_types from
  Phase 4). Reads animated opacity + thickness from an optional
  `EdgeStatePool` so new edges fade in, removed edges fade out, and
  emphasis ticks morph instead of popping.
- `render/EdgeState.ts` — per-edge `EdgeState` carrying `opacity` and
  `thickness` as `InterpolatedProperty<number>`, plus an `EdgeStatePool`
  that pools them by `edge_id` (parallel to `LayoutEngine`'s LayoutNode
  pool). Color stays static per edge_type — proper color morph is a
  follow-up (4 number-channels or a `Lerpable` Color class).
- `render/CardFrameRenderer.ts` — Canvas2D pass for card frames,
  author-color stripes, selection / hover outlines, and the
  Counter-Salience focus glow. Reads card spatial state from
  `LayoutNode<TextBlock>` (already animated by the layouter) and
  interactive state from a `CardFrameStatePool`.
- `render/CardFrameState.ts` — per-card `selectionStrength`,
  `hoverStrength`, `focusGlow` as `InterpolatedProperty<number>` in
  0..1. `focusGlow` uses the InterpolatedProperty library's built-in
  sine animation mode for a soft pulse on tension-flagged cards —
  no parallel rAF timer needed.

### Everything-on-InterpolatedProperty pattern

All animatable visual state in this domain — layout positions, edge
opacity / thickness, card selection / hover / glow — runs through
`InterpolatedProperty<number>` instances owned by persistent pools
(`LayoutEngine`, `EdgeStatePool`, `CardFrameStatePool`). Pools key by
the same stable id (`block_id` or `edge_id`) so state survives across
sync ticks and animations resume from the current frame instead of
restarting. This matches the Product-domain Canvas's animation model
exactly — same engine philosophy, different domain.

## What this skeleton is NOT

- Not yet wired into `CanvasRenderer.render()`. The render loop
  still only knows about `Product`. Integration lands when
  `content-app` ships a `<CanvasView>` mode toggle and the engine
  receives its first real `block_edges` payload from the server.
- Not yet validated against a live `canvas_meta` payload — that
  schema does not exist server-side yet (Codex' MVP sequence puts
  it after the Cards prototype).
- Not yet generic over `<T>` for layout strategies. `FreeCanvas`
  only handles `TextBlock` because the only thing it reads is
  `block.canvas_meta`. Later layouters that need richer access to
  text-domain concepts (section grouping, author clustering) stay
  in this domain.
- Not a replacement for the Product domain. The two domains coexist
  on the same engine — picking which set of layouters to use is the
  caller's choice.

## Phase ordering (per Post #777 op-log seq 2181)

This is **Phase 5a prep**, parallel to (not blocking) Phases 2 / 2.5
in `content-app` which add the `block_id`/`block_type` paragraph
attrs and per-paragraph SalienceOverlay cues. When Phase 5a goes
runtime, it consumes those server-stamped attrs and the in-progress
`canvas_meta` extension.

## Next steps (not part of this skeleton)

1. Server: `canvas_meta` field on the paragraph paragraph-attrs
   (Content's call — Codex' MVP cut puts it as patch after Cards
   prototype validates).
2. Content-app: `<CanvasView>` mode toggle in `PostEditor.tsx` that
   mounts a Canvas-React-Tree fed by this engine. Mode toggle
   measures DOM card boundboxes and hands them to the engine as
   initial positions (View-Transition pattern, not FLIP — see PR #1
   discussion).
3. Engine: wire `EdgeRenderer` + `CardFrameRenderer` into
   `CanvasRenderer.render()` as additional passes. Add a DOM-overlay
   -bridge React hook (`useDomOverlay`) that subscribes to
   `ViewportTransform` updates and computes the inverse transform
   for the overlay layer.
4. Edge color morph between edge_types (responds_to →
   contradicts). Either 4 `InterpolatedProperty<number>` for r/g/b/a
   on `EdgeState`, or a `Lerpable` Color class fed into a single
   `InterpolatedProperty<Color>`. Decide once a real product use
   case demands it.
5. Per-block-type frame variants in `CardFrameRenderer`
   (sticky-note silhouette for `annotation`, pro/contra split for
   `decision_point`). Wired to the same `data-block-type` attribute
   that the DOM overlay reads.
