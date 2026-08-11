// IConstitutionalKnowledgeLayer.cs — CKL host interface.

// Status: interface; JS ConstitutionalKnowledgeLayer.js is authoritative for browser.



using System.Collections.Generic;

using SovereignX.CIEMS.Engine.Runtime;



namespace SovereignX.CIEMS.Engine.Governance

{

    public interface IConstitutionalKnowledgeLayer

    {

        PolicySet GetPoliciesForWorld(string worldId);

        IReadOnlyList<PrecedentRecord> GetPrecedents(IntentRecord intent);

        PrecedentRecord RecordPrecedent(IntentRecord intent, Decision decision, float driftScore = 0f);

    }



    public sealed class PolicyRule

    {

        public string Id;

        public string Scope;

        public string Condition;

        public string Rule;

        public string Severity;

        public string Message;

        public string Param;

        public string Modifier;

        public List<string> Require = new List<string>();

    }



    public sealed class PolicySet

    {

        public string WorldId;

        public List<PolicyRule> Policies = new List<PolicyRule>();

        public string LoadedAt;

    }



    public sealed class PrecedentRecord

    {

        public string Id;

        public string IntentType;

        public string WorldId;

        public string IntentId;

        public object Decision;

        public float DriftScore;

        public string At;

    }

}

