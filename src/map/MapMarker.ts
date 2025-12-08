/**
 * Map Marker (Point of Interest)
 *
 * Positioned using geographic coordinates, rendered at calculated
 * pixel position with smooth animations.
 *
 * @module map
 */

import { Vector2, InterpolatedProperty } from 'arkturian-typescript-utils';
import { GeoTransform } from '../geo/GeoTransform';
import { LatLng } from '../geo/GeoTypes';
import { ViewportTransform } from '../utils/ViewportTransform';
import { MapFeature, MarkerOptions, DEFAULT_MARKER_STYLE } from './MapTypes';

/**
 * Generate unique ID
 */
let markerIdCounter = 0;
function generateMarkerId(): string {
  return `marker_${++markerIdCounter}_${Date.now()}`;
}

/**
 * Map marker representing a point of interest
 */
export class MapMarker implements MapFeature {
  readonly id: string;
  readonly type = 'marker' as const;

  // Position
  private _latLng: LatLng;

  // Visual properties
  label: string;
  icon: HTMLImageElement | null = null;
  iconUrl: string | null = null;
  iconSize: { width: number; height: number };
  iconAnchor: { x: number; y: number };
  color: string;

  // Animation properties (using InterpolatedProperty for smooth transitions)
  readonly opacity: InterpolatedProperty<number>;
  readonly scale: InterpolatedProperty<number>;
  readonly offsetX: InterpolatedProperty<number>;
  readonly offsetY: InterpolatedProperty<number>;

  // Helper to get current interpolated values
  private get currentOpacity(): number { return this.opacity.value ?? 1; }
  private get currentScale(): number { return this.scale.value ?? 1; }
  private get currentOffsetX(): number { return this.offsetX.value ?? 0; }
  private get currentOffsetY(): number { return this.offsetY.value ?? 0; }

  // State
  visible: boolean = true;
  zIndex: number = 0;
  metadata: Record<string, unknown> = {};

  // Interaction state
  private _draggable: boolean = false;
  private _hovered: boolean = false;
  private _selected: boolean = false;

  // Cached pixel position
  private _cachedPixel: Vector2 | null = null;
  private _cacheTransformId: number = 0;

  /**
   * Create a new marker
   */
  constructor(latLng: LatLng, options: MarkerOptions = {}) {
    this.id = generateMarkerId();
    this._latLng = { ...latLng };

    // Visual properties from options
    this.label = options.label ?? '';
    this.color = options.color ?? DEFAULT_MARKER_STYLE.color;
    this.iconSize = options.iconSize ?? { width: DEFAULT_MARKER_STYLE.size, height: DEFAULT_MARKER_STYLE.size };
    this.iconAnchor = options.iconAnchor ?? { ...DEFAULT_MARKER_STYLE.iconAnchor };
    this.zIndex = options.zIndex ?? 0;
    this.metadata = options.metadata ?? {};
    this._draggable = options.draggable ?? false;

    // Load icon if provided
    if (options.icon) {
      if (typeof options.icon === 'string') {
        this.iconUrl = options.icon;
        this.loadIcon(options.icon);
      } else {
        this.icon = options.icon;
      }
    }

    // Animation properties
    const animDuration = 0.2;
    this.opacity = new InterpolatedProperty('opacity', options.opacity ?? 1, null, animDuration);
    this.scale = new InterpolatedProperty('scale', 1, null, animDuration);
    this.offsetX = new InterpolatedProperty('offsetX', 0, null, animDuration);
    this.offsetY = new InterpolatedProperty('offsetY', 0, null, animDuration);
  }

