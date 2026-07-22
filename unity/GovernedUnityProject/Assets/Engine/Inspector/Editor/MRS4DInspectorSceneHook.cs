#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using SovereignX.CIEMS.Engine.Inspector;

namespace SovereignX.CIEMS.Engine.Inspector.Editor
{
    /// <summary>
    /// SceneView click → MRS 4D Inspector (live protocol when connected; stub when not).
    /// </summary>
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

            var client = window.Client ?? MRSInspectorClient.Instance ?? new MRSInspectorClient();
            // SceneView mouse is in GUI coords; pass pixel size for inspect_screen.
            int w = Mathf.Max(1, (int)sceneView.position.width);
            int h = Mathf.Max(1, (int)sceneView.position.height);
            var result = client.InspectAtScreenPoint(e.mousePosition, w, h);
            // Live path updates async via OnResult; stub returns immediately.
            if (result != null) window.SetResult(result);
            e.Use();
        }
    }
}
#endif
