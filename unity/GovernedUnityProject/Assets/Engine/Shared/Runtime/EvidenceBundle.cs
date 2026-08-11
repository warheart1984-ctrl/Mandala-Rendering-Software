// mirrors engine/runtime/EvidenceBundle.cs
using System.Collections.Generic;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public sealed class EvidenceBundle
    {
        public string Id;
        public string Kind;
        public string Timestamp;
        public string WorldId;
        public string TimelineId;
        public Dictionary<string, object> Fields = new Dictionary<string, object>();
    }
}
