# Tile Generator

Python tool for generating tile pyramids from large images.

## Overview

Converts large images (400MB+) into a pyramid of tiles for efficient rendering with `TileMapRenderer`. Similar to how Google Maps and OpenStreetMap work.

## Requirements

```bash
pip install Pillow numpy tqdm
# or
pip install -r requirements.txt
```

## Usage

### Basic Usage

```bash
# Generate tiles from a large image
python tile_generator.py input.jpg output_tiles/

# With custom tile size
python tile_generator.py input.jpg output_tiles/ --tile-size 512

# WebP format with high quality
python tile_generator.py input.jpg output_tiles/ --format webp --quality 90

# Use config file
python tile_generator.py --config config.json
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `input` | Input image path | (required) |
| `output` | Output directory | (required) |
| `--tile-size`, `-s` | Tile size in pixels | 1024 |
| `--format`, `-f` | Output format (jpg, png, webp) | jpg |
| `--quality`, `-q` | JPEG/WebP quality (1-100) | 85 |
| `--max-zoom` | Maximum zoom level | auto |
| `--parallel` | Enable parallel processing | true |
| `--no-parallel` | Disable parallel processing | - |
| `--threads`, `-t` | Number of threads | 4 |
| `--config`, `-c` | Load config from JSON file | - |

### Configuration File

```json
{
  "input": "/path/to/large-image.jpg",
  "output": "/path/to/tiles",
  "tileSize": 1024,
  "format": "jpg",
  "quality": 85,
  "zoomLevels": "auto",
  "minZoom": 0,
  "maxZoom": null,
  "backgroundColor": "#000000",
  "parallel": true,
  "threads": 4
}
```

## Output Structure

```
output_tiles/
├── manifest.json          # Tile manifest for TileMapRenderer
├── zoom_0/
│   └── tile_0_0.jpg       # Single tile at lowest zoom
├── zoom_1/
│   ├── tile_0_0.jpg
│   ├── tile_0_1.jpg
│   ├── tile_1_0.jpg
│   └── tile_1_1.jpg
├── zoom_2/
│   └── ... (more tiles)
└── zoom_N/
    └── ... (full resolution tiles)
```

## Manifest Format

The generated `manifest.json` is used by `TileMapRenderer`:

```json
{
  "originalSize": {
    "width": 32000,
    "height": 24000
  },
  "tileSize": 1024,
  "format": "jpg",
  "quality": 85,
  "baseUrl": ".",
  "urlPattern": "{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}",
  "zoomLevels": [
    {
      "zoom": 0,
      "scale": 0.03125,
      "cols": 1,
      "rows": 1,
      "width": 1000,
      "height": 750
    },
    ...
  ]
}
```

## Algorithm

1. **Analyze Image**: Get dimensions without loading full image
2. **Calculate Zoom Levels**: Determine number of levels based on image size
3. **Generate Tiles**: For each zoom level:
   - Resize image to target scale (using Lanczos resampling)
   - Divide into grid of tiles
   - Save each tile with optional padding
4. **Create Manifest**: Generate `manifest.json` for renderer

## Performance

- **Memory Efficient**: Processes large images (400MB+) efficiently
- **Parallel Processing**: Uses multiple threads for tile generation
- **Progressive Scaling**: Generates lower zoom levels from full resolution

### Benchmarks (Approximate)

| Image Size | Tiles (1024px) | Time (4 threads) |
|------------|----------------|------------------|
| 8000x6000 | ~50 | ~10s |
| 16000x12000 | ~200 | ~40s |
| 32000x24000 | ~800 | ~3min |

## Integration with TileMapRenderer

```typescript
import { TileMapRenderer } from 'arkturian-canvas-engine';

// Load manifest
const manifest = await fetch('/tiles/manifest.json').then(r => r.json());

// Create renderer
const renderer = new TileMapRenderer({
  canvas: document.getElementById('map') as HTMLCanvasElement,
  manifest,
});

renderer.start();
```

## Troubleshooting

### Out of Memory

For very large images, try:
- Reduce `--threads` to 1 or 2
- Use `--no-parallel` flag
- Increase system swap space

### Slow Generation

- Ensure SSD storage for output
- Increase `--threads` if CPU allows
- Use `jpg` format (fastest)

### Image Decompression Bomb

The tool disables PIL's decompression bomb protection for large images. Ensure input files are trusted.

## License

MIT
