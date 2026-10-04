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

    if extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=filepath)
        return

    try:
        bpy.ops.wm.obj_import(filepath=filepath)
    except AttributeError:
        bpy.ops.import_scene.obj(filepath=filepath)


def ensure_directory(path):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def build_material(albedo_path, normal_path=None, roughness_path=None, ao_path=None):
    material = bpy.data.materials.new(name="CS2SkinMaterial")
    material.use_nodes = True
    if hasattr(material, "blend_method"):
        material.blend_method = "OPAQUE"
    if hasattr(material, "shadow_method"):
        material.shadow_method = "OPAQUE"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (700, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (320, 0)
    shader.inputs["IOR"].default_value = 2.0
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    albedo = nodes.new("ShaderNodeTexImage")
    albedo.location = (-520, 260)
    albedo.image = bpy.data.images.load(albedo_path)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-760, 260)
    links.new(tex_coord.outputs["UV"], albedo.inputs["Vector"])
    base_color_output = albedo.outputs["Color"]

    if ao_path and os.path.exists(ao_path):
        ao = nodes.new("ShaderNodeTexImage")
        ao.location = (-520, 80)
        ao.image = bpy.data.images.load(ao_path)
        ao.image.colorspace_settings.name = "Non-Color"
        links.new(tex_coord.outputs["UV"], ao.inputs["Vector"])
        ao_mix = nodes.new("ShaderNodeMixRGB")
        ao_mix.location = (-110, 180)
        ao_mix.blend_type = "MULTIPLY"
        ao_mix.inputs["Fac"].default_value = 1.0
        links.new(albedo.outputs["Color"], ao_mix.inputs["Color1"])
        links.new(ao.outputs["Color"], ao_mix.inputs["Color2"])
        base_color_output = ao_mix.outputs["Color"]

    links.new(base_color_output, shader.inputs["Base Color"])

    if roughness_path and os.path.exists(roughness_path):
        roughness = nodes.new("ShaderNodeTexImage")
        roughness.location = (-520, 0)
        roughness.image = bpy.data.images.load(roughness_path)
        roughness.image.colorspace_settings.name = "Non-Color"
        links.new(tex_coord.outputs["UV"], roughness.inputs["Vector"])
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.location = (-110, 0)
        links.new(roughness.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], shader.inputs["Roughness"])
        if "Metallic" in shader.inputs:
            links.new(separate.outputs["Blue"], shader.inputs["Metallic"])

    if normal_path and os.path.exists(normal_path):
        normal = nodes.new("ShaderNodeTexImage")
        normal.location = (-520, -260)
        normal.image = bpy.data.images.load(normal_path)
        normal.image.colorspace_settings.name = "Non-Color"
        links.new(tex_coord.outputs["UV"], normal.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.location = (-110, -240)
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])

    return material


def normalize_object_setup(mesh_preference="hd"):
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


def mesh_objects_for_skin(mesh_preference="hd"):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data]
    legacy_objects = [obj for obj in mesh_objects if "legacy" in obj.name.lower()]
    hd_objects = [obj for obj in mesh_objects if "body_hd" in obj.name.lower()]
    non_legacy_objects = [obj for obj in mesh_objects if "legacy" not in obj.name.lower() and "body_hd" not in obj.name.lower()]

    if mesh_preference == "legacy":
        if legacy_objects:
            return legacy_objects
        return non_legacy_objects or mesh_objects

    if hd_objects:
        return hd_objects
    if non_legacy_objects:
        return non_legacy_objects
    return legacy_objects or mesh_objects


def assign_material(obj, material):
    slot_count = len(obj.material_slots)
    if slot_count <= 0:
        obj.data.materials.append(material)
        return

    for index in range(slot_count):
        obj.material_slots[index].material = material


def cleanup_scene_for_export(mesh_preference="hd"):
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    keep_meshes = mesh_objects_for_skin(mesh_preference)

    for obj in list(mesh_objects):
        if obj not in keep_meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT", "ARMATURE", "EMPTY"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.context.view_layer.update()


def export_glb(output_path, mesh_preference="hd"):
    ensure_directory(output_path)
    cleanup_scene_for_export(mesh_preference)
    # Prefer lossless embeds when source textures already include alpha (Cartel-quality PNGs).
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_image_format="AUTO",
        export_jpeg_quality=98,
        export_image_quality=98,
        use_selection=False
    )


def main():
    args = parse_args()
    base_model = args.get("base-model", "")
    albedo_path = args.get("albedo", "")
    normal_path = args.get("normal", "")
    roughness_path = args.get("roughness", "")
    ao_path = args.get("ao", "")
    output_path = args.get("output", "")
    mesh_preference = args.get("mesh-preference", "hd").strip().lower()
    if mesh_preference not in {"hd", "legacy"}:
        mesh_preference = "hd"

    if not base_model or not os.path.exists(base_model):
        raise SystemExit(f"Base model not found: {base_model}")
    if not albedo_path or not os.path.exists(albedo_path):
        raise SystemExit(f"Albedo texture not found: {albedo_path}")
    if not output_path:
        raise SystemExit("Missing output path.")

    clear_scene()
    import_model(base_model)
    normalize_object_setup(mesh_preference)
    skin_material = build_material(albedo_path, normal_path or None, roughness_path or None, ao_path or None)

    for obj in mesh_objects_for_skin(mesh_preference):
        assign_material(obj, skin_material)

    export_glb(output_path, mesh_preference)


if __name__ == "__main__":
    main()
