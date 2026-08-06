"""
SME-AUD — Transcription Module
Constitutional Contract: contract.sme-aud.v1
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
    segments: list[dict[str, Any]]  # Each: {"text", "start", "end", "words": [{"word", "start", "end"}]}


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
class AudTranscribeRequest:
    """Request to transcribe audio"""
    audio: AudRaw
    metadata: Optional[AudMeta] = None
    language: str = "auto"
    translate: bool = False
    extract_embedding: bool = True


@dataclass
class AudTranscribeResponse:
    """Response from audio transcription"""
    transcript: AudTranscript
    embedding: Optional[AudEmbed] = None
    timecodes: Optional[AudTimecodes] = None
    evidence: AudEvidence = None


class AudioTranscriber:
    """
    Constitutional audio transcriber using whisper.cpp.
    """
    
    def __init__(
        self,
        models_dir: Path,
        default_model: WhisperModelName = WhisperModelName.TINY,
        default_quantization: str = "Q5_1",
        whisper_cpp_path: Optional[Path] = None,
    ):
        self.models_dir = Path(models_dir)
        self.default_model = default_model
        self.default_quantization = default_quantization
        self.factory = WhisperCppFactory(self.models_dir, whisper_cpp_path)
        self._wrapper: Optional[WhisperCppWrapper] = None
        self._current_model: Optional[WhisperModelName] = None
        self._current_quantization: Optional[str] = None
    
    def load_model(
        self,
        model_name: Optional[WhisperModelName] = None,
        quantization: Optional[str] = None,
    ) -> WhisperModelMetadata:
        """Load Whisper model"""
        model_name = model_name or self.default_model
        quantization = quantization or self.default_quantization
        
        if (self._wrapper is not None and 
            self._current_model == model_name and 
            self._current_quantization == quantization):
            return self._wrapper.metadata
        
        if self._wrapper:
            self._wrapper.unload()
        
        self._wrapper = self.factory.create(model_name, quantization)
        self._current_model = model_name
        self._current_quantization = quantization
        
        return self._wrapper.metadata
    
    def unload_model(self) -> None:
        if self._wrapper:
            self._wrapper.unload()
            self._wrapper = None
        self._current_model = None
        self._current_quantization = None
    
    def transcribe(
        self,
        request: AudTranscribeRequest,
        intent_id: Optional[str] = None,
    ) -> AudTranscribeResponse:
        """
        Transcribe audio with constitutional evidence.
        """
        if not self._wrapper:
            self.load_model()
        
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Configure wrapper
        self._wrapper.config.language = request.language
        self._wrapper.config.translate = request.translate
        
        # Compute audio hash
        import hashlib
        audio_hash = hashlib.sha256(request.audio.data).hexdigest()
        
        # Transcribe
        text, segments, transcribe_evidence = self._wrapper.transcribe_bytes(
            request.audio.data,
            request.audio.format,
        )
        
        # Extract embedding if requested
        embedding = None
        embed_evidence = {}
        if request.extract_embedding:
            embedding, embed_evidence = self._extract_embedding(request.audio.data)
        
        # Build timecodes
        timecodes = AudTimecodes(segments=segments)
        
        # Build evidence
        evidence = AudEvidence(
            evidence_id=f"ev-aud-{uuid.uuid4().hex[:12]}",
            audio_hash=audio_hash,
            model_metadata=self._wrapper.metadata.to_evidence_dict(),
            transcript_evidence=transcribe_evidence,
            embedding_evidence=embed_evidence,
            timestamp=timestamp,
        )
        
        response = AudTranscribeResponse(
            transcript=AudTranscript(
                text=text,
                segments=segments,
                language=transcribe_evidence.get("language", "unknown"),
                evidence=transcribe_evidence,
            ),
            embedding=embedding,
            timecodes=timecodes,
            evidence=evidence,
        )
        
        return response
    
    def _extract_embedding(self, audio_data: bytes) -> tuple[Optional[AudEmbed], dict[str, Any]]:
        """
        Extract audio embedding from Whisper encoder.
        This would require accessing the encoder output directly.
        For now, return a placeholder - in production use whisper.cpp library binding
        or ONNXRuntime to extract encoder embeddings.
        """
        # Placeholder: return a deterministic embedding based on audio hash
        # In production: run encoder forward pass
        import hashlib
        audio_hash = hashlib.sha256(audio_data).hexdigest()
        
        # Create deterministic pseudo-embedding from hash
        np.random.seed(int(audio_hash[:8], 16))
        embedding = np.random.randn(256).astype(np.float32)
        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
        
        embed_evidence = {
            "model": self._wrapper.metadata.to_evidence_dict(),
            "method": "encoder_projection_placeholder",
            "embedding_dim": 256,
            "note": "Placeholder - use whisper encoder output in production",
        }
        
        return AudEmbed(embedding=embedding, evidence=embed_evidence), embed_evidence
    
    @property
    def current_model(self) -> Optional[WhisperModelName]:
        return self._current_model
    
    @property
    def embedding_dim(self) -> int:
        return 256  # Fixed per Appendix H §1.3


def create_audio_transcriber(
    models_dir: Path,
    model: WhisperModelName = WhisperModelName.TINY,
    quant: str = "Q5_1",
) -> AudioTranscriber:
    """Factory function"""
    return AudioTranscriber(models_dir, model, quant)


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    transcriber = create_audio_transcriber(models_dir, WhisperModelName.TINY, "Q5_1")
    
    try:
        meta = transcriber.load_model()
        print(f"Loaded: {meta.name}")
        print(f"  Params: {meta.parameter_count/1e6:.0f}M")
        print(f"  Embedding dim: {meta.embedding_dim}")
        
    except FileNotFoundError as e:
        print(f"Model not found: {e}")
    except Exception as e:
        print(f"Error: {e}")