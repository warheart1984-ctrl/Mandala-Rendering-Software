using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using SovereignX.CIEMS.Engine.CSSV;
using SovereignX.CIEMS.Engine.Runtime;
using UnityEngine;

/// <summary>
/// Engine-native movie pipeline for Unity.
/// Prefers Unity Recorder container encode (MP4/WebM) in Editor Play Mode when available;
/// falls back to PNG sequence (+ optional ffmpeg mux).
/// Status: partial — Recorder path Editor-only; Play Mode not CI-verified.
/// </summary>
public class GovernedMovieCapture : MonoBehaviour
{
    public enum EncodeMode
    {
        Auto,
        Container,
        PngSequence,
    }

    /// <summary>
    /// Editor Recorder bridge assigns this at load (GovernedMovieRecorderBridge).
    /// Returns true when container recording started; outs path + format (mp4|webm).
    /// </summary>
    public static Func<string, string, float, int, int, int, ContainerEncodeResult> TryContainerEncode;

    public struct ContainerEncodeResult
    {
        public bool Ok;
        public string ContainerPath;
        public string Format;
    }

    public TimelineExecutor timelineExecutor;
    public ProvenanceRecorderBehaviour provenance;
    public EncodeMode encodeMode = EncodeMode.Auto;
    public float defaultSeconds = 8f;
    public int defaultFps = 30;
    public string basename = "4dce-movie";

    public bool IsRecording { get; private set; }
    public MovieExportManifest LastManifest { get; private set; }

    Coroutine _recordRoutine;

    void Awake()
    {
        if (timelineExecutor == null) timelineExecutor = GetComponent<TimelineExecutor>();
        if (provenance == null) provenance = GetComponent<ProvenanceRecorderBehaviour>();
    }

    public bool StartGovernedRecord(IntentRecord intent, Decision decision)
    {
        if (IsRecording)
        {
            Debug.LogWarning("[MovieCapture] Already recording.");
            return false;
        }

        var seconds = defaultSeconds;
        var fps = defaultFps;
        if (intent?.Params != null)
        {
            if (intent.Params.TryGetValue("seconds", out var s) && s != null &&
                double.TryParse(s.ToString(), System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out var secVal))
                seconds = (float)secVal;
            if (intent.Params.TryGetValue("fps", out var f) && f != null &&
                int.TryParse(f.ToString(), out var fpsVal))
                fps = Mathf.Clamp(fpsVal, 1, 120);
        }

        if (intent != null && !string.IsNullOrEmpty(intent.Timeline) && timelineExecutor != null)
            timelineExecutor.Play(intent);

        if (provenance != null && intent != null)
        {
            provenance.CurrentIntentId = intent.Id;
            provenance.CurrentTimelineId = intent.Timeline;
            provenance.CurrentWorldId = intent.World ?? provenance.CurrentWorldId;
        }

        var preferContainer = encodeMode == EncodeMode.Container ||
                              (encodeMode == EncodeMode.Auto && TryContainerEncode != null);

        if (preferContainer && TryContainerEncode != null)
        {
            _recordRoutine = StartCoroutine(RecordContainerRoutine(intent, decision, seconds, fps));
            return true;
        }

        if (encodeMode == EncodeMode.Container)
            Debug.LogWarning("[MovieCapture] Container mode requested but Unity Recorder bridge unavailable — PNG fallback.");

        _recordRoutine = StartCoroutine(RecordPngRoutine(intent, decision, seconds, fps));
        return true;
    }

    [ContextMenu("Record Test Movie (ungoverned — use Orchestrator in production)")]
    public void ContextRecordTest()
    {
        var intent = new IntentRecord
        {
            Id = "movie-test-" + DateTime.UtcNow.Ticks,
            Type = "artifact.movie",
            Kind = "artifact.movie",
            Actor = "runtime.unity",
            World = "world-mythar-plains",
            Timeline = "opening_4d_reveal",
            Params = new Dictionary<string, object>
            {
                ["seconds"] = defaultSeconds,
                ["fps"] = defaultFps,
            },
        };
        StartGovernedRecord(intent, new Decision { Ok = true, Verdict = "allow", DecisionId = "local-test" });
    }

