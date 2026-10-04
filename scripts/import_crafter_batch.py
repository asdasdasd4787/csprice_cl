"""
Batch-import the freshly Blender-textured skins from C:\\Users\\User\\CS2_ModelsTextured
into the Skin Crafter, mirroring scripts/import-crafter-skin.js (same steps, just done
for ~50 files at once instead of one at a time via Node, since Node isn't installed here):

  1. copy each .glb into assets/models/skins/<finish_token>.glb
  2. run the normal-alpha patch (same fix used for AK-47 | Cartel)
  3. upsert assets/models/skins/manifest.json
  4. upsert assets/models/crafter/batch-map.json
  5. insert a LOCAL_MODEL_MATCHERS row into BOTH react/skin-viewer-core.js and
     react/item-page.tsx (the two independent copies of that array)

Run: python scripts/import_crafter_batch.py
"""
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(r"C:\Users\User\CS2_ModelsTextured")
DEST_DIR = ROOT / "assets" / "models" / "skins"
MANIFEST_PATH = DEST_DIR / "manifest.json"
BATCH_MAP_PATH = ROOT / "assets" / "models" / "crafter" / "batch-map.json"
VIEWER_CORE_PATH = ROOT / "react" / "skin-viewer-core.js"
ITEM_PAGE_PATH = ROOT / "react" / "item-page.tsx"
PATCH_SCRIPT = ROOT / "scripts" / "patch_glb_normal_alpha.py"

WEAPON_DISPLAY = {
    "ak47": "AK-47",
    "deagle": "Desert Eagle",
    "mp7": "MP7",
    "mp9": "MP9",
    "p250": "P250",
    "revoler": "R8 Revolver",
    "nova": "Nova",
    "negev": "Negev",
    "m249": "M249",
}

STOPWORDS = {"tga", "psd", "png", "jpg", "jpeg", "albedo", "texture", "model", "finished"}
NAME_OVERRIDES = {
    "Fireserpent": "Fire Serpent",
    "T Bus": "T-Bus",
    "Mp7-commander": "Commander",
}
# Some texture filenames use a different token for the weapon than the folder
# name itself (e.g. R8 Revolver textures are prefixed "r8_", not "revoler_";
# Negev textures use a leftover "mach_" prefix from the internal weapon slot).
WEAPON_ALIASES = {
    "revoler": {"r8"},
    "negev": {"mach"},
}


def version_tag():
    d = datetime.now()
    return f"{d.year}{d.month:02d}{d.day:02d}-crafter-import-1"


def clean_skin_name(texture_stem, weapon_key):
    stem = re.sub(r"_[0-9a-f]{6,10}$", "", texture_stem, flags=re.IGNORECASE)
    tokens = [t for t in stem.split("_") if t]
    if tokens and tokens[0] in ("cu", "gs", "aq"):
        tokens = tokens[1:]
    aliases = WEAPON_ALIASES.get(weapon_key, set())
    tokens = [t for t in tokens if t.lower() not in STOPWORDS and t.lower() != weapon_key and t.lower() not in aliases]
    if not tokens:
        tokens = [t for t in stem.split("_") if t]
    name = " ".join(tok.capitalize() for tok in tokens)
    return NAME_OVERRIDES.get(name, name)


def slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug[:48] or "skin"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def upsert_manifest(items_to_add, version):
    payload = read_json(MANIFEST_PATH) if MANIFEST_PATH.is_file() else {"items": []}
    items = payload.get("items") or []
    names_to_add = {row["market_name"] for row in items_to_add}
    kept = [row for row in items if row.get("market_name") not in names_to_add]
    manifest_rows = [
        {
            "market_name": row["market_name"],
            "finish_token": row["finish_token"],
            "model_url": f"{row['model_url']}?v={version}",
            "source_url": "",
            "updated_at": version,
        }
        for row in items_to_add
    ]
    payload["items"] = manifest_rows + kept
    write_json(MANIFEST_PATH, payload)


