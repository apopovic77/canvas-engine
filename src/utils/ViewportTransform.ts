import { Vector2 } from 'arkturian-typescript-utils';

export interface ContentBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  maxItemHeight?: number; // Maximum height of a single item (for zoom limit calculation)
}

export class ViewportTransform {
  // Current interpolated values (what's actually rendered)
  public scale = 1;
  public offset = new Vector2(0, 0);
  public rotation = 0; // Rotation in radians (0 = north up)
  private targetRotation = 0; // Target rotation for smooth animation

  // Target values (where we want to go)
  private targetScale = 1;
  private targetOffset = new Vector2(0, 0);

  // Interpolation speed (0-1, higher = faster, e.g., 0.15 means 15% per frame)
  public speedFactor = 0.15;

  // Scale limits
  private fitToContentScale = 1; // Calculated from content bounds
  public maxScale = 2; // Dynamically calculated: fitToContentScale × 50

  // Rubber banding config (iOS-style)
  // Separate flags for translation (panning) and scale (zooming) bounds
  private enableRubberBandingTranslation = true; // Controls panning bounds (Rect Bounds mode)
  private enableRubberBandingScale = true; // Controls zoom bounds (all modes)
  private rubberBandResistance = 0.5; // 0-1, how much resistance (higher = more resistance)
  private rubberBandSpringBack = 0.08; // Speed of spring back (higher = faster)
  private lockVerticalPan = false; // If true, disable vertical panning and rubber banding
  private enableLeftClickPan = false; // If true, left-click drag pans (for map viewers)
  private enableZoom = true; // If false, zoom via wheel/pinch is disabled
  private enablePan = true; // If false, all panning is disabled (calibration mode)

  // Content bounds for bounds checking
  private contentBounds: ContentBounds | null = null;
  public viewportWidth = 0;
  public viewportHeight = 0;

  private isDragging = false;
  private dragStart = new Vector2(0, 0);
  private offsetStart = new Vector2(0, 0);
  
  constructor(private canvas: HTMLCanvasElement) {
    this.viewportWidth = canvas.width;
    this.viewportHeight = canvas.height;
    this.setupEventListeners();
  }

  /**
   * Set content bounds to enable bounds checking and calculate fit-to-content scale.
   * This should be called whenever the layout changes.
   */
  setContentBounds(bounds: ContentBounds): void {
    this.contentBounds = bounds;
    this.updateViewportSize();
    this.calculateFitToContentScale();
  }

  /**
   * Update viewport size (called on canvas resize)
   */
  updateViewportSize(): void {
    this.viewportWidth = this.canvas.width;
    this.viewportHeight = this.canvas.height;
    this.calculateFitToContentScale();
  }

  /**
   * Lock vertical panning (horizontal-only scrolling)
   */
  setLockVerticalPan(lock: boolean): void {
    this.lockVerticalPan = lock;
  }

  /**
   * Enable or disable rubber banding for translation (panning bounds)
   * When enabled: panning is restricted to content bounds with spring-back (Rect Bounds mode)
   * When disabled: free panning without bounds (OFF mode or Snap-to-Content mode)
   */
  setEnableRubberBandingTranslation(enable: boolean): void {
    this.enableRubberBandingTranslation = enable;
  }

  /**
   * Enable or disable rubber banding for scale (zoom bounds)
   * When enabled: zoom is restricted between minScale and maxScale
   * When disabled: free zooming without limits (OFF mode only)
   */
  setEnableRubberBandingScale(enable: boolean): void {
    this.enableRubberBandingScale = enable;
  }

  /**
   * Enable left-click panning (for map viewers)
   * When enabled: left-click drag pans the view
   * When disabled: only middle/right click or Ctrl+drag pans (default for product galleries)
   */
  setEnableLeftClickPan(enable: boolean): void {
    this.enableLeftClickPan = enable;
  }

  /**
   * Enable or disable zoom (wheel/pinch)
   */
  setEnableZoom(enable: boolean): void {
    this.enableZoom = enable;
  }

  /**
   * Enable or disable all panning (mouse drag, touch)
   */
  setEnablePan(enable: boolean): void {
    this.enablePan = enable;
  }

