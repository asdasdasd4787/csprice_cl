"""
Re-export a Skin Crafter .glb with only ONE weapon body baked in (body_hd
or body_legacy -- the other is deleted before export), fixing the bug where
both generations end up in the same file and the site's viewer picks the
wrong one for a given texture.

Run once per weapon with a JSON job list:
  "tools\\blender51\\blender.exe" --background --python scripts\\finalize_body_choice.py -- \
      --model "<weapon_xxx.gltf>" --jobs "<jobs.json>"

jobs.json: [{"texture": "<path to skin png>", "keep": "body_hd"|"body_legacy", "out": "<output .glb path>"}, ...]
"""
import bpy
import json
import sys
from pathlib import Path

NON_SKIN_MATERIAL_HINTS = ("sticker", "gap", "patch", "decal")


def log(msg):
    print(f"[finalize_body] {msg}", flush=True)


def clean_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block_collection in (
        bpy.data.meshes, bpy.data.materials, bpy.data.images,
        bpy.data.armatures, bpy.data.actions, bpy.data.node_groups,
    ):
        for block in list(block_collection):
            if block.users == 0:
                block_collection.remove(block)


def find_base_color_image_nodes(objects):
    seen_materials = set()
    nodes = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen_materials:
                continue
            seen_materials.add(mat.name)
            lowered = mat.name.lower()
            if any(hint in lowered for hint in NON_SKIN_MATERIAL_HINTS):
                continue
            if not mat.node_tree:
                continue
            for node in mat.node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                base_color_input = node.inputs.get("Base Color")
                if not base_color_input or not base_color_input.is_linked:
                    continue
                src = base_color_input.links[0].from_node
                if src.type == "TEX_IMAGE":
                    nodes.append(src)
    return nodes


def run_job(model_path: Path, texture_path: Path, keep: str, out_path: Path) -> bool:
    clean_scene()
    bpy.ops.import_scene.gltf(filepath=str(model_path))

    drop = "body_legacy" if keep == "body_hd" else "body_hd"
    for obj in list(bpy.data.objects):
        if drop in obj.name.lower():
            bpy.data.objects.remove(obj, do_unlink=True)
    # Also drop stray junk objects (e.g. a leftover "Icosphere" placeholder)
    # that carry no material and aren't part of the armature hierarchy.
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and not obj.material_slots and obj.parent is None:
            bpy.data.objects.remove(obj, do_unlink=True)

    objects = list(bpy.data.objects)
    image_nodes = find_base_color_image_nodes([o for o in objects if o.type == "MESH"])
    if not image_nodes:
        log(f"  ! no Base Color image node for {out_path.name}")
        return False
    new_image = bpy.data.images.load(str(texture_path), check_existing=True)
    for node in image_nodes:
        node.image = new_image

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
    )
    return True


def main():
    argv = sys.argv
    if "--" not in argv:
        log("ERROR: pass args after --")
        return
    rest = argv[argv.index("--") + 1:]

    def arg(name, default=None):
        if name in rest:
            return rest[rest.index(name) + 1]
        return default

    model_path = Path(arg("--model"))
    jobs_path = Path(arg("--jobs"))
    if not model_path.is_file():
        log(f"ERROR: model not found: {model_path}")
        return
    if not jobs_path.is_file():
        log(f"ERROR: jobs file not found: {jobs_path}")
        return

    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    ok = 0
    for job in jobs:
        texture_path = Path(job["texture"])
        keep = job["keep"]
        out_path = Path(job["out"])
        if not texture_path.is_file():
            log(f"  ! texture missing: {texture_path}")
            continue
        try:
            if run_job(model_path, texture_path, keep, out_path):
                ok += 1
                log(f"  -> {out_path} (kept {keep})")
        except Exception as exc:  # noqa: BLE001
            log(f"  ! FAILED {out_path.name}: {exc}")

    log(f"Done. {ok}/{len(jobs)} finalized.")


if __name__ == "__main__":
    main()
