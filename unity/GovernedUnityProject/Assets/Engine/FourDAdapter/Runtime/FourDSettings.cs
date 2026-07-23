using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// Adapter settings — skeleton ScriptableObject.
    /// Status: skeleton. Does not enable 4D compute in Unity.
    /// </summary>
    [CreateAssetMenu(
        fileName = "FourDSettings",
        menuName = "SovereignX/FourDAdapter/Settings (skeleton)",
        order = 2000)]
    public class FourDSettings : ScriptableObject
    {
        [Tooltip("Default observation mode id when none supplied (declared PLP vocabulary).")]
        public string DefaultModeId = "perspective_w";

        [Tooltip("Perspective d4 when using perspective_w (host may ignore; computation is MRS-side).")]
        public float DefaultD4 = 4f;

        [Tooltip("Parent path for imported Scene3D roots.")]
        public string ImportRootName = "FourDProjected";
    }
}
