using System.Collections.Generic;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>
    /// Skeleton mapper from MRS material / shader-graph ids to Unity Material properties.
    /// Status: skeleton — no runtime graph evaluation.
    /// </summary>
    public class MRSShaderMapper : MonoBehaviour
    {
        [System.Serializable]
        public struct ParamMap
        {
            public string mrsParam;
            public string unityProperty;
        }

        public ParamMap[] maps = new ParamMap[]
        {
            new ParamMap { mrsParam = "albedo", unityProperty = "_Color" },
            new ParamMap { mrsParam = "roughness", unityProperty = "_Glossiness" },
        };

        public Material templateMaterial;

        readonly Dictionary<string, Material> _cache = new Dictionary<string, Material>();

        public Material Resolve(string materialId, string shaderGraphId)
        {
            var key = $"{materialId}|{shaderGraphId}";
            if (_cache.TryGetValue(key, out var mat) && mat != null) return mat;
            mat = templateMaterial != null ? new Material(templateMaterial) : null;
            if (mat != null) _cache[key] = mat;
            return mat;
        }

        public void ApplyParams(Material mat, IDictionary<string, float> floats)
        {
            if (mat == null || floats == null) return;
            foreach (var map in maps)
            {
                if (floats.TryGetValue(map.mrsParam, out var v) && !string.IsNullOrEmpty(map.unityProperty))
                    mat.SetFloat(map.unityProperty, v);
            }
        }
    }
}
