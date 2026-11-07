// Argila → Unity: coloque este arquivo em Assets/Editor/.
// Requer o pacote glTFast (com.unity.cloud.gltfast) para importar .glb.
// Quando o Argila envia um .glb para Assets/Argila, o Unity reimporta e este script
// atualiza (ou cria) a instância na cena aberta.
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public class ArgilaLiveLink : AssetPostprocessor
{
    const string Folder = "Assets/Argila";

    static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
    {
        foreach (var path in imported)
        {
            if (!path.StartsWith(Folder) || !(path.EndsWith(".glb") || path.EndsWith(".gltf"))) continue;
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            if (prefab == null) continue;
            var name = "Argila_" + prefab.name;
            var old = GameObject.Find(name);
            Vector3 pos = old ? old.transform.position : Vector3.zero;
            if (old) Object.DestroyImmediate(old);
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            inst.name = name;
            inst.transform.position = pos;
            Debug.Log("[Argila] atualizado: " + path);
        }
    }
}
#endif
