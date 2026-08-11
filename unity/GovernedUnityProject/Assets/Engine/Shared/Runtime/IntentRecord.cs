// mirrors engine/runtime/IntentRecord.cs — keep in sync with engine/
using System.Collections.Generic;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public sealed class IntentRecord
    {
        public string Id;
        public string Actor;
        public string Type;
        public string Kind;
        public string World;
        public string Timeline;
        public string Entity;
        public string EvidenceId;
        public string At;
        public string Timestamp;
        public string Source;
        public string Goal;
        public Dictionary<string, object> Payload = new Dictionary<string, object>();
        public Dictionary<string, object> Constraints = new Dictionary<string, object>();
        public Dictionary<string, object> Params;
    }
}
