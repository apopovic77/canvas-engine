#!/usr/bin/env python3
"""
Tile Generator for Large Images

Generates a tile pyramid from large images for use with TileMapRenderer.
Supports parallel processing and memory-efficient handling of 400MB+ images.

Usage:
    python tile_generator.py input.jpg output_dir/
    python tile_generator.py input.jpg output_dir/ --tile-size 1024 --format jpg --quality 85
    python tile_generator.py --config config.json

Author: Alex Popovic (Arkturian)
"""

import os
import sys
import json
import math
import argparse
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
    # Disable decompression bomb protection for large images
    Image.MAX_IMAGE_PIXELS = None
    import numpy as np
    from tqdm import tqdm
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install with: pip install Pillow numpy tqdm")
    sys.exit(1)


@dataclass
class ZoomLevel:
    """Configuration for a single zoom level"""
    zoom: int
    scale: float
    cols: int
    rows: int
    width: int
    height: int


@dataclass
class TileConfig:
    """Tile generation configuration"""
    input_path: str
    output_path: str
    tile_size: int = 1024
    format: str = "jpg"
    quality: int = 85
    min_zoom: int = 0
    max_zoom: Optional[int] = None
    background_color: str = "#000000"
    parallel: bool = True
    threads: int = 4


class TileGenerator:
    """
    Generates tile pyramid from large images.

    Algorithm:
    1. Load image dimensions (without loading full image)
    2. Calculate zoom levels based on image size and tile size
    3. For each zoom level (from max to min):
       a. Calculate scaled dimensions
       b. Divide into grid of tiles
       c. Extract and save each tile
    4. Generate manifest.json
    """

    def __init__(self, config: TileConfig):
        self.config = config
        self.image: Optional[Image.Image] = None
        self.original_width = 0
        self.original_height = 0
        self.zoom_levels: List[ZoomLevel] = []
        self.tiles_generated = 0
        self.total_tiles = 0

    def run(self) -> Dict[str, Any]:
        """Run the tile generation process"""
        print(f"\n{'='*60}")
        print(f"  Tile Generator")
        print(f"{'='*60}")
        print(f"  Input:  {self.config.input_path}")
        print(f"  Output: {self.config.output_path}")
        print(f"  Tile Size: {self.config.tile_size}x{self.config.tile_size}")
        print(f"  Format: {self.config.format.upper()} (quality: {self.config.quality})")
        print(f"{'='*60}\n")

        # Step 1: Get image dimensions
        print("[1/4] Analyzing image...")
        self._analyze_image()
        print(f"      Image size: {self.original_width} x {self.original_height}")

        # Step 2: Calculate zoom levels
        print("[2/4] Calculating zoom levels...")
        self._calculate_zoom_levels()
        self._print_zoom_levels()

        # Step 3: Create output directory
        output_path = Path(self.config.output_path)
        output_path.mkdir(parents=True, exist_ok=True)

        # Step 4: Generate tiles
        print("[3/4] Generating tiles...")
        self._load_image()
        self._generate_all_tiles()

        # Step 5: Generate manifest
        print("[4/4] Generating manifest...")
        manifest = self._generate_manifest()
        manifest_path = output_path / "manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        print(f"\n{'='*60}")
        print(f"  Complete!")
        print(f"  Generated {self.tiles_generated} tiles")
        print(f"  Manifest: {manifest_path}")
        print(f"{'='*60}\n")

        return manifest

    def _analyze_image(self):
        """Get image dimensions without loading full image"""
        with Image.open(self.config.input_path) as img:
            self.original_width, self.original_height = img.size

    def _calculate_zoom_levels(self):
        """Calculate zoom levels from image size"""
        tile_size = self.config.tile_size

        # Calculate max zoom (full resolution)
        cols_max = math.ceil(self.original_width / tile_size)
        rows_max = math.ceil(self.original_height / tile_size)

        # Determine number of zoom levels
        # Each level is half the resolution of the next
        max_dimension = max(self.original_width, self.original_height)
        num_levels = max(1, math.ceil(math.log2(max_dimension / tile_size)) + 1)

        if self.config.max_zoom is not None:
            num_levels = min(num_levels, self.config.max_zoom + 1)

        self.zoom_levels = []
        self.total_tiles = 0

        for zoom in range(num_levels):
            # Scale factor: 2^(zoom - max_zoom)
            # zoom 0 = smallest, zoom max = full resolution
            scale = 2 ** (zoom - (num_levels - 1))

            width = int(self.original_width * scale)
            height = int(self.original_height * scale)
            cols = math.ceil(width / tile_size)
            rows = math.ceil(height / tile_size)

            level = ZoomLevel(
                zoom=zoom,
                scale=scale,
                cols=cols,
                rows=rows,
                width=width,
                height=height
            )
            self.zoom_levels.append(level)
            self.total_tiles += cols * rows

    def _print_zoom_levels(self):
        """Print zoom level information"""
        print(f"      Zoom levels: {len(self.zoom_levels)}")
        for level in self.zoom_levels:
            print(f"        Level {level.zoom}: {level.width}x{level.height} "
                  f"({level.cols}x{level.rows} = {level.cols * level.rows} tiles) "
                  f"scale={level.scale:.4f}")
        print(f"      Total tiles: {self.total_tiles}")

    def _load_image(self):
        """Load the full image into memory"""
        print(f"      Loading image into memory...")
        # Set maximum image size (for decompression bomb protection)
        Image.MAX_IMAGE_PIXELS = None
        self.image = Image.open(self.config.input_path)
        # Convert to RGB if necessary
        if self.image.mode != 'RGB':
            self.image = self.image.convert('RGB')
        print(f"      Image loaded: {self.image.size}")

    def _generate_all_tiles(self):
        """Generate tiles for all zoom levels"""
        output_path = Path(self.config.output_path)

        # Create progress bar
        pbar = tqdm(total=self.total_tiles, desc="Generating tiles", unit="tile")

        # Process from highest zoom to lowest (so we can downsample)
        scaled_images: Dict[int, Image.Image] = {}

        for level in reversed(self.zoom_levels):
            # Create zoom directory
            zoom_dir = output_path / f"zoom_{level.zoom}"
            zoom_dir.mkdir(exist_ok=True)

            # Get or create scaled image
            if level.scale == 1.0:
                scaled_img = self.image
            else:
                # Resize image for this zoom level
                new_size = (level.width, level.height)
                scaled_img = self.image.resize(new_size, Image.Resampling.LANCZOS)

            scaled_images[level.zoom] = scaled_img

            # Generate tiles for this level
            if self.config.parallel and level.cols * level.rows > 4:
                self._generate_tiles_parallel(level, scaled_img, zoom_dir, pbar)
            else:
                self._generate_tiles_sequential(level, scaled_img, zoom_dir, pbar)

        pbar.close()

        # Cleanup scaled images
        for zoom, img in scaled_images.items():
            if img != self.image:
                img.close()

    def _generate_tiles_sequential(
        self,
        level: ZoomLevel,
        img: Image.Image,
        output_dir: Path,
        pbar: tqdm
    ):
        """Generate tiles sequentially"""
        tile_size = self.config.tile_size

        for row in range(level.rows):
            for col in range(level.cols):
                self._generate_tile(level, img, output_dir, col, row)
                self.tiles_generated += 1
                pbar.update(1)

    def _generate_tiles_parallel(
        self,
        level: ZoomLevel,
        img: Image.Image,
        output_dir: Path,
        pbar: tqdm
    ):
        """Generate tiles in parallel"""
        tile_size = self.config.tile_size

        # Create list of tile coordinates
        tiles = [(col, row) for row in range(level.rows) for col in range(level.cols)]

        with ThreadPoolExecutor(max_workers=self.config.threads) as executor:
            futures = {
                executor.submit(self._generate_tile, level, img, output_dir, col, row): (col, row)
                for col, row in tiles
            }

            for future in as_completed(futures):
                try:
                    future.result()
                    self.tiles_generated += 1
                    pbar.update(1)
                except Exception as e:
                    col, row = futures[future]
                    print(f"\nError generating tile {col},{row}: {e}")

    def _generate_tile(
        self,
        level: ZoomLevel,
        img: Image.Image,
        output_dir: Path,
        col: int,
        row: int
    ):
        """Generate a single tile"""
        tile_size = self.config.tile_size

        # Calculate crop box
        left = col * tile_size
        top = row * tile_size
        right = min(left + tile_size, level.width)
        bottom = min(top + tile_size, level.height)

        # Crop tile
        tile = img.crop((left, top, right, bottom))

        # If tile is smaller than tile_size, pad it
        if tile.size != (tile_size, tile_size):
            # Parse background color
            bg_color = self._parse_color(self.config.background_color)
            padded = Image.new('RGB', (tile_size, tile_size), bg_color)
            padded.paste(tile, (0, 0))
            tile = padded

        # Save tile
        filename = f"tile_{col}_{row}.{self.config.format}"
        filepath = output_dir / filename

        if self.config.format.lower() in ('jpg', 'jpeg'):
            tile.save(filepath, 'JPEG', quality=self.config.quality)
        elif self.config.format.lower() == 'webp':
            tile.save(filepath, 'WEBP', quality=self.config.quality)
        else:
            tile.save(filepath, 'PNG')

    def _parse_color(self, color: str) -> tuple:
        """Parse hex color to RGB tuple"""
        color = color.lstrip('#')
        return tuple(int(color[i:i+2], 16) for i in (0, 2, 4))

    def _generate_manifest(self) -> Dict[str, Any]:
        """Generate manifest.json"""
        return {
            "originalSize": {
                "width": self.original_width,
                "height": self.original_height
            },
            "tileSize": self.config.tile_size,
            "format": self.config.format,
            "quality": self.config.quality,
            "baseUrl": ".",
            "urlPattern": "{baseUrl}/zoom_{zoom}/tile_{x}_{y}.{format}",
            "zoomLevels": [
                {
                    "zoom": level.zoom,
                    "scale": level.scale,
                    "cols": level.cols,
                    "rows": level.rows,
                    "width": level.width,
                    "height": level.height
                }
                for level in self.zoom_levels
            ]
        }


