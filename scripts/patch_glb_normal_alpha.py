#!/usr/bin/env python3
"""Patch GLB normal-map PNGs that have alpha=0 (WebGL premultiply → black normals / zebra).

Same fix that made AK-47 | Cartel render correctly.
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if data[0:4] != b"glTF":
        raise ValueError(f"Not a GLB: {path}")
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise ValueError(f"Unsupported GLB version {version}: {path}")

    offset = 12
    json_chunk = None
    bin_chunk = b""
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_len]
        offset += chunk_len
        if chunk_type == b"JSON":
            json_chunk = json.loads(chunk.decode("utf-8").rstrip(" \x00"))
        elif chunk_type == b"BIN\x00":
            bin_chunk = chunk
    if json_chunk is None:
        raise ValueError(f"Missing JSON chunk: {path}")
    return json_chunk, bin_chunk


def write_glb(path: Path, gltf: dict, bin_blob: bytes) -> None:
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_bytes += b" " * json_pad

    bin_pad = (4 - (len(bin_blob) % 4)) % 4
    bin_blob_padded = bin_blob + (b"\x00" * bin_pad)

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_blob_padded)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, total)
    out += struct.pack("<I4s", len(json_bytes), b"JSON")
    out += json_bytes
    out += struct.pack("<I4s", len(bin_blob_padded), b"BIN\x00")
    out += bin_blob_padded
    path.write_bytes(out)


def png_alpha_stats(png_bytes: bytes) -> tuple[int, int, int]:
    img = Image.open(BytesIO(png_bytes))
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    alpha = img.getchannel("A")
    hist = alpha.histogram()
    a0 = hist[0] if hist else 0
    a255 = hist[255] if len(hist) > 255 else 0
    total = img.size[0] * img.size[1]
    return a0, a255, total


def fix_png_alpha(png_bytes: bytes) -> bytes | None:
    img = Image.open(BytesIO(png_bytes))
    if img.mode != "RGBA":
        # No alpha channel — nothing to fix.
        return None
    a0, a255, total = png_alpha_stats(png_bytes)
    if total <= 0:
        return None
    # Cartel bug: valid RGB normals with alpha fully (or almost fully) zero.
    if a0 < total * 0.90:
        return None
    if a255 > total * 0.05:
        return None

    r, g, b, _a = img.split()
    opaque = Image.merge("RGBA", (r, g, b, Image.new("L", img.size, 255)))
    buf = BytesIO()
    opaque.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def collect_normal_image_indices(gltf: dict) -> set[int]:
    textures = gltf.get("textures") or []
    images = gltf.get("images") or []
    out: set[int] = set()
    for mat in gltf.get("materials") or []:
        nt = mat.get("normalTexture")
        if not isinstance(nt, dict):
            continue
        tex_index = nt.get("index")
        if not isinstance(tex_index, int) or tex_index < 0 or tex_index >= len(textures):
            continue
        source = textures[tex_index].get("source")
        if isinstance(source, int) and 0 <= source < len(images):
            out.add(source)
    # Also catch images whose name suggests a normal map.
    for i, image in enumerate(images):
        name = str(image.get("name") or "").lower()
        uri = str(image.get("uri") or "").lower()
        if "normal" in name or "normal" in uri:
            out.add(i)
    return out


def patch_glb(path: Path, dry_run: bool = False) -> dict:
    gltf, bin_blob = read_glb(path)
    images = gltf.get("images") or []
    views = gltf.get("bufferViews") or []
    if not images or not views:
        return {"file": str(path), "patched": 0, "skipped": "no images"}

    targets = collect_normal_image_indices(gltf)
    if not targets:
        # Fallback: scan all PNG images for alpha=0 normals pattern.
        targets = set(range(len(images)))

    replacements: dict[int, bytes] = {}
    reports = []
    for img_index in sorted(targets):
        image = images[img_index]
        mime = str(image.get("mimeType") or "")
        if mime and mime != "image/png":
            continue
        view_index = image.get("bufferView")
        if not isinstance(view_index, int) or view_index < 0 or view_index >= len(views):
            continue
        view = views[view_index]
        offset = int(view.get("byteOffset") or 0)
        length = int(view.get("byteLength") or 0)
        png = bin_blob[offset : offset + length]
        if png[:8] != b"\x89PNG\r\n\x1a\n":
            continue
        a0, a255, total = png_alpha_stats(png)
        fixed = fix_png_alpha(png)
        reports.append(
            {
                "image": img_index,
                "a0": a0,
                "a255": a255,
                "total": total,
                "fixed": fixed is not None,
                "old": length,
                "new": len(fixed) if fixed else length,
            }
        )
        if fixed is not None:
            replacements[view_index] = fixed

    if not replacements:
        return {"file": str(path.name), "patched": 0, "reports": reports}

    if dry_run:
        return {"file": str(path.name), "patched": len(replacements), "dry_run": True, "reports": reports}

    # Rebuild tightly packed BIN with updated image blobs; keep non-image views intact.
    # Strategy: copy original bin, but because sizes change we rebuild all bufferViews
    # that belong to replaced images and shift trailing data via full rebuild of image
    # bufferViews only — simplest correct approach: rebuild entire BIN from accessors+images.

    # Safer approach used here: concatenate all bufferViews in order with new image bytes.
    new_bin = bytearray()
    new_views = []
    for i, view in enumerate(views):
        offset = int(view.get("byteOffset") or 0)
        length = int(view.get("byteLength") or 0)
        chunk = replacements.get(i)
        if chunk is None:
            chunk = bin_blob[offset : offset + length]
        # 4-byte align
        while len(new_bin) % 4:
            new_bin.append(0)
        new_view = dict(view)
        new_view["byteOffset"] = len(new_bin)
        new_view["byteLength"] = len(chunk)
        new_views.append(new_view)
        new_bin.extend(chunk)

    gltf["bufferViews"] = new_views
    if gltf.get("buffers"):
        gltf["buffers"][0]["byteLength"] = len(new_bin)
    elif "buffers" in gltf:
        pass
    else:
        gltf["buffers"] = [{"byteLength": len(new_bin)}]

    backup = path.with_suffix(path.suffix + ".before-normal-alpha.bak")
    if not backup.exists():
        backup.write_bytes(path.read_bytes())

    write_glb(path, gltf, bytes(new_bin))
    return {"file": str(path.name), "patched": len(replacements), "reports": reports, "backup": str(backup.name)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dirs",
        nargs="*",
        default=[
            str(ROOT / "assets" / "models" / "crafter"),
            str(ROOT / "assets" / "models" / "skins"),
            str(ROOT / "assets" / "models"),
        ],
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--glob", default="*.glb")
    args = parser.parse_args()

    files: list[Path] = []
    for d in args.dirs:
        base = Path(d)
        if not base.exists():
            continue
        if base.is_file() and base.suffix.lower() == ".glb":
            files.append(base)
            continue
        # Only top-level glbs in models/, recursive in crafter/skins
        if base.name == "models":
            files.extend(sorted(base.glob(args.glob)))
        else:
            files.extend(sorted(base.rglob(args.glob)))

    # Deduplicate + skip backups
    seen = set()
    unique = []
    for f in files:
        key = str(f.resolve()).lower()
        if key in seen:
            continue
        if ".bak" in f.name.lower() or "physics" in f.name.lower():
            continue
        seen.add(key)
        unique.append(f)

    print(f"Scanning {len(unique)} GLB files...")
    patched_files = 0
    patched_images = 0
    for path in unique:
        try:
            result = patch_glb(path, dry_run=args.dry_run)
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {path.name}: {exc}")
            continue
        n = int(result.get("patched") or 0)
        if n:
            patched_files += 1
            patched_images += n
            print(f"OK   {result['file']}: patched {n} normal image(s)")
        else:
            print(f"skip {result['file']}: no zero-alpha normals")

    print(f"\nDone. files_patched={patched_files} images_patched={patched_images} dry_run={args.dry_run}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
