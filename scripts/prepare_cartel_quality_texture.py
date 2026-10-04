#!/usr/bin/env python3
"""Prepare paint/weapon PNGs for Cartel-quality GLB embeds.

- Force opaque alpha before any resize (zero-alpha normals premultiply to garbage)
- Downscale to target size (default 2048) for stable Blender export
- Keep RGBA so Blender glTF AUTO embeds lossless PNG instead of JPEG
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def prepare(src: Path, dst: Path, size: int) -> None:
    image = Image.open(src).convert("RGBA")
    red, green, blue, _alpha = image.split()
    opaque = Image.new("L", image.size, 255)
    image = Image.merge("RGBA", (red, green, blue, opaque))
    if size > 0 and image.size != (size, size):
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst, optimize=True)
    print(f"{dst.name}: {image.size[0]}x{image.size[1]} ({dst.stat().st_size} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--dst", required=True)
    parser.add_argument("--size", type=int, default=2048)
    args = parser.parse_args()
    prepare(Path(args.src), Path(args.dst), args.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
