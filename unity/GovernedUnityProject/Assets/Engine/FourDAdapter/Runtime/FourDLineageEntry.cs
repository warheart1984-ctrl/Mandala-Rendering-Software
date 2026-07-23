using System;

namespace SovereignX.CIEMS.Engine.FourDAdapter
{
    /// <summary>
    /// One lineage row — projected Scene3D node → WorldDocument entity.
    /// Status: skeleton DTO.
    /// </summary>
    [Serializable]
    public class FourDLineageEntry
    {
        public string ProjectedNodeId;
        public string SourceEntityId;
        public string GeometryKind;
        public string Notes;
    }
}
