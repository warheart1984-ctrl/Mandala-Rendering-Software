using System.Collections.Generic;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>
    /// Maps MRS entity ids to Unity GameObjects / MeshFilter / MeshRenderer.
    /// Status: skeleton.
    /// </summary>
    public class MRSMeshBinding : MonoBehaviour
    {
        [Tooltip("Parent for spawned entity objects.")]
        public Transform entityRoot;

        [Tooltip("Optional shared material for created meshes.")]
        public Material defaultMaterial;

        readonly Dictionary<int, GameObject> _map = new Dictionary<int, GameObject>();

        public GameObject FindOrCreate(int id)
        {
            if (_map.TryGetValue(id, out var go) && go != null) return go;

            go = new GameObject($"MRS_Entity_{id}");
            if (entityRoot != null) go.transform.SetParent(entityRoot, false);
            go.AddComponent<MeshFilter>();
            var mr = go.AddComponent<MeshRenderer>();
            if (defaultMaterial != null) mr.sharedMaterial = defaultMaterial;
            _map[id] = go;
            return go;
        }

        public void UpdatePose(int id, Vector3 position, Quaternion? rotation = null)
        {
            var go = FindOrCreate(id);
            go.transform.position = position;
            if (rotation.HasValue) go.transform.rotation = rotation.Value;
        }

        public void Clear()
        {
            foreach (var kv in _map)
            {
                if (kv.Value != null) Destroy(kv.Value);
            }
            _map.Clear();
        }
    }
}