  /**
   * Load icon from URL
   */
  private loadIcon(url: string): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.icon = img;
      if (!this.iconSize || (this.iconSize.width === DEFAULT_MARKER_STYLE.size && this.iconSize.height === DEFAULT_MARKER_STYLE.size)) {
        this.iconSize = { width: img.width, height: img.height };
      }
    };
    img.src = url;
  }

  // === Position ===

  get latLng(): LatLng {
    return { ...this._latLng };
  }

  set latLng(value: LatLng) {
    this._latLng = { ...value };
    this._cachedPixel = null;
  }

  /**
   * Get pixel position using geo transform
   */
  getPixelPosition(geoTransform: GeoTransform): Vector2 {
    return geoTransform.latLngToPixel(this._latLng);
  }

  /**
   * Get screen position using viewport transform
   */
  getScreenPosition(
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): Vector2 {
    const pixel = this.getPixelPosition(geoTransform);
    const screen = viewport.worldToScreen(pixel);

    // Apply animated offset
    return new Vector2(
      screen.x + this.currentOffsetX,
      screen.y + this.currentOffsetY
    );
  }

  // === Rendering ===

  /**
   * Render marker on canvas
   */
  render(
    ctx: CanvasRenderingContext2D,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): void {
    if (!this.visible || this.currentOpacity <= 0) return;

    const screenPos = this.getScreenPosition(geoTransform, viewport);
    const scaleValue = this.currentScale;
    const opacityValue = this.currentOpacity;

    ctx.save();
    ctx.globalAlpha = opacityValue;

    // Calculate render position with anchor
    const renderWidth = this.iconSize.width * scaleValue;
    const renderHeight = this.iconSize.height * scaleValue;
    const renderX = screenPos.x - renderWidth * this.iconAnchor.x;
    const renderY = screenPos.y - renderHeight * this.iconAnchor.y;

    if (this.icon) {
      // Draw icon
      ctx.drawImage(
        this.icon,
        renderX,
        renderY,
        renderWidth,
        renderHeight
      );
    } else {
      // Draw default marker (teardrop shape)
      this.drawDefaultMarker(ctx, screenPos.x, screenPos.y, scaleValue);
    }

    // Draw label
    if (this.label) {
      this.drawLabel(ctx, screenPos.x, screenPos.y - renderHeight * this.iconAnchor.y);
    }

    ctx.restore();
  }

  /**
   * Draw default teardrop marker
   */
  private drawDefaultMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    markerScale: number
  ): void {
    const size = DEFAULT_MARKER_STYLE.size * markerScale;
    const radius = size / 2;

    ctx.beginPath();

    // Teardrop shape
    ctx.arc(x, y - size, radius, Math.PI, 0, false);
    ctx.quadraticCurveTo(x + radius, y - size + radius, x, y);
    ctx.quadraticCurveTo(x - radius, y - size + radius, x - radius, y - size);

    ctx.fillStyle = this.color;
    ctx.fill();

    // Inner circle (white)
    ctx.beginPath();
    ctx.arc(x, y - size, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  /**
   * Draw label above marker
   */
  private drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void {
    ctx.font = DEFAULT_MARKER_STYLE.labelFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // Background
    const padding = 4;
    const textWidth = ctx.measureText(this.label).width;
    const bgX = x - textWidth / 2 - padding;
    const bgY = y + DEFAULT_MARKER_STYLE.labelOffset.y - 16;
    const bgWidth = textWidth + padding * 2;
    const bgHeight = 18;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 4);
    ctx.fill();

    // Text
    ctx.fillStyle = DEFAULT_MARKER_STYLE.labelColor;
    ctx.fillText(this.label, x, y + DEFAULT_MARKER_STYLE.labelOffset.y);
  }

  /**
   * Check if point hits this marker
   */
  hitTest(
    screenPoint: Vector2,
    geoTransform: GeoTransform,
    viewport: ViewportTransform
  ): boolean {
    if (!this.visible) return false;

    const markerPos = this.getScreenPosition(geoTransform, viewport);
    const scaleVal = this.currentScale;
    const hitRadius = Math.max(this.iconSize.width, this.iconSize.height) * scaleVal / 2;

    const dx = screenPoint.x - markerPos.x;
    const dy = screenPoint.y - (markerPos.y - this.iconSize.height * this.iconAnchor.y * scaleVal);

    return dx * dx + dy * dy <= hitRadius * hitRadius;
  }

  // === Interaction ===

  get hovered(): boolean {
    return this._hovered;
  }

  set hovered(value: boolean) {
    if (this._hovered === value) return;
    this._hovered = value;
    this.scale.targetValue = value ? DEFAULT_MARKER_STYLE.hoverScale : (this._selected ? DEFAULT_MARKER_STYLE.selectedScale : 1);
  }

  get selected(): boolean {
    return this._selected;
  }

  set selected(value: boolean) {
    if (this._selected === value) return;
    this._selected = value;
    this.scale.targetValue = value ? DEFAULT_MARKER_STYLE.selectedScale : (this._hovered ? DEFAULT_MARKER_STYLE.hoverScale : 1);
  }

  get draggable(): boolean {
    return this._draggable;
  }

  set draggable(value: boolean) {
    this._draggable = value;
  }

  // === Animation ===

  /**
   * Update interpolated properties (called each frame)
   * Note: InterpolatedProperty handles its own interpolation internally
   */
  update(_deltaTime: number): void {
    // InterpolatedProperty auto-updates when value is accessed
    // This method is here for compatibility with layer update loops
  }

  /**
   * Animate marker appearing
   */
  animateIn(): void {
    this.opacity.setImmediate(0);
    this.scale.setImmediate(0.5);
    this.opacity.targetValue = 1;
    this.scale.targetValue = 1;
  }

  /**
   * Animate marker disappearing
   */
  async animateOut(): Promise<void> {
    this.opacity.targetValue = 0;
    this.scale.targetValue = 0.5;

    // Wait for animation to complete
    return new Promise(resolve => {
      const checkComplete = () => {
        if (this.currentOpacity <= 0.01) {
          resolve();
        } else {
          requestAnimationFrame(checkComplete);
        }
      };
      checkComplete();
    });
  }

  /**
   * Bounce animation
   */
  bounce(): void {
    this.offsetY.setImmediate(-20);
    this.offsetY.targetValue = 0;
  }

  /**
   * Clone marker with new position
   */
  clone(newLatLng?: LatLng): MapMarker {
    const marker = new MapMarker(newLatLng ?? this._latLng, {
      label: this.label,
      icon: this.icon ?? this.iconUrl ?? undefined,
      iconSize: { ...this.iconSize },
      iconAnchor: { ...this.iconAnchor },
      color: this.color,
      opacity: this.opacity.value ?? undefined,
      draggable: this._draggable,
      zIndex: this.zIndex,
      metadata: { ...this.metadata },
    });
    return marker;
  }
}