  /**
   * Enable or disable two-finger pan (translation while pinching)
   * When enabled: parallel two-finger movement pans the map during pinch
   * When disabled: only zoom happens during two-finger gesture (classic behavior)
   */
  setEnableTwoFingerPan(enable: boolean): void {
    this.enableTwoFingerPan = enable;
  }

  /**
   * Enable or disable two-finger rotation
   * When enabled: twisting two fingers rotates the map
   * When disabled: no rotation from touch gestures
   */
  setEnableTwoFingerRotation(enable: boolean): void {
    this.enableTwoFingerRotation = enable;
  }

  /**
   * Set callback for before pan starts
   * Called with screen coordinates and button. Return false to prevent panning.
   * Use this for hit-testing interactive elements (e.g., draggable labels).
   */
  setBeforePanCallback(callback: ((screenX: number, screenY: number, button: number) => boolean) | null): void {
    this.beforePanCallback = callback;
  }

  /**
   * Set callback for mouse move events
   * Called with screen coordinates during mouse move (including during external drag)
   */
  setOnMouseMoveCallback(callback: ((screenX: number, screenY: number) => void) | null): void {
    this.onMouseMoveCallback = callback;
  }

  /**
   * Set callback for mouse up events
   * Called when mouse button is released
   */
  setOnMouseUpCallback(callback: (() => void) | null): void {
    this.onMouseUpCallback = callback;
  }

  /**
   * Calculate the scale needed to fit all content in viewport
   * Also sets maxScale so a product can be zoomed in significantly
   */
  private calculateFitToContentScale(): void {
    if (!this.contentBounds || this.viewportWidth === 0 || this.viewportHeight === 0) {
      this.fitToContentScale = 1;
      this.maxScale = 10; // Fallback
      return;
    }

    const scaleX = this.viewportWidth / this.contentBounds.width;
    const scaleY = this.viewportHeight / this.contentBounds.height;

    // Use the smaller scale to ensure everything fits
    this.fitToContentScale = Math.min(scaleX, scaleY); // No padding, exact fit

    // Max zoom: Allow zooming to 50× the fit-to-content scale
    // This allows viewing a single item 50× larger than in overview
    this.maxScale = this.fitToContentScale * 50;
  }

  /**
   * Get minimum allowed scale (can't zoom out further than fit-to-content)
   */
  get minScale(): number {
    // Allow zooming out to 90% of fit-to-content for some breathing room
    return this.fitToContentScale * 0.9;
  }

  /**
   * Get current content bounds for debugging
   */
  getContentBounds(): ContentBounds | null {
    return this.contentBounds;
  }

  /**
   * Smooth interpolation update - call this every frame!
   * Formula: curr += (target - curr) * speedFactor
   */
  update(): void {
    // Apply rubber banding / spring back if not dragging
    // Only apply if translation rubber banding is enabled (Rect Bounds mode)
    if (!this.isDragging && this.enableRubberBandingTranslation) {
      this.applyRubberBanding();
    }

    // Interpolate scale
    this.scale += (this.targetScale - this.scale) * this.speedFactor;

    // Interpolate offset
    this.offset.x += (this.targetOffset.x - this.offset.x) * this.speedFactor;
    this.offset.y += (this.targetOffset.y - this.offset.y) * this.speedFactor;

    // Interpolate rotation (shortest path)
    let rotDiff = this.targetRotation - this.rotation;
    // Normalize to [-PI, PI] for shortest rotation path
    while (rotDiff > Math.PI) rotDiff -= 2 * Math.PI;
    while (rotDiff < -Math.PI) rotDiff += 2 * Math.PI;
    this.rotation += rotDiff * this.speedFactor;
    // Snap when close enough
    if (Math.abs(rotDiff) < 0.001) this.rotation = this.targetRotation;
  }

  getTargetScale(): number {
    return this.targetScale;
  }

  getTargetOffset(): { x: number; y: number } {
    return { x: this.targetOffset.x, y: this.targetOffset.y };
  }

  /** Smoothly animate rotation to target (radians) */
  setTargetRotation(rotation: number): void {
    console.log(`[Viewport] setTargetRotation: ${(rotation * 180 / Math.PI).toFixed(1)}° (was ${(this.targetRotation * 180 / Math.PI).toFixed(1)}°)`);
    this.targetRotation = rotation;
  }

