"""Live Infinity Beatbox / Speakers / MP4 handoff for the warrior 8-shot plan.

Does not compose an original score. Does not fake Beatbox if Infinity is absent.
Speakers mix + film mux run only when a real video_path exists.
Otherwise: declared skip + optional click/silent flipbook MP4 (not motion picture).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Any

_DIR = Path(__file__).resolve().parent
if str(_DIR.parent) not in sys.path:
    sys.path.insert(0, str(_DIR.parent))

from contract.audio import (  # noqa: E402
    BEATBOX_SCORE_ENTRY,
    BEATBOX_STATUS_ENDPOINT,
    local_click_playlist,
)
from contract.map_infinity import from_infinity_backend_build  # noqa: E402

FIXTURE = _DIR / "fixtures" / "infinity-backend-build-warrior-courtyard.json"
EVIDENCE_DIR = _DIR / "evidence" / "beatbox-mp4"
INFINITY_CANDIDATES = (
    Path("/media/jon/New Volume/infinity"),
    Path("/media/jon/New Volume/Mandala Rendering Software/external/beatbox_speakers"),
        Path(_DIR.parents[3] / "external" / "beatbox_speakers"),
    Path.home() / "infinity",
)


def _find_beatbox_lane() -> Path | None:
    for root in INFINITY_CANDIDATES:
        candidate = root / "src" / "beatbox" / "lanes" / "beatbox_lane.py"
        if candidate.is_file():
            return candidate
        nested = root / "external" / "beatbox_speakers" / "src" / "beatbox" / "lanes" / "beatbox_lane.py"
        if nested.is_file():
            return nested
    return None


def _find_ffmpeg() -> str | None:
    for name in ("ffmpeg",):
        found = shutil.which(name)
        if found:
            return found
    for path in (
        Path("/usr/bin/ffmpeg"),
        Path("/usr/local/bin/ffmpeg"),
        Path("/media/jon/New Volume/Mandala Rendering Software/runtime/toolchain/ffmpeg/usr/bin/ffmpeg"),
    ):
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    return None


def _get_beatbox_status(url: str) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": True,
                "httpStatus": getattr(resp, "status", None),
                "body": body[:2000],
            }
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"ok": False, "error": str(exc)}


def _write_click_wav(path: Path, playlist: dict[str, Any]) -> None:
    rate = 22050
    frames: list[int] = []
    for entry in playlist["entries"]:
        hz = float(entry["clickHz"])
        duration = 0.35
        n = int(rate * duration)
        for i in range(n):
            t = i / rate
            env = 1.0 if (i % max(1, int(rate / hz))) < 8 else 0.0
            sample = int(12000 * env)
            frames.append(max(-32767, min(32767, sample)))
        frames.extend([0] * int(rate * 0.05))
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(b"".join(int(s).to_bytes(2, "little", signed=True) for s in frames))


def _try_click_mp4(ffmpeg: str | None, wav: Path, out_mp4: Path) -> dict[str, Any]:
    if not ffmpeg:
        return {
            "statusTag": "declared",
            "written": False,
            "why": "ffmpeg not on PATH; Speakers mix / MP4 mux not run",
        }
    cmd = [
        ffmpeg,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:d=2",
        "-i",
        str(wav),
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        str(out_mp4),
    ]
    run = subprocess.run(cmd, capture_output=True, text=True)
    if run.returncode != 0 or not out_mp4.is_file():
        return {
            "statusTag": "declared",
            "written": False,
            "why": "ffmpeg click mux failed",
            "stderr": (run.stderr or "")[-1500:],
        }
    return {
        "statusTag": "partial",
        "written": True,
        "path": str(out_mp4),
        "bytes": out_mp4.stat().st_size,
        "tag": "flipbook-not-motion",
        "claim": "tiny click/black-frame MP4 fixture — not a film score, not Speakers mix, not motion picture",
    }


def run_live_handoff(*, video_path: str | None = None) -> dict[str, Any]:
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    artifact = from_infinity_backend_build(raw)
    plan = artifact["audioPlan"]
    playlist = local_click_playlist(plan)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    lane = _find_beatbox_lane()
    base = os.environ.get("JARVIS_MEMORYBOARD_URL", "http://127.0.0.1:8001").rstrip("/")
    status_url = f"{base}/api/jarvis/beatbox-lane/status"
    http_status = _get_beatbox_status(status_url)

    invoked = False
    invoke_error = None
    if lane is not None:
        invoke_error = (
            "BeatboxLane.score found on disk but Mandala does not import Infinity; "
            "live score remains Infinity-owned. Not invoked from this adapter."
        )
    else:
        invoke_error = "BeatboxLane.score source not present in this workspace"

    wav_path = EVIDENCE_DIR / "warrior-courtyard-click.wav"
    _write_click_wav(wav_path, playlist)
    ffmpeg = _find_ffmpeg()
    mp4_path = EVIDENCE_DIR / "warrior-courtyard-click-flipbook.mp4"

    video = video_path or os.environ.get("MANDALA_WARRIOR_VIDEO_PATH")
    speakers: dict[str, Any]
    if video and Path(video).is_file():
        speakers = {
            "statusTag": "declared",
            "video_path": video,
            "whyDeclared": (
                "video_path exists but Speakers mix_lane is Infinity-owned and was not imported."
            ),
        }
        mp4 = {
            "statusTag": "declared",
            "why": "Would mux via story_forge.movie_audio_pipeline only inside Infinity",
            "video_path": video,
        }
    else:
        speakers = {
            "statusTag": "declared",
            "video_path": None,
            "skip": True,
            "whyDeclared": "No rendered video_path; Speakers mix not run.",
        }
        mp4 = _try_click_mp4(ffmpeg, wav_path, mp4_path)

    evidence = {
        "schemaVersion": artifact["schemaVersion"],
        "productionId": artifact["productionId"],
        "characterId": artifact["characters"][0]["characterId"],
        "shotCount": len(plan["cues"]),
        "scoreIdentity": plan["scoreIdentity"],
        "beatbox": {
            "livePathStatusTag": "declared",
            "statusEndpoint": BEATBOX_STATUS_ENDPOINT,
            "scoreEntry": BEATBOX_SCORE_ENTRY,
            "sourcePath": str(lane) if lane else None,
            "invoked": invoked,
            "httpStatusProbe": http_status,
            "whyDeclared": invoke_error,
        },
        "speakers": speakers,
        "clickPlaylist": playlist,
        "clickWav": str(wav_path),
        "mp4": mp4,
        "limitation": (
            "Cues mapped; Beatbox live score not invoked. Click/flipbook is not an original score."
        ),
    }
    out = EVIDENCE_DIR / "warrior-beatbox-mp4-evidence.json"
    out.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    evidence["evidencePath"] = str(out)
    return evidence


def main() -> int:
    evidence = run_live_handoff()
    print(json.dumps(evidence, indent=2))
    # Success = honest evidence written, not a fake score.
    return 0 if Path(evidence["evidencePath"]).is_file() else 1


if __name__ == "__main__":
    raise SystemExit(main())
