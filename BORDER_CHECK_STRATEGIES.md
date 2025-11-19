# Border Check Strategies

As of v1.0.10, ViewportTransform supports configurable border checking strategies using the Strategy Pattern.

## Overview

Border checking controls how the viewport behaves when the user pans or zooms beyond content boundaries. You can now choose between different strategies per project:

- **NoBoundsStrategy** (default): Free panning without restrictions
- **RectBoundsStrategy**: iOS-style rubber banding with spring-back to content bounds

## Quick Start

### Option 1: No Bounds (Default - Free Panning)

```typescript
import { ViewportTransform, NoBoundsStrategy } from 'arkturian-canvas-engine';

const viewport = new ViewportTransform(canvas);
// NoBoundsStrategy is used by default - no setup needed!

// Or explicitly set it:
viewport.setBorderCheckStrategy(new NoBoundsStrategy());
```

**When to use**:
- Snap-to-Content mode (auto-navigation handles content visibility)
- Infinite canvas applications
- When you want unrestricted panning

### Option 2: Rect Bounds (iOS-style Rubber Banding)

```typescript
import { ViewportTransform, RectBoundsStrategy } from 'arkturian-canvas-engine';

const viewport = new ViewportTransform(canvas);

// Enable rubber banding with content bounds
viewport.setBorderCheckStrategy(
  new RectBoundsStrategy(
    0.5,  // rubberBandResistance (0-1, higher = more resistance)
    0.08  // rubberBandSpringBack (0-1, higher = faster spring back)
  )
);
```

**When to use**:
- Traditional pan/zoom interfaces
- When content has fixed rectangular boundaries
- When you want iOS-style spring-back behavior

## Strategy Comparison

| Feature | NoBoundsStrategy | RectBoundsStrategy |
|---------|-----------------|-------------------|
| Drag Resistance | None | iOS-style resistance beyond bounds |
| Spring Back | None | Automatic spring back when drag released |
| Content Centering | None | Auto-centers when content < viewport |
| Vertical Pan Lock | Respected | Respected |
| Best For | Snap-to-Content, infinite canvas | Traditional pan/zoom with fixed bounds |

## Advanced Usage

### Switching Strategies at Runtime

```typescript
import { RectBoundsStrategy, NoBoundsStrategy } from 'arkturian-canvas-engine';

// Start with rect bounds
viewport.setBorderCheckStrategy(new RectBoundsStrategy());

// Later switch to no bounds (e.g., when enabling Snap-to-Content mode)
viewport.setBorderCheckStrategy(new NoBoundsStrategy());
```

### Custom Rubber Banding Parameters

```typescript
// Very high resistance, slow spring back (feels heavy)
viewport.setBorderCheckStrategy(new RectBoundsStrategy(0.9, 0.02));

// Low resistance, fast spring back (feels snappy)
viewport.setBorderCheckStrategy(new RectBoundsStrategy(0.2, 0.15));

// Default balanced feel
viewport.setBorderCheckStrategy(new RectBoundsStrategy(0.5, 0.08));
```

## Implementation Details

### RectBoundsStrategy

The classic rubber banding system (restored from v1.0.6):

1. **Drag Resistance**: When dragging beyond content bounds, resistance increases proportionally to overflow distance
2. **Spring Back**: When drag is released, viewport smoothly springs back to valid bounds
3. **Content Centering**: If content is smaller than viewport, it automatically centers

### NoBoundsStrategy

Free panning mode (current behavior):

1. **No Resistance**: Drag moves viewport freely in all directions
2. **No Spring Back**: Viewport stays where user pans it
3. **Vertical Pan Lock**: Still respects `lockVerticalPan` setting

## Migration from v1.0.9

v1.0.9 had NO border checking at all. v1.0.10 defaults to `NoBoundsStrategy` for backward compatibility.

**If you want the old rubber banding behavior back**:

```typescript
import { ViewportTransform, RectBoundsStrategy } from 'arkturian-canvas-engine';

const viewport = new ViewportTransform(canvas);
viewport.setBorderCheckStrategy(new RectBoundsStrategy());
```

## Zoom Behavior (Unchanged)

All strategies use **INSTANT zoom-to-mouse** (implemented in v1.0.8):
- Zoom happens immediately without interpolation
- Point under cursor stays pixel-perfect during zoom
- No drift or rubber band effects after zoom completes

Only **panning** behavior is affected by the border check strategy.

## Example: react-koralmbahn-canvas

```typescript
import { ViewportTransform, NoBoundsStrategy } from 'arkturian-canvas-engine';

// Snap-to-Content mode (uses NoBoundsStrategy)
const viewport = new ViewportTransform(canvas);
viewport.setBorderCheckStrategy(new NoBoundsStrategy()); // Free panning + Snap-to-Content

// For a traditional bounded pan/zoom:
// viewport.setBorderCheckStrategy(new RectBoundsStrategy());
```

## Creating Custom Strategies

You can implement your own border checking logic:

```typescript
import type { BorderCheckStrategy, BorderCheckContext, DragContext, BorderCheckBounds } from 'arkturian-canvas-engine';

class MyCustomStrategy implements BorderCheckStrategy {
  calculateBounds(context: BorderCheckContext): BorderCheckBounds | null {
    // Return bounds or null
    return null;
  }

  applyDragResistance(dx: number, dy: number, context: DragContext): { dx: number; dy: number } {
    // Return modified dx/dy
    return { dx, dy };
  }

  applySpringBack(context: BorderCheckContext): void {
    // Modify context.targetOffset for spring back animation
  }
}

viewport.setBorderCheckStrategy(new MyCustomStrategy());
```

## Architecture

The Strategy Pattern was introduced in v1.0.10 to:

1. **Restore deleted code**: Rubber banding was accidentally removed in v1.0.7
2. **Make it configurable**: Allow per-project choice of border checking behavior
3. **Keep zoom instant**: INSTANT zoom-to-mouse (v1.0.8) is preserved
4. **Enable extensibility**: Easy to add new border checking strategies

## Version History

- **v1.0.10**: Strategy Pattern implementation, rubber banding restored
- **v1.0.9**: Hack with `enableSmoothTransition` flag (reverted)
- **v1.0.8**: INSTANT zoom-to-mouse (preserved)
- **v1.0.7**: Rubber banding accidentally deleted (mistake!)
- **v1.0.6**: Rubber banding worked perfectly
