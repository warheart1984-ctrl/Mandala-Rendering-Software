using System;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.Inspector
{
    /// <summary>MRS-IC v1.1 DTO. Status: skeleton.</summary>
    [Serializable]
    public class Inspector4DResultDTO
    {
        public string schemaVersion = "1.1";
        public bool ok;
        public string error;
        public Vector4 position;
        public Vector4 normal4D;
        public Vector4 tangent1;
        public Vector4 tangent2;
        public float k1;
        public float k2;
        public Matrix4x4 jacobian4x2;
        public Matrix4x4 projectionMatrix;
        public RotationPlaneDTO[] rotationPlanes;
        public HyperplaneIntersectionDTO[] hyperplanes;
        public TopologyDTO topology;
        public int primitiveId = -1;
        public int faceIndex = -1;
    }

    [Serializable]
    public class RotationPlaneDTO
    {
        public Vector4 axisA;
        public Vector4 axisB;
        public float angle;
        public string label;
    }

    [Serializable]
    public class HyperplaneIntersectionDTO
    {
        public Vector4 normal;
        public float d;
        public float distance;
        public bool onPlane;
    }

    [Serializable]
    public class TopologyDTO
    {
        public int[] incidentCellIds;
        public int[] neighborCellIds;
        public bool isBoundary;
    }
}
