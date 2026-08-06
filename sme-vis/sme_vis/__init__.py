"""
SME-VIS — Vision Module Package
"""
from .encoder.onnx_encoder import (
    VisionEncoder,
    VisionEncoderFactory,
    VisionModelMetadata,
    VisionModelName,
    OrtVisionConfig,
    VISION_MODEL_SPECS,
)
from .preprocess.pipeline import ImagePreprocessor, PreprocessConfig, PreprocessorFactory
from .ifc.vis_ifc import (
    SmeVisIFC,
    ImgRaw,
    ImgMeta,
    VisEmbed,
    VisFeatures,
    VisEvidence,
    VisEncodeRequest,
    VisEncodeResponse,
    create_vis_ifc,
)

__all__ = [
    # Encoder
    "VisionEncoder",
    "VisionEncoderFactory",
    "VisionModelMetadata",
    "VisionModelName",
    "OrtVisionConfig",
    "VISION_MODEL_SPECS",
    # Preprocess
    "ImagePreprocessor",
    "PreprocessConfig",
    "PreprocessorFactory",
    # IFC
    "SmeVisIFC",
    "ImgRaw",
    "ImgMeta",
    "VisEmbed",
    "VisFeatures",
    "VisEvidence",
    "VisEncodeRequest",
    "VisEncodeResponse",
    "create_vis_ifc",
]

__version__ = "1.0.0"