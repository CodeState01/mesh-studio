# Mesh → Godot 4

Godot imports `.glb`/`.gltf` natively, so no plugin is needed.

1. In Mesh, open **Engines → Godot → Escolher pasta** and select a folder inside your project, for example `meu_jogo/mesh`.
2. Turn on **Sync ao vivo** (live sync).
3. Godot detects the file change and reimports it on its own. Drag `mesh_cena.glb` into your scene, and it stays updated after that (it becomes an inherited scene).

Tip: in the `.glb` Import tab, turn on *Meshes › Generate LODs* and *Physics* if you need collision.
