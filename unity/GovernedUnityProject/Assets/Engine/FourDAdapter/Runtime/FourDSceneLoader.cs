using System;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// Load projected Scene3D JSON into the Unity hierarchy.
    /// Status: **partial** — validates envelope + spawns placeholder nodes per entity id.
    /// </summary>
    public class FourDSceneLoader : MonoBehaviour
    {
        [Serializable]
        private sealed class Scene3DEnvelope
        {
            public string schemaVersion;
            public string id;
            public Scene3DEntity[] entities;
        }

        [Serializable]
        private sealed class Scene3DEntity
        {
            public string id;
            public string name;
        }

        [SerializeField] private FourDSettings settings;
        [SerializeField] private FourDLineageRegistry lineageRegistry;
        [SerializeField] private FourDMaterialMapper materialMapper;

        /// <summary>
        /// Parse Scene3D JSON and spawn placeholder GameObjects (no mesh assets yet).
        /// </summary>
        public void LoadScene3DJson(string scene3DJson)
        {
            if (string.IsNullOrWhiteSpace(scene3DJson))
            {
                Debug.LogWarning("[FourDAdapter] LoadScene3DJson: empty JSON");
                return;
            }

            Scene3DEnvelope envelope;
            try
            {
                envelope = JsonUtility.FromJson<Scene3DEnvelope>(scene3DJson);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[FourDAdapter] LoadScene3DJson parse failed: {ex.Message}");
                return;
            }

            if (envelope == null || string.IsNullOrEmpty(envelope.id))
            {
                Debug.LogWarning("[FourDAdapter] LoadScene3DJson: missing Scene3D id (partial loader)");
                return;
            }

            var root = new GameObject($"Scene3D_{envelope.id}");
            root.transform.SetParent(transform, worldPositionStays: false);

            if (envelope.entities != null)
            {
                foreach (var entity in envelope.entities)
                {
                    if (entity == null || string.IsNullOrEmpty(entity.id))
                    {
                        continue;
                    }

                    var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    go.name = string.IsNullOrEmpty(entity.name) ? entity.id : entity.name;
                    go.transform.SetParent(root.transform, worldPositionStays: false);
                    go.transform.localScale = Vector3.one * 0.25f;
                }
            }

            Debug.Log(
                $"[FourDAdapter] Scene3D partial load id={envelope.id} entities={(envelope.entities?.Length ?? 0)}");
            _ = settings;
            _ = materialMapper;
        }

        /// <summary>
        /// Attach lineage bundle so selection can resolve source entity ids.
        /// Status: partial — clears registry only.
        /// </summary>
        public void BindLineageJson(string lineageBundleJson)
        {
            if (lineageRegistry != null)
            {
                lineageRegistry.Clear();
            }

            if (string.IsNullOrWhiteSpace(lineageBundleJson))
            {
                Debug.LogWarning("[FourDAdapter] BindLineageJson: empty bundle");
                return;
            }

            Debug.Log("[FourDAdapter] BindLineageJson: registry cleared; population TODO (partial)");
        }
    }
}
