"""
SME-GEN — FFmpeg Video Stitching
Constitutional Contract: contract.sme-gen.v1
Authority: generate
Status: declared
Mathematical Constraints (Appendix H §1.5):
- Video generation: IMPOSSIBLE on CPU (neural)
- Use FFmpeg stitching: images + audio → video
"""
from __future__ import annotations

import hashlib
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image


@dataclass
class VideoEncodingConfig:
    """Video encoding configuration"""
    codec: str = "libx264"  # "libx264", "libvpx-vp9", "libaom-av1"
    preset: str = "medium"  # ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
    crf: int = 23  # Constant Rate Factor (0-51, lower = better quality)
    framerate: int = 30
    pixel_format: str = "yuv420p"
    audio_codec: str = "aac"
    audio_bitrate: str = "128k"
    width: int = 512
    height: int = 512


@dataclass
class StitchConfig:
    """Image sequence stitching configuration"""
    input_pattern: str = "frame_%04d.png"
    framerate: int = 30
    loop_last_frame: int = 0  # Hold last frame for N seconds
    fade_in: float = 0.0
    fade_out: float = 0.0


class FFmpegStitcher:
    """
    Stitches image sequences and audio into video using FFmpeg.
    Constitutional video generation (neural video gen impossible on CPU).
    """
    
    def __init__(
        self,
        config: Optional[VideoEncodingConfig] = None,
        ffmpeg_path: Optional[Path] = None,
    ):
        self.config = config or VideoEncodingConfig()
        self.ffmpeg_path = ffmpeg_path or Path("ffmpeg")
        self._validate_ffmpeg()
    
    def _validate_ffmpeg(self) -> None:
        """Check FFmpeg availability"""
        try:
            result = subprocess.run(
                [str(self.ffmpeg_path), "-version"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise RuntimeError("FFmpeg not found or not executable")
        except FileNotFoundError:
            raise RuntimeError("FFmpeg not found. Install ffmpeg.")
    
    def stitch_images(
        self,
        images: list[Image.Image],
        output_path: Path,
        audio_path: Optional[Path] = None,
        stitch_config: Optional[StitchConfig] = None,
    ) -> dict[str, Any]:
        """
        Stitch images into video, optionally with audio.
        
        Args:
            images: List of PIL Images
            output_path: Output video path
            audio_path: Optional audio file to add
            stitch_config: Stitching configuration
            
        Returns:
            evidence: dict with encoding metadata
        """
        stitch_config = stitch_config or StitchConfig()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            
            # Save images
            for i, img in enumerate(images):
                # Resize if needed
                if img.size != (self.config.width, self.config.height):
                    img = img.resize(
                        (self.config.width, self.config.height),
                        Image.LANCZOS,
                    )
                
                frame_path = tmpdir / stitch_config.input_pattern % i
                img.save(frame_path, "PNG")
            
            # Build FFmpeg command
            cmd = [
                str(self.ffmpeg_path),
                "-y",
                "-framerate", str(stitch_config.framerate),
                "-i", str(tmpdir / stitch_config.input_pattern),
            ]
            
            # Add audio if provided
            if audio_path and audio_path.exists():
                cmd.extend(["-i", str(audio_path)])
                cmd.extend(["-c:a", self.config.audio_codec])
                cmd.extend(["-b:a", self.config.audio_bitrate])
                cmd.extend(["-shortest"])  # Stop at shortest stream
            
            # Video encoding
            cmd.extend([
                "-c:v", self.config.codec,
                "-preset", self.config.preset,
                "-crf", str(self.config.crf),
                "-pix_fmt", self.config.pixel_format,
                "-r", str(self.config.framerate),
            ])
            
            # Fade in/out
            if stitch_config.fade_in > 0 or stitch_config.fade_out > 0:
                filter_parts = []
                if stitch_config.fade_in > 0:
                    filter_parts.append(f"fade=t=in:st=0:d={stitch_config.fade_in}")
                if stitch_config.fade_out > 0:
                    filter_parts.append(f"fade=t=out:st={max(0, len(images)/stitch_config.framerate - stitch_config.fade_out)}:d={stitch_config.fade_out}")
                cmd.extend(["-vf", ",".join(filter_parts)])
            
            # Loop last frame if requested
            if stitch_config.loop_last_frame > 0:
                cmd.extend([
                    "-filter_complex",
                    f"[0:v]tpad=stop_mode=clone:stop_duration={stitch_config.loop_last_frame}[v]",
                    "-map", "[v]",
                ])
            
            cmd.append(str(output_path))
            
            # Run FFmpeg
            start = time.perf_counter()
            result = subprocess.run(cmd, capture_output=True, text=True)
            latency_s = time.perf_counter() - start
            
            if result.returncode != 0:
                raise RuntimeError(f"FFmpeg stitching failed: {result.stderr}")
            
            # Verify output
            if not output_path.exists():
                raise RuntimeError("Output video not created")
            
            output_size = output_path.stat().st_size
            
            evidence = {
                "output_path": str(output_path),
                "num_frames": len(images),
                "framerate": stitch_config.framerate,
                "resolution": [self.config.width, self.config.height],
                "codec": self.config.codec,
                "preset": self.config.preset,
                "crf": self.config.crf,
                "has_audio": audio_path is not None,
                "output_size_bytes": output_size,
                "latency_seconds": latency_s,
            }
            
            return evidence
    
    def stitch_image_sequence(
        self,
        image_dir: Path,
        output_path: Path,
        pattern: str = "frame_%04d.png",
        framerate: int = 30,
        audio_path: Optional[Path] = None,
    ) -> dict[str, Any]:
        """Stitch existing image sequence"""
        # Count frames
        frames = sorted(image_dir.glob(pattern.replace("%04d", "*")))
        
        cmd = [
            str(self.ffmpeg_path),
            "-y",
            "-framerate", str(framerate),
            "-i", str(image_dir / pattern),
        ]
        
        if audio_path and audio_path.exists():
            cmd.extend(["-i", str(audio_path)])
            cmd.extend(["-c:a", self.config.audio_codec, "-b:a", self.config.audio_bitrate, "-shortest"])
        
        cmd.extend([
            "-c:v", self.config.codec,
            "-preset", self.config.preset,
            "-crf", str(self.config.crf),
            "-pix_fmt", self.config.pixel_format,
            "-r", str(self.config.framerate),
        ])
        
        cmd.append(str(output_path))
        
        start = time.perf_counter()
        result = subprocess.run(cmd, capture_output=True, text=True)
        latency_s = time.perf_counter() - start
        
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg sequence stitching failed: {result.stderr}")
        
        return {
            "num_frames": len(frames),
            "framerate": framerate,
            "latency_seconds": latency_s,
            "output_size_bytes": output_path.stat().st_size if output_path.exists() else 0,
        }
    
    def encode_video(
        self,
        input_path: Path,
        output_path: Path,
        config: Optional[VideoEncodingConfig] = None,
    ) -> dict[str, Any]:
        """Re-encode video with different settings"""
        cfg = config or self.config
        
        cmd = [
            str(self.ffmpeg_path),
            "-y",
            "-i", str(input_path),
            "-c:v", cfg.codec,
            "-preset", cfg.preset,
            "-crf", str(cfg.crf),
            "-pix_fmt", cfg.pixel_format,
            "-r", str(cfg.framerate),
        ]
        
        if cfg.audio_codec:
            cmd.extend(["-c:a", cfg.audio_codec, "-b:a", cfg.audio_bitrate])
        
        cmd.append(str(output_path))
        
        start = time.perf_counter()
        result = subprocess.run(cmd, capture_output=True, text=True)
        latency_s = time.perf_counter() - start
        
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg encoding failed: {result.stderr}")
        
        return {
            "latency_seconds": latency_s,
            "output_size_bytes": output_path.stat().st_size if output_path.exists() else 0,
        }


import time  # Move import to top in production


if __name__ == "__main__":
    # Demo
    stitcher = FFmpegStitcher()
    
    # Create test images
    images = [
        Image.new("RGB", (512, 512), color=(i * 10, 100, 200))
        for i in range(30)
    ]
    
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        output = Path(tmp.name)
    
    try:
        evidence = stitcher.stitch_images(images, output)
        print(f"Stitched: {evidence}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        output.unlink(missing_ok=True)