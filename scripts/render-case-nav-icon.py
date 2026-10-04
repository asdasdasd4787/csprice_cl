"""Build a simple solid CS case silhouette (outer shape only, no inner details)."""
from pathlib import Path
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN = Path(r"C:\Users\dogeg\.cursor\projects\c-xampp-htdocs-csgo-price-tracker\assets\cases-nav-icon-gen.png")
OUT = ROOT / "assets" / "nav" / "items" / "cases.png"
SRC = ROOT / "assets" / "nav" / "items" / "cases-source.png"
SVG_OUT = ROOT / "assets" / "nav" / "items" / "cases.svg"

WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def to_mask(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (r + g + b) / 3.0
            px[x, y] = WHITE if (a >= 40 and lum >= 90) else CLEAR
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    pad = 24
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), CLEAR)
    canvas.paste(im, (pad, pad), im)
    return canvas


def dilate(im: Image.Image, radius: int) -> Image.Image:
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h), CLEAR)
    dst = out.load()
    r2 = radius * radius
    for y in range(h):
        for x in range(w):
            hit = False
            for dy in range(-radius, radius + 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in range(-radius, radius + 1):
                    if dx * dx + dy * dy > r2:
                        continue
                    xx = x + dx
                    if xx < 0 or xx >= w:
                        continue
                    if src[xx, yy][3] >= 40:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                dst[x, y] = WHITE
    return out


def erode(im: Image.Image, radius: int) -> Image.Image:
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h), CLEAR)
    dst = out.load()
    r2 = radius * radius
    for y in range(h):
        for x in range(w):
            if src[x, y][3] < 40:
                continue
            keep = True
            for dy in range(-radius, radius + 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    keep = False
                    break
                for dx in range(-radius, radius + 1):
                    if dx * dx + dy * dy > r2:
                        continue
                    xx = x + dx
                    if xx < 0 or xx >= w or src[xx, yy][3] < 40:
                        keep = False
                        break
                if not keep:
                    break
            if keep:
                dst[x, y] = WHITE
    return out


def fill_interior_holes(im: Image.Image) -> Image.Image:
    w, h = im.size
    px = im.load()
    outside = [[False] * w for _ in range(h)]
    q = deque()

    def clear(x, y):
        return px[x, y][3] < 40

    for x in range(w):
        for y in (0, h - 1):
            if clear(x, y) and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if clear(x, y) and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and clear(nx, ny):
                outside[ny][nx] = True
                q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if clear(x, y) and not outside[y][x]:
                px[x, y] = WHITE
    return im


def scanline_fill(im: Image.Image) -> Image.Image:
    """Fill between first/last opaque pixel on each row and column pass."""
    w, h = im.size
    px = im.load()
    for y in range(h):
        xs = [x for x in range(w) if px[x, y][3] >= 40]
        if len(xs) >= 2:
            for x in range(xs[0], xs[-1] + 1):
                px[x, y] = WHITE
    for x in range(w):
        ys = [y for y in range(h) if px[x, y][3] >= 40]
        if len(ys) >= 2:
            for y in range(ys[0], ys[-1] + 1):
                px[x, y] = WHITE
    return im


def finalize(im: Image.Image, target_h: int = 192) -> Image.Image:
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    pad = 8
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), CLEAR)
    canvas.paste(im, (pad, pad), im)
    scale = target_h / canvas.height
    target_w = max(1, int(round(canvas.width * scale)))
    canvas = canvas.resize((target_w, target_h), Image.Resampling.LANCZOS)
    px = canvas.load()
    for y in range(canvas.height):
        for x in range(canvas.width):
            px[x, y] = WHITE if px[x, y][3] >= 100 else CLEAR
    return canvas


if not GEN.is_file():
    raise SystemExit(f"missing detailed source: {GEN}")

# Downscale first so morphological ops are fast and seal gaps cleanly.
raw = Image.open(GEN).convert("RGBA")
raw.thumbnail((420, 320), Image.Resampling.LANCZOS)
mask = to_mask(raw)

# Close thin inner channels (ribs / latches / handle), then seal leftovers.
closed = erode(dilate(mask, 6), 6)
closed = fill_interior_holes(closed)
closed = scanline_fill(closed)
closed = fill_interior_holes(closed)

out = finalize(closed)
out.save(OUT, "PNG")
out.save(SRC, "PNG")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {out.size[0]}x{out.size[1]})")

SVG_OUT.write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 52" fill="#fff">
  <path d="M10 20 L40 8 L70 20 L66 26 V42 L40 50 L14 42 V26 Z"/>
</svg>
""",
    encoding="utf-8",
)
print(f"wrote {SVG_OUT}")
