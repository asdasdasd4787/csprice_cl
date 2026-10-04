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


def normalize_object_setup():
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    legacy_objects = [obj for obj in mesh_objects if "legacy" in obj.name.lower()]
    non_legacy_objects = [obj for obj in mesh_objects if "legacy" not in obj.name.lower()]

    if legacy_objects and non_legacy_objects:
        for obj in non_legacy_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        non_legacy_objects = []

    for obj in non_legacy_objects:
        obj.rotation_euler = (0.0, 0.0, 0.0)
        obj.scale = (1.0, 1.0, 1.0)

    if non_legacy_objects:
        for obj in legacy_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        for obj in legacy_objects:
            obj.rotation_euler = (0.0, 0.0, 0.0)
            obj.scale = (1.0, 1.0, 1.0)

    bpy.context.view_layer.update()


def mesh_objects_for_skin():
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data]
    legacy_objects = [obj for obj in mesh_objects if "legacy" in obj.name.lower()]
    if legacy_objects:
        return legacy_objects
    non_legacy_objects = [obj for obj in mesh_objects if "legacy" not in obj.name.lower()]
    if non_legacy_objects:
        return non_legacy_objects
    return mesh_objects


def parse_color(value, fallback):
    if not value:
        return fallback
    parts = [float(part) for part in value.replace(",", " ").split()]
    if len(parts) < 3:
        return fallback
    alpha = parts[3] if len(parts) > 3 else 1.0
    return (parts[0], parts[1], parts[2], alpha)


def lerp(a, b, t):
    return a + (b - a) * t


def composite_hydro_tile(pattern_path, grunge_path, colors, output_path):
    pattern = bpy.data.images.load(pattern_path)
    width, height = pattern.size
    pattern_pixels = list(pattern.pixels[:])

    grunge_pixels = None
    if grunge_path and os.path.exists(grunge_path):
        grunge = bpy.data.images.load(grunge_path)
        if grunge.size[0] == width and grunge.size[1] == height:
            grunge_pixels = list(grunge.pixels[:])

    color0, color1, color2, color3 = colors
    out_pixels = []

    for index in range(0, len(pattern_pixels), 4):
        red = pattern_pixels[index]
        green = pattern_pixels[index + 1]
        blue = pattern_pixels[index + 2]

        cr = lerp(color0[0], color1[0], red)
        cg = lerp(color0[1], color1[1], red)
        cb = lerp(color0[2], color1[2], red)

        cr = lerp(cr, color2[0], green)
        cg = lerp(cg, color2[1], green)
        cb = lerp(cb, color2[2], green)

        cr = lerp(cr, color3[0], blue)
        cg = lerp(cg, color3[1], blue)
        cb = lerp(cb, color3[2], blue)

        cr = min(1.0, cr * 1.08 + 0.04)
        cg = min(1.0, cg * 1.08 + 0.04)
        cb = min(1.0, cb * 1.08 + 0.04)

        if grunge_pixels:
            gray = grunge_pixels[index] * 0.299 + grunge_pixels[index + 1] * 0.587 + grunge_pixels[index + 2] * 0.114
            grunge_mix = 0.82 + gray * 0.18
            cr *= grunge_mix
            cg *= grunge_mix
            cb *= grunge_mix

        out_pixels.extend([cr, cg, cb, 1.0])

    tile = bpy.data.images.new("HydroTile", width=width, height=height, alpha=False)
    tile.pixels = out_pixels
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    tile.filepath_raw = output_path
    tile.file_format = "PNG"
    tile.save()
    return output_path


def build_masked_bake_material(
    tile_path,
    base_color_path,
    mask_path,
    bake_image,
    pattern_scale,
    pattern_offset_x,
    pattern_offset_y,
):
    material = bpy.data.materials.new(name="CS2SkinBakeMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (980, 0)
    emission = nodes.new("ShaderNodeEmission")
    emission.location = (760, 0)

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-980, 40)

    base_tex = nodes.new("ShaderNodeTexImage")
    base_tex.location = (-520, 220)
    base_tex.image = bpy.data.images.load(base_color_path)
    base_tex.extension = "CLIP"
    links.new(tex_coord.outputs["UV"], base_tex.inputs["Vector"])

    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-760, -120)
    mapping.inputs["Scale"].default_value = (pattern_scale, pattern_scale, pattern_scale)
    mapping.inputs["Location"].default_value = (pattern_offset_x, pattern_offset_y, 0.0)
    links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])

    pattern_tex = nodes.new("ShaderNodeTexImage")
    pattern_tex.location = (-520, -120)
    pattern_tex.image = bpy.data.images.load(tile_path)
    pattern_tex.extension = "REPEAT"
    links.new(mapping.outputs["Vector"], pattern_tex.inputs["Vector"])

    mask_tex = nodes.new("ShaderNodeTexImage")
    mask_tex.location = (-520, -360)
    mask_tex.image = bpy.data.images.load(mask_path)
    mask_tex.image.colorspace_settings.name = "Non-Color"
    mask_tex.extension = "CLIP"
    links.new(tex_coord.outputs["UV"], mask_tex.inputs["Vector"])

    mask_value = nodes.new("ShaderNodeSeparateColor")
    mask_value.location = (-260, -360)
    links.new(mask_tex.outputs["Color"], mask_value.inputs["Color"])

    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.location = (-40, 40)
    mix.blend_type = "MIX"
    links.new(base_tex.outputs["Color"], mix.inputs["A"])
    links.new(pattern_tex.outputs["Color"], mix.inputs["B"])
    links.new(mask_value.outputs["Red"], mix.inputs["Factor"])

    bake_node = nodes.new("ShaderNodeTexImage")
    bake_node.location = (220, 260)
    bake_node.image = bake_image
    bake_node.select = True
    nodes.active = bake_node

    links.new(mix.outputs["Result"], emission.inputs["Color"])
    emission_output = emission.outputs.get("Emission") or emission.outputs.get("Color")
    links.new(emission_output, output.inputs["Surface"])
    return material, bake_node


