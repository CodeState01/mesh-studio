# Mesh Live Link — add-on para Blender 3.6+/4.x
# Instalação: Edit > Preferences > Add-ons > Install... > este arquivo.
# Painel: View3D > Sidebar (N) > Mesh. Aponte para a pasta configurada no Mesh (Engines > Blender).
# Sempre que o Mesh envia um .glb, o add-on reimporta na coleção "Mesh".
bl_info = {
    "name": "Mesh Live Link",
    "author": "Mesh",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "View3D > Sidebar > Mesh",
    "description": "Recarrega automaticamente modelos enviados pelo Mesh",
    "category": "Import-Export",
}

import os
import bpy

_state = {"mtimes": {}}


def _collection():
    col = bpy.data.collections.get("Mesh")
    if not col:
        col = bpy.data.collections.new("Mesh")
        bpy.context.scene.collection.children.link(col)
    return col


def _reimport(path):
    col = _collection()
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    for obj in set(bpy.data.objects) - before:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        col.objects.link(obj)


def _poll():
    props = bpy.context.scene.mesh_link
    if not props.enabled or not props.folder:
        return 1.0
    folder = bpy.path.abspath(props.folder)
    if os.path.isdir(folder):
        for name in os.listdir(folder):
            if not name.lower().endswith((".glb", ".gltf")):
                continue
            p = os.path.join(folder, name)
            m = os.path.getmtime(p)
            if _state["mtimes"].get(p) != m:
                _state["mtimes"][p] = m
                try:
                    _reimport(p)
                    print("[Mesh] recarregado:", name)
                except Exception as e:  # noqa: BLE001
                    print("[Mesh] falha:", e)
    return 1.0


class MeshLinkProps(bpy.types.PropertyGroup):
    folder: bpy.props.StringProperty(name="Pasta", subtype="DIR_PATH")
    enabled: bpy.props.BoolProperty(name="Ativo", default=True)


class MESH_PT_panel(bpy.types.Panel):
    bl_label = "Mesh Live Link"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Mesh"

    def draw(self, context):
        p = context.scene.mesh_link
        self.layout.prop(p, "folder")
        self.layout.prop(p, "enabled")


classes = (MeshLinkProps, MESH_PT_panel)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.Scene.mesh_link = bpy.props.PointerProperty(type=MeshLinkProps)
    bpy.app.timers.register(_poll, persistent=True)


def unregister():
    if bpy.app.timers.is_registered(_poll):
        bpy.app.timers.unregister(_poll)
    del bpy.types.Scene.mesh_link
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
