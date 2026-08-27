/**
 * Media URL Builder
 * Handles construction of media URLs with trim parameter support
 */

import { APP_CONFIG } from '../config/AppConfig';

export interface MediaUrlOptions {
  storageId: number;
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  trim?: boolean;
}

/**
 * Build a media URL with all parameters including trim support
 */
export function buildMediaUrl(options: MediaUrlOptions): string {
  const {
    storageId,
    width,
    height,
    format = 'webp',
    quality,
    trim = APP_CONFIG.media?.useTrimmedImages ?? false,
  } = options;
  const resolvedQuality = quality ?? (format === 'mp4' ? undefined : 85);

  const params = new URLSearchParams();
  params.set('id', storageId.toString());

  if (width) params.set('width', width.toString());
  if (height) params.set('height', height.toString());
  params.set('format', format);
  if (resolvedQuality !== undefined) {
    params.set('quality', resolvedQuality.toString());
  }

  if (trim) {
    params.set('trim', 'true');
  }

  const endpoint = APP_CONFIG.mediaProxyUrl || '/proxy.php';
  const separator = endpoint.includes('?')
    ? endpoint.endsWith('?') || endpoint.endsWith('&')
      ? ''
      : '&'
    : '?';
  return `${endpoint}${separator}${params.toString()}`;
}

/**
 * Build a thumbnail URL (low resolution)
 */
export function buildThumbnailUrl(storageId: number, size: number = 130): string {
  return buildMediaUrl({
    storageId,
    width: size,
    height: size,
    quality: 75,
  });
}

/**
 * Build a high resolution URL
 */
export function buildHighResUrl(storageId: number, size: number = 1300): string {
  return buildMediaUrl({
    storageId,
    width: size,
    height: size,
    quality: 85,
  });
}
