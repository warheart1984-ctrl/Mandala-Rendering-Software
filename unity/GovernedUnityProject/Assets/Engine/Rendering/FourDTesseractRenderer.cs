using UnityEngine;

/// <summary>
/// Unity 4D surface renderer — wireframe (Gizmos) + solid (MeshFilter/MeshRenderer).
/// Mesh SoT: 4d-renderer export under StreamingAssets/surfaces.
/// Status: partial — solid draw implemented; Play Mode CI via scripts/test-host-solid-play.mjs + optional Unity batch.
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

    void Awake() => EnsureComponents();

    void OnEnable()
    {
        EnsureComponents();
        ReloadMesh();
        EnsureSolidMaterial();
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
