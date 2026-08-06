"""
SME-GEN — Generative Media Module Package
"""
from .diffusion.onnx_pipeline import (
    DiffusionPipeline,
    DiffusionFactory,
    DiffusionModelName,
    DiffusionModelMetadata,
    OrtDiffusionConfig,
    DIFFUSION_MODEL_SPECS,
)
from .tts.piper import (
    PiperTTSWrapper,
    PiperFactory,
    PiperVoice,
    PiperVoiceMetadata,
    PiperConfig,
    PIPER_VOICES,
)
from .ffmpeg.stitch import FFmpegStitcher, VideoEncodingConfig, StitchConfig
from .gpu_connector.authority import (
    GPUConnector,
    NIMConnector,
    LocalGPUConnector,
    AuthorityGrant,
    GPUOffloadRequest,
    GPUOffloadResponse,
    create_authority_grant,
)
from .ifc.gen_ifc import (
    SmeGenIFC,
    GenRequest,
    GenArtifact,
    GenTrace,
    GenEvidence,
    GenResponse,
    create_gen_ifc,
)

__all__ = [
    # Diffusion
    "DiffusionPipeline",
    "DiffusionFactory",
    "DiffusionModelName",
    "DiffusionModelMetadata",
    "OrtDiffusionConfig",
    "DIFFUSION_MODEL_SPECS",
    # TTS
    "PiperTTSWrapper",
    "PiperFactory",
    "PiperVoice",
    "PiperVoiceMetadata",
    "PiperConfig",
    "PIPER_VOICES",
    # FFmpeg
    "FFmpegStitcher",
    "VideoEncodingConfig",
    "StitchConfig",
    # GPU Connector
    "GPUConnector",
    "NIMConnector",
    "LocalGPUConnector",
    "AuthorityGrant",
    "GPUOffloadRequest",
    "GPUOffloadResponse",
    "create_authority_grant",
    # IFC
    "SmeGenIFC",
    "GenRequest",
    "GenArtifact",
    "GenTrace",
    "GenEvidence",
    "GenResponse",
    "create_gen_ifc",
]

__version__ = "1.0.0"