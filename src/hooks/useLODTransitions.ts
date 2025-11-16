import { useRef } from 'react';

/**
 * Level of Detail mode types
 */
export type LODMode = 'detail' | 'image-only';

/**
 * Transition state for a single LOD item
 */
export interface LODTransitionState {
  imageHeightPercent: number; // 0.0 to 1.0 (interpolated)
  textOpacity: number; // 0.0 to 1.0 (interpolated)
  targetMode: LODMode;
}

/**
 * Configuration options for LOD transitions
 */
interface UseLODTransitionsOptions {
  /**
   * Screen-space pixel threshold for switching to detail mode
   * @default 80
   */
  cardLODThreshold?: number;

  /**
   * Speed of transition interpolation (0.0 to 1.0)
   * Higher = faster transitions
   * @default 0.15
   */
  transitionSpeed?: number;
}

/**
 * Return type of useLODTransitions hook
 */
interface UseLODTransitionsReturn {
  /**
   * Get current LOD state for an item by ID
   */
  getLODState: (itemId: string) => LODTransitionState | null;

  /**
   * Update and interpolate LOD state based on screen-space size
   * Returns the updated state
   */
  updateLODState: (
    itemId: string,
    screenCardWidth: number
  ) => LODTransitionState;

  /**
   * Clear all LOD state (useful on unmount or data refresh)
   */
  clearLODState: () => void;
}

const DEFAULT_CARD_LOD_THRESHOLD = 80; // pixels
const DEFAULT_TRANSITION_SPEED = 0.15;

/**
 * React hook for managing smooth LOD (Level of Detail) transitions in canvas applications
 *
 * Provides smooth interpolation between two LOD modes:
 * - "detail": Full content with text (imageHeight=45%, textOpacity=100%)
 * - "image-only": Image only (imageHeight=100%, textOpacity=0%)
 *
 * @example
 * ```tsx
 * const { updateLODState } = useLODTransitions({ cardLODThreshold: 100 });
 *
 * // In render loop:
 * events.forEach(event => {
 *   const screenWidth = event.width * viewport.scale;
 *   const lodState = updateLODState(event.id, screenWidth);
 *
 *   // Use interpolated values for smooth transitions
 *   const imageHeight = event.height * lodState.imageHeightPercent;
 *   ctx.globalAlpha = lodState.textOpacity;
 * });
 * ```
 */
export function useLODTransitions({
  cardLODThreshold = DEFAULT_CARD_LOD_THRESHOLD,
  transitionSpeed = DEFAULT_TRANSITION_SPEED,
}: UseLODTransitionsOptions = {}): UseLODTransitionsReturn {
  const lodTransitionState = useRef<Map<string, LODTransitionState>>(new Map());

  const getLODState = (itemId: string): LODTransitionState | null => {
    return lodTransitionState.current.get(itemId) || null;
  };

  const updateLODState = (
    itemId: string,
    screenCardWidth: number
  ): LODTransitionState => {
    // Calculate target mode based on screen-space size
    const targetMode: LODMode = screenCardWidth >= cardLODThreshold ? 'detail' : 'image-only';

    // Initialize or update LOD transition state
    if (!lodTransitionState.current.has(itemId)) {
      const initialState: LODTransitionState = {
        imageHeightPercent: targetMode === 'detail' ? 0.45 : 1.0,
        textOpacity: targetMode === 'detail' ? 1 : 0,
        targetMode,
      };
      lodTransitionState.current.set(itemId, initialState);
      return initialState;
    }

    const state = lodTransitionState.current.get(itemId)!;

    // Update target mode if changed
    if (state.targetMode !== targetMode) {
      state.targetMode = targetMode;
    }

    // Interpolate towards target values (smooth transition)
    const targetImageHeight = targetMode === 'detail' ? 0.45 : 1.0;
    const targetTextOpacity = targetMode === 'detail' ? 1.0 : 0.0;

    state.imageHeightPercent += (targetImageHeight - state.imageHeightPercent) * transitionSpeed;
    state.textOpacity += (targetTextOpacity - state.textOpacity) * transitionSpeed;

    return state;
  };

  const clearLODState = () => {
    lodTransitionState.current.clear();
  };

  return {
    getLODState,
    updateLODState,
    clearLODState,
  };
}
