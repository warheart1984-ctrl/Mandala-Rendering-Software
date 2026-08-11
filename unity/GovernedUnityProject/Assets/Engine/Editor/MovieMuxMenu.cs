#if UNITY_EDITOR
using System.Diagnostics;
using System.IO;
using UnityEditor;
using UnityEngine;

/// <summary>
/// Optional MP4 mux for PNG sequences written by GovernedMovieCapture.
/// Requires ffmpeg on PATH. Does not claim in-engine H.264 encoding.
/// </summary>
public static class MovieMuxMenu
{
    [MenuItem("SovereignX.CIEMS.Engine/Mux Movie Sequence (ffmpeg)")]
    public static void MuxSelectedFolder()
    {
        var folder = EditorUtility.OpenFolderPanel(
            "Select movie session folder (contains frame_00000.png)",
            Path.Combine(Application.persistentDataPath, "Movies"),
            "");
        if (string.IsNullOrEmpty(folder))
            return;

        var pattern = Path.Combine(folder, "frame_%05d.png");
        if (!File.Exists(Path.Combine(folder, "frame_00000.png")))
        {
            UnityEngine.Debug.LogError("[MovieMux] frame_00000.png not found in " + folder);
            return;
        }

        var fps = 30;
        var manifestPath = Path.Combine(folder, "movie-manifest.json");
        if (File.Exists(manifestPath))
        {
            var json = File.ReadAllText(manifestPath);
            var m = System.Text.RegularExpressions.Regex.Match(json, "\"fps\"\\s*:\\s*(\\d+)");
            if (m.Success) int.TryParse(m.Groups[1].Value, out fps);
        }

        var outMp4 = Path.Combine(folder, Path.GetFileName(folder) + ".mp4");
        var args = $"-y -framerate {fps} -i \"{pattern}\" -c:v libx264 -pix_fmt yuv420p \"{outMp4}\"";
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                Arguments = args,
                UseShellExecute = false,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            using var proc = Process.Start(psi);
            var err = proc.StandardError.ReadToEnd();
            proc.WaitForExit();
            if (proc.ExitCode != 0)
                UnityEngine.Debug.LogError("[MovieMux] ffmpeg failed:\n" + err);
            else
                UnityEngine.Debug.Log("[MovieMux] Wrote " + outMp4);
        }
        catch (System.Exception ex)
        {
            UnityEngine.Debug.LogError("[MovieMux] ffmpeg not available: " + ex.Message);
        }
    }
}
#endif
