"""
SME-TXT — Unit Tests
Constitutional Contract: contract.sme-txt.v1
"""
import pytest
import numpy as np
from pathlib import Path

from sme_txt.models.loader import (
    ModelLoader,
    ModelMetadata,
    QuantizationFormat,
    ModelBudget,
)
from sme_txt.tokenizer.hf_tokenizer import TokenizerFactory, SmeTokenizer
from sme_txt.tokenizer.chat_template import (
    ChatTemplate,
    ChatMessage,
    format_messages,
    SMOLLM_TEMPLATE,
)
from sme_txt.ifc.txt_ifc import (
    SmeTxtIFC,
    TxtPrompt,
    MmEmbeddings,
    TxtResponse,
    DecisionRecord,
    create_txt_ifc,
)


class TestModelLoader:
    """Test ModelLoader budget calculations"""
    
    def test_model_metadata_creation(self):
        metadata = ModelMetadata(
            name="test-model",
            version="1.0.0",
            parameter_count=360_000_000,
            quantization=QuantizationFormat.Q4_1,
            format="gguf",
            checksum_sha256="a" * 64,
            flop_per_token=720_000_000,
            context_window=4096,
            hidden_dim=960,
            num_heads=12,
            num_layers=24,
            vocab_size=49152,
        )
        
        assert metadata.parameter_count == 360_000_000
        assert metadata.quantization == QuantizationFormat.Q4_1
        assert metadata.flop_per_token == 720_000_000
    
    def test_model_budget_calculation(self):
        metadata = ModelMetadata(
            name="test-model",
            version="1.0.0",
            parameter_count=360_000_000,
            quantization=QuantizationFormat.Q4_1,
            format="gguf",
            checksum_sha256="a" * 64,
            flop_per_token=720_000_000,
            context_window=4096,
            hidden_dim=960,
            num_heads=12,
            num_layers=24,
            vocab_size=49152,
        )
        
        budget = ModelBudget(
            flop_per_token=metadata.flop_per_token,
            model_size_bytes=int(360_000_000 * 0.5),
            kv_cache_bytes_per_token=1024,
            max_context_tokens=4096,
        )
        
        flops_128 = budget.estimate_flops(128)
        assert flops_128 == 720_000_000 * 128
        
        fits, msg = budget.fits_in_budget(128, cpu_budget_gflops=2400.0)
        assert fits is True
        
        fits, msg = budget.fits_in_budget(10000, cpu_budget_gflops=2400.0)
        assert fits is False


class TestQuantizationFormat:
    """Test quantization format validation"""
    
    def test_valid_formats(self):
        assert QuantizationFormat.validate_format("Q4_1") == QuantizationFormat.Q4_1
        assert QuantizationFormat.validate_format("q5_0") == QuantizationFormat.Q5_0
        assert QuantizationFormat.validate_format("INT8") == QuantizationFormat.INT8
    
    def test_invalid_format(self):
        with pytest.raises(ValueError):
            QuantizationFormat.validate_format("Q8_0")
        with pytest.raises(ValueError):
            QuantizationFormat.validate_format("FP16")


class TestTokenizerFactory:
    """Test tokenizer factory (requires network for download)"""
    
    @pytest.mark.skipif(
        not Path("./tokenizers/smollm-360m/tokenizer.json").exists(),
        reason="Tokenizer not downloaded"
    )
    def test_tokenizer_creation(self):
        factory = TokenizerFactory(Path("./tokenizers"))
        tokenizer = factory.create("smollm-360m")
        
        text = "Hello, world!"
        encoded = tokenizer.encode(text)
        
        assert "input_ids" in encoded
        assert "attention_mask" in encoded
        assert len(encoded["input_ids"]) > 0
        
        decoded = tokenizer.decode(encoded["input_ids"])
        assert "Hello" in decoded or "world" in decoded


