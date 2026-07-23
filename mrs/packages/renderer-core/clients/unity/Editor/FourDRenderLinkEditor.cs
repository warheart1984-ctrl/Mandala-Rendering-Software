using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(FourDRenderLink))]
public class FourDRenderLinkEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();

        var link = (FourDRenderLink)target;

        EditorGUILayout.Space(10);
        EditorGUILayout.LabelField("Connection", EditorStyles.boldLabel);

        if (GUILayout.Button("Connect"))
        {
            _ = link.Connect();
        }

        if (GUILayout.Button("Disconnect"))
        {
            _ = link.Disconnect();
        }

        EditorGUILayout.Space(5);
        EditorGUILayout.LabelField("Inspect", EditorStyles.boldLabel);

        if (GUILayout.Button("Inspect at Screen Center"))
        {
            link.RequestInspect(new Vector2(Screen.width / 2f, Screen.height / 2f));
        }

        if (Application.isPlaying && link.transform.childCount > 0)
        {
            EditorGUILayout.Space(5);
            EditorGUILayout.LabelField($"Active Meshes: {link.transform.childCount}", EditorStyles.miniLabel);
        }
    }
}
