using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// Skeleton: load projected Scene3D JSON into the Unity hierarchy.
    /// Does NOT compute 4D. Status: skeleton.
    /// </summary>
    public class FourDSceneLoader : MonoBehaviour
    {
        [SerializeField] private FourDSettings settings;
        [SerializeField] private FourDLineageRegistry lineageRegistry;
        [SerializeField] private FourDMaterialMapper materialMapper;

        /// <summary>
        /// TODO: Deserialize Scene3D JSON and spawn/update meshes under this transform.
        /// </summary>
        public void LoadScene3DJson(string scene3DJson)
        {
            // TODO: parse Scene3D v1 → MeshFilter / MeshRenderer
            Debug.LogWarning("[FourDAdapter] FourDSceneLoader.LoadScene3DJson is a skeleton stub.");
            _ = scene3DJson;
            _ = settings;
            _ = materialMapper;
        }

        /// <summary>
        /// TODO: Attach lineage bundle so selection can resolve source entity ids.
        /// </summary>
        public void BindLineageJson(string lineageBundleJson)
        {
            // TODO: populate FourDLineageRegistry
            Debug.LogWarning("[FourDAdapter] FourDSceneLoader.BindLineageJson is a skeleton stub.");
            if (lineageRegistry != null)
            {
                lineageRegistry.Clear();
            }
            _ = lineageBundleJson;
        }
    }
}