class TestChatTemplate:
    """Test chat template formatting"""
    
    def test_smolllm_template(self):
        messages = [
            {"role": "system", "content": "You are helpful."},
            {"role": "user", "content": "What is 2+2?"},
        ]
        
        formatted = format_messages(messages, "smollm-360m")
        
        assert "<|user|>" in formatted
        assert "What is 2+2?" in formatted
        assert "<|assistant|>" in formatted
        assert formatted.endswith("<|assistant|>\n")
    
    def test_chat_message_dataclass(self):
        msg = ChatMessage(role="user", content="Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"


class TestMmEmbeddings:
    """Test multimodal embeddings projection"""
    
    def test_projection_to_token_space(self):
        embeddings = MmEmbeddings(
            vis_embed=np.random.randn(512).astype(np.float32),
            aud_embed=np.random.randn(256).astype(np.float32),
            vid_embed=np.random.randn(512).astype(np.float32),
        )
        
        projected = embeddings.to_token_space(1024)
        
        assert projected is not None
        assert projected.shape[0] == 3
        assert projected.shape[1] == 1024
    
    def test_empty_embeddings(self):
        embeddings = MmEmbeddings()
        projected = embeddings.to_token_space(1024)
        assert projected is None


class TestTxtPrompt:
    """Test prompt configuration"""
    
    def test_default_values(self):
        prompt = TxtPrompt(text="Hello")
        
        assert prompt.max_tokens == 256
        assert prompt.temperature == 0.7
        assert prompt.top_p == 0.9
        assert prompt.seed == 42
        assert prompt.stop_sequences == ["\n\n", "<|endoftext|>", "\n\n"]
    
    def test_custom_values(self):
        prompt = TxtPrompt(
            text="Hello",
            max_tokens=100,
            temperature=0.5,
            seed=123,
        )
        
        assert prompt.max_tokens == 100
        assert prompt.temperature == 0.5
        assert prompt.seed == 123


class TestDecisionRecord:
    """Test decision record creation"""
    
    def test_creation(self):
        decision = DecisionRecord(
            decision_id="test-decision",
            intent_id="test-intent",
            model_metadata={"name": "test", "params": 360_000_000},
            prompt_tokens=10,
            completion_tokens=20,
            reason_trace=["step1", "step2"],
            seed=42,
            timestamp="2024-01-01T00:00:00Z",
        )
        
        evidence = decision.to_evidence_dict()
        
        assert evidence["decision_id"] == "test-decision"
        assert evidence["intent_id"] == "test-intent"
        assert evidence["prompt_tokens"] == 10
        assert evidence["completion_tokens"] == 20
        assert evidence["reason_trace"] == ["step1", "step2"]


# Integration tests (require models)
class TestSmeTxtIFCIntegration:
    """Integration tests requiring model files"""
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/*.gguf")),
        reason="No GGUF models found"
    )
    def test_ifc_creation(self):
        ifc = create_txt_ifc(
            Path("./models"),
            model="smollm-360m",
            quant=QuantizationFormat.Q4_1,
            backend="llama_cpp",
        )
        
        assert ifc is not None
        assert ifc.default_model == "smollm-360m"
        assert ifc.backend == "llama_cpp"
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/*.gguf")),
        reason="No GGUF models found"
    )
    def test_model_loading(self):
        ifc = create_txt_ifc(Path("./models"), "smollm-360m", QuantizationFormat.Q4_1)
        
        try:
            meta = ifc.load_model()
            assert meta.name == "smollm-360m"
            assert meta.parameter_count == 360_000_000
        except FileNotFoundError:
            pytest.skip("Model file not found")
    
    @pytest.mark.skipif(
        not any(Path("./models").glob("**/*.gguf")),
        reason="No GGUF models found"
    )
    def test_generate(self):
        ifc = create_txt_ifc(Path("./models"), "smollm-360m", QuantizationFormat.Q4_1)
        
        try:
            ifc.load_model()
            
            prompt = TxtPrompt(
                text="The capital of France is",
                max_tokens=16,
                temperature=0.7,
                seed=42,
            )
            
            response, decision = ifc.generate(prompt)
            
            assert isinstance(response.text, str)
            assert len(response.text) > 0
            assert response.tokens_generated > 0
            assert decision.decision_id is not None
            assert decision.intent_id is not None
            assert decision.seed == 42
            
        except FileNotFoundError:
            pytest.skip("Model file not found")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])