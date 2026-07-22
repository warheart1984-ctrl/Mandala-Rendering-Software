#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using SovereignX.CIEMS.Engine.Inspector;

namespace SovereignX.CIEMS.Engine.Inspector.Editor
{
    /// <summary>
    /// MRS 4D Inspector Editor window (MRS-IC layout).
    /// Status: wires live protocol when connected; stub fallback when disconnected (labeled).
    /// Menu: MRS / 4D Inspector
    /// </summary>
    public class MRS4DInspectorWindow : EditorWindow
    {
        private MRSInspectorClient _client;
        private Inspector4DResultDTO _lastResult;
        private bool _updateOnClick = true;
        private Vector2 _scroll;
        private bool _foldPos = true, _foldDiff = true, _foldJac, _foldRot = true, _foldHyp, _foldTop;
        private string _endpoint = MRSInspectorClient.DefaultEndpoint;
        private string _status = "Disconnected";

        [MenuItem("MRS/4D Inspector")]
        public static void ShowWindow()
        {
            GetWindow<MRS4DInspectorWindow>("MRS 4D Inspector");
        }

        private void OnEnable()
        {
            _endpoint = MRSInspectorClient.LoadEndpointPref();
            _client ??= new MRSInspectorClient(_endpoint);
            _client.OnResult += SetResult;
            _client.OnStatus += s => { _status = s; Repaint(); };
            _client.OnConnected += () => Repaint();
            _client.OnDisconnected += () => Repaint();
            EditorApplication.update += PumpClient;
        }

        private void OnDisable()
        {
            EditorApplication.update -= PumpClient;
            if (_client != null)
            {
                _client.OnResult -= SetResult;
                _client.Disconnect();
            }
        }

        private void PumpClient() => _client?.PumpMainThread();

        public void SetResult(Inspector4DResultDTO result)
        {
            _lastResult = result;
            Repaint();
        }

        public bool UpdateOnClick => _updateOnClick;
        public MRSInspectorClient Client => _client;

        private void OnGUI()
        {
            DrawConnectionBar();
            _updateOnClick = EditorGUILayout.ToggleLeft("Scene Click → Inspect", _updateOnClick);
            EditorGUILayout.Space(4);

            if (_lastResult != null && _lastResult.ok && _lastResult.error == "stub_disconnected")
            {
                EditorGUILayout.HelpBox(
                    "Showing local stub (not connected to protocol server). Start `npm run inspector:ws` and Connect.",
                    MessageType.Warning);
            }

            if (_lastResult == null || !_lastResult.ok)
            {
                EditorGUILayout.HelpBox(
                    _lastResult?.error != null
                        ? $"Last error: {_lastResult.error}"
                        : "Connect to inspector:ws, then click in Scene view (with Scene Click → Inspect).",
                    MessageType.Info);
                DrawToolbar();
                return;
            }

            _scroll = EditorGUILayout.BeginScrollView(_scroll);

            DrawSectionA();
            DrawSectionB();
            DrawSectionC();
            DrawSectionD();
            DrawSectionE();
            DrawSectionF();

            EditorGUILayout.EndScrollView();
            DrawToolbar();
        }

        private void DrawConnectionBar()
        {
            EditorGUILayout.LabelField("Endpoint", EditorStyles.boldLabel);
            using (new EditorGUILayout.HorizontalScope())
            {
                _endpoint = EditorGUILayout.TextField(_endpoint);
                if (GUILayout.Button("Connect", GUILayout.Width(72)))
                {
                    _client ??= new MRSInspectorClient(_endpoint);
                    _client.Connect(_endpoint);
                }
                if (GUILayout.Button("Disconnect", GUILayout.Width(80)))
                {
                    _client?.Disconnect();
                }
            }

            var connected = _client != null && _client.IsConnected;
            EditorGUILayout.HelpBox(
                connected
                    ? $"Live: {_status}"
                    : $"Offline: {_status} — stub fallback on Scene click until connected.",
                connected ? MessageType.None : MessageType.None);
            EditorGUILayout.LabelField("State", connected ? "CONNECTED" : "DISCONNECTED");
        }

