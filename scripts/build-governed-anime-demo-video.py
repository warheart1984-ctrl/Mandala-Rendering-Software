#!/usr/bin/env python3
"""Build a YouTube-ready governed anime pipeline demo video.

Uses local Lemonade TTS per repo lawbook and assembles:
- generated anime_demo.mp4,
- structure plate / evidence stills,
- capability canvas cards,
- honest maturity labels.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import textwrap
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tmp" / "hackathon-governed-anime-demo"
OUT = ROOT / "tmp" / "governed-anime-demo-video"
LEMONADE_URL = "http://localhost:13305/api/v1/audio/speech"
SIZE = (1920, 1080)
FPS = 30


SLIDES = [
    {
        "name": "01-open",
        "kind": "card",
        "title": "Governed Creative Anime Pipeline",
        "caption": "Intent → Genblaze /api/anime → ffmpeg → Evidence → Replay",
        "body": [
            "This demo is not just an anime stylizer.",
            "It is a governed creative pipeline where style, structure, export, and evidence travel together.",
        ],
        "narration": (
            "This is the governed creative anime pipeline. The point is not just stylization. "
            "The point is that every artifact has intent, profile metadata, hashes, and a replay trail."
        ),
    },
    {
        "name": "02-demo-clip",
        "kind": "video",
        "title": "Deterministic Anime Structure Clip",
        "caption": "Generated locally from deterministic structure/cel plates.",
        "narration": (
            "The verified demo path generates deterministic anime structure plates, then exports a clean H.264 video with ffmpeg."
        ),
    },
    {
        "name": "03-structure",
        "kind": "image",
        "image": "structure_plate.png",
        "title": "Structure Plate",
        "caption": "First frame becomes the UE handoff structure plate.",
        "narration": (
            "The structure plate is a real file with a SHA-256 hash. It can be used by the optional Unreal AnimeStylizer consumer leg."
        ),
    },
    {
        "name": "04-evidence",
        "kind": "receipt",
        "title": "Evidence Bundle",
        "caption": "Manifest, provenance, replay metadata, hashes, and run receipt.",
        "narration": (
            "The output folder includes the video, structure plate, Genblaze handoff JSON, provenance, replay metadata, and a compact evidence bundle."
        ),
    },
    {
        "name": "05-capabilities",
        "kind": "capability",
        "title": "Honest Capability Status",
        "caption": "Verified path is structure-to-ffmpeg; UE remains optional skeleton/partial.",
        "narration": (
            "The maturity labels are explicit. The Genblaze handoff and offline structure path are partial and runnable. "
            "The Unreal plugin is scaffolded as an optional consumer, not overclaimed as a verified engine compile."
        ),
    },
    {
        "name": "06-close",
        "kind": "card",
        "title": "Reusable Profiles. Replayable Media.",
        "caption": "The differentiator is governance, not a lucky frame.",
        "body": [
            "AnimeWorldProfile declares style.",
            "Projection provenance declares how structure is made.",
            "Evidence proves what was produced.",
            "Replay metadata lets operators compare future runs.",
        ],
        "narration": (
            "That is the story: reusable style profiles, replayable execution, and evidence-backed creative media. "
            "It is not another anime renderer. It is governed media infrastructure."
        ),
    },
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=str(ROOT), check=True)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def card(title: str, caption: str, body: list[str] | None = None) -> Image.Image:
    img = Image.new("RGB", SIZE, (7, 10, 24))
    d = ImageDraw.Draw(img)
    for r in range(140, 980, 90):
        d.ellipse((960 - r, 540 - r, 960 + r, 540 + r), outline=(20, 70, 105), width=2)
    d.rounded_rectangle((90, 80, 1830, 1000), radius=36, fill=(13, 20, 42), outline=(104, 230, 255), width=3)
    d.text((150, 140), title, fill=(245, 253, 255), font=font(76, True))
    d.text((154, 240), caption, fill=(191, 226, 240), font=font(38))
    y = 370
    for line in body or []:
        for part in textwrap.wrap(line, 60):
            d.text((180, y), part, fill=(226, 241, 248), font=font(48))
            y += 68
        y += 18
    d.text((150, 925), "Mandala Rendering System · Genblaze · AnimeWorldProfile · CECP evidence", fill=(130, 170, 196), font=font(28))
    return img


def fit_cover(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    sw, sh = im.size
    scale = max(SIZE[0] / sw, SIZE[1] / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    return im.crop(((nw - SIZE[0]) // 2, (nh - SIZE[1]) // 2, (nw + SIZE[0]) // 2, (nh + SIZE[1]) // 2))


def overlay(im: Image.Image, title: str, caption: str, idx: int) -> Image.Image:
    img = ImageEnhance.Color(fit_cover(im)).enhance(1.12)
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle((70, 65, 1850, 250), radius=28, fill=(4, 9, 24, 220), outline=(90, 220, 255, 170), width=2)
    d.text((112, 96), title, fill=(245, 253, 255, 255), font=font(62, True))
    d.text((114, 178), caption, fill=(207, 230, 240, 255), font=font(34))
    badge = f"{idx:02d} · GOVERNED ANIME"
    d.rounded_rectangle((1510, 82, 1830, 132), radius=18, fill=(44, 76, 145, 230))
    d.text((1530, 94), badge, fill=(235, 246, 255, 255), font=font(24, True))
    return img


def receipt_card() -> Image.Image:
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    lines = [
        f"End-to-end run: {manifest['timing']['end_to_end_seconds']} seconds",
        f"ffmpeg export: {manifest['ffmpeg']['status']}",
        f"AnimeWorldProfile: {manifest['profile_id']}",
        f"Projection method: {manifest['projection_method']}",
        f"MP4 SHA-256: {manifest['ffmpeg']['sha256'][:24]}...",
        f"Evidence bundle: {manifest['evidence_bundle']['sha256'][:24]}...",
    ]
    return card("Evidence Bundle", "Hashes, provenance, replay metadata, and receipt.", lines)


def capability_card() -> Image.Image:
    return card(
        "Capability Canvas",
        "Declared / Partial / Verified boundaries are part of the product.",
        [
            "Partial: Genblaze /api/anime handoff",
            "Partial: deterministic structure/cel plates",
            "Partial: ffmpeg H.264 export when ffmpeg is present",
            "Skeleton/Partial: UE AnimeStylizer optional consumer",
            "Declared: CKL replay enforcement for this anime path",
        ],
    )


def make_stills(work: Path) -> list[Path]:
    stills = []
    for i, s in enumerate(SLIDES, 1):
        if s["kind"] == "image":
            im = Image.open(SOURCE / s["image"])
            im = overlay(im, s["title"], s["caption"], i)
        elif s["kind"] == "receipt":
            im = overlay(receipt_card(), s["title"], s["caption"], i)
        elif s["kind"] == "capability":
            im = overlay(capability_card(), s["title"], s["caption"], i)
        else:
            im = card(s["title"], s["caption"], s.get("body"))
        path = work / "stills" / f"{i:02d}-{s['name']}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        im.save(path)
        stills.append(path)
    stills[0].with_name("thumbnail.jpg")
    overlay(card("Governed Anime Pipeline", "Profiles · structure · ffmpeg · evidence · replay", []), "Governed Anime Pipeline", "MRS + Genblaze + evidence-backed anime media", 1).save(work / "youtube-thumbnail.jpg", "JPEG", quality=92)
    return stills


def tts(text: str, voice: str, out: Path) -> None:
    payload = json.dumps({"model": "kokoro-v1", "input": text, "voice": voice, "response_format": "mp3"}).encode()
    req = urllib.request.Request(LEMONADE_URL, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        out.write_bytes(resp.read())


def duration(path: Path) -> float:
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(p.stdout.strip())


def build(work: Path, voice: str) -> Path:
    if not (SOURCE / "anime_demo.mp4").exists():
        raise SystemExit(f"missing source anime demo: {SOURCE / 'anime_demo.mp4'}")
    work.mkdir(parents=True, exist_ok=True)
    stills = make_stills(work)
    segs: list[Path] = []
    for i, (slide, still) in enumerate(zip(SLIDES, stills), 1):
        audio = work / "audio" / f"{i:02d}-{slide['name']}.mp3"
        audio.parent.mkdir(parents=True, exist_ok=True)
        if not audio.exists():
            tts(slide["narration"], voice, audio)
        seg = work / "segments" / f"{i:02d}-{slide['name']}.mp4"
        seg.parent.mkdir(parents=True, exist_ok=True)
        dur = max(5.0, duration(audio) + 0.4)
        if slide["kind"] == "video":
            # Loop the short anime clip underneath the narration.
            run([
                "ffmpeg", "-y", "-stream_loop", "-1", "-i", str(SOURCE / "anime_demo.mp4"), "-i", str(audio),
                "-t", f"{dur:.3f}", "-vf", f"scale={SIZE[0]}:{SIZE[1]}:force_original_aspect_ratio=increase,crop={SIZE[0]}:{SIZE[1]},format=yuv420p",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-shortest", str(seg)
            ])
        else:
            run([
                "ffmpeg", "-y", "-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", str(still), "-i", str(audio),
                "-vf", f"scale={math.ceil(SIZE[0]*1.02)}:{math.ceil(SIZE[1]*1.02)},crop={SIZE[0]}:{SIZE[1]},format=yuv420p",
                "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-shortest", str(seg)
            ])
        segs.append(seg)
    concat = work / "segments.txt"
    concat.write_text("".join(f"file '{str(s).replace(chr(92), '/')}'\n" for s in segs), encoding="utf-8")
    joined = work / "joined.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(joined)])
    final = work / "governed-anime-pipeline-demo.mp4"
    run(["ffmpeg", "-y", "-i", str(joined), "-movflags", "+faststart", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", str(final)])
    meta = {
        "video": str(final).replace("\\", "/"),
        "thumbnail": str(work / "youtube-thumbnail.jpg").replace("\\", "/"),
        "voice": voice,
        "duration_seconds": duration(final),
        "sha256": sha256(final),
        "source_anime_demo": str(SOURCE / "anime_demo.mp4").replace("\\", "/"),
        "claim_boundary": "Verified path: Genblaze/anime handoff -> deterministic structure/cel plates -> ffmpeg -> evidence. UE AnimeStylizer remains optional skeleton/partial.",
    }
    (work / "video-build.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))
    return final


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--voice", default="am_michael")
    args = ap.parse_args()
    build(args.out, args.voice)


if __name__ == "__main__":
    main()
