// Unity mirror of engine/runtime/MovieExportManifest.cs

using System.Collections.Generic;

namespace SovereignX.CIEMS.Engine.Runtime
{
    public sealed class MovieExportManifest
    {
        public string Format = "png-sequence";
        public string HostId = "unity";
        public string IntentId;
        public string WorldId;
        public string TimelineId;
        public string DecisionId;
        public string OutputDir;
        public string Basename;
        public double Seconds;
        public int Fps;
        public int FrameCount;
        public int Width;
        public int Height;
        public List<string> FrameFiles = new List<string>();
        public string ManifestPath;
        public string ProvenancePath;
        public string MuxHint;
        public string ContainerPath;
        public string CreatedAt;
    }
}
