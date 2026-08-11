using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>Governed world ScriptableObject. Status: skeleton.</summary>
[CreateAssetMenu(menuName = "Governed/World")]
public class GovernedWorld : ScriptableObject
{
    public string worldId;
    public TextAsset worldJson;
}

#if UNITY_EDITOR
public class GovernedWorldEditorWindow : EditorWindow
{
    GovernedWorld world;

    [MenuItem("SovereignX.CIEMS.Engine/World Editor")]
    public static void Open() => GetWindow<GovernedWorldEditorWindow>("Governed World");

    void OnGUI()
    {
        world = (GovernedWorld)EditorGUILayout.ObjectField("World", world, typeof(GovernedWorld), false);
        if (world == null) return;
        if (GUILayout.Button("Load Into Scene"))
        {
            // Parse world.worldJson, instantiate entities — not implemented in skeleton.
        }
        if (GUILayout.Button("Export From Scene"))
        {
            // Sample scene → world JSON — not implemented in skeleton.
        }
    }
}
#endif
