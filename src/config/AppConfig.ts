export interface CanvasEngineMediaConfig {
  useTrimmedImages: boolean;
}

export interface CanvasEngineConfig {
  /** Base URL for direct Storage API requests. Empty means same origin. */
  storageApiUrl: string;
  /** Endpoint that accepts the legacy `id` media query. Relative URLs are same-origin. */
  mediaProxyUrl: string;
  media: CanvasEngineMediaConfig;
}

export type CanvasEngineConfigInput = Partial<
  Omit<CanvasEngineConfig, 'media'>
> & {
  media?: Partial<CanvasEngineMediaConfig>;
};

const DEFAULT_CANVAS_ENGINE_CONFIG: CanvasEngineConfig = {
  storageApiUrl: '',
  mediaProxyUrl: '/proxy.php',
  media: {
    useTrimmedImages: false,
  },
};

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/**
 * Mutable compatibility object. Prefer configureCanvasEngine() over direct writes.
 * Its reference stays stable so existing internal and deep-import consumers keep working.
 */
export const AppConfig: CanvasEngineConfig = {
  ...DEFAULT_CANVAS_ENGINE_CONFIG,
  media: { ...DEFAULT_CANVAS_ENGINE_CONFIG.media },
};

export const APP_CONFIG = AppConfig;

export function configureCanvasEngine(
  input: CanvasEngineConfigInput,
): Readonly<CanvasEngineConfig> {
  if (input.storageApiUrl !== undefined) {
    AppConfig.storageApiUrl = normalizeUrl(input.storageApiUrl);
  }
  if (input.mediaProxyUrl !== undefined) {
    AppConfig.mediaProxyUrl = normalizeUrl(input.mediaProxyUrl) || '/proxy.php';
  }
  if (input.media?.useTrimmedImages !== undefined) {
    AppConfig.media.useTrimmedImages = input.media.useTrimmedImages;
  }

  return getCanvasEngineConfig();
}

export function getCanvasEngineConfig(): Readonly<CanvasEngineConfig> {
  return {
    ...AppConfig,
    media: { ...AppConfig.media },
  };
}

export function resetCanvasEngineConfig(): Readonly<CanvasEngineConfig> {
  AppConfig.storageApiUrl = DEFAULT_CANVAS_ENGINE_CONFIG.storageApiUrl;
  AppConfig.mediaProxyUrl = DEFAULT_CANVAS_ENGINE_CONFIG.mediaProxyUrl;
  AppConfig.media = { ...DEFAULT_CANVAS_ENGINE_CONFIG.media };
  return getCanvasEngineConfig();
}
