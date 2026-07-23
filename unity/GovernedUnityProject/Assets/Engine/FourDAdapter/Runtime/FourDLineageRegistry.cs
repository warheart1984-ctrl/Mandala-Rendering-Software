using System;
using System.Collections.Generic;
using UnityEngine;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// Skeleton registry: projected node id → source WorldDocument entity id.
    /// Status: skeleton.
    /// </summary>
    public class FourDLineageRegistry : MonoBehaviour
    {
        private readonly Dictionary<string, FourDLineageEntry> _byProjectedId =
            new Dictionary<string, FourDLineageEntry>(StringComparer.Ordinal);

        public void Clear()
        {
            _byProjectedId.Clear();
        }

        /// <summary>
        /// TODO: Load from LineageBundle JSON.
        /// </summary>
        public void Register(FourDLineageEntry entry)
        {
            if (entry == null || string.IsNullOrEmpty(entry.ProjectedNodeId))
            {
                return;
            }
            _byProjectedId[entry.ProjectedNodeId] = entry;
        }

        public bool TryGet(string projectedNodeId, out FourDLineageEntry entry)
        {
            return _byProjectedId.TryGetValue(projectedNodeId, out entry);
        }
    }
}
