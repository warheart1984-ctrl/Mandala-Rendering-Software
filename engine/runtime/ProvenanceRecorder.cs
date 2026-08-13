// In-memory provenance ledger (session). Serialize later for TRT.

using System.Collections.Generic;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public static class ProvenanceRecorder
    {
        static readonly List<FrameProvenance> Frames = new List<FrameProvenance>();

        public static void Record(FrameProvenance frame) => Frames.Add(frame);

        /// <summary>
        /// Record a frame with observed memory telemetry.
        /// Enables Sovereign-X Router resource-aware governance.
        /// </summary>
        public static void RecordWithTelemetry(
            string intentId,
            string timelineId,
            string worldId,
            double timeSeconds,
            Dictionary<string, double> parameters,
            double allocationLatencyNs,
            double copyBandwidthGBps,
            double copyLatencyNs,
            long memoryCapacityBytes,
            long workingSetBytes,
            float localityScore,
            int numaNode,
            float cacheLineUtilization,
            float deviceUtilizationPercent,
            int queueDepth
        )
        {
            var frame = new FrameProvenance
            {
                IntentId = intentId,
                TimelineId = timelineId,
                WorldId = worldId,
                TimeSeconds = timeSeconds,
                Parameters = parameters,
                AllocationLatencyNs = allocationLatencyNs,
                CopyBandwidthGBps = copyBandwidthGBps,
                CopyLatencyNs = copyLatencyNs,
                MemoryCapacityBytes = memoryCapacityBytes,
                WorkingSetBytes = workingSetBytes,
                LocalityScore = localityScore,
                NumaNode = numaNode,
                CacheLineUtilization = cacheLineUtilization,
                DeviceUtilizationPercent = deviceUtilizationPercent,
                QueueDepth = queueDepth
            };
            Frames.Add(frame);
        }

        public static IReadOnlyList<FrameProvenance> GetFrames() => Frames;

        public static void Clear() => Frames.Clear();

        public static int Count => Frames.Count;
    }
}
