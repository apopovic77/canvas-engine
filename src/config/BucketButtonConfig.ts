export const BucketButtonConfig = {
  width: 200,
  height: 60,
  fontSize: 18,
  cornerRadius: 8,
  widthExtension: 10,
  hover: {
    yOffset: -4,
    shadow: {
      color: 'rgba(0, 0, 0, 0.3)',
      blur: 20,
      offsetY: 8,
    },
  },
  imageOverlay: {
    opacityNormal: 0.4,
    opacityHover: 0.2,
  },
  gradient: {
    normal: {
      start: 'rgba(59, 130, 246, 0.9)',
      end: 'rgba(37, 99, 235, 0.9)',
    },
    hover: {
      start: 'rgba(96, 165, 250, 0.95)',
      end: 'rgba(59, 130, 246, 0.95)',
    },
  },
  font: {
    family: 'system-ui, -apple-system, sans-serif',
    color: '#ffffff',
    sizeNormal: 16,
    sizeHover: 18,
    weightNormal: '600',
    weightHover: '700',
    alignHorizontal: 'center' as 'left' | 'center' | 'right',
    alignVertical: 'center' as 'top' | 'center' | 'bottom',
    textTransform: 'none' as 'none' | 'uppercase' | 'lowercase' | 'capitalize',
  },
  spacing: {
    paddingTop: 12,
    paddingRight: 20,
    paddingBottom: 12,
    paddingLeft: 20,
  },
  fallbackImages: [] as number[],
};

// Named export for compatibility
export const BUCKET_BUTTON_CONFIG = BucketButtonConfig;
