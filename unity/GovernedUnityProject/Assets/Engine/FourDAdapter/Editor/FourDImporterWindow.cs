#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using SovereignX.CIEMS.Engine.FourDAdapter;

namespace SovereignX.CIEMS.Engine.FourDAdapter.Editor
{
    /// <summary>
    /// Skeleton importer window for Scene3D + LineageBundle JSON.
    /// Status: skeleton — no production import pipeline claimed.
    /// </summary>
    public class FourDImporterWindow : EditorWindow
    {
        private string _scene3DPath = "";
        private string _lineagePath = "";
        private FourDSceneLoader _loader;

        [MenuItem("SovereignX/FourDAdapter/Importer (skeleton)")]
        public static void Open()
        {
            GetWindow<FourDImporterWindow>("FourD Importer (skeleton)");
        }

        private void OnGUI()
        {
            EditorGUILayout.HelpBox(
                "Skeleton only. Consumes scene3D + lineageBundle; does not compute 4D. " +
                "See docs/4d-engine/v1/adapters/UNITY_ADAPTER_V1.md",
                MessageType.Info);

            _loader = (FourDSceneLoader)EditorGUILayout.ObjectField(
                "Loader", _loader, typeof(FourDSceneLoader), true);

            _scene3DPath = EditorGUILayout.TextField("Scene3D JSON path", _scene3DPath);
            _lineagePath = EditorGUILayout.TextField("Lineage JSON path", _lineagePath);

            using (new EditorGUI.DisabledScope(_loader == null))
            {
                if (GUILayout.Button("Import (TODO stub)"))
                {
                    // TODO: read files and call LoadScene3DJson / BindLineageJson
                    Debug.LogWarning("[FourDAdapter] Import stub — wire file IO later.");
                }
            }
        }
    }
}
#endif