def upsert_batch_map(items_to_add, version):
    payload = read_json(BATCH_MAP_PATH)
    items = payload.get("items") or []
    names_to_add = {row["market_name"].lower() for row in items_to_add}
    kept = [row for row in items if str(row.get("market_name", "")).lower() not in names_to_add]
    batch_rows = [
        {
            "model_url": row["model_url"],
            "market_name": row["market_name"],
            "finish_token": row["finish_token"],
            "name_color": "8847FF",
        }
        for row in items_to_add
    ]
    payload["version"] = version
    payload["items"] = kept + batch_rows
    write_json(BATCH_MAP_PATH, payload)


def insert_matchers(file_path, items_to_add, version):
    source = file_path.read_text(encoding="utf-8")
    marker = "const LOCAL_MODEL_MATCHERS = ["
    start = source.find(marker)
    if start < 0:
        raise RuntimeError(f"LOCAL_MODEL_MATCHERS not found in {file_path}")
    insert_at = start + len(marker)

    existing_lower = source.lower()
    lines = []
    for row in items_to_add:
        match_key = row["market_name"].lower()
        if f'"{match_key}"' in existing_lower:
            continue  # already present (e.g. re-running the importer)
        url = f"{row['model_url']}?v={version}"
        lines.append(f'\n    {{ matches: ["{match_key}"], url: "{url}" }},')

    if not lines:
        return 0

    next_source = source[:insert_at] + "".join(lines) + source[insert_at:]
    file_path.write_text(next_source, encoding="utf-8")
    return len(lines)


def main():
    if not SOURCE_DIR.is_dir():
        print(f"ERROR: source dir not found: {SOURCE_DIR}")
        return 1

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    version = version_tag()
    items_to_add = []
    seen_names = set()

    for weapon_dir in sorted(SOURCE_DIR.iterdir()):
        if not weapon_dir.is_dir():
            continue
        weapon_key = weapon_dir.name
        display = WEAPON_DISPLAY.get(weapon_key)
        if not display:
            print(f"SKIP unknown weapon folder: {weapon_key}")
            continue

        for glb_path in sorted(weapon_dir.glob("*.glb")):
            stem = glb_path.stem
            if "__" not in stem:
                print(f"  ! unexpected filename, skipping: {glb_path.name}")
                continue
            _, texture_stem = stem.split("__", 1)
            skin_name = clean_skin_name(texture_stem, weapon_key)
            market_name = f"{display} | {skin_name}"
            if market_name in seen_names:
                market_name = f"{display} | {skin_name} ({texture_stem[-6:]})"
            seen_names.add(market_name)

            finish_token = texture_stem
            dest_name = f"{weapon_key}_{slugify(skin_name)}"
            dest_path = DEST_DIR / f"{dest_name}.glb"
            shutil.copyfile(glb_path, dest_path)

            items_to_add.append({
                "market_name": market_name,
                "finish_token": finish_token,
                "model_url": f"assets/models/skins/{dest_name}.glb",
            })

    print(f"Copied {len(items_to_add)} models into {DEST_DIR}")

    if not items_to_add:
        print("Nothing to do.")
        return 0

    print("Running normal-alpha patch...")
    result = subprocess.run(
        [sys.executable, str(PATCH_SCRIPT), "--dirs", str(DEST_DIR)],
        cwd=str(ROOT),
    )
    if result.returncode != 0:
        print(f"WARNING: patch script exited {result.returncode}")

    upsert_manifest(items_to_add, version)
    upsert_batch_map(items_to_add, version)
    n1 = insert_matchers(VIEWER_CORE_PATH, items_to_add, version)
    n2 = insert_matchers(ITEM_PAGE_PATH, items_to_add, version)

    print(f"manifest.json + batch-map.json updated with {len(items_to_add)} entries")
    print(f"LOCAL_MODEL_MATCHERS: +{n1} in skin-viewer-core.js, +{n2} in item-page.tsx")
    print(f"version tag: {version}")

    for row in items_to_add:
        print(f"  {row['market_name']}  ->  {row['model_url']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
