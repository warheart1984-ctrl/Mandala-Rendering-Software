"""
SME-AUD — Audio Embedding Extraction
Constitutional Contract: contract.sme-aud.v1
"""
from __future__ import annotations

import hashlib
import numpy as np
from pathlib import Path
from typing import Any, Optional

import onnxruntime as ort


class AudioEmbeddingExtractor:
    """
    Extracts audio embeddings from Whisper encoder using ONNXRuntime.
    This provides deterministic, reproducible embeddings for fusion.
    """
    
    def __init__(
        self,
        encoder_path: Path,
        config: Optional[ort.SessionOptions] = None,
    ):
        self.encoder_path = Path(encoder_path)
        self._session: Optional[ort.InferenceSession] = None
        self._input_name: Optional[str] = None
        self._output_name: Optional[str] = None
        self._loaded = False
        
        self.config = config or ort.SessionOptions()
        self.config.intra_op_num_threads = 4
        self.config.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    
    def load(self) -> None:
        if self._loaded:
            return
        
        self._session = ort.InferenceSession(
            str(self.encoder_path),
            sess_options=self.config,
            providers=["CPUExecutionProvider"],
        )
        
        self._input_name = self._session.get_inputs()[0].name
        self._output_names = [out.name for out in self._session.get_outputs()]
        
        self._loaded = True
    
    def extract(
        self,
        mel_spectrogram: np.ndarray,  # [B, 80, T] or [80, T]
    ) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Extract embeddings from mel spectrogram.
        
        Returns:
            embedding: [B, 256] or [256] normalized
            evidence: dict
        """
        if not self._loaded:
            self.load()
        
        # Ensure batch dimension
        if mel_spectrogram.ndim == 2:
            mel_spectrogram = mel_spectrogram[None, ...]
        
        import time
        start = time.perf_counter()
        
        outputs = self._session.run(
            self._output_names,
            {self._input_name: mel_spectrogram.astype(np.float32)}
        )
        
        latency_ms = (time.perf_counter() - start) * 1000
        
        # Get encoder output (last hidden state)
        encoder_out = outputs[0]  # [B, T, D]
        
        # Mean pooling over time dimension
        embedding = np.mean(encoder_out, axis=1)  # [B, D]
        
        # Project to 256 if needed
        if embedding.shape[-1] != 256:
            if embedding.shape[-1] > 256:
                embedding = embedding[..., :256]
            else:
                pad_width = [(0, 0)] * (embedding.ndim - 1) + [(0, 256 - embedding.shape[-1])]
                embedding = np.pad(embedding, pad_width, mode="constant")
        
        # L2 normalize
        norms = np.linalg.norm(embedding, axis=-1, keepdims=True)
        embedding = embedding / (norms + 1e-8)
        
        evidence = {
            "model_path": str(self.encoder_path),
            "input_shape": list(mel_spectrogram.shape),
            "output_shape": list(embedding.shape),
            "latency_ms": latency_ms,
            "pooling": "mean",
            "embedding_dim": embedding.shape[-1],
        }
        
        return embedding.astype(np.float32), evidence
    
    def extract_from_audio(
        self,
        audio_data: np.ndarray,  # [T] float32, 16kHz
        sample_rate: int = 16000,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Extract embedding from raw audio (computes mel spectrogram internally).
        """
        # Compute mel spectrogram
        mel = self._compute_mel_spectrogram(audio_data, sample_rate)
        return self.extract(mel)
    
    def _compute_mel_spectrogram(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
        n_mels: int = 80,
        n_fft: int = 400,
        hop_length: int = 160,
    ) -> np.ndarray:
        """Compute mel spectrogram matching Whisper preprocessing"""
        import librosa
        
        # Pad/trim to 30 seconds
        target_length = 30 * sample_rate
        if len(audio) > target_length:
            audio = audio[:target_length]
        else:
            audio = np.pad(audio, (0, target_length - len(audio)))
        
        # Compute STFT
        stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length, window="hann")
        magnitudes = np.abs(stft) ** 2
        
        # Mel filter bank
        mel_filters = librosa.filters.mel(sr=sample_rate, n_fft=n_fft, n_mels=n_mels)
        mel_spec = np.dot(mel_filters, magnitudes)
        
        # Log scale
        log_mel_spec = np.log10(np.maximum(mel_spec, 1e-10))
        
        # Normalize (Whisper uses specific normalization)
        log_mel_spec = (log_mel_spec + 4.0) / 4.0
        
        return log_mel_spec.astype(np.float32)  # [80, T]


class EmbeddingPooling:
    """Pooling strategies for audio embeddings"""
    
    @staticmethod
    def mean(embeddings: np.ndarray) -> np.ndarray:
        """Mean pooling over time"""
        return np.mean(embeddings, axis=1)
    
    @staticmethod
    def attention(embeddings: np.ndarray, weights: np.ndarray) -> np.ndarray:
        """Attention pooling (simplified)"""
        # weights: [B, T] or [T]
        if weights.ndim == 1:
            weights = weights[None, :]
        return np.sum(embeddings * weights[..., None], axis=1)
    
    @staticmethod
    def max(embeddings: np.ndarray) -> np.ndarray:
        """Max pooling over time"""
        return np.max(embeddings, axis=1)
    
    @staticmethod
    def cls_token(embeddings: np.ndarray) -> np.ndarray:
        """Use first token (CLS-style)"""
        return embeddings[:, 0, :]


if __name__ == "__main__":
    # Demo
    import tempfile
    
    # Create dummy encoder ONNX (would be converted from Whisper encoder)
    print("AudioEmbeddingExtractor requires Whisper encoder ONNX model")
    print("Convert using: python -m whisper.onnx.export_encoder")