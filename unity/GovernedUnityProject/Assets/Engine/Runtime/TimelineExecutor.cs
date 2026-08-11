using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>
/// Plays governed timeline clips against BindingResolver targets.
/// Apply4DClip lerps speed/d4/d3 on FourDTesseractRenderer.
/// Status: skeleton — logic present; verify in Unity Play Mode.
/// </summary>
public class TimelineExecutor : MonoBehaviour
{
    public GovernedTimelineStore store;
    public TimelineScheduler scheduler;
    public BindingResolver bindings;

    TimelineDto _timeline;

    void Awake()
    {
        if (store == null) store = GetComponent<GovernedTimelineStore>();
        if (scheduler == null) scheduler = GetComponent<TimelineScheduler>();
        if (bindings == null) bindings = GetComponent<BindingResolver>();
    }

    public void Play(IntentRecord intent)
    {
        _timeline = store.Load();
        scheduler.DurationSec = _timeline.durationSec > 0 ? _timeline.durationSec : 12f;
        if (scheduler.TimeSec >= scheduler.DurationSec)
            scheduler.ResetClock();
        bindings.Rebuild();
        scheduler.Play();
        Debug.Log($"[TimelineExecutor] Play {_timeline.id} intent={intent?.Id}");
    }

    void Update()
    {
        if (scheduler == null || !scheduler.Playing || _timeline?.tracks == null) return;
        ApplyClips(scheduler.TimeSec);
    }

    void ApplyClips(float timeSec)
    {
        foreach (var track in _timeline.tracks)
        {
            if (track?.clips == null) continue;
            foreach (var clip in track.clips)
            {
                float end = clip.startSec + clip.durationSec;
                if (timeSec < clip.startSec || timeSec > end) continue;
                float p = clip.durationSec <= 0 ? 1f : (timeSec - clip.startSec) / clip.durationSec;
                var payload = clip.payload;
                if (payload == null || string.IsNullOrEmpty(payload.param)) continue;
                if (clip.action != "set_param" && clip.action != "render_4d") continue;

                float value = Mathf.Lerp(payload.from, payload.to, p);
                var tess = bindings.Resolve<FourDTesseractRenderer>(track.binding);
                if (tess != null)
                {
                    tess.Apply4DClip(payload.param, value);
                    continue;
                }
                var cam = bindings.Resolve<Camera>(track.binding);
                if (cam != null && payload.param == "d3")
                {
                    // Camera binding: stash d3 on a companion renderer if present
                    var r = cam.GetComponent<FourDTesseractRenderer>();
                    if (r != null) r.Apply4DClip("d3", value);
                }
            }
        }
    }
}
