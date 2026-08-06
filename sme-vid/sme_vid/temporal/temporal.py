"""
SME-VID — Temporal Aggregation
Constitutional Contract: contract.sme-vid.v1
Mathematical Constraints (Appendix H §1.4):
- Simple mean pooling only (no learned temporal model)
- VID_EMBED = (1/k) · Σ VIS_EMBED_i
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import numpy as np


@dataclass
class TemporalAggregationConfig:
    """Configuration for temporal aggregation"""
    method: str = "mean"  # "mean" only per Appendix H §1.4
    normalize: bool = True
    
    def __post_init__(self):
        # Enforce CPU-safe: only mean pooling allowed
        if self.method != "mean":
            raise ValueError("Only 'mean' pooling allowed per CPU constraints (Appendix H §1.4)")


class TemporalAggregator:
    """
    Aggregates per-frame embeddings into video-level embedding.
    
    Per Appendix H §1.4:
    VID_EMBED = (1/k) · Σ VIS_EMBED_i
    
    No learned temporal model (attention, TSM, RNN) — avoids CPU explosion.
    """
    
    def __init__(self, config: Optional[TemporalAggregationConfig] = None):
        self.config = config or TemporalAggregationConfig()
    
    def aggregate(
        self,
        frame_embeddings: np.ndarray,  # [k, 512] or [k, D]
        timestamps: Optional[list[float]] = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Aggregate frame embeddings to video embedding.
        
        Args:
            frame_embeddings: [k, D] frame embeddings from SME-VIS
            timestamps: Optional timestamps for each frame
            
        Returns:
            video_embedding: [D] aggregated embedding
            evidence: dict with aggregation metadata
        """
        k, d = frame_embeddings.shape
        
        if k == 0:
            raise ValueError("No frame embeddings provided")
        
        import time
        start = time.perf_counter()
        
        # Mean pooling: VID_EMBED = (1/k) · Σ VIS_EMBED_i
        video_embedding = np.mean(frame_embeddings, axis=0)  # [D]
        
        # L2 normalize if requested
        if self.config.normalize:
            norm = np.linalg.norm(video_embedding)
            if norm > 1e-8:
                video_embedding = video_embedding / norm
        
        latency_ms = (time.perf_counter() - start) * 1000
        
        evidence = {
            "method": "mean_pooling",
            "num_frames": k,
            "embedding_dim": d,
            "latency_ms": latency_ms,
            "normalized": self.config.normalize,
            "timestamp_range": [min(timestamps), max(timestamps)] if timestamps else None,
        }
        
        return video_embedding.astype(np.float32), evidence
    
    def aggregate_with_per_frame(
        self,
        frame_embeddings: np.ndarray,
        timestamps: Optional[list[float]] = None,
    ) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
        """
        Aggregate and return both video embedding and per-frame embeddings.
        
        Returns:
            video_embedding: [D] global video embedding
            per_frame_embeddings: [k, D] original frame embeddings
            evidence: dict
        """
        video_emb, evidence = self.aggregate(frame_embeddings, timestamps)
        evidence["per_frame_embeddings_shape"] = list(frame_embeddings.shape)
        
        return video_emb, frame_embeddings, evidence


class EventDetector:
    """
    Optional simple event detection from frame embeddings.
    Lightweight, no learned model - just similarity-based.
    """
    
    def __init__(self, similarity_threshold: float = 0.85):
        self.similarity_threshold = similarity_threshold
    
    def detect_events(
        self,
        frame_embeddings: np.ndarray,  # [k, D]
        timestamps: list[float],
    ) -> list[dict[str, Any]]:
        """
        Detect scene changes based on embedding similarity.
        
        Returns:
            List of {"type": "scene_change", "timestamp": float, "confidence": float}
        """
        if len(frame_embeddings) < 2:
            return []
        
        events = []
        
        for i in range(1, len(frame_embeddings)):
            # Cosine similarity between consecutive frames
            a = frame_embeddings[i-1]
            b = frame_embeddings[i]
            
            sim = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8)
            
            if sim < self.similarity_threshold:
                events.append({
                    "type": "scene_change",
                    "timestamp": timestamps[i],
                    "frame_index": i,
                    "similarity": float(sim),
                    "confidence": float(1.0 - sim),
                })
        
        return events


if __name__ == "__main__":
    # Demo
    import numpy as np
    
    # Simulate 30 frame embeddings (512-dim each)
    frame_embs = np.random.randn(30, 512).astype(np.float32)
    timestamps = [i * 1.0 for i in range(30)]  # 1 second intervals
    
    aggregator = TemporalAggregator()
    video_emb, evidence = aggregator.aggregate(frame_embs, timestamps)
    
    print(f"Video embedding shape: {video_emb.shape}")
    print(f"Evidence: {evidence}")
    
    # Test event detection
    detector = EventDetector()
    events = detector.detect_events(frame_embs, timestamps)
    print(f"Events detected: {len(events)}")