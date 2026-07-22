#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using SovereignX.CIEMS.Engine.Inspector;

namespace SovereignX.CIEMS.Engine.Inspector.Editor
{
    /// <summary>SceneView click → MRS 4D Inspector. Status: skeleton.</summary>
    [InitializeOnLoad]
    public static class MRS4DInspectorSceneHook
    {
        static MRS4DInspectorSceneHook()
        {
            SceneView.duringSceneGui += OnSceneGUI;
        }

        private static void OnSceneGUI(SceneView sceneView)
        {
            var windows = Resources.FindObjectsOfTypeAll<MRS4DInspectorWindow>();
            if (windows == null || windows.Length == 0) return;
            var window = windows[0];
            if (window == null || !window.UpdateOnClick) return;

            Event e = Event.current;
            if (e == null || e.type != EventType.MouseDown || e.button != 0) return;
            if (e.alt) return; // allow orbit

            var client = MRSInspectorClient.Instance ?? new MRSInspectorClient();
            var result = client.InspectAtScreenPoint(e.mousePosition);
            window.SetResult(result);
            e.Use();
        }
    }
}
#endif