  /**
   * Calculate valid bounds for current scale
   */
  private calculateBounds(): {
    minOffsetX: number;
    maxOffsetX: number;
    minOffsetY: number;
    maxOffsetY: number;
    centerX: number;
    centerY: number;
    shouldCenterX: boolean;
    shouldCenterY: boolean;
  } | null {
    if (!this.contentBounds) return null;

    const scaledWidth = this.contentBounds.width * this.targetScale;
    const scaledHeight = this.contentBounds.height * this.targetScale;

    // Content smaller than viewport? → Center it
    const shouldCenterX = scaledWidth < this.viewportWidth;
    const shouldCenterY = scaledHeight < this.viewportHeight;

    // Center content accounting for its origin (minX, minY)
    const centerX = (this.viewportWidth - scaledWidth) / 2 - this.contentBounds.minX * this.targetScale;
    const centerY = (this.viewportHeight - scaledHeight) / 2 - this.contentBounds.minY * this.targetScale;

    // Bounds: account for extended content bounds (e.g., Hero Mode allows edge products to center)
    // If minX < 0, content was extended to the left → allow panning right (positive maxOffsetX)
    // If content extends beyond viewport, allow panning left (negative minOffsetX)
    const maxOffsetX = shouldCenterX ? centerX : -this.contentBounds.minX * this.targetScale;
    const minOffsetX = shouldCenterX ? centerX : this.viewportWidth - scaledWidth - this.contentBounds.minX * this.targetScale;
    const maxOffsetY = shouldCenterY ? centerY : -this.contentBounds.minY * this.targetScale;
    const minOffsetY = shouldCenterY ? centerY : this.viewportHeight - scaledHeight - this.contentBounds.minY * this.targetScale;

    return {
      minOffsetX,
      maxOffsetX,
      minOffsetY,
      maxOffsetY,
      centerX,
      centerY,
      shouldCenterX,
      shouldCenterY,
    };
  }

  /**
   * Apply iOS-style rubber banding: spring back to bounds when not dragging
   * Respects enableRubberBandingScale and enableRubberBandingTranslation flags
   */
  private applyRubberBanding(): void {
    // Clamp scale if scale rubber banding is enabled
    if (this.enableRubberBandingScale) {
      this.targetScale = Math.max(this.minScale, Math.min(this.maxScale, this.targetScale));
    }

    // Skip translation bounds if translation rubber banding is disabled
    if (!this.enableRubberBandingTranslation) {
      return;
    }

    const bounds = this.calculateBounds();
    if (!bounds) return;

    // Spring back to center if content is smaller than viewport
    if (bounds.shouldCenterX) {
      const distanceX = bounds.centerX - this.targetOffset.x;
      this.targetOffset.x += distanceX * this.rubberBandSpringBack;
    } else {
      // Spring back if outside bounds
      if (this.targetOffset.x > bounds.maxOffsetX) {
        const overflow = this.targetOffset.x - bounds.maxOffsetX;
        this.targetOffset.x -= overflow * this.rubberBandSpringBack;
      } else if (this.targetOffset.x < bounds.minOffsetX) {
        const overflow = bounds.minOffsetX - this.targetOffset.x;
        this.targetOffset.x += overflow * this.rubberBandSpringBack;
      }
    }

    // Skip Y-axis rubber banding if vertical pan is locked
    if (!this.lockVerticalPan) {
      if (bounds.shouldCenterY) {
        const distanceY = bounds.centerY - this.targetOffset.y;
        this.targetOffset.y += distanceY * this.rubberBandSpringBack;
      } else {
        // Spring back if outside bounds
        if (this.targetOffset.y > bounds.maxOffsetY) {
          const overflow = this.targetOffset.y - bounds.maxOffsetY;
          this.targetOffset.y -= overflow * this.rubberBandSpringBack;
        } else if (this.targetOffset.y < bounds.minOffsetY) {
          const overflow = bounds.minOffsetY - this.targetOffset.y;
          this.targetOffset.y += overflow * this.rubberBandSpringBack;
        }
      }
    }
  }

