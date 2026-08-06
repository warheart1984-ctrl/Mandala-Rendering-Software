"""
SME-AUD — Unit Tests
Constitutional Contract: contract.sme-aud.v1
"""
import pytest
import numpy as np
from pathlib import Path

from sme_aud.whisper.wrapper import (
    WhisperModelName,
    WhisperModelMetadata,
    WhisperConfig,
    WHISPER_MODEL_SPECS,
)
from sme_aud.whisper.transcribe import (
    AudRaw,
    AudMeta,
    AudTranscribeRequest,
    AudioTranscriber,
)
from sme_aud.embed.extractor import AudioEmbeddingExtractor, EmbeddingPooling
from sme_aud.ifc.aud_ifc import (
    SmeAudIFC,
    AudEncodeRequest,
    AudEncodeResponse,
    create_aud_ifc,
)


class TestWhisperModelSpecs:
    """Test Whisper model specifications"""
    
    def test_tiny_model_specs(self):
        spec = WHISPER_MODEL_SPECS[WhisperModelName.TINY]
        assert spec["parameter_count"] == 39_000_000
        assert "Q5_1" in spec["quantizations"]
        assert "Q4_1" in spec["quantizations"]
        assert spec["embedding_dim"] == 384
    
    def test_base_model_over_budget(self):
        """Whisper-base is 74M - over the 30M budget"""
        spec = WHISPER_MODEL_SPECS[WhisperModelName.BASE]
        assert spec["parameter_count"] == 74_000_000
        # This should be flagged as over budget in production


class TestWhisperConfig:
    """Test Whisper configuration"""
    
    def test_default_config(self):
        config = WhisperConfig()
        assert config.language == "auto"
        assert config.n_threads > 0
        assert config.beam_size == 5
        assert config.temperature == 0.0
    
    def test_custom_config(self):
        config = WhisperConfig(
            language="en",
            n_threads=4,
            beam_size=3,
            temperature=0.5,
        )
        assert config.language == "en"
        assert config.n_threads == 4
        assert config.beam_size == 3
        assert config.temperature == 0.5


class TestAudioDataClasses:
    """Test audio data classes"""
    
    def test_aud_raw_creation(self):
        raw = AudRaw(
            data=b"fake_audio_data",
            format="wav",
            sample_rate=16000,
            channels=1,
            duration_seconds=5.0,
        )
        assert raw.format == "wav"
        assert raw.sample_rate == 16000
        assert raw.duration_seconds == 5.0
    
    def test_aud_meta_creation(self):
        meta = AudMeta(
            sample_rate=16000,
            channels=1,
            duration_seconds=10.0,
            source="microphone",
        )
        assert meta.source == "microphone"
        assert "T" in meta.timestamp  # ISO format


class TestEmbeddingPooling:
    """Test embedding pooling strategies"""
    
    def test_mean_pooling(self):
        embeddings = np.random.randn(2, 10, 256).astype(np.float32)
        pooled = EmbeddingPooling.mean(embeddings)
        assert pooled.shape == (2, 256)
    
    def test_max_pooling(self):
        embeddings = np.random.randn(2, 10, 256).astype(np.float32)
        pooled = EmbeddingPooling.max(embeddings)
        assert pooled.shape == (2, 256)
    
    def test_cls_pooling(self):
        embeddings = np.random.randn(2, 10, 256).astype(np.float32)
        pooled = EmbeddingPooling.cls_token(embeddings)
        assert pooled.shape == (2, 256)
        # First token should match
        assert np.allclose(pooled, embeddings[:, 0, :])


class TestAudEncodeRequest:
    """Test encode request"""
    
    def test_default_values(self):
        raw = AudRaw(data=b"test", format="wav")
        request = AudEncodeRequest(audio=raw)
        
        assert request.language == "auto"
        assert request.translate is False
        assert request.extract_embedding is True
        assert request.pooling == "mean"
    
    def test_custom_values(self):
        raw = AudRaw(data=b"test", format="ogg")
        request = AudEncodeRequest(
            audio=raw,
            language="en",
            translate=True,
            pooling="max",
        )
        
        assert request.language == "en"
        assert request.translate is True
        assert request.pooling == "max"


# Integration tests (require models)
class TestSmeAudIFCIntegration:
    """Integration tests requiring model files"""
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/whisper-tiny*.bin")),
        reason="No Whisper models found"
    )
    def test_ifc_creation(self):
        ifc = create_aud_ifc(
            Path("./models"),
            model=WhisperModelName.TINY,
            quant="Q5_1",
        )
        
        assert ifc is not None
        assert ifc.default_model == WhisperModelName.TINY
        assert ifc.embedding_dim == 256
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/whisper-tiny*.bin")),
        reason="No Whisper models found"
    )
    def test_model_loading(self):
        ifc = create_aud_ifc(Path("./models"), WhisperModelName.TINY, "Q5_1")
        
        try:
            meta = ifc.load_model()
            assert meta.name == "whisper-tiny"
            assert meta.parameter_count == 39_000_000
        except FileNotFoundError:
            pytest.skip("Model file not found")
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/whisper-tiny*.bin")),
        reason="No Whisper models found"
    )
    def test_encode_placeholder(self):
        ifc = create_aud_ifc(Path("./models"), WhisperModelName.TINY, "Q5_1")
        
        try:
            ifc.load_model()
            
            # Create fake audio data
            raw = AudRaw(
                data=b"fake_wav_data" * 1000,
                format="wav",
                sample_rate=16000,
                channels=1,
                duration_seconds=2.0,
            )
            
            request = AudEncodeRequest(audio=raw, language="en")
            
            # This will use placeholder embedding
            response = ifc.encode(request)
            
            assert isinstance(response.transcript.text, str)
            assert response.transcript.language in ["en", "unknown"]
            assert response.embedding is not None
            assert response.embedding.embedding.shape[-1] == 256
            assert response.evidence is not None
            assert response.evidence.evidence_id.startswith("ev-aud-")
            
        except FileNotFoundError:
            pytest.skip("Model file not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])