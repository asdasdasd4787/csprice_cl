"""
Render a marketplace-style preview thumbnail (side 3/4 view, transparent
background) for each Skin Crafter model, headless via Blender.

Run: "tools\\blender51\\blender.exe" --background --python scripts\\render_crafter_previews.py -- [--only <dest_name>]
"""
import bpy
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SKINS_DIR = ROOT / "assets" / "models" / "skins"
OUT_DIR = SKINS_DIR / "previews"

RENDER_SIZE = (640, 400)


def log(msg):
    print(f"[render_previews] {msg}", flush=True)


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


def combined_bounds(objects):
    min_v = Vector((math.inf, math.inf, math.inf))
    max_v = Vector((-math.inf, -math.inf, -math.inf))
    found = False
    for obj in objects:
        if obj.type != "MESH":
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
    # Side-elevated 3/4 view, framing the whole bounding sphere.
    distance = size * 2.1
    offset = Vector((distance * 0.95, -distance * 0.55, distance * 0.35))
    cam_obj.location = center + offset
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    direction = center - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam_obj


def render_one(glb_path: Path, out_path: Path):
    clean_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    objects = list(bpy.context.selected_objects)
    if not objects:
        log(f"  ! no objects imported from {glb_path.name}")
        return False

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
    only = None
    list_file = None
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        if "--only" in rest:
            only = rest[rest.index("--only") + 1]
        if "--list-file" in rest:
            list_file = rest[rest.index("--list-file") + 1]

    glb_files = sorted(SKINS_DIR.glob("*.glb"))
    if only:
        glb_files = [p for p in glb_files if p.stem == only]
    elif list_file:
        wanted = {
            line.strip() for line in Path(list_file).read_text(encoding="utf-8").splitlines() if line.strip()
        }
        glb_files = [p for p in glb_files if p.stem in wanted]

    if not glb_files:
        log("No matching .glb files found.")
        return

    ok = 0
    for glb_path in glb_files:
        out_path = OUT_DIR / f"{glb_path.stem}.png"
        log(f"Rendering {glb_path.name} -> {out_path.relative_to(ROOT)}")
        try:
            if render_one(glb_path, out_path):
                ok += 1
        except Exception as exc:  # noqa: BLE001
            log(f"  ! FAILED {glb_path.name}: {exc}")

    log(f"Done. Rendered {ok}/{len(glb_files)} previews.")


if __name__ == "__main__":
    main()
