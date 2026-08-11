using System.Collections.Generic;
using SovereignX.CIEMS.Engine.CSSV;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>Records FrameProvenance each LateUpdate. Status: skeleton until Play Mode verified.</summary>
public class ProvenanceRecorderBehaviour : MonoBehaviour
{
    public FourDTesseractRenderer Renderer;
    public string CurrentIntentId;
    public string CurrentTimelineId;
    public string CurrentWorldId = "world-mythar-plains";

    void LateUpdate()
    {
        if (Renderer == null) Renderer = GetComponent<FourDTesseractRenderer>();
        if (Renderer == null) return;

        var frame = new FrameProvenance
        {
            IntentId = CurrentIntentId,
            TimelineId = CurrentTimelineId,
            WorldId = CurrentWorldId,
            TimeSeconds = Time.time,
            Parameters = new Dictionary<string, double>
            {
                ["speed"] = Renderer.speed,
                ["d4"] = Renderer.d4,
                ["d3"] = Renderer.d3,
            },
        };
        ProvenanceRecorder.Record(frame);
        CssvRegistry.EnsureInstance()?.RegisterFrame(frame);
    }
}