  /**
   * Apply resistance when dragging outside bounds (iOS-style rubber band feel)
   * Only applies if translation rubber banding is enabled
   */
  private applyDragResistance(dx: number, dy: number): { dx: number; dy: number } {
    if (!this.enableRubberBandingTranslation) return { dx, dy };

    const bounds = this.calculateBounds();
    if (!bounds) return { dx, dy };

    let resistedDx = dx;
    let resistedDy = dy;

    // Apply resistance when dragging outside bounds
    const newOffsetX = this.offsetStart.x + dx;
    const newOffsetY = this.offsetStart.y + dy;

    // X-axis resistance
    if (!bounds.shouldCenterX) {
      if (newOffsetX > bounds.maxOffsetX) {
        const overflow = newOffsetX - bounds.maxOffsetX;
        resistedDx = dx - overflow * this.rubberBandResistance;
      } else if (newOffsetX < bounds.minOffsetX) {
        const overflow = bounds.minOffsetX - newOffsetX;
        resistedDx = dx + overflow * this.rubberBandResistance;
      }
    }

    // Y-axis resistance (skip if vertical pan is locked)
    if (!this.lockVerticalPan && !bounds.shouldCenterY) {
      if (newOffsetY > bounds.maxOffsetY) {
        const overflow = newOffsetY - bounds.maxOffsetY;
        resistedDy = dy - overflow * this.rubberBandResistance;
      } else if (newOffsetY < bounds.minOffsetY) {
        const overflow = bounds.minOffsetY - newOffsetY;
        resistedDy = dy + overflow * this.rubberBandResistance;
      }
    } else if (this.lockVerticalPan) {
      // Block vertical dragging completely
      resistedDy = 0;
    }

    return { dx: resistedDx, dy: resistedDy };
  }

  private setupEventListeners() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    
    // Pan with mouse drag
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
    