    IEnumerator RecordContainerRoutine(IntentRecord intent, Decision decision, float seconds, int fps)
    {
        IsRecording = true;
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var sessionName = $"{basename}-{stamp}";
        var outDir = Path.Combine(Application.persistentDataPath, "Movies", sessionName);
        Directory.CreateDirectory(outDir);

        var width = Screen.width > 0 ? Screen.width : 1920;
        var height = Screen.height > 0 ? Screen.height : 1080;

        ContainerEncodeResult result;
        try
        {
            result = TryContainerEncode(outDir, sessionName, seconds, fps, width, height);
        }
        catch (Exception ex)
        {
            Debug.LogError("[MovieCapture] Container encode failed: " + ex.Message + " — falling back to PNG.");
            IsRecording = false;
            _recordRoutine = StartCoroutine(RecordPngRoutine(intent, decision, seconds, fps));
            yield break;
        }

        if (!result.Ok)
        {
            Debug.LogWarning("[MovieCapture] Container encode declined — PNG fallback.");
            IsRecording = false;
            _recordRoutine = StartCoroutine(RecordPngRoutine(intent, decision, seconds, fps));
            yield break;
        }

        // Wait for Recorder time interval (+ flush).
        yield return new WaitForSecondsRealtime(seconds + 1.5f);

        var format = string.IsNullOrEmpty(result.Format) ? "mp4" : result.Format;
        var containerPath = result.ContainerPath;
        if (string.IsNullOrEmpty(containerPath))
            containerPath = Path.Combine(outDir, sessionName + "." + format);

        var manifest = new MovieExportManifest
        {
            Format = format,
            HostId = "unity",
            IntentId = intent?.Id,
            WorldId = intent?.World,
            TimelineId = intent?.Timeline,
            DecisionId = decision?.DecisionId,
            OutputDir = outDir,
            Basename = sessionName,
            Seconds = seconds,
            Fps = fps,
            FrameCount = Mathf.RoundToInt(seconds * fps),
            Width = width,
            Height = height,
            CreatedAt = DateTime.UtcNow.ToString("o"),
            MuxHint = null,
            ContainerPath = containerPath,
        };

        FinishManifest(manifest, intent, decision);
        IsRecording = false;
        _recordRoutine = null;
        Debug.Log($"[MovieCapture] Container done — {containerPath}");
    }

    IEnumerator RecordPngRoutine(IntentRecord intent, Decision decision, float seconds, int fps)
    {
        IsRecording = true;
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var sessionName = $"{basename}-{stamp}";
        var outDir = Path.Combine(Application.persistentDataPath, "Movies", sessionName);
        Directory.CreateDirectory(outDir);

        var frameFiles = new List<string>();
        var interval = 1f / Mathf.Max(1, fps);
        var elapsed = 0f;
        var frameIndex = 0;
        var width = Screen.width;
        var height = Screen.height;

        Debug.Log($"[MovieCapture] PNG sequence {seconds}s @ {fps}fps → {outDir}");

        while (elapsed < seconds)
        {
            yield return new WaitForEndOfFrame();

            try
            {
                var tex = ScreenCapture.CaptureScreenshotAsTexture();
                if (tex != null)
                {
                    width = tex.width;
                    height = tex.height;
                    var fileName = $"frame_{frameIndex:D5}.png";
                    File.WriteAllBytes(Path.Combine(outDir, fileName), tex.EncodeToPNG());
                    frameFiles.Add(fileName);
                    Destroy(tex);
                    frameIndex++;
                }
            }
            catch (Exception ex)
            {
                Debug.LogError("[MovieCapture] Frame capture failed: " + ex.Message);
                IsRecording = false;
                yield break;
            }

            elapsed += interval;
            if (interval > 0)
                yield return new WaitForSecondsRealtime(Mathf.Max(0f, interval - Time.unscaledDeltaTime));
        }

        var manifest = new MovieExportManifest
        {
            Format = "png-sequence",
            HostId = "unity",
            IntentId = intent?.Id,
            WorldId = intent?.World,
            TimelineId = intent?.Timeline,
            DecisionId = decision?.DecisionId,
            OutputDir = outDir,
            Basename = sessionName,
            Seconds = seconds,
            Fps = fps,
            FrameCount = frameFiles.Count,
            Width = width,
            Height = height,
            FrameFiles = frameFiles,
            CreatedAt = DateTime.UtcNow.ToString("o"),
            MuxHint = $"ffmpeg -y -framerate {fps} -i \"{Path.Combine(outDir, "frame_%05d.png")}\" -c:v libx264 -pix_fmt yuv420p \"{Path.Combine(outDir, sessionName + ".mp4")}\"",
        };

        FinishManifest(manifest, intent, decision);
        IsRecording = false;
        _recordRoutine = null;
        Debug.Log($"[MovieCapture] PNG done — {manifest.FrameCount} frames. Manifest: {manifest.ManifestPath}");
    }

