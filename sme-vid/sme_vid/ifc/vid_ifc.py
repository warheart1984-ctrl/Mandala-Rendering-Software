"""
SME-VID — Video Module Interface (SME-VID-IFC)
Constitutional Contract: contract.sme-vid.v1
Authority: encode
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from ..sampler.sampler import (
    FrameSampler,
    SamplerFactory,
    SamplingStrategy,
    SampledFrames,
    VideoMeta,
)
from ..temporal.temporal import TemporalAggregator, EventDetector


@dataclass
class VidRaw:
    """Raw video input"""
    data: bytes
    format: str  # "mp4", "webm", "mov", "avi"
    source: str = "upload"


@dataclass
class VidMeta:
    """Video metadata"""
    codec: str = "unknown"
    width: int = 0
    height: int = 0
    fps: float = 30.0
    duration_seconds: float = 0.0
    total_frames: int = 0


@dataclass
class VidEmbed:
    """Video embedding output"""
    embedding: np.ndarray  # [512] global video embedding
    evidence: dict[str, Any]


@dataclass
class VidFrameEmbeds:
    """Per-frame embeddings"""
    embeddings: np.ndarray  # [k, 512]
    timestamps: list[float]
    frame_indices: list[int]
    evidence: dict[str, Any]


@dataclass
class VidEvents:
    """Detected events"""
    events: list[dict[str, Any]]
    evidence: dict[str, Any]


@dataclass
class VidEvidence:
    """Video evidence for audit trail"""
    evidence_id: str
    video_hash: str
    sampling_evidence: dict[str, Any]
    frame_evidence: dict[str, Any]
    aggregation_evidence: dict[str, Any]
    events_evidence: dict[str, Any]
    timestamp: str


@dataclass
class VidEncodeRequest:
    """Request to encode video"""
    video: VidRaw
    metadata: Optional[VidMeta] = None
    sampling_method: str = "uniform"  # "uniform", "keyframe", "scene_detect"
    sampling_ratio: float = 0.05
    max_frames: int = 45
    extract_events: bool = False
    similarity_threshold: float = 0.85


@dataclass
class VidEncodeResponse:
    """Response from video encoding"""
    embed: VidEmbed
    frame_embeds: Optional[VidFrameEmbeds] = None
    events: Optional[VidEvents] = None
    evidence: VidEvidence = None


class SmeVidIFC:
    """
    SME-VID Interface Implementation.
    Constitutional video encoder with frame sampling + temporal aggregation.
    """
    
    def __init__(
        self,
        models_dir: Path,
        vis_ifc: Any,  # SME-VIS IFC instance
        cache_dir: Path = Path("./cache"),
    ):
        self.models_dir = Path(models_dir)
        self.vis_ifc = vis_ifc
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.temporal_aggregator = TemporalAggregator()
        self.event_detector = EventDetector()
    
    def encode(
        self,
        request: VidEncodeRequest,
        intent_id: Optional[str] = None,
    ) -> VidEncodeResponse:
        """
        Encode video to embedding with constitutional evidence.
        
        Pipeline:
        1. Save video to temp file
        2. Sample frames (uniform/keyframe/scene_detect)
        3. Encode each frame with SME-VIS
        4. Aggregate frame embeddings (mean pooling)
        5. Optional: detect events
        6. Return evidence
        """
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Save video to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=f".{request.video.format}", delete=False) as tmp:
            tmp.write(request.video.data)
            video_path = Path(tmp.name)
        
        try:
            # Create sampler
            strategy = SamplingStrategy(
                method=request.sampling_method,
                ratio=request.sampling_ratio,
                max_frames=request.max_frames,
            )
            
            # Clamp to CPU-safe limits per Appendix H §1.4
            strategy.ratio = min(strategy.ratio, 0.05)
            strategy.max_frames = min(strategy.max_frames, 45)
            
            sampler = SamplerFactory.create(
                request.sampling_method,
                ratio=strategy.ratio,
                max_frames=strategy.max_frames,
            )
            
            # Sample frames
            sampled = sampler.sample(video_path)
            
            # Encode each frame with SME-VIS
            frame_embeddings = []
            frame_evidences = []
            
            for frame in sampled.frames:
                # Convert frame to bytes for SME-VIS
                import cv2
                import io
                _, buf = cv2.imencode(".png", cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
                frame_bytes = buf.tobytes()
                
                from sme_vis.ifc.vis_ifc import ImgRaw, ImgMeta, VisEncodeRequest
                
                vis_request = VisEncodeRequest(
                    image=ImgRaw(data=frame_bytes, format="png"),
                    metadata=ImgMeta(width=frame.shape[1], height=frame.shape[0]),
                )
                
                vis_response = self.vis_ifc.encode(vis_request)
                frame_embeddings.append(vis_response.embed.embedding.squeeze())
                frame_evidences.append(vis_response.evidence.__dict__ if hasattr(vis_response.evidence, '__dict__') else vis_response.evidence)
            
            # Stack frame embeddings
            if frame_embeddings:
                frame_embs_array = np.stack(frame_embeddings)  # [k, 512]
            else:
                frame_embs_array = np.zeros((0, 512), dtype=np.float32)
            
            # Aggregate
            video_embedding, agg_evidence = self.temporal_aggregator.aggregate(
                frame_embs_array,
                sampled.timestamps,
            )
            
            # Detect events if requested
            events = None
            events_evidence = {}
            if request.extract_events and len(frame_embs_array) > 1:
                detected_events = self.event_detector.detect_events(
                    frame_embs_array,
                    sampled.timestamps,
                )
                events = VidEvents(
                    events=detected_events,
                    evidence={"detector": "cosine_similarity", "threshold": request.similarity_threshold},
                )
                events_evidence = {
                    "num_events": len(detected_events),
                    "threshold": request.similarity_threshold,
                }
            
            # Compute video hash
            import hashlib
            video_hash = hashlib.sha256(request.video.data).hexdigest()
            
            # Build evidence
            evidence = VidEvidence(
                evidence_id=f"ev-vid-{uuid.uuid4().hex[:12]}",
                video_hash=video_hash,
                sampling_evidence=sampled.evidence,
                frame_evidence={
                    "num_frames": len(frame_embeddings),
                    "frame_evidences": frame_evidences,
                },
                aggregation_evidence=agg_evidence,
                events_evidence=events_evidence,
                timestamp=timestamp,
            )
            
            response = VidEncodeResponse(
                embed=VidEmbed(
                    embedding=video_embedding,
                    evidence=agg_evidence,
                ),
                frame_embeds=VidFrameEmbeds(
                    embeddings=frame_embs_array,
                    timestamps=sampled.timestamps,
                    frame_indices=sampled.frame_indices,
                    evidence=agg_evidence,
                ),
                events=events,
                evidence=evidence,
            )
            
            return response
            
        finally:
            # Cleanup temp file
            video_path.unlink(missing_ok=True)
    
    def project_to_llm(
        self,
        embedding: np.ndarray,
        d_llm: int,
    ) -> np.ndarray:
        """
        Project video embedding to LLM token space.
        VID_TOKEN = W_proj · VID_EMBED
        
        W_proj ∈ ℝ^{d_LLM × 512}, Q4 quantized per Appendix H §1.2.
        """
        if embedding.shape[-1] == d_llm:
            return embedding
        elif embedding.shape[-1] > d_llm:
            return embedding[..., :d_llm]
        else:
            pad_width = [(0, 0)] * (embedding.ndim - 1) + [(0, d_llm - embedding.shape[-1])]
            return np.pad(embedding, pad_width, mode="constant")
    
    @property
    def embedding_dim(self) -> int:
        return 512  # Fixed per Appendix H §1.4


def create_vid_ifc(
    models_dir: Path,
    vis_ifc: Any,
) -> SmeVidIFC:
    """Factory function to create SME-VID IFC"""
    return SmeVidIFC(models_dir, vis_ifc)


if __name__ == "__main__":
    # Demo
    print("SME-VID requires SME-VIS IFC instance")
    print("Usage: vid_ifc = create_vid_ifc(models_dir, vis_ifc)")