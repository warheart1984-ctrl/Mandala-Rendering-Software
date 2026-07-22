using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>
    /// Unity live-link client: receive MRS 4D state, project Π₃D, update scene.
    /// Status: skeleton — Experimental in README capability snapshot.
    /// Protocol: docs/4drs/substrate/UNITY_LIVE_LINK.md
    /// </summary>
    public class MRSUnityLiveLink : MonoBehaviour
    {
        public enum ProjectionMode
        {
            DropW,
            ScaleByW,
            OffsetYByW,
        }

        [Header("Connection")]
        public string webSocketUrl = "ws://127.0.0.1:9487";
        public bool connectOnStart = true;

        [Header("Projection Π₃D")]
        public ProjectionMode projection = ProjectionMode.DropW;
        public float wScale = 1f;

        [Header("Bindings")]
        public MRSMeshBinding meshBinding;
        public MRSShaderMapper shaderMapper;

        [Header("Replay hooks (declared)")]
        public int lastFrame = -1;
        public int lastSeed;
        public bool logSnapshots;

        IMRSConnection _connection;

        void Start()
        {
            if (meshBinding == null) meshBinding = GetComponent<MRSMeshBinding>();
            if (shaderMapper == null) shaderMapper = GetComponent<MRSShaderMapper>();
            if (connectOnStart) Connect();
        }

        void Update()
        {
            if (_connection is MRSWebSocketConnection ws) ws.PumpMainThread();
        }

        void OnDestroy() => Disconnect();

        public void Connect()
        {
            Disconnect();
            var ws = new MRSWebSocketConnection(webSocketUrl);
            ws.OnStateReceived += OnMRSStateReceived;
            ws.OnConnected += () => Debug.Log("[MRS] live-link connected");
            ws.OnDisconnected += () => Debug.Log("[MRS] live-link disconnected");
            _connection = ws;
            _connection.Connect();
        }

        public void Disconnect()
        {
            _connection?.Dispose();
            _connection = null;
        }

        void OnMRSStateReceived(MRSStateSnapshot snapshot)
        {
            if (snapshot == null) return;
            lastFrame = snapshot.frame;
            lastSeed = snapshot.seed;
            if (logSnapshots)
                Debug.Log($"[MRS] frame={snapshot.frame} entities={snapshot.Entities?.Length ?? 0}");

            if (snapshot.Entities == null || meshBinding == null) return;
            foreach (var entity in snapshot.Entities)
            {
                var pos3 = Project4Dto3D(entity.Position4D);
                meshBinding.UpdatePose(entity.id, pos3);
                if (shaderMapper != null)
                {
                    var go = meshBinding.FindOrCreate(entity.id);
                    var mr = go.GetComponent<MeshRenderer>();
                    if (mr != null)
                    {
                        var mat = shaderMapper.Resolve(entity.materialId, entity.shaderGraphId);
                        if (mat != null) mr.sharedMaterial = mat;
                    }
                }
            }
        }

        /// <summary>Π₃D: default drops w. Alternatives documented in UNITY_LIVE_LINK.md.</summary>
        public Vector3 Project4Dto3D(MRSVector4 pos4)
        {
            switch (projection)
            {
                case ProjectionMode.ScaleByW:
                    var s = 1f + wScale * pos4.w;
                    return new Vector3(pos4.x * s, pos4.y * s, pos4.z * s);
                case ProjectionMode.OffsetYByW:
                    return new Vector3(pos4.x, pos4.y + wScale * pos4.w, pos4.z);
                case ProjectionMode.DropW:
                default:
                    return new Vector3(pos4.x, pos4.y, pos4.z);
            }
        }
    }
}
