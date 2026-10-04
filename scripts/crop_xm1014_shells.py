"""Remove XM1014 shell clusters from preview images and save local webps."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "tmp_xm_src"
DEST = ROOT / "assets" / "weapons" / "shotguns"
ASSET_VER = "20260912-xm-noshell-crop-1"

OUTPUTS = {
    "Entombed_steam.png": "Entombed.webp",
    "Tranquility_steam.png": "Tranquility.webp",
    "Watchdog_steam.png": "Watchdog.webp",
    "Mockingbird_steam.png": "Mockingbird.webp",
    "Heaven_Guard_steam.png": "Heaven Guard.webp",
}


def components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=np.uint8)
    comps: list[tuple[int, int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = 1
            pts = 0
            minx = maxx = x
            miny = maxy = y
            while q:
                cy, cx = q.popleft()
                pts += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = 1
                        q.append((ny, nx))
                        minx = min(minx, nx)
                        maxx = max(maxx, nx)
                        miny = min(miny, ny)
                        maxy = max(maxy, ny)
            comps.append((pts, minx, miny, maxx, maxy))
    comps.sort(reverse=True)
    return comps


def strip_shells(im: Image.Image) -> Image.Image:
    rgba = np.array(im.convert("RGBA"))
    mask = rgba[:, :, 3] > 24
    comps = components(mask)
    if not comps:
        return im

    gun_pts, gun_minx, gun_miny, gun_maxx, gun_maxy = comps[0]
    gun_h = max(1, gun_maxy - gun_miny)
    cleaned = False
    for pts, minx, miny, maxx, maxy in comps[1:]:
        width = maxx - minx + 1
        height = maxy - miny + 1
        below = miny >= gun_maxy - int(gun_h * 0.12)
        rightish = minx >= gun_minx + int((gun_maxx - gun_minx) * 0.45)
        small = pts < gun_pts * 0.08 and width < 90 and height < 40
        if small and (below or rightish):
            rgba[miny : maxy + 1, minx : maxx + 1, 3] = 0
            cleaned = True

    # Also clear any leftover low-alpha dust under the stock.
    if cleaned or True:
        cut_y = gun_maxy + 2
        if cut_y < rgba.shape[0]:
            rgba[cut_y:, :, 3] = 0

    out = Image.fromarray(rgba, "RGBA")
    bbox = out.getbbox()
    if bbox:
        pad = 8
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(out.width, bbox[2] + pad)
        bottom = min(out.height, bbox[3] + pad)
        out = out.crop((left, top, right, bottom))
    return out


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for src_name, dest_name in OUTPUTS.items():
        src = SRC / src_name
        if not src.is_file():
            raise SystemExit(f"missing {src}")
        cropped = strip_shells(Image.open(src))
        dest = DEST / dest_name
        cropped.save(dest, "WEBP", quality=92, method=6)
        print(f"{dest_name}: {cropped.size} {dest.stat().st_size} {ASSET_VER}")

    alias = DEST / "heaven-guard.webp"
    Image.open(DEST / "Heaven Guard.webp").save(alias, "WEBP", quality=92, method=6)
    print(f"heaven-guard.webp: {alias.stat().st_size}")


if __name__ == "__main__":
    main()
