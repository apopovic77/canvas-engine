import { InterpolatedProperty } from 'arkturian-typescript-utils'

/**
 * CardFrameState — persistent per-card UI state for TextBlock cards.
 *
 * The card's *spatial* state (posX/posY/width/height/opacity/scale)
 * already lives on its LayoutNode<TextBlock>, fed by FreeCanvasLayouter.
 * This class adds the *interactive* state that LayoutNode does not
 * carry: selection, hover, narrative focus, and a draft pulsing glow
 * for tension blocks (Counter-Salience visual cue in canvas mode).
 *
 * Keyed by the same id as LayoutNode (block_id, or paragraph_index
 * fallback). CardFrameStatePool mirrors LayoutEngine's pool pattern so
 * InterpolatedProperty state survives sync ticks.
 *
 * All properties are InterpolatedProperty<number> in the 0..1 range:
 *
 *   - selectionStrength: 0 = idle, 1 = focused selection. Drives
 *     selection-outline opacity and width.
 *   - hoverStrength: 0 = idle, 1 = hovered. Lighter cue than selection,
 *     fades faster (shorter duration).
 *   - focusGlow: 0 = idle, 1 = peaked. Counter-Salience marker for
 *     tension blocks. Use sine animation on this for a soft pulse:
 *
 *       state.focusGlow.enableSinAnimation({
 *         amplitude: 0.25, frequencyHz: 0.6,
 *       })
 *
 *     The InterpolatedProperty library has built-in sine mode for
 *     numeric properties; using it keeps the pulse on the same
 *     animation system as everything else instead of needing a
 *     parallel rAF timer.
 */
export class CardFrameState {
  readonly id: string
  readonly selectionStrength: InterpolatedProperty<number>
  readonly hoverStrength: InterpolatedProperty<number>
  readonly focusGlow: InterpolatedProperty<number>

  constructor(id: string) {
    this.id = id
    this.selectionStrength = new InterpolatedProperty<number>(
      'selectionStrength',
      0,
      0,
      0.2,
    )
    this.hoverStrength = new InterpolatedProperty<number>(
      'hoverStrength',
      0,
      0,
      0.12,
    )
    this.focusGlow = new InterpolatedProperty<number>(
      'focusGlow',
      0,
      0,
      0.45,
    )
  }

  setSelected(selected: boolean): void {
    this.selectionStrength.targetValue = selected ? 1 : 0
  }

  setHovered(hovered: boolean): void {
    this.hoverStrength.targetValue = hovered ? 1 : 0
  }

  /**
   * Enable / disable the Counter-Salience pulse on this card.
   * Driven by sine animation around a target value so we get a real
   * breathing effect without an external rAF loop.
   */
  setFocusPulse(active: boolean, peak = 0.7): void {
    if (active) {
      this.focusGlow.targetValue = peak
      this.focusGlow.enableSinAnimation({
        amplitude: peak * 0.35,
        frequencyHz: 0.6,
      })
    } else {
      this.focusGlow.disableSinAnimation()
      this.focusGlow.targetValue = 0
    }
  }
}

/**
 * CardFrameStatePool — keep CardFrameState alive across renders.
 * Mirror of LayoutEngine.sync/all but for the interactive layer.
 *
 * The id-set is expected to match the LayoutEngine's id-set; the
 * pool only allocates states lazily when get() asks for one, and
 * `gc()` drops states whose ids are no longer in the active set.
 */
export class CardFrameStatePool {
  private states = new Map<string, CardFrameState>()

  get(id: string): CardFrameState {
    let s = this.states.get(id)
    if (!s) {
      s = new CardFrameState(id)
      this.states.set(id, s)
    }
    return s
  }

  /** Drop states whose id is not in the given active set. */
  gc(activeIds: Iterable<string>): void {
    const keep = new Set(activeIds)
    for (const id of Array.from(this.states.keys())) {
      if (!keep.has(id)) this.states.delete(id)
    }
  }

  all(): CardFrameState[] {
    return Array.from(this.states.values())
  }
}
