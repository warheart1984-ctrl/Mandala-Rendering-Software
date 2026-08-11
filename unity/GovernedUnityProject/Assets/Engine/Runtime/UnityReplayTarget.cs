using System.Collections.Generic;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>Unity IReplayTarget — applies FrameProvenance to FourDTesseractRenderer. Status: skeleton.</summary>
public class UnityReplayTarget : MonoBehaviour, IReplayTarget
{
    public FourDTesseractRenderer Renderer;

    public void ApplyFrame(FrameProvenance frame)
    {
        if (Renderer == null || frame.Parameters == null) return;
        if (frame.Parameters.TryGetValue("speed", out var speed))
            Renderer.speed = (float)speed;
        if (frame.Parameters.TryGetValue("d4", out var d4))
            Renderer.d4 = (float)d4;
        if (frame.Parameters.TryGetValue("d3", out var d3))
            Renderer.d3 = (float)d3;
    }
}
