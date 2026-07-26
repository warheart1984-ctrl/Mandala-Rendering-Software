using UnityEngine;

/// <summary>
/// Unity 4D surface renderer — wireframe (Gizmos) + solid (MeshFilter/MeshRenderer)
/// + optional ShadingInput4D ComputeBuffer (inspection/debug).
/// Mesh SoT: 4d-renderer export under StreamingAssets/surfaces.
/// Status: partial — solid draw + shading buffer fill; not BVH traversal / Shade4D.
/// PLP remains the Scene3D host path; this buffer is an inspection channel.
/// </summary>
[ExecuteAlways]
[RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
public class FourDTesseractRenderer : MonoBehaviour
{
    public enum RenderMode
    {
        Wireframe,
        Solid,
        Both,
    }

    [Tooltip("World binding id (e.g. tesseract-hero) for BindingResolver.")]
    public string bindingName = "tesseract-hero";

    [Tooltip("Surface id: tesseract, clifford-torus, hopf-surface, torus-3d, trefoil-4d")]
    public string surfaceId = "tesseract";

    public RenderMode renderMode = RenderMode.Both;
    public float d4 = 4f;
    public float d3 = 4f;
    public float scale = 2f;
    public float speed = 1f;
    public Material solidMaterial;

    [Header("Shading buffer (inspection — partial)")]
    [Tooltip("Maps to ObservationModeId + ProjectionPolicyId (host SoT). Modes are transported; PLP remains Scene3D path.")]
    public ObservationModeChoice observationMode = ObservationModeChoice.Perspective4DTo3D;
    public uint shadingMaterialId = 0;
    [Tooltip("When true, fills a ComputeBuffer of ShadingInput4D (one per vertex) for debug readback.")]
    public bool enableShadingBuffer = true;

    [Header("LiveLink shading publish (partial)")]
    [Tooltip("When true, publishes bounded shading_update JSON to LiveLink. Uses CPU copy — not GetData every frame.")]
    public bool publishShadingToLiveLink = false;
    public string liveLinkUrl = "ws://127.0.0.1:9487";
    [Tooltip("Seconds between publishes. Avoids per-frame GPU/WS stalls.")]
    public float shadingPublishIntervalSeconds = 1f;
    [Tooltip("Max ShadingInput4D entries included in each JSON message.")]
    public int maxShadingEntriesToPublish = 16;

    Vector4[] verts4D;
    int[,] edges;
    int[] facesFlat;
    string _loadedSurface;
    Mesh _solidMesh;
    MeshFilter _meshFilter;
    MeshRenderer _meshRenderer;
    Vector3[] _projected;
    Vector3[] _normals;
    Color[] _colors;

    ComputeBuffer _shadingBuffer;
    ShadingInput4D[] _shadingCpu;
    float _nextShadingPublishTime;
    SovereignX.CIEMS.Engine.LiveLink.MRSWebSocketConnection _shadingLiveLink;

    void Awake() => EnsureComponents();

    void OnEnable()
    {
        EnsureComponents();
        ReloadMesh();
        EnsureSolidMaterial();
        EnsureShadingBuffer();
        EnsureShadingLiveLink();
    }

    void OnDisable()
    {
        ReleaseShadingBuffer();
        ReleaseShadingLiveLink();
    }

    void OnValidate()
    {
        if (!string.Equals(_loadedSurface, surfaceId, System.StringComparison.Ordinal))
            ReloadMesh();
        UpdateSolidVisibility();
    }

    void LateUpdate()
    {
        if (verts4D == null) ReloadMesh();
        if (verts4D == null) return;
        float t = Application.isPlaying ? Time.time * speed : Time.realtimeSinceStartup * speed;
        if (renderMode == RenderMode.Solid || renderMode == RenderMode.Both)
            UpdateSolidMesh(t);
        if (enableShadingBuffer)
            FillShadingBuffer(t);
        if (publishShadingToLiveLink)
            MaybePublishShadingToLiveLink();
    }

    public void SetSurface(string id)
    {
        surfaceId = id;
        ReloadMesh();
    }

    public void Apply4DClip(string param, float value)
    {
        switch (param)
        {
            case "speed": speed = value; break;
            case "d4": d4 = value; break;
            case "d3": d3 = value; break;
            case "scale": scale = value; break;
        }
    }

    /// <summary>Play Mode / EditMode smoke: reload + project one solid frame; returns triangle count.</summary>
    public int SmokeSolidFrame()
    {
        ReloadMesh();
        if (facesFlat == null || facesFlat.Length < 3) return 0;
        UpdateSolidMesh(0.5f);
        return facesFlat.Length / 3;
    }

    void EnsureComponents()
    {
        _meshFilter = GetComponent<MeshFilter>();
        _meshRenderer = GetComponent<MeshRenderer>();
        if (_meshFilter == null) _meshFilter = gameObject.AddComponent<MeshFilter>();
        if (_meshRenderer == null) _meshRenderer = gameObject.AddComponent<MeshRenderer>();
    }

    void EnsureSolidMaterial()
    {
        if (solidMaterial != null && _meshRenderer != null)
        {
            _meshRenderer.sharedMaterial = solidMaterial;
            return;
        }
        if (_meshRenderer == null) return;
        var shader = Shader.Find("Sprites/Default") ?? Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Color");
        if (shader == null) return;
        solidMaterial = new Material(shader) { color = new Color(0.45f, 0.55f, 0.75f, 0.85f) };
        _meshRenderer.sharedMaterial = solidMaterial;
    }

    void UpdateSolidVisibility()
    {
        if (_meshRenderer == null) return;
        _meshRenderer.enabled = renderMode == RenderMode.Solid || renderMode == RenderMode.Both;
    }

    void ReloadMesh()
    {
        EnsureComponents();
        if (SurfaceMeshLoader.TryLoadFull(surfaceId, out var loaded))
        {
            verts4D = loaded.Verts;
            edges = loaded.Edges;
            facesFlat = loaded.Faces;
            _loadedSurface = surfaceId;
        }
        else
        {
            BuildTesseractFallback();
            _loadedSurface = "tesseract";
            if (surfaceId != "tesseract")
                Debug.LogWarning($"[FourD] Mesh '{surfaceId}' not found; tesseract fallback.");
        }

        _projected = new Vector3[verts4D.Length];
        _normals = new Vector3[verts4D.Length];
        _colors = new Color[verts4D.Length];
        if (_solidMesh == null)
        {
            _solidMesh = new Mesh { name = "Governed4DSolid" };
            _solidMesh.MarkDynamic();
        }
        _meshFilter.sharedMesh = _solidMesh;
        UpdateSolidVisibility();
        EnsureSolidMaterial();
        EnsureShadingBuffer();
    }

    void EnsureShadingBuffer()
    {
        if (!enableShadingBuffer || verts4D == null || verts4D.Length == 0)
        {
            ReleaseShadingBuffer();
            return;
        }
        int count = verts4D.Length;
        if (_shadingBuffer != null && _shadingBuffer.count != count)
            ReleaseShadingBuffer();
        if (_shadingBuffer == null)
        {
            _shadingBuffer = new ComputeBuffer(count, FourDRendererLayout.ShadingInput4DStrideBytes);
            _shadingCpu = new ShadingInput4D[count];
        }
        else if (_shadingCpu == null || _shadingCpu.Length != count)
        {
            _shadingCpu = new ShadingInput4D[count];
        }
    }

    void ReleaseShadingBuffer()
    {
        if (_shadingBuffer != null)
        {
            _shadingBuffer.Release();
            _shadingBuffer = null;
        }
        _shadingCpu = null;
    }

    /// <summary>
    /// Fills one ShadingInput4D per vertex (Position4D / placeholder Normal4D / ViewDir4D / ids).
    /// Status: partial inspection path — not Shade4D / BVH traversal.
    /// </summary>
    void FillShadingBuffer(float t)
    {
        EnsureShadingBuffer();
        if (_shadingBuffer == null || _shadingCpu == null || verts4D == null) return;

        uint projId = FourDObservationModeMap.ToProjectionPolicyId(observationMode);
        Vector3 camPos = Camera.main != null ? Camera.main.transform.position : Vector3.zero;

        for (int i = 0; i < verts4D.Length; i++)
        {
            Vector4 p4 = Rotate4D(verts4D[i], t);
            Vector3 p3 = Project3DtoWorld(Project4Dto3D(p4));
            Vector3 view3 = (camPos - p3).normalized;
            if (view3.sqrMagnitude < 1e-8f) view3 = Vector3.forward;

            _shadingCpu[i] = new ShadingInput4D
            {
                Position4D = p4,
                // Placeholder: 4D normal not derived from mesh topology here.
                Normal4D = new Vector4(0f, 0f, 0f, 1f),
                ViewDir4D = new Vector4(view3.x, view3.y, view3.z, 0f),
                MaterialId = shadingMaterialId,
                ProjectionPolicyId = projId,
            };
        }
        _shadingBuffer.SetData(_shadingCpu);
    }

    /// <summary>
    /// Main-thread readback of the inspection shading buffer. Returns a copy; empty if disabled.
    /// Status: partial — does not imply GPU kernel consumption.
    /// Prefer this for explicit validation; avoid calling every frame in Play Mode.
    /// </summary>
    public ShadingInput4D[] ReadBackShadingData()
    {
        if (_shadingBuffer == null || _shadingCpu == null)
            return System.Array.Empty<ShadingInput4D>();
        _shadingBuffer.GetData(_shadingCpu);
        var copy = new ShadingInput4D[_shadingCpu.Length];
        System.Array.Copy(_shadingCpu, copy, _shadingCpu.Length);
        return copy;
    }

    /// <summary>Current ObservationModeId wire hex (host SoT).</summary>
    public string GetObservationModeWireId() => FourDObservationModeMap.ToWireHex(observationMode);

    /// <summary>
    /// Build LiveLink shading_update JSON from the CPU shading mirror (no GetData).
    /// Status: partial inspection transport — not Shade4D.
    /// </summary>
    public string BuildShadingUpdateJson(int maxEntries = -1)
    {
        if (_shadingCpu == null || _shadingCpu.Length == 0)
            return null;
        int limit = maxEntries < 0 ? maxShadingEntriesToPublish : maxEntries;
        if (limit < 1) limit = 1;
        if (limit > _shadingCpu.Length) limit = _shadingCpu.Length;

        var sb = new System.Text.StringBuilder(256 + limit * 96);
        string obsHex = FourDObservationModeMap.ToWireHex(observationMode);
        uint projId = FourDObservationModeMap.ToProjectionPolicyId(observationMode);
        string surf = string.IsNullOrEmpty(_loadedSurface) ? surfaceId : _loadedSurface;
        int frame = Application.isPlaying ? (int)(Time.frameCount) : 0;

        sb.Append("{\"type\":\"shading_update\",\"schemaVersion\":\"1.0\",\"role\":\"inspection\",");
        sb.Append("\"surfaceId\":\"").Append(EscapeJson(surf)).Append("\",");
        sb.Append("\"frame\":").Append(frame).Append(',');
        sb.Append("\"observationModeId\":\"").Append(obsHex).Append("\",");
        sb.Append("\"projectionPolicyId\":").Append(projId).Append(',');
        sb.Append("\"materialId\":").Append(shadingMaterialId).Append(',');
        sb.Append("\"count\":").Append(limit).Append(',');
        sb.Append("\"entries\":[");
        for (int i = 0; i < limit; i++)
        {
            if (i > 0) sb.Append(',');
            var e = _shadingCpu[i];
            sb.Append("{\"Position4D\":[")
                .Append(Fmt(e.Position4D.x)).Append(',').Append(Fmt(e.Position4D.y)).Append(',')
                .Append(Fmt(e.Position4D.z)).Append(',').Append(Fmt(e.Position4D.w)).Append("],");
            sb.Append("\"Normal4D\":[")
                .Append(Fmt(e.Normal4D.x)).Append(',').Append(Fmt(e.Normal4D.y)).Append(',')
                .Append(Fmt(e.Normal4D.z)).Append(',').Append(Fmt(e.Normal4D.w)).Append("],");
            sb.Append("\"ViewDir4D\":[")
                .Append(Fmt(e.ViewDir4D.x)).Append(',').Append(Fmt(e.ViewDir4D.y)).Append(',')
                .Append(Fmt(e.ViewDir4D.z)).Append(',').Append(Fmt(e.ViewDir4D.w)).Append("],");
            sb.Append("\"MaterialId\":").Append(e.MaterialId).Append(',');
            sb.Append("\"ProjectionPolicyId\":").Append(e.ProjectionPolicyId).Append('}');
        }
        sb.Append("]}");
        return sb.ToString();
    }

    static string Fmt(float v) => v.ToString("R", System.Globalization.CultureInfo.InvariantCulture);

    static string EscapeJson(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    void EnsureShadingLiveLink()
    {
        if (!publishShadingToLiveLink)
        {
            ReleaseShadingLiveLink();
            return;
        }
        // Keep the connection object while connecting; do not reconnect every frame.
        if (_shadingLiveLink != null) return;
        _shadingLiveLink = new SovereignX.CIEMS.Engine.LiveLink.MRSWebSocketConnection(liveLinkUrl);
        _shadingLiveLink.Connect();
        _nextShadingPublishTime = 0f;
    }

    void ReleaseShadingLiveLink()
    {
        _shadingLiveLink?.Dispose();
        _shadingLiveLink = null;
    }

    void MaybePublishShadingToLiveLink()
    {
        EnsureShadingLiveLink();
        if (_shadingLiveLink == null) return;
        _shadingLiveLink.PumpMainThread();
        float interval = Mathf.Max(0.05f, shadingPublishIntervalSeconds);
        float now = Application.isPlaying ? Time.unscaledTime : Time.realtimeSinceStartup;
        if (now < _nextShadingPublishTime) return;
        _nextShadingPublishTime = now + interval;
        if (!_shadingLiveLink.IsConnected) return;
        // CPU mirror only — do not call GetData on the publish path.
        if (!enableShadingBuffer || _shadingCpu == null) return;
        string json = BuildShadingUpdateJson(maxShadingEntriesToPublish);
        if (!string.IsNullOrEmpty(json))
            _shadingLiveLink.SendJson(json);
    }

    void BuildTesseractFallback()
    {
        verts4D = new Vector4[16];
        int i = 0;
        foreach (int x in new[] { -1, 1 })
        foreach (int y in new[] { -1, 1 })
        foreach (int z in new[] { -1, 1 })
        foreach (int w in new[] { -1, 1 })
            verts4D[i++] = new Vector4(x, y, z, w);

        var edgeList = new System.Collections.Generic.List<(int, int)>();
        for (int a = 0; a < verts4D.Length; a++)
        for (int b = a + 1; b < verts4D.Length; b++)
        {
            int diff = 0;
            for (int k = 0; k < 4; k++)
                if (verts4D[a][k] != verts4D[b][k]) diff++;
            if (diff == 1) edgeList.Add((a, b));
        }
        edges = new int[edgeList.Count, 2];
        for (int e = 0; e < edgeList.Count; e++)
        {
            edges[e, 0] = edgeList[e].Item1;
            edges[e, 1] = edgeList[e].Item2;
        }
        facesFlat = BuildTesseractFaces(verts4D);
    }

    static int[] BuildTesseractFaces(Vector4[] verts)
    {
        var faces = new System.Collections.Generic.List<int>();
        int IndexOf(float x, float y, float z, float w)
        {
            for (int i = 0; i < verts.Length; i++)
                if (Mathf.Approximately(verts[i].x, x) && Mathf.Approximately(verts[i].y, y) &&
                    Mathf.Approximately(verts[i].z, z) && Mathf.Approximately(verts[i].w, w))
                    return i;
            return -1;
        }
        var vals = new[] { -1f, 1f };
        for (int d1 = 0; d1 < 4; d1++)
        for (int d2 = d1 + 1; d2 < 4; d2++)
        {
            var fixedAxes = new System.Collections.Generic.List<int>();
            for (int d = 0; d < 4; d++)
                if (d != d1 && d != d2) fixedAxes.Add(d);
            foreach (var f0 in vals)
            foreach (var f1 in vals)
            {
                var corners = new int[4];
                int ci = 0;
                foreach (var a in vals)
                foreach (var b in vals)
                {
                    var c = new float[4];
                    c[d1] = a; c[d2] = b; c[fixedAxes[0]] = f0; c[fixedAxes[1]] = f1;
                    corners[ci++] = IndexOf(c[0], c[1], c[2], c[3]);
                }
                faces.Add(corners[0]); faces.Add(corners[1]); faces.Add(corners[2]);
                faces.Add(corners[1]); faces.Add(corners[3]); faces.Add(corners[2]);
            }
        }
        return faces.ToArray();
    }

    void UpdateSolidMesh(float t)
    {
        if (_solidMesh == null || facesFlat == null || facesFlat.Length < 3) return;

        for (int i = 0; i < verts4D.Length; i++)
        {
            var r = Rotate4D(verts4D[i], t);
            _projected[i] = Project3DtoWorld(Project4Dto3D(r));
            float depth = Mathf.InverseLerp(-1.5f, 1.5f, r.w);
            _colors[i] = Color.Lerp(new Color(0.12f, 0.2f, 0.31f, 0.85f), new Color(0.77f, 0.54f, 0.35f, 0.95f), depth);
            _normals[i] = Vector3.back;
        }

        _solidMesh.Clear();
        _solidMesh.SetVertices(_projected);
        _solidMesh.SetColors(_colors);
        _solidMesh.SetTriangles(facesFlat, 0);
        _solidMesh.RecalculateNormals();
        _solidMesh.RecalculateBounds();
    }

    Vector4 Rotate4D(Vector4 p, float t)
    {
        p = RotateXW(p, t * 0.7f);
        p = RotateYZ(p, t * 1.1f);
        p = RotateZW(p, t * 1.5f);
        p = RotateYW(p, t * 2.0f);
        return p;
    }

    Vector4 RotateXW(Vector4 p, float theta)
    {
        float c = Mathf.Cos(theta), s = Mathf.Sin(theta);
        return new Vector4(c * p.x - s * p.w, p.y, p.z, s * p.x + c * p.w);
    }

    Vector4 RotateYZ(Vector4 p, float theta)
    {
        float c = Mathf.Cos(theta), s = Mathf.Sin(theta);
        return new Vector4(p.x, c * p.y - s * p.z, s * p.y + c * p.z, p.w);
    }

    Vector4 RotateZW(Vector4 p, float theta)
    {
        float c = Mathf.Cos(theta), s = Mathf.Sin(theta);
        return new Vector4(p.x, p.y, c * p.z - s * p.w, s * p.z + c * p.w);
    }

    Vector4 RotateYW(Vector4 p, float theta)
    {
        float c = Mathf.Cos(theta), s = Mathf.Sin(theta);
        return new Vector4(p.x, c * p.y - s * p.w, p.z, s * p.y + c * p.w);
    }

    Vector3 Project4Dto3D(Vector4 p)
    {
        float k = d4 / (d4 - p.w);
        return new Vector3(k * p.x, k * p.y, k * p.z);
    }

    Vector3 Project3DtoWorld(Vector3 p)
    {
        float k = d3 / (d3 - p.z);
        return transform.position + new Vector3(k * p.x * scale, k * p.y * scale, 0f);
    }

    /// <summary>
    /// Build inspectable 4D mesh + projection params matching current solid/gizmo pose.
    /// Status: prepares Editor → inspector:ws scene_push payload (not multi-user sync).
    /// </summary>
    public bool TryBuildInspectableSnapshot(out InspectableSnapshot snap)
    {
        snap = default;
        if (verts4D == null || facesFlat == null || facesFlat.Length < 3)
            ReloadMesh();
        if (verts4D == null || facesFlat == null || facesFlat.Length < 3)
            return false;

        float t = Application.isPlaying ? Time.time * speed : Time.realtimeSinceStartup * speed;
        var rotated = new Vector4[verts4D.Length];
        for (int i = 0; i < verts4D.Length; i++)
            rotated[i] = Rotate4D(verts4D[i], t);

        snap = new InspectableSnapshot
        {
            surfaceId = string.IsNullOrEmpty(_loadedSurface) ? surfaceId : _loadedSurface,
            vertices = rotated,
            facesFlat = facesFlat,
            d4 = d4,
            d3 = d3,
            scale = scale,
        };
        return true;
    }

    /// <summary>Snapshot for MRS Inspector scene_push (rotated verts + camera).</summary>
    public struct InspectableSnapshot
    {
        public string surfaceId;
        public Vector4[] vertices;
        public int[] facesFlat;
        public float d4;
        public float d3;
        public float scale;
    }

    void OnDrawGizmos()
    {
        if (renderMode == RenderMode.Solid) return;
        if (verts4D == null || edges == null) ReloadMesh();
        if (verts4D == null || edges == null) return;
        float t = Application.isPlaying ? Time.time * speed : Time.realtimeSinceStartup * speed;
        var v3 = new Vector3[verts4D.Length];
        for (int i = 0; i < verts4D.Length; i++)
            v3[i] = Project3DtoWorld(Project4Dto3D(Rotate4D(verts4D[i], t)));
        for (int i = 0; i < edges.GetLength(0); i++)
        {
            int a = edges[i, 0], b = edges[i, 1];
            if (a < 0 || b < 0 || a >= verts4D.Length || b >= verts4D.Length) continue;
            var ra = Rotate4D(verts4D[a], t);
            float depth = Mathf.InverseLerp(-1f, 1f, ra.w);
            Color c = Color.Lerp(new Color(0.6f, 0.4f, 0.2f), new Color(0.7f, 0.7f, 0.7f), depth);
            c.a = Mathf.Lerp(0.3f, 1f, depth);
            Gizmos.color = c;
            Gizmos.DrawLine(v3[a], v3[b]);
        }
    }
}
