import bpy
import os
import sys


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Missing '--' argument separator.")
    args = argv[argv.index("--") + 1:]
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


def import_model(filepath):
    extension = os.path.splitext(filepath)[1].lower()
    if extension in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=filepath)
        return
    try:
        bpy.ops.wm.obj_import(filepath=filepath)
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=filepath)


def mesh_objects_for_skin(mesh_preference="legacy"):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data]
    legacy_objects = [obj for obj in mesh_objects if "legacy" in obj.name.lower()]
    hd_objects = [obj for obj in mesh_objects if "body_hd" in obj.name.lower()]
    non_legacy_objects = [
        obj for obj in mesh_objects
        if "legacy" not in obj.name.lower() and "body_hd" not in obj.name.lower()
    ]

    if mesh_preference == "legacy":
        if legacy_objects:
            return legacy_objects
        return non_legacy_objects or mesh_objects

    if hd_objects:
        return hd_objects
    if non_legacy_objects:
        return non_legacy_objects
    return legacy_objects or mesh_objects


def normalize_object_setup(mesh_preference="legacy"):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    placeholder_names = {"cube", "icosphere", "sphere", "plane"}
    for obj in list(mesh_objects):
        name = obj.name.lower().split(".")[-1]
        if name in placeholder_names or obj.name.lower() in placeholder_names:
            bpy.data.objects.remove(obj, do_unlink=True)

    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    keep_meshes = mesh_objects_for_skin(mesh_preference)
    for obj in list(mesh_objects):
        if obj not in keep_meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.rotation_euler = (0.0, 0.0, 0.0)
        obj.scale = (1.0, 1.0, 1.0)

    bpy.context.view_layer.update()


def resolve_uv_map_names(objects):
    primary = "UVMap"
    secondary = "UVMap.001"
    for obj in objects:
        layers = getattr(obj.data, "uv_layers", None)
        if not layers or len(layers) == 0:
            continue
        primary = layers[0].name
        secondary = layers[1].name if len(layers) > 1 else layers[0].name
        break
    return primary, secondary


def build_patina_bake_material(
    pattern_path,
    base_color_path,
    mask_path,
    bake_image,
    uv_primary,
    uv_secondary,
):
    material = bpy.data.materials.new(name="CS2PatinaBakeMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (980, 0)
    emission = nodes.new("ShaderNodeEmission")
    emission.location = (760, 0)

    uv_primary_node = nodes.new("ShaderNodeUVMap")
    uv_primary_node.location = (-980, 120)
    uv_primary_node.uv_map = uv_primary

    uv_secondary_node = nodes.new("ShaderNodeUVMap")
    uv_secondary_node.location = (-980, -180)
    uv_secondary_node.uv_map = uv_secondary

    base_tex = nodes.new("ShaderNodeTexImage")
    base_tex.location = (-520, 260)
    base_tex.image = bpy.data.images.load(base_color_path)
    base_tex.extension = "CLIP"
    links.new(uv_primary_node.outputs["UV"], base_tex.inputs["Vector"])

    pattern_tex = nodes.new("ShaderNodeTexImage")
    pattern_tex.location = (-520, -40)
    pattern_tex.image = bpy.data.images.load(pattern_path)
    pattern_tex.extension = "CLIP"
    links.new(uv_secondary_node.outputs["UV"], pattern_tex.inputs["Vector"])

    mask_tex = nodes.new("ShaderNodeTexImage")
    mask_tex.location = (-520, -320)
    mask_tex.image = bpy.data.images.load(mask_path)
    mask_tex.image.colorspace_settings.name = "Non-Color"
    mask_tex.extension = "CLIP"
    links.new(uv_primary_node.outputs["UV"], mask_tex.inputs["Vector"])

    mask_value = nodes.new("ShaderNodeSeparateColor")
    mask_value.location = (-260, -320)
    links.new(mask_tex.outputs["Color"], mask_value.inputs["Color"])

    invert_mask = nodes.new("ShaderNodeMath")
    invert_mask.location = (-120, -320)
    invert_mask.operation = "SUBTRACT"
    invert_mask.inputs[0].default_value = 1.0
    links.new(mask_value.outputs["Red"], invert_mask.inputs[1])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (-40, 40)
    mix.blend_type = "MIX"
    links.new(base_tex.outputs["Color"], mix.inputs["A"])
    links.new(pattern_tex.outputs["Color"], mix.inputs["B"])
    links.new(invert_mask.outputs["Value"], mix.inputs["Factor"])

    bake_node = nodes.new("ShaderNodeTexImage")
    bake_node.location = (220, 260)
    bake_node.image = bake_image
    bake_node.select = True
    nodes.active = bake_node

    emission_output = emission.outputs.get("Emission") or emission.outputs.get("Color")
    links.new(mix.outputs["Result"], emission.inputs["Color"])
    links.new(emission_output, output.inputs["Surface"])
    return material, bake_node


def build_export_material(baked_path, normal_path=None):
    material = bpy.data.materials.new(name="CS2SkinMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (760, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (520, 0)
    shader.inputs["Roughness"].default_value = 0.48
    shader.inputs["Metallic"].default_value = 0.12
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-760, 40)

    albedo = nodes.new("ShaderNodeTexImage")
    albedo.location = (-260, 120)
    albedo.image = bpy.data.images.load(baked_path)
    albedo.extension = "CLIP"
    links.new(tex_coord.outputs["UV"], albedo.inputs["Vector"])
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])

    if normal_path and os.path.exists(normal_path):
        normal = nodes.new("ShaderNodeTexImage")
        normal.location = (-260, -160)
        normal.image = bpy.data.images.load(normal_path)
        normal.image.colorspace_settings.name = "Non-Color"
        links.new(tex_coord.outputs["UV"], normal.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (120, -140)
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

    return material


def assign_material(objects, material):
    for obj in objects:
        if len(obj.material_slots) <= 0:
            obj.data.materials.append(material)
        else:
            for index in range(len(obj.material_slots)):
                obj.material_slots[index].material = material


def bake_albedo(objects, material, bake_node, bake_path, uv_primary):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8

    assign_material(objects, material)

    for obj in objects:
        if not obj.data.uv_layers:
            continue
        obj.data.uv_layers.active = obj.data.uv_layers.get(uv_primary) or obj.data.uv_layers[0]

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    material.node_tree.nodes.active = bake_node
    bake_node.select = True

    os.makedirs(os.path.dirname(bake_path), exist_ok=True)
    bpy.ops.object.bake(type="EMIT", margin=8, use_clear=True)
    bake_node.image.filepath_raw = bake_path
    bake_node.image.file_format = "PNG"
    bake_node.image.save()
    return bake_path


def cleanup_scene_for_export(mesh_preference="legacy"):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    keep_meshes = mesh_objects_for_skin(mesh_preference)
    for obj in mesh_objects:
        if obj not in keep_meshes:
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT", "ARMATURE", "EMPTY"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()


def export_glb(output_path, mesh_preference="legacy"):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cleanup_scene_for_export(mesh_preference)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_image_format="AUTO",
        export_jpeg_quality=98,
        export_image_quality=98,
        use_selection=False,
    )


