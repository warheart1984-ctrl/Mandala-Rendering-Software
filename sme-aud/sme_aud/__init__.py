"""
SME-AUD — Audio Module Package
"""
from .whisper.wrapper import (
    WhisperCppWrapper,
    WhisperCppFactory,
    WhisperModelMetadata,
    WhisperModelName,
    WhisperConfig,
    WHISPER_MODEL_SPECS,
)
from .whisper.transcribe import (
    AudioTranscriber,
    AudRaw,
    AudMeta,
    AudTranscript,
    AudEmbed,
    AudTimecodes,
    AudEvidence,
    AudTranscribeRequest,
    AudTranscribeResponse,
    create_audio_transcriber,
)
from .embed.extractor import AudioEmbeddingExtractor, EmbeddingPooling
from .ifc.aud_ifc import (
    SmeAudIFC,
    AudRaw as IFC_AudRaw,
    AudMeta as IFC_AudMeta,
    AudTranscript as IFC_AudTranscript,
    AudEmbed as IFC_AudEmbed,
    AudTimecodes as IFC_AudTimecodes,
    AudEvidence as IFC_AudEvidence,
    AudEncodeRequest,
    AudEncodeResponse,
    create_aud_ifc,
)

__all__ = [
    # Whisper
    "WhisperCppWrapper",
    "WhisperCppFactory",
    "WhisperModelMetadata",
    "WhisperModelName",
    "WhisperConfig",
    "WHISPER_MODEL_SPECS",
    # Transcription
    "AudioTranscriber",
    "AudRaw",
    "AudMeta",
    "AudTranscript",
    "AudEmbed",
    "AudTimecodes",
    "AudEvidence",
    "AudTranscribeRequest",
    "AudTranscribeResponse",
    "create_audio_transcriber",
    # Embedding
    "AudioEmbeddingExtractor",
    "EmbeddingPooling",
    # IFC
    "SmeAudIFC",
    "IFC_AudRaw",
    "IFC_AudMeta",
    "IFC_AudTranscript",
    "IFC_AudEmbed",
    "IFC_AudTimecodes",
    "IFC_AudEvidence",
    "AudEncodeRequest",
    "AudEncodeResponse",
    "create_aud_ifc",
]

__version__ = "1.0.0"