    void FinishManifest(MovieExportManifest manifest, IntentRecord intent, Decision decision)
    {
        var manifestPath = Path.Combine(manifest.OutputDir, "movie-manifest.json");
        File.WriteAllText(manifestPath, SerializeManifest(manifest), Encoding.UTF8);
        manifest.ManifestPath = manifestPath;

        var provenancePath = Path.Combine(manifest.OutputDir, "provenance.json");
        WriteProvenance(provenancePath, intent, decision, manifest);
        manifest.ProvenancePath = provenancePath;

        CssvRegistry.EnsureInstance()?.RegisterArtifact(new CssvArtifactRecord
        {
            Id = "movie-" + manifest.Basename,
            ArtifactType = "movie",
            Payload = new Dictionary<string, object>
            {
                ["format"] = manifest.Format,
                ["outputDir"] = manifest.OutputDir,
                ["containerPath"] = manifest.ContainerPath,
                ["frameCount"] = manifest.FrameCount,
                ["fps"] = manifest.Fps,
                ["seconds"] = manifest.Seconds,
                ["manifestPath"] = manifestPath,
            },
        });

        LastManifest = manifest;
    }

    static void WriteProvenance(string path, IntentRecord intent, Decision decision, MovieExportManifest manifest)
    {
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append("\"host\":\"unity\",");
        sb.Append("\"intentId\":\"").Append(Esc(intent?.Id)).Append("\",");
        sb.Append("\"worldId\":\"").Append(Esc(intent?.World)).Append("\",");
        sb.Append("\"timelineId\":\"").Append(Esc(intent?.Timeline)).Append("\",");
        sb.Append("\"decisionId\":\"").Append(Esc(decision?.DecisionId)).Append("\",");
        sb.Append("\"verdict\":\"").Append(Esc(decision?.Verdict)).Append("\",");
        sb.Append("\"format\":\"").Append(Esc(manifest.Format)).Append("\",");
        sb.Append("\"containerPath\":\"").Append(Esc(manifest.ContainerPath)).Append("\",");
        sb.Append("\"frameCount\":").Append(manifest.FrameCount).Append(',');
        sb.Append("\"fps\":").Append(manifest.Fps).Append(',');
        sb.Append("\"seconds\":").Append(manifest.Seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',');
        sb.Append("\"outputDir\":\"").Append(Esc(manifest.OutputDir)).Append("\",");
        sb.Append("\"createdAt\":\"").Append(Esc(manifest.CreatedAt)).Append('"');
        sb.Append('}');
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
    }

    static string SerializeManifest(MovieExportManifest m)
    {
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append("\"format\":\"").Append(Esc(m.Format)).Append("\",");
        sb.Append("\"hostId\":\"").Append(Esc(m.HostId)).Append("\",");
        sb.Append("\"intentId\":\"").Append(Esc(m.IntentId)).Append("\",");
        sb.Append("\"worldId\":\"").Append(Esc(m.WorldId)).Append("\",");
        sb.Append("\"timelineId\":\"").Append(Esc(m.TimelineId)).Append("\",");
        sb.Append("\"decisionId\":\"").Append(Esc(m.DecisionId)).Append("\",");
        sb.Append("\"outputDir\":\"").Append(Esc(m.OutputDir)).Append("\",");
        sb.Append("\"basename\":\"").Append(Esc(m.Basename)).Append("\",");
        sb.Append("\"containerPath\":\"").Append(Esc(m.ContainerPath)).Append("\",");
        sb.Append("\"seconds\":").Append(m.Seconds.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',');
        sb.Append("\"fps\":").Append(m.Fps).Append(',');
        sb.Append("\"frameCount\":").Append(m.FrameCount).Append(',');
        sb.Append("\"width\":").Append(m.Width).Append(',');
        sb.Append("\"height\":").Append(m.Height).Append(',');
        sb.Append("\"muxHint\":\"").Append(Esc(m.MuxHint)).Append("\",");
        sb.Append("\"createdAt\":\"").Append(Esc(m.CreatedAt)).Append("\",");
        sb.Append("\"frameFiles\":[");
        for (var i = 0; i < m.FrameFiles.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('"').Append(Esc(m.FrameFiles[i])).Append('"');
        }
        sb.Append("]}");
        return sb.ToString();
    }

    static string Esc(string s) =>
        (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
}
