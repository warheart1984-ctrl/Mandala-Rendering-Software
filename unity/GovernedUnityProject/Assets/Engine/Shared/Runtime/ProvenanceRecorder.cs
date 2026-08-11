// In-memory provenance ledger (session). Serialize later for TRT.



using System.Collections.Generic;



namespace SovereignX.CIEMS.Engine.Runtime

{

    public static class ProvenanceRecorder

    {

        static readonly List<FrameProvenance> Frames = new List<FrameProvenance>();



        public static void Record(FrameProvenance frame) => Frames.Add(frame);



        public static IReadOnlyList<FrameProvenance> GetFrames() => Frames;



        public static void Clear() => Frames.Clear();



        public static int Count => Frames.Count;

    }

}

