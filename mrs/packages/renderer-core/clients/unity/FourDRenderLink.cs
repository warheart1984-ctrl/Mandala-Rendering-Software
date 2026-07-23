using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

public class FourDRenderLink : MonoBehaviour
{
    [Header("Connection")]
    public string serverUrl = "ws://127.0.0.1:9487";
    public bool autoConnect = true;

    [Header("Mesh")]
    public Material meshMaterial;
    public string meshPrefix = "4D_Mesh_";
    public bool autoUpdateMesh = true;

    [Header("Debug")]
    public bool drawDebugGizmos = true;
    public KeyCode inspectKey = KeyCode.Mouse0;

    private ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private readonly List<GameObject> _meshObjects = new List<GameObject>();
    private bool _connected;

    async void Start()
    {
        if (autoConnect) await Connect();
    }

    async void OnDestroy()
    {
        _cts?.Cancel();
        _ws?.Dispose();
        foreach (var obj in _meshObjects)
            if (obj) Destroy(obj);
    }

    public async Task Connect()
    {
        if (_connected) return;
        _cts = new CancellationTokenSource();
        _ws = new ClientWebSocket();
        try
        {
            await _ws.ConnectAsync(new Uri(serverUrl), _cts.Token);
            _connected = true;
            Debug.Log($"[4DRL] Connected to {serverUrl}");
            _ = ReceiveLoop();
        }
        catch (Exception e)
        {
            Debug.LogError($"[4DRL] Connection failed: {e.Message}");
        }
    }

    public async Task Disconnect()
    {
        _connected = false;
        _cts?.Cancel();
        if (_ws?.State == WebSocketState.Open)
            await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "disconnect", CancellationToken.None);
    }

    async Task ReceiveLoop()
    {
        var buffer = new byte[1024 * 256];
        var msgBuffer = new List<byte>();

        while (_connected && _ws?.State == WebSocketState.Open)
        {
            var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts?.Token ?? CancellationToken.None);
            msgBuffer.AddRange(new ArraySegment<byte>(buffer, 0, result.Count));
            if (result.EndOfMessage)
            {
                var json = Encoding.UTF8.GetString(msgBuffer.ToArray());
                msgBuffer.Clear();
                try
                {
                    var msg = JsonUtility.FromJson<LiveLinkMessage>(json);
                    HandleMessage(msg, json);
                }
                catch (Exception e)
                {
                    Debug.LogWarning($"[4DRL] Parse error: {e.Message}");
                }
            }
        }
    }

    void HandleMessage(LiveLinkMessage msg, string rawJson)
    {
        switch (msg.type)
        {
            case "mesh_update":
                HandleMeshUpdate(rawJson);
                break;
            case "state_snapshot":
                HandleStateSnapshot(rawJson);
                break;
            case "config":
                HandleConfig(msg);
                break;
            case "inspect_result":
                HandleInspectResult(msg);
                break;
        }
    }

    void HandleMeshUpdate(string json)
    {
        var update = JsonUtility.FromJson<MeshUpdateMessage>(json);
        if (update == null) return;

        var positions = DeserializeFloatArray(update.positions);
        var indices = DeserializeUIntArray(update.indices);

        var go = new GameObject($"{meshPrefix}{update.frame}");
        go.transform.SetParent(transform);

        var mf = go.AddComponent<MeshFilter>();
        var mr = go.AddComponent<MeshRenderer>();

        var mesh = new Mesh();
        var verts = new Vector3[update.vertexCount];
        for (int i = 0; i < update.vertexCount; i++)
            verts[i] = new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

        var tris = new int[update.faceCount * 3];
        for (int i = 0; i < update.faceCount * 3; i++)
            tris[i] = (int)indices[i];

        mesh.vertices = verts;
        mesh.triangles = tris;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        mf.sharedMesh = mesh;
        mr.sharedMaterial = meshMaterial ? meshMaterial : new Material(Shader.Find("Standard"));

        if (update.transform != null)
        {
            var t = update.transform;
            go.transform.localPosition = new Vector3(t.x ?? 0, t.y ?? 0, t.z ?? 0);
        }

        _meshObjects.Add(go);
    }

    void HandleStateSnapshot(string json)
    {
        var snap = JsonUtility.FromJson<StateSnapshotMessage>(json);
        if (snap?.entities == null) return;

        foreach (var entity in snap.entities)
        {
            var existing = GameObject.Find(entity.id);
            if (existing == null)
            {
                existing = new GameObject(entity.id);
                existing.transform.SetParent(transform);
                _meshObjects.Add(existing);
            }
            if (entity.pos4?.Length >= 3)
                existing.transform.position = new Vector3(entity.pos4[0], entity.pos4[1], entity.pos4[2]);
        }
    }

    void HandleConfig(LiveLinkMessage msg) { }

    void HandleInspectResult(LiveLinkMessage msg)
    {
        Debug.Log($"[4DRL] Inspect result: primitive {msg.primitiveId}, normal {msg.normal4D}");
    }

    public async void RequestInspect(Vector2 screenPos)
    {
        if (!_connected) return;
        var req = JsonUtility.ToJson(new
        {
            type = "inspect_screen",
            sx = screenPos.x / Screen.width,
            sy = screenPos.y / Screen.height,
            width = Screen.width,
            height = Screen.height
        });
        var bytes = Encoding.UTF8.GetBytes(req);
        await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    void Update()
    {
        if (drawDebugGizmos && Input.GetKeyDown(inspectKey))
            RequestInspect(Input.mousePosition);
    }

    void OnDrawGizmos()
    {
        if (!drawDebugGizmos) return;
        Gizmos.color = Color.cyan;
        foreach (var obj in _meshObjects)
        {
            if (obj && obj.GetComponent<MeshFilter>()?.sharedMesh != null)
                Gizmos.DrawWireMesh(obj.GetComponent<MeshFilter>().sharedMesh, obj.transform.position);
        }
    }

    static float[] DeserializeFloatArray(string base64)
    {
        var bytes = Convert.FromBase64String(base64);
        var floats = new float[bytes.Length / 4];
        Buffer.BlockCopy(bytes, 0, floats, 0, bytes.Length);
        return floats;
    }

    static uint[] DeserializeUIntArray(string base64)
    {
        var bytes = Convert.FromBase64String(base64);
        var uints = new uint[bytes.Length / 4];
        Buffer.BlockCopy(bytes, 0, uints, 0, bytes.Length);
        return uints;
    }

    [Serializable]
    public class LiveLinkMessage
    {
        public string type;
        public int primitiveId;
        public string normal4D;
    }

    [Serializable]
    public class MeshUpdateMessage
    {
        public string type;
        public int version;
        public long timestamp;
        public int vertexCount;
        public int faceCount;
        public string positions;
        public string indices;
        public TransformData transform;
        public int frame;
    }

    [Serializable]
    public class StateSnapshotMessage
    {
        public string type;
        public int version;
        public int frame;
        public EntityData[] entities;
    }

    [Serializable]
    public class EntityData
    {
        public string id;
        public float[] pos4;
        public string topologyId;
        public string materialId;
    }

    [Serializable]
    public class TransformData
    {
        public float x, y, z;
    }
}
