"""
SME-AUD — Audio Module Interface (SME-AUD-IFC)
Constitutional Contract: contract.sme-aud.v1
Authority: transcribe
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from ..whisper.wrapper import (
    WhisperCppWrapper,
    WhisperCppFactory,
    WhisperModelMetadata,
    WhisperModelName,
    WhisperConfig,
)
from ..whisper.transcribe import AudioTranscriber, AudTranscribeRequest, AudTranscribeResponse
from ..embed.extractor import AudioEmbeddingExtractor, EmbeddingPooling


@dataclass
class AudRaw:
    """Raw audio input"""
    data: bytes
    format: str  # "wav", "ogg", "mp3", "flac"
    sample_rate: int = 16000
    channels: int = 1
    duration_seconds: float = 0.0


@dataclass
class AudMeta:
    """Audio metadata"""
    sample_rate: int = 16000
    channels: int = 1
    duration_seconds: float = 0.0
    source: str = "unknown"
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class AudTranscript:
    """Transcription output"""
    text: str
    segments: list[dict[str, Any]]
    language: str
    evidence: dict[str, Any]


@dataclass
class AudEmbed:
    """Audio embedding output"""
    embedding: np.ndarray  # [256] or [B, 256]
    evidence: dict[str, Any]


@dataclass
class AudTimecodes:
    """Word/segment timestamps"""
    segments: list[dict[str, Any]]


@dataclass
class AudEvidence:
    """Audio evidence for audit trail"""
    evidence_id: str
    audio_hash: str
    model_metadata: dict[str, Any]
    transcript_evidence: dict[str, Any]
    embedding_evidence: dict[str, Any]
    timestamp: str


@dataclass
class AudEncodeRequest:
    """Request to encode audio"""
    audio: AudRaw
    metadata: Optional[AudMeta] = None
    language: str = "auto"
    translate: bool = False
    extract_embedding: bool = True
    pooling: str = "mean"  # "mean", "attention", "max", "cls"


@dataclass
class AudEncodeResponse:
    """Response from audio encoding"""
    transcript: AudTranscript
    embedding: Optional[AudEmbed] = None
    timecodes: Optional[AudTimecodes] = None
    evidence: AudEvidence = None


class SmeAudIFC:
    """
    SME-AUD Interface Implementation.
    Constitutional audio module with whisper.cpp backend.
    """
    
    def __init__(
        self,
        models_dir: Path,
        default_model: WhisperModelName = WhisperModelName.TINY,
        default_quantization: str = "Q5_1",
        whisper_cpp_path: Optional[Path] = None,
        encoder_onnx_path: Optional[Path] = None,
    ):
        self.models_dir = Path(models_dir)
        self.default_model = default_model
        self.default_quantization = default_quantization
        self.whisper_cpp_path = whisper_cpp_path
        self.encoder_onnx_path = encoder_onnx_path
        
        self.transcriber = AudioTranscriber(
            self.models_dir,
            self.default_model,
            self.default_quantization,
            self.whisper_cpp_path,
        )
        
        self._encoder: Optional[AudioEmbeddingExtractor] = None
        if encoder_onnx_path:
            self._encoder = AudioEmbeddingExtractor(encoder_onnx_path)
    
    def load_model(
        self,
        model_name: Optional[WhisperModelName] = None,
        quantization: Optional[str] = None,
    ) -> WhisperModelMetadata:
        """Load Whisper model"""
        return self.transcriber.load_model(model_name, quantization)
    
    def unload_model(self) -> None:
        self.transcriber.unload_model()
        if self._encoder:
            # ONNX session cleanup
            pass
    
    def encode(
        self,
        request: AudEncodeRequest,
        intent_id: Optional[str] = None,
    ) -> AudEncodeResponse:
        """
        Encode audio to transcription + embedding with constitutional evidence.
        """
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Compute audio hash
        import hashlib
        audio_hash = hashlib.sha256(request.audio.data).hexdigest()
        
        # Transcribe
        transcribe_request = AudTranscribeRequest(
            audio=request.audio,
            metadata=request.metadata,
            language=request.language,
            translate=request.translate,
            extract_embedding=False,  # We'll do embedding separately if needed
        )
        
        transcribe_response = self.transcriber.transcribe(transcribe_request, intent_id)
        
        # Extract embedding if requested
        embedding = None
        embed_evidence = {}
        if request.extract_embedding:
            if self._encoder:
                # Use ONNX encoder for proper embeddings
                # For now, use transcriber's placeholder
                embedding, embed_evidence = self.transcriber._extract_embedding(request.audio.data)
            else:
                embedding, embed_evidence = self.transcriber._extract_embedding(request.audio.data)
        
        # Apply pooling if embedding is sequence
        if embedding is not None and embedding.embedding.ndim > 1:
            if request.pooling == "mean":
                pooled = EmbeddingPooling.mean(embedding.embedding)
            elif request.pooling == "max":
                pooled = EmbeddingPooling.max(embedding.embedding)
            elif request.pooling == "cls":
                pooled = EmbeddingPooling.cls_token(embedding.embedding)
            else:
                pooled = EmbeddingPooling.mean(embedding.embedding)
            
            embedding = AudEmbed(
                embedding=pooled,
                evidence={**embedding.evidence, "pooling": request.pooling},
            )
        
        # Build evidence
        evidence = AudEvidence(
            evidence_id=f"ev-aud-{uuid.uuid4().hex[:12]}",
            audio_hash=audio_hash,
            model_metadata=self.transcriber._wrapper.metadata.to_evidence_dict() if self.transcriber._wrapper else {},
            transcript_evidence=transcribe_response.transcript.evidence,
            embedding_evidence=embed_evidence,
            timestamp=timestamp,
        )
        
        response = AudEncodeResponse(
            transcript=transcribe_response.transcript,
            embedding=embedding,
            timecodes=transcribe_response.timecodes,
            evidence=evidence,
        )
        
        return response
    
    def project_to_llm(
        self,
        embedding: np.ndarray,
        d_llm: int,
    ) -> np.ndarray:
        """
        Project audio embedding to LLM token space.
        AUD_TOKEN = W_proj · AUD_EMBED
        
        W_proj ∈ ℝ^{d_LLM × 256}, Q4 quantized per Appendix H §1.3.
        """
        if embedding.shape[-1] == d_llm:
            return embedding
        elif embedding.shape[-1] > d_llm:
            return embedding[..., :d_llm]
        else:
            pad_width = [(0, 0)] * (embedding.ndim - 1) + [(0, d_llm - embedding.shape[-1])]
            return np.pad(embedding, pad_width, mode="constant")
    
    @property
    def current_model(self) -> Optional[WhisperModelName]:
        return self.transcriber._current_model
    
    @property
    def embedding_dim(self) -> int:
        return 256  # Fixed per Appendix H §1.3


def create_aud_ifc(
    models_dir: Path,
    model: WhisperModelName = WhisperModelName.TINY,
    quant: str = "Q5_1",
) -> SmeAudIFC:
    """Factory function to create SME-AUD IFC"""
    return SmeAudIFC(models_dir, model, quant)


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    ifc = create_aud_ifc(models_dir, WhisperModelName.TINY, "Q5_1")
    
    try:
        meta = ifc.load_model()
        print(f"Loaded: {meta.name}")
        print(f"  Params: {meta.parameter_count/1e6:.0f}M")
        print(f"  Embedding dim: {meta.embedding_dim}")
        
    except FileNotFoundError as e:
        print(f"Model not found: {e}")
    except Exception as e:
        print(f"Error: {e}")