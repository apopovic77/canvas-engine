# arkturian-canvas-engine

High-performance canvas-based rendering engine with viewport transform, layout system, and interactive controls.

## Features

- **Canvas Renderer**: Optimized 2D canvas rendering with LOD support
- **Viewport Transform**: Smooth zoom/pan with mouse wheel and touch gestures
- **Layout System**: Flexible layout algorithms (Pivot, Hero modes)
- **Interpolation**: Smooth property animations
- **Touch Support**: Full gesture support (pinch-to-zoom, pan)
- **TypeScript**: Fully typed API

## Installation

```bash
npm install arkturian-canvas-engine
```

## Quick Start

```tsx
import {
  ViewportTransform,
  CanvasRenderer,
  LayoutService
} from 'arkturian-canvas-engine';

// Initialize viewport
const canvas = document.getElementById('myCanvas') as HTMLCanvasElement;
const viewport = new ViewportTransform(canvas);

// Initialize renderer
const renderer = new CanvasRenderer(canvas, products, viewport);

// Render loop
function render() {
  viewport.update();
  renderer.render();
  requestAnimationFrame(render);
}
render();
```

## Core APIs

### ViewportTransform
Manages viewport zoom, pan, and bounds:

```typescript
const viewport = new ViewportTransform(canvas);
viewport.setContentBounds(bounds);
viewport.reset(); // Fit to content
viewport.centerOn(x, y, scale); // Center on position
```

### CanvasRenderer
High-performance canvas rendering:

```typescript
const renderer = new CanvasRenderer<Product>(
  canvas,
  products,
  viewport,
  layoutService,
  viewportService,
  onProductClick
);
```

### LayoutService
Layout orchestration system:

```typescript
const layoutService = new LayoutService(engine);
layoutService.layout(products, viewport.viewportWidth, viewport.viewportHeight);
```

## Viewport Controls

- **Zoom**: Mouse wheel or pinch gesture
- **Pan**: Right-click drag, middle-click drag, or Ctrl+drag
- **Touch**: Single finger pan, two-finger zoom

## TypeScript

Full TypeScript support with type definitions included.

## License

MIT

## Author

Arkturian <hello@arkturian.com>
