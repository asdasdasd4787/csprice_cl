"""Export the opened .blend scene to GLB for the web viewer."""
import bpy
import sys

argv = sys.argv
args = argv[argv.index("--") + 1:] if "--" in argv else []
output_path = args[0] if args else ""

if not output_path:
    raise SystemExit("Missing output GLB path argument.")

for obj in list(bpy.data.objects):
    obj.select_set(False)

export_objects = [
    obj for obj in bpy.data.objects
    if obj.type in {"MESH", "ARMATURE", "EMPTY"}
]

if not export_objects:
    raise SystemExit("No exportable objects found in the .blend file.")

bpy.ops.object.select_all(action="DESELECT")
for obj in export_objects:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    break

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)

print("EXPORT_OK", output_path)
