using System;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.LiveLink
{
    /// <summary>4-vector for MRS live-link. Status: skeleton.</summary>
    [Serializable]
    public struct MRSVector4
    {
        public float x, y, z, w;

        public MRSVector4(float x, float y, float z, float w)
        {
            this.x = x;
            this.y = y;
            this.z = z;
            this.w = w;
        }

        public static MRSVector4 FromArray(float[] a)
        {
            if (a == null || a.Length < 4) return default;
            return new MRSVector4(a[0], a[1], a[2], a[3]);
        }
    }

    [Serializable]
    public class MRSEntity
    {
        public int id;
        public MRSVector4 Position4D;
        public string topologyId;
        public string materialId;
        public string shaderGraphId;
        public string otherDataJson;
    }

    [Serializable]
    public class MRSStateSnapshot
    {
        public int frame;
        public long timestampMs;
        public int seed;
        public MRSEntity[] Entities;
    }
}
