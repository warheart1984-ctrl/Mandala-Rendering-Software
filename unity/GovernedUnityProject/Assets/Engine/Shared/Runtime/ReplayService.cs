// Deterministic replay from recorded FrameProvenance.



using System.Collections.Generic;



namespace SovereignX.CIEMS.Engine.Runtime

{

    public interface IReplayTarget

    {

        void ApplyFrame(FrameProvenance frame);

    }



    public static class ReplayService

    {

        public static void Replay(IReadOnlyList<FrameProvenance> frames, IReplayTarget target)

        {

            if (frames == null || target == null) return;

            foreach (var frame in frames)

                target.ApplyFrame(frame);

        }

    }

}

