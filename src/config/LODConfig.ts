export const LODConfig = {
  canvasWidth: 1920,
  canvasHeight: 1080,
  enabled: false, // LOD disabled in template
  scanInterval: 1000,
  processInterval: 50,
  highResolution: 1300,
  lowResolution: 300,
  transitionThresholdUp: 400,
  transitionThresholdDown: 300,
  highQuality: 85,
  lowQuality: 75,
};

// Named export for compatibility
export const LOD_CONFIG = LODConfig;
