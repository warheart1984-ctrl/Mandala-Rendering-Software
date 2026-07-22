using System;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.Inspector
{
    /// <summary>Client for MRS Inspector JSON protocol. Status: skeleton.</summary>
    public class MRSInspectorClient
    {
        public static MRSInspectorClient Instance { get; private set; }

        public string Endpoint { get; set; }
        public event Action<Inspector4DResultDTO> OnResult;

        private Inspector4DResultDTO _last;

        public MRSInspectorClient(string endpoint = "ws://localhost:8080/mrs_inspector")
        {
            Endpoint = endpoint;
            Instance = this;
        }

        public Inspector4DResultDTO LastResult => _last;

        /// <summary>
        /// Screen-space inspect. Live transport not wired — returns a deterministic stub
        /// so the Editor window layout can be exercised. Replace with WebSocket round-trip.
        /// </summary>
        public Inspector4DResultDTO InspectAtScreenPoint(Vector2 mousePos)
        {
            var dto = new Inspector4DResultDTO
            {
                ok = true,
                schemaVersion = "1.1",
                position = new Vector4(mousePos.x * 0.01f, mousePos.y * 0.01f, 0f, 0f),
                normal4D = new Vector4(0, 0, 1, 0),
                tangent1 = new Vector4(1, 0, 0, 0),
                tangent2 = new Vector4(0, 1, 0, 0),
                k1 = 0f,
                k2 = 0f,
                jacobian4x2 = Matrix4x4.identity,
                projectionMatrix = Matrix4x4.identity,
                rotationPlanes = new[]
                {
                    new RotationPlaneDTO
                    {
                        axisA = new Vector4(1, 0, 0, 0),
                        axisB = new Vector4(0, 0, 0, 1),
                        angle = 0f,
                        label = "x-w"
                    }
                },
                hyperplanes = Array.Empty<HyperplaneIntersectionDTO>(),
                topology = new TopologyDTO
                {
                    incidentCellIds = Array.Empty<int>(),
                    neighborCellIds = Array.Empty<int>(),
                    isBoundary = false
                },
                primitiveId = -1,
                faceIndex = -1
            };
            _last = dto;
            OnResult?.Invoke(dto);
            return dto;
        }

        public void SetResult(Inspector4DResultDTO dto)
        {
            _last = dto;
            OnResult?.Invoke(dto);
        }
    }
}
