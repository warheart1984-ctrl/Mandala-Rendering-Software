// Frame provenance — every governed frame tagged for TRT replay.
// Status: shared contract; hosts record into ProvenanceRecorder.
// 
// Memory telemetry fields added for Phase 3 Sovereign-X Router integration:
// - Memory telemetry enables resource-aware routing (CPU↔RAM↔GPU)
// - Governance can verify memory access patterns and conformance

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

        // Memory telemetry — observed at frame generation time
        public double AllocationLatencyNs;
        public double CopyBandwidthGBps;
        public double CopyLatencyNs;
        public long MemoryCapacityBytes;
        public long WorkingSetBytes;
        public float LocalityScore;    // 0.0 = fully random, 1.0 = perfectly sequential
        public int NumaNode;
        public float CacheLineUtilization;
        public float DeviceUtilizationPercent;
        public int QueueDepth;
    }
}