    // Touch support (passive: false to enable preventDefault for iOS)
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
    this.canvas.addEventListener('touchcancel', this.handleTouchEnd); // Handle interrupted touches
  }
  
  destroy() {
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
  }
  
  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // Skip if zoom is disabled (e.g., calibration mode)
    if (!this.enableZoom) return;

    // Increased zoom speed for better control (0.002 instead of 0.001)
    const delta = -e.deltaY * 0.002;
    let newScale = this.targetScale * (1 + delta);

    // Apply scale bounds if scale rubber banding is enabled
    if (this.enableRubberBandingScale) {
      newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    }

    // Zoom towards mouse position
    const rect = this.canvas.getBoundingClientRect();
    let mouseX = e.clientX - rect.left;
    let mouseY = e.clientY - rect.top;

    // Un-rotate mouse position: offset operates in unrotated space,
    // but mouse is in rotated screen space
    if (this.rotation !== 0) {
      const cx = this.viewportWidth / 2;
      const cy = this.viewportHeight / 2;
      const cos = Math.cos(-this.rotation);
      const sin = Math.sin(-this.rotation);
      const dx = mouseX - cx;
      const dy = mouseY - cy;
      mouseX = dx * cos - dy * sin + cx;
      mouseY = dx * sin + dy * cos + cy;
    }

    // Adjust target offset to zoom towards mouse position
    const scaleFactor = newScale / this.targetScale;
    this.targetOffset.x = mouseX - (mouseX - this.targetOffset.x) * scaleFactor;
    this.targetOffset.y = mouseY - (mouseY - this.targetOffset.y) * scaleFactor;

    this.targetScale = newScale;
  };
  
  private handleMouseDown = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Check if external callback wants to handle this (e.g., label dragging)
    if (this.beforePanCallback) {
      const shouldPreventPan = this.beforePanCallback(screenX, screenY, e.button);
      if (shouldPreventPan) {
        e.preventDefault();
        this.externalDragActive = true;
        this.canvas.style.cursor = 'grabbing';
        return; // Don't start viewport panning
      }
    }

    // Skip panning if disabled (e.g., calibration mode)
    if (!this.enablePan) return;

    // Pan with middle or right button, or with Ctrl/Cmd key
    // Also left-click if enableLeftClickPan is true (for map viewers)
    const shouldPan = e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey ||
      (e.button === 0 && this.enableLeftClickPan);

    if (shouldPan) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStart.x = e.clientX;
      this.dragStart.y = e.clientY;
      this.offsetStart.x = this.targetOffset.x;
      this.offsetStart.y = this.targetOffset.y;
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // External drag handling (e.g., label dragging)
    if (this.externalDragActive && this.onMouseMoveCallback) {
      this.onMouseMoveCallback(screenX, screenY);
      return;
    }

    if (this.isDragging) {
      let dx = e.clientX - this.dragStart.x;
      let dy = e.clientY - this.dragStart.y;

      // When map is rotated, rotate drag delta in opposite direction
      // so panning feels natural (drag up = map moves up visually)
      if (this.rotation !== 0) {
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const rdx = dx * cos - dy * sin;
        const rdy = dx * sin + dy * cos;
        dx = rdx;
        dy = rdy;
      }

      // Apply rubber band resistance when dragging outside bounds
      const resisted = this.applyDragResistance(dx, dy);

      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };
  
  private handleMouseUp = () => {
    // External drag ended
    if (this.externalDragActive) {
      this.externalDragActive = false;
      this.canvas.style.cursor = 'default';
      if (this.onMouseUpCallback) {
        this.onMouseUpCallback();
      }
      return;
    }

    if (this.isDragging) {
      this.isDragging = false;
      this.canvas.style.cursor = 'default';
    }
  };
  
  // Touch support
  private touchStartDistance = 0;
  private touchStartScale = 1;
  private touchStartCenter = new Vector2(0, 0); // Midpoint between two fingers
  private touchStartAngle = 0; // Angle between two fingers at start
  private touchStartRotation = 0; // Map rotation at touch start
  private touchLastMidX = 0; // Last midpoint X for incremental pan
  private touchLastMidY = 0; // Last midpoint Y for incremental pan

  // Two-finger gesture configuration
  private enableTwoFingerPan = true; // Pan while pinching (parallel finger movement)
  private enableTwoFingerRotation = false; // Rotate by twisting two fingers

  // Mouse event callbacks for external handling (e.g., label dragging)
  private beforePanCallback: ((screenX: number, screenY: number, button: number) => boolean) | null = null;
  private onMouseMoveCallback: ((screenX: number, screenY: number) => void) | null = null;
  private onMouseUpCallback: (() => void) | null = null;
  private externalDragActive = false; // When true, don't do viewport panning

  private handleTouchStart = (e: TouchEvent) => {
    // Skip if panning/zooming is disabled (calibration mode)
    if (!this.enablePan && !this.enableZoom) return;

    if (e.touches.length === 2 && this.enableZoom) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      this.touchStartDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      this.touchStartScale = this.targetScale;

      // Store midpoint between fingers (relative to canvas)
      const rect = this.canvas.getBoundingClientRect();
      this.touchStartCenter.x = ((touch1.clientX + touch2.clientX) / 2) - rect.left;
      this.touchStartCenter.y = ((touch1.clientY + touch2.clientY) / 2) - rect.top;

      // Store midpoint in screen coords for incremental pan tracking
      this.touchLastMidX = (touch1.clientX + touch2.clientX) / 2;
      this.touchLastMidY = (touch1.clientY + touch2.clientY) / 2;

      // Store angle between fingers for rotation tracking
      this.touchStartAngle = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      );
      this.touchStartRotation = this.rotation;
    } else if (e.touches.length === 1 && this.enablePan) {
      // Prevent default to avoid iOS Safari scroll/bounce behavior
      e.preventDefault();
      const touch = e.touches[0];
      this.isDragging = true;
      this.dragStart.x = touch.clientX;
      this.dragStart.y = touch.clientY;
      this.offsetStart.x = this.targetOffset.x;
      this.offsetStart.y = this.targetOffset.y;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      // --- Zoom (pinch) ---
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      const scaleFactor = distance / this.touchStartDistance;
      let newScale = this.touchStartScale * scaleFactor;

      // Apply scale bounds if scale rubber banding is enabled
      if (this.enableRubberBandingScale) {
        newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
      }

      // Zoom towards the midpoint between fingers (iOS-style pinch-to-zoom)
      const midX = (touch1.clientX + touch2.clientX) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2;
      const rect = this.canvas.getBoundingClientRect();
      const canvasMidX = midX - rect.left;
      const canvasMidY = midY - rect.top;

      const scaleRatio = newScale / this.targetScale;
      this.targetOffset.x = canvasMidX - (canvasMidX - this.targetOffset.x) * scaleRatio;
      this.targetOffset.y = canvasMidY - (canvasMidY - this.targetOffset.y) * scaleRatio;
      this.targetScale = newScale;

      // --- Pan (parallel two-finger movement) ---
      if (this.enableTwoFingerPan) {
        let panDx = midX - this.touchLastMidX;
        let panDy = midY - this.touchLastMidY;

        // When map is rotated, rotate pan delta in opposite direction
        if (this.rotation !== 0) {
          const cos = Math.cos(-this.rotation);
          const sin = Math.sin(-this.rotation);
          const rotatedDx = panDx * cos - panDy * sin;
          const rotatedDy = panDx * sin + panDy * cos;
          panDx = rotatedDx;
          panDy = rotatedDy;
        }

        this.targetOffset.x += panDx;
        this.targetOffset.y += panDy;
      }
      this.touchLastMidX = midX;
      this.touchLastMidY = midY;

      // --- Rotation (two-finger twist) ---
      if (this.enableTwoFingerRotation) {
        const currentAngle = Math.atan2(
          touch2.clientY - touch1.clientY,
          touch2.clientX - touch1.clientX
        );
        const newRotation = this.touchStartRotation + (currentAngle - this.touchStartAngle);
        this.rotation = newRotation;
        this.targetRotation = newRotation; // Keep in sync — prevents update() fighting back
      }

    } else if (e.touches.length === 1 && this.isDragging) {
      e.preventDefault();
      const touch = e.touches[0];
      let dx = touch.clientX - this.dragStart.x;
      let dy = touch.clientY - this.dragStart.y;

      // When map is rotated, rotate drag delta in opposite direction
      // so panning feels natural (drag up = map moves up visually)
      if (this.rotation !== 0) {
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const rotatedDx = dx * cos - dy * sin;
        const rotatedDy = dx * sin + dy * cos;
        dx = rotatedDx;
        dy = rotatedDy;
      }

      // Apply rubber band resistance when dragging outside bounds
      const resisted = this.applyDragResistance(dx, dy);

      this.targetOffset.x = this.offsetStart.x + resisted.dx;
      this.targetOffset.y = this.offsetStart.y + resisted.dy;
    }
  };
  
  private handleTouchEnd = () => {
    // Only sync targetRotation if user was doing a 2-finger rotation gesture.
    // Otherwise programmatic rotation (compass, autoAlign) gets overwritten.
    if (this.touchStartDistance > 0) {
      this.targetRotation = this.rotation;
    }
    this.isDragging = false;
    this.touchStartDistance = 0;
  };
  
  /**
   * Reset to fit-to-content view
   * Calculates correct offset based on content bounds and viewport size
   * If content is smaller than viewport, center it immediately (no rubberband animation)
   */
  reset() {
    this.targetScale = this.fitToContentScale;

    let offsetX = 0;
    let offsetY = 0;

    if (this.contentBounds) {
      const scaledWidth = this.contentBounds.width * this.fitToContentScale;
      const scaledHeight = this.contentBounds.height * this.fitToContentScale;

      // Check if content is smaller than viewport (would be centered by rubberband)
      const shouldCenterX = scaledWidth < this.viewportWidth;
      const shouldCenterY = scaledHeight < this.viewportHeight;

      if (shouldCenterX) {
        // Center horizontally immediately
        offsetX = (this.viewportWidth - scaledWidth) / 2 - this.contentBounds.minX * this.fitToContentScale;
      } else {
        // Align to left edge
        offsetX = -this.contentBounds.minX * this.fitToContentScale;
      }

      if (shouldCenterY) {
        // Center vertically immediately
        offsetY = (this.viewportHeight - scaledHeight) / 2 - this.contentBounds.minY * this.fitToContentScale;
      } else {
        // Align to top edge
        offsetY = -this.contentBounds.minY * this.fitToContentScale;
      }
    }

    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;

    // Let interpolation handle the animation smoothly
    // (removed instant reset for continuous flow during mode switches)
  }

  /**
   * Smoothly center viewport on a specific world position
   * Used in Hero Mode to center clicked products
   *
   * @param worldX - X coordinate in world space (e.g., product center)
   * @param worldY - Y coordinate in world space (e.g., product center)
   * @param targetScale - Optional scale to animate to (defaults to current scale)
   */
  centerOn(worldX: number, worldY: number, targetScale?: number): void {
    // Use provided scale or keep current
    const scale = targetScale ?? this.targetScale;

    // Calculate offset needed to center world position in viewport
    // Formula: offset = viewportCenter - (worldPos * scale)
    const offsetX = this.viewportWidth / 2 - worldX * scale;
    const offsetY = this.viewportHeight / 2 - worldY * scale;

    // Set targets (smooth interpolation will handle the animation)
    this.targetScale = scale;
    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;
  }

  /**
   * Immediately set scale and offset without interpolation
   */
  setImmediate(scale: number, offsetX: number, offsetY: number) {
    this.scale = scale;
    this.targetScale = scale;
    this.offset.x = offsetX;
    this.offset.y = offsetY;
    this.targetOffset.x = offsetX;
    this.targetOffset.y = offsetY;
  }
  
  applyTransform(ctx: CanvasRenderingContext2D) {
    // For rotation: rotate around viewport center
    if (this.rotation !== 0) {
      const cx = this.viewportWidth / 2;
      const cy = this.viewportHeight / 2;
      ctx.translate(cx, cy);
      ctx.rotate(this.rotation);
      ctx.translate(-cx, -cy);
    }
    ctx.translate(this.offset.x, this.offset.y);
    ctx.scale(this.scale, this.scale);
  }
  
  screenToWorld(screenX: number, screenY: number): Vector2;
  screenToWorld(screenPos: Vector2): Vector2;
  screenToWorld(screenXOrPos: number | Vector2, screenY?: number): Vector2 {
    if (typeof screenXOrPos === 'number') {
      return new Vector2(
        (screenXOrPos - this.offset.x) / this.scale,
        (screenY! - this.offset.y) / this.scale
      );
    } else {
      return new Vector2(
        (screenXOrPos.x - this.offset.x) / this.scale,
        (screenXOrPos.y - this.offset.y) / this.scale
      );
    }
  }

  /**
   * screenToWorld WITH rotation correction.
   * Use this for hit-testing and coordinate conversion that needs
   * to account for map rotation (e.g., tile bounds, click-to-latLng).
   */
  screenToWorldRotated(screenX: number, screenY: number): Vector2 {
    let sx = screenX;
    let sy = screenY;
    if (this.rotation !== 0) {
      const cx = this.viewportWidth / 2;
      const cy = this.viewportHeight / 2;
      const cos = Math.cos(-this.rotation);
      const sin = Math.sin(-this.rotation);
      const dx = sx - cx;
      const dy = sy - cy;
      sx = dx * cos - dy * sin + cx;
      sy = dx * sin + dy * cos + cy;
    }
    return new Vector2(
      (sx - this.offset.x) / this.scale,
      (sy - this.offset.y) / this.scale
    );
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number): Vector2;
  worldToScreen(worldPos: Vector2): Vector2;
  worldToScreen(worldXOrPos: number | Vector2, worldY?: number): Vector2 {
    if (typeof worldXOrPos === 'number') {
      return new Vector2(
        worldXOrPos * this.scale + this.offset.x,
        worldY! * this.scale + this.offset.y
      );
    } else {
      return new Vector2(
        worldXOrPos.x * this.scale + this.offset.x,
        worldXOrPos.y * this.scale + this.offset.y
      );
    }
  }

  /**
   * Set target scale for smooth animation
   */
  setTargetScale(scale: number): void {
    this.targetScale = scale;
  }

  /**
   * Set target offset for smooth animation
   */
  setTargetOffset(x: number, y: number): void {
    this.targetOffset.x = x;
    this.targetOffset.y = y;
  }
}

