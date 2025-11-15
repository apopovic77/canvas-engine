export const ScaleConfig = {
  minScale: 0.5,
  maxScale: 2,
  enabled: false, // Scaling disabled in template
  weight: {
    enabled: false,
    clampMin: 0.8,
    clampMax: 1.4,
  },
};

// Named export for compatibility
export const SCALE_CONFIG = ScaleConfig;

// Helper function to resolve scale enabled state
export function resolveScaleEnabled(enabled: boolean | 'auto', isHeroMode: boolean): boolean {
  if (enabled === 'auto') {
    return !isHeroMode; // Auto mode: enabled in pivot, disabled in hero
  }
  return enabled;
}
