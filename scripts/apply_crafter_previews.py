"""
Point each new Skin Crafter entry's preview_image at the locally rendered
thumbnail in assets/models/skins/previews/<dest_name>.png.

Run: python scripts/apply_crafter_previews.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets" / "models" / "skins" / "manifest.json"
BATCH_MAP_PATH = ROOT / "assets" / "models" / "crafter" / "batch-map.json"
PREVIEWS_DIR = ROOT / "assets" / "models" / "skins" / "previews"
VERSION = "20260915-crafter-import-1"


def dest_name_from_model_url(model_url):
    tail = model_url.rsplit("/", 1)[-1]
    stem = tail.split("?", 1)[0]
    return stem[:-4] if stem.endswith(".glb") else stem


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def apply_to(path, is_manifest):
    payload = read_json(path)
    items = payload.get("items") or []
    updated = 0
    for row in items:
        model_url = str(row.get("model_url", ""))
        if is_manifest and VERSION not in model_url:
            continue
        if not is_manifest and "assets/models/skins/" not in model_url:
            continue
        dest_name = dest_name_from_model_url(model_url)
        preview_path = PREVIEWS_DIR / f"{dest_name}.png"
        if not preview_path.is_file():
            continue
        row["preview_image"] = f"assets/models/skins/previews/{dest_name}.png?v={VERSION}"
        updated += 1
    write_json(path, payload)
    print(f"{path.name}: updated {updated} preview_image field(s)")


def main():
    apply_to(MANIFEST_PATH, True)
    apply_to(BATCH_MAP_PATH, False)


if __name__ == "__main__":
    main()
