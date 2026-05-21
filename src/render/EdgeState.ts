import { InterpolatedProperty } from 'arkturian-typescript-utils'

/**
 * EdgeState — persistent visual state per BlockEdge, parallel to the
 * LayoutNode pool that LayoutEngine maintains for nodes.
 *
 * Each EdgeState is created ONCE per edge_id and reused. Its
 * InterpolatedProperty instances persist across sync() ticks so that
 * appearing / disappearing / type-changing edges morph smoothly
 * instead of popping.
 *
 * Animatable properties in this skeleton:
 *   - opacity  (0..1): fade-in for new edges, fade-out for removed,
 *     and lower-opacity for "deprioritized" edges (e.g. when the
 *     user is dragging one card and only that card's edges should
 *     stay sharp).
 *   - thickness: maps to ctx.lineWidth at render time. Stays at the
 *     style default unless the caller animates a weight emphasis.
 *
 * Color stays static per edge_type (from DEFAULT_EDGE_STYLES dict in
 * EdgeRenderer) because cross-type morphs (responds_to -> contradicts)
 * are rare in practice and a proper color morph wants 4 number-channels
 * (r/g/b/a) or a Lerpable Color class. Either is a follow-up patch
 * once we have a real product use case for type-morphs.
 */
export class EdgeState {
  readonly id: string
  readonly opacity: InterpolatedProperty<number>
  readonly thickness: InterpolatedProperty<number>
  isNew = true

  constructor(id: string, initialOpacity = 0, initialThickness = 1.5) {
    this.id = id
    this.opacity = new InterpolatedProperty<number>(
      'opacity',
      initialOpacity,
      initialOpacity,
      0.35,
    )
    this.thickness = new InterpolatedProperty<number>(
      'thickness',
      initialThickness,
      initialThickness,
      0.25,
    )
  }

  /**
   * Set the target opacity. On a brand-new edge, also primes opacity
   * to 0 immediately so the first frame after sync animates from
   * invisible to target rather than popping in.
   */
  fadeTo(target: number): void {
    if (this.isNew) {
      this.opacity.setImmediate(0)
      this.isNew = false
    }
    this.opacity.targetValue = target
  }

  setThickness(target: number): void {
    this.thickness.targetValue = target
  }

  /**
   * Convenience for callers that want to flag an edge as "removed but
   * still on screen". The pool keeps the EdgeState around until the
   * fade animation completes; the caller's next sync() drops it.
   */
  beginFadeOut(): void {
    this.opacity.targetValue = 0
  }
}

/**
 * EdgeStatePool — analog to LayoutEngine for edges. Pools EdgeState
 * instances by edge_id so InterpolatedProperty state survives across
 * sync() ticks.
 *
 * Usage pattern (mirrors LayoutEngine.sync + .all):
 *
 *   const pool = new EdgeStatePool()
 *   pool.sync(edges, (e) => e.edge_id, defaultOpacity)
 *   for (const edge of edges) {
 *     const state = pool.get(edge.edge_id)
 *     // ...use state.opacity.value, state.thickness.value at render
 *   }
 *
 * Optional `keepUntilFaded` mode: instead of removing dropped edges
 * immediately, the pool can be told to keep them alive until their
 * opacity has interpolated to ~0. Out-of-scope for this skeleton —
 * caller can implement it by tracking dropped ids and only removing
 * after `state.opacity.value < 0.01`.
 */
export class EdgeStatePool {
  private states = new Map<string, EdgeState>()

  sync<E>(edges: E[], idOf: (e: E) => string, targetOpacity = 1): void {
    const keep = new Set<string>()
    for (const e of edges) {
      const id = idOf(e)
      keep.add(id)
      let state = this.states.get(id)
      if (!state) {
        state = new EdgeState(id)
        this.states.set(id, state)
      }
      state.fadeTo(targetOpacity)
    }
    for (const id of Array.from(this.states.keys())) {
      if (!keep.has(id)) this.states.delete(id)
    }
  }

  get(id: string): EdgeState | undefined {
    return this.states.get(id)
  }

  all(): EdgeState[] {
    return Array.from(this.states.values())
  }
}
