"""
SME-VID — Frame Sampling Strategies
Constitutional Contract: contract.sme-vid.v1
Authority: encode
Status: declared
Mathematical Constraints (Appendix H §1.4):
- Sampling ratio: r = 0.03–0.05 (CPU-safe)
- Max frames: 45 (for 30s @ 30 FPS)
- Temporal aggregation: Simple mean pooling only
"""
from __future__ import annotations

import hashlib
import subprocess
import tempfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np


@dataclass
class VideoMeta:
    """Video metadata"""
    codec: str = "unknown"
    width: int = 0
    height: int = 0
    fps: float = 30.0
    duration_seconds: float = 0.0
    total_frames: int = 0


@dataclass
class SamplingStrategy:
    """Frame sampling configuration"""
    method: str  # "uniform", "keyframe", "scene_detect"
    ratio: float = 0.05  # CPU-safe: 0.03–0.05
    max_frames: int = 45
    min_frames: int = 1
    fps_target: Optional[float] = None  # For uniform sampling
    
    def __post_init__(self):
        # Enforce CPU-safe limits per Appendix H §1.4
        if self.ratio > 0.05:
            self.ratio = 0.05
        if self.max_frames > 45:
            self.max_frames = 45


@dataclass
class SampledFrames:
    """Result of frame sampling"""
    frames: list[np.ndarray]  # List of [H, W, 3] RGB frames
    timestamps: list[float]   # Timestamp in seconds for each frame
    frame_indices: list[int]  # Original frame indices
    strategy: SamplingStrategy
    video_meta: VideoMeta
    evidence: dict[str, Any]