def build_export_material(baked_path):
    material = bpy.data.materials.new(name="CS2SkinMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (760, 0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (520, 0)
    shader.inputs["Roughness"].default_value = 0.58
    shader.inputs["Metallic"].default_value = 0.04
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-760, 0)
    albedo = nodes.new("ShaderNodeTexImage")
    albedo.location = (-260, 0)
    albedo.image = bpy.data.images.load(baked_path)
    albedo.extension = "CLIP"
    links.new(tex_coord.outputs["UV"], albedo.inputs["Vector"])
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    return material


def assign_material(objects, material):
    for obj in objects:
        if len(obj.material_slots) <= 0:
            obj.data.materials.append(material)
        else:
            for index in range(len(obj.material_slots)):
                obj.material_slots[index].material = material


def bake_albedo(objects, material, bake_node, bake_path):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8

    assign_material(objects, material)

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


def cleanup_scene_for_export():
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    legacy_objects = [obj for obj in mesh_objects if "legacy" in obj.name.lower()]
    keep_meshes = legacy_objects or mesh_objects

    for obj in mesh_objects:
        if obj not in keep_meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT", "ARMATURE", "EMPTY"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.context.view_layer.update()


def export_glb(output_path):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cleanup_scene_for_export()
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_image_format="AUTO",
        use_selection=False,
    )


def main():
    args = parse_args()
    base_model = args.get("base-model", "")
    pattern_path = args.get("pattern", "")
    grunge_path = args.get("grunge", "")
    base_color_path = args.get("base-color", "")
    mask_path = args.get("paint-mask", "")
    output_path = args.get("output", "")
    tile_path = args.get("tile-output", "")
    bake_path = args.get("bake-output", "")
    pattern_scale = float(args.get("pattern-scale", "14") or "14")
    pattern_offset_x = float(args.get("pattern-offset-x", "0.416") or "0.416")
    pattern_offset_y = float(args.get("pattern-offset-y", "0.97") or "0.97")
    bake_size = int(float(args.get("bake-size", "2048") or "2048"))

    colors = [
        parse_color(args.get("color0", ""), (0.294118, 0.282353, 0.329412, 1.0)),
        parse_color(args.get("color1", ""), (0.470588, 0.470588, 0.470588, 1.0)),
        parse_color(args.get("color2", ""), (0.188235, 0.188235, 0.188235, 1.0)),
        parse_color(args.get("color3", ""), (0.231373, 0.227451, 0.262745, 1.0)),
    ]

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
    if grunge_path:
        grunge_path = os.path.abspath(grunge_path)
    output_path = os.path.abspath(output_path)
    if not tile_path:
        tile_path = os.path.splitext(output_path)[0] + "_tile.png"
    tile_path = os.path.abspath(tile_path)
    if not bake_path:
        bake_path = os.path.splitext(output_path)[0] + "_albedo.png"
    bake_path = os.path.abspath(bake_path)

    clear_scene()
    composite_hydro_tile(pattern_path, grunge_path, colors, tile_path)

    import_model(base_model)
    normalize_object_setup()
    mesh_objects = mesh_objects_for_skin()
    if not mesh_objects:
        raise SystemExit("No mesh objects found to export.")

    bake_image = bpy.data.images.new("BakedAlbedo", bake_size, bake_size, alpha=False)
    bake_material, bake_node = build_masked_bake_material(
        tile_path,
        base_color_path,
        mask_path,
        bake_image,
        pattern_scale,
        pattern_offset_x,
        pattern_offset_y,
    )
    bake_albedo(mesh_objects, bake_material, bake_node, bake_path)

    export_material = build_export_material(bake_path)
    assign_material(mesh_objects, export_material)
    export_glb(output_path)


if __name__ == "__main__":
    main()
