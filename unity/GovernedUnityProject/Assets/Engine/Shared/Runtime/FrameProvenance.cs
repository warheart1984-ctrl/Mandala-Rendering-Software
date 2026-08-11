// Frame provenance — every governed frame tagged for TRT replay.

// Status: shared contract; hosts record into ProvenanceRecorder.



using System.Collections.Generic;



namespace SovereignX.CIEMS.Engine.Runtime

{

    public struct FrameProvenance

    {

        public string IntentId;

        public string TimelineId;

        public string WorldId;

        public double TimeSeconds;

        public Dictionary<string, double> Parameters;

    }

}