def load_config(config_path: str) -> TileConfig:
    """Load configuration from JSON file"""
    with open(config_path) as f:
        data = json.load(f)

    return TileConfig(
        input_path=data["input"],
        output_path=data["output"],
        tile_size=data.get("tileSize", 1024),
        format=data.get("format", "jpg"),
        quality=data.get("quality", 85),
        min_zoom=data.get("minZoom", 0),
        max_zoom=data.get("maxZoom"),
        background_color=data.get("backgroundColor", "#000000"),
        parallel=data.get("parallel", True),
        threads=data.get("threads", 4)
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate tile pyramid from large images",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tile_generator.py image.jpg tiles/
  python tile_generator.py image.jpg tiles/ --tile-size 512 --format webp
  python tile_generator.py --config config.json
        """
    )

    parser.add_argument("input", nargs="?", help="Input image path")
    parser.add_argument("output", nargs="?", help="Output directory")
    parser.add_argument("--config", "-c", help="Load configuration from JSON file")
    parser.add_argument("--tile-size", "-s", type=int, default=1024, help="Tile size in pixels (default: 1024)")
    parser.add_argument("--format", "-f", choices=["jpg", "png", "webp"], default="jpg", help="Output format (default: jpg)")
    parser.add_argument("--quality", "-q", type=int, default=85, help="JPEG/WebP quality 1-100 (default: 85)")
    parser.add_argument("--max-zoom", type=int, help="Maximum zoom level")
    parser.add_argument("--parallel", action="store_true", default=True, help="Use parallel processing")
    parser.add_argument("--no-parallel", action="store_true", help="Disable parallel processing")
    parser.add_argument("--threads", "-t", type=int, default=4, help="Number of threads (default: 4)")

    args = parser.parse_args()

    # Load config from file or arguments
    if args.config:
        config = load_config(args.config)
    elif args.input and args.output:
        config = TileConfig(
            input_path=args.input,
            output_path=args.output,
            tile_size=args.tile_size,
            format=args.format,
            quality=args.quality,
            max_zoom=args.max_zoom,
            parallel=not args.no_parallel,
            threads=args.threads
        )
    else:
        parser.print_help()
        sys.exit(1)

    # Validate input
    if not os.path.exists(config.input_path):
        print(f"Error: Input file not found: {config.input_path}")
        sys.exit(1)

    # Run generator
    generator = TileGenerator(config)
    manifest = generator.run()

    return 0


if __name__ == "__main__":
    sys.exit(main())
