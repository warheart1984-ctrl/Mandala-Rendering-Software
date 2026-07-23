using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// Skeleton: map material ids from Scene3D / WorldDocument to Unity Materials.
    /// Status: skeleton.
    /// </summary>
    public class FourDMaterialMapper : MonoBehaviour
    {
        [SerializeField] private Material fallbackMaterial;

        /// <summary>
        /// TODO: Resolve materialId to a Unity Material (library lookup).
        /// </summary>
        public Material Resolve(string materialId)
        {
            // TODO: implement id → Material map
            _ = materialId;
            return fallbackMaterial;
        }
    }
}
