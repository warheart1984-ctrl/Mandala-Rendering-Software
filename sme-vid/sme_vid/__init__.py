"""
SME-VID — Video Module Package
"""
from .sampler.sampler import (
    FrameSampler,
    SamplerFactory,
    SamplingStrategy,
    SampledFrames,
    VideoMeta,
    UniformSampler,
    KeyframeSampler,
    SceneDetectSampler,
)
from .temporal.temporal import TemporalAggregator, EventDetector, TemporalAggregationConfig
from .ifc.vid_ifc import (
    SmeVidIFC,
    VidRaw,
    VidMeta,
    VidEmbed,
    VidFrameEmbeds,
    VidEvents,
    VidEvidence,
    VidEncodeRequest,
    VidEncodeResponse,
    create_vid_ifc,
)

__all__ = [
    # Sampling
    "FrameSampler",
    "SamplerFactory",
    "SamplingStrategy",
    "SampledFrames",
    "VideoMeta",
    "UniformSampler",
    "KeyframeSampler",
    "SceneDetectSampler",
    # Temporal
    "TemporalAggregator",
    "EventDetector",
    "TemporalAggregationConfig",
    # IFC
    "SmeVidIFC",
    "VidRaw",
    "VidMeta",
    "VidEmbed",
    "VidFrameEmbeds",
    "VidEvents",
    "VidEvidence",
    "VidEncodeRequest",
    "VidEncodeResponse",
    "create_vid_ifc",
]

__version__ = "1.0.0"