#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter.Editor
{
    /// <summary>
    /// Skeleton: host-side slice / observation param UI.
    /// Does not run 4D math — parameters are intended for re-project requests to MRS/PLP.
    /// Status: skeleton.
    /// </summary>
    public class FourDSliceController : EditorWindow
    {
        private string _modeId = "perspective_w";
        private float _d4 = 4f;
        private float _sliceOffset = 0f;

        [MenuItem("SovereignX/FourDAdapter/Slice Controller (skeleton)")]
        public static void Open()
        {
            GetWindow<FourDSliceController>("FourD Slice (skeleton)");
        }

        private void OnGUI()
        {
            EditorGUILayout.HelpBox(
                "Skeleton observation controls. Re-projection belongs on the MRS/PLP side.",
                MessageType.Info);

            _modeId = EditorGUILayout.TextField("modeId", _modeId);
            _d4 = EditorGUILayout.FloatField("d4", _d4);
            _sliceOffset = EditorGUILayout.FloatField("slice offset", _sliceOffset);

            if (GUILayout.Button("Request re-project (TODO)"))
            {
                // TODO: emit request to MRS / reload Scene3D
                Debug.LogWarning("[FourDAdapter] Slice re-project stub.");
            }
        }
    }
}
#endif