def main():
    args = parse_args()
    base_model = args.get("base-model", "")
    pattern_path = args.get("pattern", "")
    base_color_path = args.get("base-color", "")
    mask_path = args.get("paint-mask", "")
    normal_path = args.get("normal", "")
    output_path = args.get("output", "")
    bake_path = args.get("bake-output", "")
    mesh_preference = args.get("mesh-preference", "legacy").strip().lower()
    bake_size = int(float(args.get("bake-size", "2048") or "2048"))

    if mesh_preference not in {"hd", "legacy"}:
        mesh_preference = "legacy"

    if not base_model or not os.path.exists(base_model):
        raise SystemExit(f"Base model not found: {base_model}")
    if not pattern_path or not os.path.exists(pattern_path):
        raise SystemExit(f"Pattern texture not found: {pattern_path}")
    if not base_color_path or not os.path.exists(base_color_path):
        raise SystemExit(f"Base color texture not found: {base_color_path}")
    if not mask_path or not os.path.exists(mask_path):
        raise SystemExit(f"Paint mask texture not found: {mask_path}")
    if not output_path:
        raise SystemExit("Missing output path.")

    base_model = os.path.abspath(base_model)
    pattern_path = os.path.abspath(pattern_path)
    base_color_path = os.path.abspath(base_color_path)
    mask_path = os.path.abspath(mask_path)
    if normal_path:
        normal_path = os.path.abspath(normal_path)
    output_path = os.path.abspath(output_path)
    if not bake_path:
        bake_path = os.path.splitext(output_path)[0] + "_albedo.png"
    bake_path = os.path.abspath(bake_path)

    clear_scene()
    import_model(base_model)
    normalize_object_setup(mesh_preference)
    mesh_objects = mesh_objects_for_skin(mesh_preference)
    if not mesh_objects:
        raise SystemExit("No mesh objects found to export.")

    uv_primary, uv_secondary = resolve_uv_map_names(mesh_objects)
    bake_image = bpy.data.images.new("BakedAlbedo", bake_size, bake_size, alpha=False)
    bake_material, bake_node = build_patina_bake_material(
        pattern_path,
        base_color_path,
        mask_path,
        bake_image,
        uv_primary,
        uv_secondary,
    )
    bake_albedo(mesh_objects, bake_material, bake_node, bake_path, uv_primary)

    export_material = build_export_material(
        bake_path,
        normal_path if normal_path and os.path.exists(normal_path) else None,
    )
    assign_material(mesh_objects, export_material)
    export_glb(output_path, mesh_preference)


if __name__ == "__main__":
    main()
