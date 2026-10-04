"""
For a given base weapon .gltf (which contains both a body_hd and a
body_legacy mesh) and a single skin texture, render two preview images:
one with the texture applied to body_hd (body_legacy deleted), one with
the texture applied to body_legacy (body_hd deleted) -- so the two can be
compared visually to see which mesh generation the texture actually
matches.

Run:
  "tools\\blender51\\blender.exe" --background --python scripts\\compare_body_variants.py -- \
      --model "<path to weapon_xxx.gltf>" --texture "<path to skin.png>" --out-prefix "<name>"

Writes <out-prefix>__hd.png and <out-prefix>__legacy.png next to this script
(or to --out-dir if given).
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = ROOT / "scripts" / "_body_compare_out"
RENDER_SIZE = (640, 400)
NON_SKIN_MATERIAL_HINTS = ("sticker", "gap", "patch", "decal")


def log(msg):
    print(f"[compare_body] {msg}", flush=True)


def clean_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block_collection in (
        bpy.data.meshes, bpy.data.materials, bpy.data.images,
        bpy.data.armatures, bpy.data.actions, bpy.data.node_groups,
        bpy.data.cameras, bpy.data.lights,
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
            if mat is None or mat.name in seen_materials or not mat.use_nodes:
                continue
            seen_materials.add(mat.name)
            lowered = mat.name.lower()
            if any(hint in lowered for hint in NON_SKIN_MATERIAL_HINTS):
                continue
            for node in mat.node_tree.nodes:
                if node.type != "BSDF_PRINCIPLED":
                    continue
                base_color_input = node.inputs.get("Base Color")
                if not base_color_input or not base_color_input.is_linked:
                    continue
                src = base_color_input.links[0].from_node
                if src.type == "TEX_IMAGE":
                    nodes.append((obj, src))
    return nodes


def combined_bounds(objects):
    min_v = Vector((math.inf, math.inf, math.inf))
    max_v = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in objects:
        if obj.type != "MESH" or not obj.visible_get():
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_v.x = min(min_v.x, world.x)
            min_v.y = min(min_v.y, world.y)
            min_v.z = min(min_v.z, world.z)
            max_v.x = max(max_v.x, world.x)
            max_v.y = max(max_v.y, world.y)
            max_v.z = max(max_v.z, world.z)
            found = True
    if not found:
        return Vector((0, 0, 0)), 1.0
    center = (min_v + max_v) / 2
    size = max((max_v - min_v).x, (max_v - min_v).y, (max_v - min_v).z, 0.001)
    return center, size


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE[0]
    scene.render.resolution_y = RENDER_SIZE[1]
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def add_lights(center, size):
    key = bpy.data.lights.new("key", type="AREA")
    key.energy = 800
    key.size = size * 2
    key_obj = bpy.data.objects.new("key", key)
    key_obj.location = center + Vector((size * 1.2, -size * 1.5, size * 1.3))
    bpy.context.collection.objects.link(key_obj)
    key_obj.rotation_euler = (math.radians(55), 0, math.radians(35))

    fill = bpy.data.lights.new("fill", type="AREA")
    fill.energy = 300
    fill.size = size * 2
    fill_obj = bpy.data.objects.new("fill", fill)
    fill_obj.location = center + Vector((-size * 1.4, -size * 0.8, size * 0.6))
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-40))

    rim = bpy.data.lights.new("rim", type="AREA")
    rim.energy = 400
    rim.size = size * 2
    rim_obj = bpy.data.objects.new("rim", rim)
    rim_obj.location = center + Vector((0, size * 1.6, size * 0.4))
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.rotation_euler = (math.radians(100), 0, 0)


def add_camera(center, size):
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.lens = 85
    cam_obj = bpy.data.objects.new("preview_cam", cam_data)
    distance = size * 2.1
    offset = Vector((distance * 0.95, -distance * 0.55, distance * 0.35))
    cam_obj.location = center + offset
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    direction = center - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_variant(model_path: Path, texture_path: Path, keep: str, out_path: Path):
    """keep: 'body_hd' or 'body_legacy' -- the other is deleted before render."""
    clean_scene()
    bpy.ops.import_scene.gltf(filepath=str(model_path))
    objects = list(bpy.context.selected_objects)
    if not objects:
        log(f"  ! import produced no objects for {model_path.name}")
        return False

    drop = "body_legacy" if keep == "body_hd" else "body_hd"
    for obj in list(bpy.data.objects):
        name = obj.name.lower()
        if drop in name:
            bpy.data.objects.remove(obj, do_unlink=True)
    objects = [o for o in bpy.data.objects if o.type in ("MESH", "ARMATURE")]

    image_nodes = find_base_color_image_nodes([o for o in objects if o.type == "MESH"])
    if not image_nodes:
        log(f"  ! no Base Color image node found for variant '{keep}'")
        return False
    new_image = bpy.data.images.load(str(texture_path), check_existing=True)
    for _obj, node in image_nodes:
        node.image = new_image

    center, size = combined_bounds(objects)
    setup_render()
    add_lights(center, size)
    add_camera(center, size)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
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

    model = arg("--model")
    texture = arg("--texture")
    out_prefix = arg("--out-prefix", "compare")
    out_dir = Path(arg("--out-dir", str(DEFAULT_OUT_DIR)))

    if not model or not texture:
        log("ERROR: --model and --texture are required")
        return

    model_path = Path(model)
    texture_path = Path(texture)
    if not model_path.is_file():
        log(f"ERROR: model not found: {model_path}")
        return
    if not texture_path.is_file():
        log(f"ERROR: texture not found: {texture_path}")
        return

    hd_out = out_dir / f"{out_prefix}__hd.png"
    legacy_out = out_dir / f"{out_prefix}__legacy.png"

    ok_hd = render_variant(model_path, texture_path, "body_hd", hd_out)
    ok_legacy = render_variant(model_path, texture_path, "body_legacy", legacy_out)

    log(f"hd: {'OK -> ' + str(hd_out) if ok_hd else 'FAILED'}")
    log(f"legacy: {'OK -> ' + str(legacy_out) if ok_legacy else 'FAILED'}")


if __name__ == "__main__":
    main()
