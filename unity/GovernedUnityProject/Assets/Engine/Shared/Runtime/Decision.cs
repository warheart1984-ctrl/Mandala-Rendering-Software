// mirrors engine/runtime/Decision.cs
using System.Collections.Generic;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public sealed class Decision
    {
        public bool Ok;
        public string Verdict;
        public string Reason;
        public string DecisionId;
        public string CharterId;
        public string IntentId;
        public string WorldId;
        public List<string> Violations = new List<string>();
        public List<string> Requirements = new List<string>();
        public bool AttachProvenance;
        public Dictionary<string, object> ParamAdjust;
        public List<string> PoliciesApplied = new List<string>();
        public int PrecedentCount;
    }
}