class FrameSampler(ABC):
    """Abstract base class for frame samplers"""
    
    def __init__(self, strategy: SamplingStrategy):
        self.strategy = strategy
    
    @abstractmethod
    def sample(self, video_path: Path) -> SampledFrames:
        """Sample frames from video"""
        pass
    
    def _get_video_meta(self, video_path: Path) -> VideoMeta:
        """Extract video metadata using ffprobe"""
        cmd = [
            "ffprobe", "-v", "quiet",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height,r_frame_rate,duration,nb_frames",
            "-of", "json",
            str(video_path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe failed: {result.stderr}")
        
        import json
        data = json.loads(result.stdout)
        stream = data.get("streams", [{}])[0]
        
        # Parse frame rate
        fps_str = stream.get("r_frame_rate", "30/1")
        num, den = map(int, fps_str.split("/"))
        fps = num / den if den > 0 else 30.0
        
        duration = float(stream.get("duration", 0))
        total_frames = int(stream.get("nb_frames", 0))
        if total_frames == 0 and duration > 0:
            total_frames = int(duration * fps)
        
        return VideoMeta(
            codec=stream.get("codec_name", "unknown"),
            width=int(stream.get("width", 0)),
            height=int(stream.get("height", 0)),
            fps=fps,
            duration_seconds=duration,
            total_frames=total_frames,
        )
    
    def _compute_hash(self, video_path: Path) -> str:
        """Compute SHA256 hash of video file"""
        sha256 = hashlib.sha256()
        with open(video_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()


class UniformSampler(FrameSampler):
    """
    Uniform frame sampling at configurable FPS.
    CPU-safe: target FPS = 0.9–1.5 (ratio 0.03–0.05 at 30 FPS)
    """
    
    def sample(self, video_path: Path) -> SampledFrames:
        video_meta = self._get_video_meta(video_path)
        
        # Determine target FPS
        if self.strategy.fps_target:
            target_fps = min(self.strategy.fps_target, video_meta.fps)
        else:
            # Default: ratio-based
            target_fps = video_meta.fps * self.strategy.ratio
            target_fps = max(0.9, min(1.5, target_fps))  # Clamp to CPU-safe range
        
        # Calculate frame interval
        frame_interval = max(1, int(video_meta.fps / target_fps))
        
        # Determine frames to sample
        total_frames = video_meta.total_frames or int(video_meta.duration_seconds * video_meta.fps)
        max_frames = min(self.strategy.max_frames, total_frames // frame_interval + 1)
        
        frame_indices = list(range(0, total_frames, frame_interval))[:max_frames]
        
        if not frame_indices:
            frame_indices = [0]
        
        # Extract frames using ffmpeg
        frames, timestamps = self._extract_frames(video_path, frame_indices, video_meta.fps)
        
        evidence = {
            "method": "uniform",
            "ratio": self.strategy.ratio,
            "target_fps": target_fps,
            "frame_interval": frame_interval,
            "frames_requested": len(frame_indices),
            "frames_extracted": len(frames),
            "video_hash": self._compute_hash(video_path),
            "video_meta": {
                "codec": video_meta.codec,
                "width": video_meta.width,
                "height": video_meta.height,
                "fps": video_meta.fps,
                "duration": video_meta.duration_seconds,
                "total_frames": video_meta.total_frames,
            },
        }
        
        return SampledFrames(
            frames=frames,
            timestamps=timestamps,
            frame_indices=frame_indices,
            strategy=self.strategy,
            video_meta=video_meta,
            evidence=evidence,
        )
    
    def _extract_frames(
        self,
        video_path: Path,
        frame_indices: list[int],
        fps: float,
    ) -> tuple[list[np.ndarray], list[float]]:
        """Extract specific frames using ffmpeg"""
        # Build filter to extract specific frames
        select_expr = "+".join(f"eq(n\\,{idx})" for idx in frame_indices)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_pattern = Path(tmpdir) / "frame_%04d.png"
            
            cmd = [
                "ffmpeg", "-y", "-v", "quiet",
                "-i", str(video_path),
                "-vf", f"select='{select_expr}',scale=224:224:flags=lanczos",
                "-vsync", "vfr",
                "-frame_pts", "1",
                str(output_pattern),
            ]
            
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg frame extraction failed: {result.stderr}")
            
            # Load extracted frames
            frames = []
            timestamps = []
            
            for idx in sorted(frame_indices):
                frame_path = Path(tmpdir) / f"frame_{idx:04d}.png"
                if frame_path.exists():
                    import cv2
                    frame = cv2.imread(str(frame_path))
                    if frame is not None:
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        frames.append(frame)
                        timestamps.append(idx / fps)
            
            return frames, timestamps


class KeyframeSampler(FrameSampler):
    """
    Keyframe (I-frame) sampling using ffprobe.
    Extracts only I-frames for maximum compression.
    """
    
    def sample(self, video_path: Path) -> SampledFrames:
        video_meta = self._get_video_meta(video_path)
        
        # Get keyframe indices using ffprobe
        cmd = [
            "ffprobe", "-v", "quiet",
            "-select_streams", "v:0",
            "-show_frames", "-show_entries", "frame=pict_type,pts_time,best_effort_timestamp_time",
            "-of", "json",
            str(video_path),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffprobe keyframe detection failed: {result.stderr}")
        
        import json
        data = json.loads(result.stdout)
        
        keyframe_indices = []
        timestamps = []
        
        for i, frame in enumerate(data.get("frames", [])):
            if frame.get("pict_type") == "I":
                keyframe_indices.append(i)
                pts = frame.get("best_effort_timestamp_time") or frame.get("pts_time", 0)
                timestamps.append(float(pts))
        
        # Limit to max_frames
        if len(keyframe_indices) > self.strategy.max_frames:
            # Uniformly subsample keyframes
            step = len(keyframe_indices) / self.strategy.max_frames
            selected_indices = [int(i * step) for i in range(self.strategy.max_frames)]
            keyframe_indices = [keyframe_indices[i] for i in selected_indices]
            timestamps = [timestamps[i] for i in selected_indices]
        
        # Extract keyframes
        frames, _ = self._extract_frames(video_path, keyframe_indices, video_meta.fps)
        
        evidence = {
            "method": "keyframe",
            "total_keyframes": len(data.get("frames", [])),
            "keyframes_extracted": len(frames),
            "max_frames_limit": self.strategy.max_frames,
            "video_hash": self._compute_hash(video_path),
            "video_meta": {
                "codec": video_meta.codec,
                "width": video_meta.width,
                "height": video_meta.height,
                "fps": video_meta.fps,
                "duration": video_meta.duration_seconds,
                "total_frames": video_meta.total_frames,
            },
        }
        
        return SampledFrames(
            frames=frames,
            timestamps=timestamps,
            frame_indices=keyframe_indices,
            strategy=self.strategy,
            video_meta=video_meta,
            evidence=evidence,
        )
    
    def _extract_frames(
        self,
        video_path: Path,
        frame_indices: list[int],
        fps: float,
    ) -> tuple[list[np.ndarray], list[float]]:
        """Extract specific frames"""
        select_expr = "+".join(f"eq(n\\,{idx})" for idx in frame_indices)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_pattern = Path(tmpdir) / "frame_%04d.png"
            
            cmd = [
                "ffmpeg", "-y", "-v", "quiet",
                "-i", str(video_path),
                "-vf", f"select='{select_expr}',scale=224:224:flags=lanczos",
                "-vsync", "vfr",
                str(output_pattern),
            ]
            
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg keyframe extraction failed: {result.stderr}")
            
            frames = []
            for idx in sorted(frame_indices):
                frame_path = Path(tmpdir) / f"frame_{idx:04d}.png"
                if frame_path.exists():
                    import cv2
                    frame = cv2.imread(str(frame_path))
                    if frame is not None:
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        frames.append(frame)
            
            return frames, [idx / fps for idx in frame_indices]


class SceneDetectSampler(FrameSampler):
    """
    Scene detection sampling using PySceneDetect.
    Samples representative frames from each detected scene.
    """
    
    def sample(self, video_path: Path) -> SampledFrames:
        video_meta = self._get_video_meta(video_path)
        
        try:
            from scenedetect import detect, ContentDetector, open_video
            from scenedetect.scene_manager import SceneManager
        except ImportError:
            raise RuntimeError("scenedetect not installed. Install with: pip install scenedetect")
        
        # Detect scenes
        video = open_video(str(video_path))
        scene_manager = SceneManager()
        scene_manager.add_detector(ContentDetector(threshold=27.0))
        scene_manager.detect_scenes(video)
        scenes = scene_manager.get_scene_list()
        
        # Get middle frame of each scene
        frame_indices = []
        timestamps = []
        
        for start, end in scenes:
            start_frame = start.get_frames()
            end_frame = end.get_frames()
            mid_frame = (start_frame + end_frame) // 2
            frame_indices.append(mid_frame)
            timestamps.append(mid_frame / video_meta.fps)
        
        # Limit to max_frames
        if len(frame_indices) > self.strategy.max_frames:
            step = len(frame_indices) / self.strategy.max_frames
            selected = [int(i * step) for i in range(self.strategy.max_frames)]
            frame_indices = [frame_indices[i] for i in selected]
            timestamps = [timestamps[i] for i in selected]
        
        # Extract frames
        frames, _ = self._extract_frames(video_path, frame_indices, video_meta.fps)
        
        evidence = {
            "method": "scene_detect",
            "scenes_detected": len(scenes),
            "frames_extracted": len(frames),
            "max_frames_limit": self.strategy.max_frames,
            "threshold": 27.0,
            "video_hash": self._compute_hash(video_path),
            "video_meta": {
                "codec": video_meta.codec,
                "width": video_meta.width,
                "height": video_meta.height,
                "fps": video_meta.fps,
                "duration": video_meta.duration_seconds,
                "total_frames": video_meta.total_frames,
            },
        }
        
        return SampledFrames(
            frames=frames,
            timestamps=timestamps,
            frame_indices=frame_indices,
            strategy=self.strategy,
            video_meta=video_meta,
            evidence=evidence,
        )
    
    def _extract_frames(
        self,
        video_path: Path,
        frame_indices: list[int],
        fps: float,
    ) -> tuple[list[np.ndarray], list[float]]:
        select_expr = "+".join(f"eq(n\\,{idx})" for idx in frame_indices)
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_pattern = Path(tmpdir) / "frame_%04d.png"
            
            cmd = [
                "ffmpeg", "-y", "-v", "quiet",
                "-i", str(video_path),
                "-vf", f"select='{select_expr}',scale=224:224:flags=lanczos",
                "-vsync", "vfr",
                str(output_pattern),
            ]
            
            result = subprocess.run(cmd, capture_output=True)
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg scene frame extraction failed: {result.stderr}")
            
            frames = []
            for idx in sorted(frame_indices):
                frame_path = Path(tmpdir) / f"frame_{idx:04d}.png"
                if frame_path.exists():
                    import cv2
                    frame = cv2.imread(str(frame_path))
                    if frame is not None:
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        frames.append(frame)
            
            return frames, [idx / fps for idx in frame_indices]


class SamplerFactory:
    """Factory for creating frame samplers"""
    
    @staticmethod
    def create(
        method: str,
        ratio: float = 0.05,
        max_frames: int = 45,
        fps_target: Optional[float] = None,
    ) -> FrameSampler:
        """Create sampler by method name"""
        strategy = SamplingStrategy(
            method=method,
            ratio=ratio,
            max_frames=max_frames,
            fps_target=fps_target,
        )
        
        samplers = {
            "uniform": UniformSampler,
            "keyframe": KeyframeSampler,
            "scene_detect": SceneDetectSampler,
        }
        
        if method not in samplers:
            raise ValueError(f"Unknown sampling method: {method}. Available: {list(samplers.keys())}")
        
        return samplers[method](strategy)


if __name__ == "__main__":
    # Demo
    import sys
    
    if len(sys.argv) > 1:
        video_path = Path(sys.argv[1])
        
        for method in ["uniform", "keyframe", "scene_detect"]:
            try:
                sampler = SamplerFactory.create(method, ratio=0.05, max_frames=45)
                result = sampler.sample(video_path)
                print(f"{method}: {len(result.frames)} frames, {result.evidence}")
            except Exception as e:
                print(f"{method}: ERROR - {e}")
    else:
        print("Usage: python sampler.py <video_path>")