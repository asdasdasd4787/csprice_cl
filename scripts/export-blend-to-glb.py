import bpy
import sys

argv = sys.argv
if "--" not in argv:
    raise SystemExit("Usage: blender --background file.blend --python export-blend-to-glb.py -- out.glb")

out_path = argv[argv.index("--") + 1]

for obj in list(bpy.data.objects):
    if obj.type not in {"MESH", "ARMATURE", "EMPTY"}:
        obj.select_set(False)
        continue
    name = obj.name.lower()
    if any(token in name for token in ("camera", "light", "sun", "area")):
        obj.hide_set(True)
        obj.hide_render = True

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.data.objects:
    if obj.type == "MESH" and not obj.hide_get():
        obj.select_set(True)

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)

print(f"Exported {out_path}")
