import { useRef } from 'react';

/**
 * Configuration for high-resolution image loading
 */
export interface HighResImageConfig {
  /** Width in pixels */
  width?: number;
  /** Image format (jpg, png, webp, etc.) */
  format?: string;
  /** Quality (1-100) */
  quality?: number;
}

/**
 * Return type of useImageCache hook
 */
interface UseImageCacheReturn {
  /**
   * Get low-resolution (thumbnail) image from cache
   */
  getLowResImage: (imageUrl: string) => HTMLImageElement | null;

  /**
   * Get high-resolution image from cache
   */
  getHighResImage: (imageUrl: string) => HTMLImageElement | null;

  /**
   * Get image from cache (auto-selects high-res or low-res based on useHighRes flag)
   */
  getImage: (imageUrl: string, useHighRes: boolean) => HTMLImageElement | null;

  /**
   * Load and cache a high-resolution version of an image
   * Returns the loaded image or null if loading failed
   */
  loadHighResImage: (
    imageUrl: string,
    config?: HighResImageConfig
  ) => Promise<HTMLImageElement | null>;

  /**
   * Add a low-resolution image to the cache
   * Useful when pre-loading from IndexedDB or other sources
   */
  setLowResImage: (imageUrl: string, image: HTMLImageElement) => void;

  /**
   * Clear all cached images (both low-res and high-res)
   */
  clearCache: () => void;

  /**
   * Get cache statistics
   */
  getCacheStats: () => {
    lowResCount: number;
    highResCount: number;
  };
}

const DEFAULT_HIGH_RES_CONFIG: HighResImageConfig = {
  width: 800,
  format: 'jpg',
  quality: 90,
};

/**
 * React hook for managing dual-resolution image caching in canvas applications
 *
 * Provides separate caches for low-resolution (thumbnails) and high-resolution images.
 * Useful for LOD (Level of Detail) systems where you want to swap between image qualities
 * based on zoom level.
 *
 * @example
 * ```tsx
 * const { getImage, loadHighResImage, setLowResImage } = useImageCache();
 *
 * // Pre-load low-res from IndexedDB cache
 * const lowResImg = await imageCache.fetchAndCache(url);
 * setLowResImage(url, lowResImg);
 *
 * // In render loop:
 * const useHighRes = viewport.scale > 1.5;
 * if (useHighRes) {
 *   loadHighResImage(url); // Lazy load high-res
 * }
 * const img = getImage(url, useHighRes);
 * ```
 */
export function useImageCache(): UseImageCacheReturn {
  const lowResCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const highResCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const getLowResImage = (imageUrl: string): HTMLImageElement | null => {
    return lowResCache.current.get(imageUrl) || null;
  };

  const getHighResImage = (imageUrl: string): HTMLImageElement | null => {
    return highResCache.current.get(imageUrl) || null;
  };

  const getImage = (imageUrl: string, useHighRes: boolean): HTMLImageElement | null => {
    if (useHighRes && highResCache.current.has(imageUrl)) {
      return highResCache.current.get(imageUrl) || null;
    }
    return lowResCache.current.get(imageUrl) || null;
  };

  const loadHighResImage = async (
    imageUrl: string,
    config: HighResImageConfig = DEFAULT_HIGH_RES_CONFIG
  ): Promise<HTMLImageElement | null> => {
    // Check if already cached
    if (highResCache.current.has(imageUrl)) {
      return highResCache.current.get(imageUrl) || null;
    }

    try {
      // Build high-res URL with query parameters
      const urlObj = new URL(imageUrl);
      if (config.width !== undefined) {
        urlObj.searchParams.set('width', String(config.width));
      }
      if (config.format) {
        urlObj.searchParams.set('format', config.format);
      }
      if (config.quality !== undefined) {
        urlObj.searchParams.set('quality', String(config.quality));
      }
      const highResUrl = urlObj.toString();

      const response = await fetch(highResUrl);

      if (!response.ok) {
        console.warn(`[ImageCache] High-res fetch failed: ${response.status}`);
        return null;
      }

      const blob = await response.blob();

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          highResCache.current.set(imageUrl, img);
          resolve(img);
        };
        img.onerror = () => {
          console.warn(`[ImageCache] Failed to load high-res image: ${imageUrl}`);
          resolve(null);
        };
        img.src = URL.createObjectURL(blob);
      });
    } catch (error) {
      console.error('[ImageCache] High-res fetch error:', error);
      return null;
    }
  };

  const setLowResImage = (imageUrl: string, image: HTMLImageElement) => {
    lowResCache.current.set(imageUrl, image);
  };

  const clearCache = () => {
    lowResCache.current.clear();
    highResCache.current.clear();
  };

  const getCacheStats = () => {
    return {
      lowResCount: lowResCache.current.size,
      highResCount: highResCache.current.size,
    };
  };

  return {
    getLowResImage,
    getHighResImage,
    getImage,
    loadHighResImage,
    setLowResImage,
    clearCache,
    getCacheStats,
  };
}