        private void DrawToolbar()
        {
            EditorGUILayout.Space(8);
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Copy JSON"))
                {
                    var text = !string.IsNullOrEmpty(_client?.LastWireJson)
                        ? _client.LastWireJson
                        : (_lastResult != null ? JsonUtility.ToJson(_lastResult, true) : "{}");
                    EditorGUIUtility.systemCopyBuffer = text;
                }
                if (GUILayout.Button("Export Snapshot") && (_lastResult != null || !string.IsNullOrEmpty(_client?.LastWireJson)))
                {
                    var path = EditorUtility.SaveFilePanel("Export Inspector Snapshot", "", "inspector4d.json", "json");
                    if (!string.IsNullOrEmpty(path))
                    {
                        var text = !string.IsNullOrEmpty(_client?.LastWireJson)
                            ? _client.LastWireJson
                            : JsonUtility.ToJson(_lastResult, true);
                        System.IO.File.WriteAllText(path, text);
                    }
                }
            }
        }

        private void DrawSectionA()
        {
            _foldPos = EditorGUILayout.Foldout(_foldPos, "Position & Projection", true);
            if (!_foldPos) return;
            var p = _lastResult.position;
            EditorGUILayout.LabelField("Position (x,y,z,w)", $"{p.x}, {p.y}, {p.z}, {p.w}");
            EditorGUILayout.LabelField("Projection", _lastResult.projectionMatrix.ToString());
        }

        private void DrawSectionB()
        {
            _foldDiff = EditorGUILayout.Foldout(_foldDiff, "Differential Geometry", true);
            if (!_foldDiff) return;
            var n = _lastResult.normal4D;
            EditorGUILayout.LabelField("Normal4D", $"{n.x}, {n.y}, {n.z}, {n.w}");
            EditorGUILayout.LabelField("t1", V4(_lastResult.tangent1));
            EditorGUILayout.LabelField("t2", V4(_lastResult.tangent2));
            EditorGUILayout.LabelField("k1", _lastResult.k1.ToString("G4"));
            EditorGUILayout.LabelField("k2", _lastResult.k2.ToString("G4"));
            EditorGUILayout.LabelField("curvatureStub", _lastResult.curvatureStub ? "true (stub)" : "false");
        }

        private void DrawSectionC()
        {
            _foldJac = EditorGUILayout.Foldout(_foldJac, "Jacobian", true);
            if (!_foldJac) return;
            EditorGUILayout.LabelField("Jacobian 4×2 (stored in Matrix4x4)", _lastResult.jacobian4x2.ToString());
        }

        private void DrawSectionD()
        {
            _foldRot = EditorGUILayout.Foldout(_foldRot, "Rotation Planes", true);
            if (!_foldRot) return;
            if (_lastResult.rotationPlanes == null) return;
            foreach (var rp in _lastResult.rotationPlanes)
            {
                EditorGUILayout.LabelField(rp.label ?? "plane", $"angle={rp.angle}");
            }
        }

        private void DrawSectionE()
        {
            _foldHyp = EditorGUILayout.Foldout(_foldHyp, "Hyperplane Intersections", true);
            if (!_foldHyp) return;
            if (_lastResult.hyperplanes == null || _lastResult.hyperplanes.Length == 0)
            {
                EditorGUILayout.LabelField("(none configured)");
                return;
            }
            foreach (var h in _lastResult.hyperplanes)
            {
                EditorGUILayout.LabelField(
                    $"δ={h.distance:G4}",
                    h.onPlane ? "onPlane" : "off");
            }
        }

        private void DrawSectionF()
        {
            _foldTop = EditorGUILayout.Foldout(_foldTop, "Local Topology", true);
            if (!_foldTop || _lastResult.topology == null) return;
            EditorGUILayout.LabelField("Incident", Join(_lastResult.topology.incidentCellIds));
            EditorGUILayout.LabelField("Neighbors", Join(_lastResult.topology.neighborCellIds));
            EditorGUILayout.LabelField("Boundary", _lastResult.topology.isBoundary ? "Boundary point" : "Interior point");
            EditorGUILayout.LabelField("primitiveId", _lastResult.primitiveId.ToString());
            EditorGUILayout.LabelField("faceIndex", _lastResult.faceIndex.ToString());
        }

        private static string V4(Vector4 v) => $"{v.x}, {v.y}, {v.z}, {v.w}";

        private static string Join(int[] a) =>
            a == null || a.Length == 0 ? "[]" : "[" + string.Join(", ", a) + "]";
    }
}
#endif
