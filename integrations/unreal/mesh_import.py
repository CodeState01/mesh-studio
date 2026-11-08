# Mesh → Unreal Engine 5: importa os .glb da pasta "inbox" para /Game/Mesh.
# Requer o plugin "Python Editor Script Plugin" (e "glTF Importer", ativo por padrão no UE5).
# Uso: Output Log > Python:  py "C:/caminho/mesh_import.py" "C:/MeuProjeto/MeshInbox"
# Dica: adicione em Project Settings > Python > Startup Scripts para rodar sozinho.
import os
import sys
import unreal

INBOX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(unreal.Paths.project_dir(), "MeshInbox")
DEST = "/Game/Mesh"


def import_all():
    tasks = []
    for name in os.listdir(INBOX):
        if not name.lower().endswith((".glb", ".gltf", ".obj")):
            continue
        t = unreal.AssetImportTask()
        t.filename = os.path.join(INBOX, name)
        t.destination_path = DEST
        t.replace_existing = True
        t.automated = True
        t.save = True
        tasks.append(t)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    unreal.log(f"[Mesh] {len(tasks)} arquivo(s) importado(s) para {DEST}")


import_all()
