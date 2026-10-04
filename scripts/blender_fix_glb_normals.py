"""Recalculate outward-facing mesh normals and export a clean single-sided GLB."""
import bpy
import os
import sys


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Missing '--' argument separator.")
    args = argv[argv.index("--") + 1 :]
    parsed = {}
    index = 0
    while index < len(args):
        key = args[index]
        if not key.startswith("--"):
            index += 1
            continue
        value = args[index + 1] if index + 1 < len(args) else ""
        parsed[key[2:]] = value
        index += 2
    return parsed


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.images):
        bpy.data.images.remove(block)


def main():
    args = parse_args()
    source = args.get("input", "")
    output = args.get("output", "")
    if not source or not os.path.exists(source):
        raise SystemExit(f"Input not found: {source}")
    if not output:
        raise SystemExit("Missing --output")

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=source)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not mesh_objects:
        raise SystemExit("No meshes in GLB")

    for obj in mesh_objects:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)

        for slot in obj.material_slots:
            mat = slot.material
            if not mat:
                continue
            if hasattr(mat, "use_backface_culling"):
                mat.use_backface_culling = True
            if hasattr(mat, "show_transparent_back"):
                mat.show_transparent_back = False

    os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_image_format="AUTO",
        export_jpeg_quality=98,
        export_image_quality=98,
        use_selection=False,
    )
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
