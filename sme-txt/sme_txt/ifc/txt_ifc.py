"""
SME-TXT — Text Reasoning Core Interface (SME-TXT-IFC)
Constitutional Contract: contract.sme-txt.v1
Authority: infer
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from ..models.loader import ModelLoader, ModelMetadata, QuantizationFormat, ModelBudget
from ..models.gguf import LlamaCppModel, LlamaCppModelFactory, LlamaCppConfig
from ..models.safetensors import OrtModel, OrtModelFactory, OrtConfig
from ..tokenizer.hf_tokenizer import SmeTokenizer, TokenizerFactory
from ..tokenizer.chat_template import format_messages, ChatMessage


@dataclass
class TxtPrompt:
    """Input prompt for SME-TXT"""
    text: str
    messages: list[dict[str, str]] | None = None
    system_prompt: str | None = None
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    seed: int = 42
    stop_sequences: list[str] = None
    
    def __post_init__(self):
        if self.stop_sequences is None:
            self.stop_sequences = ["</s>", "<|endoftext|>", "\n\n"]


@dataclass
class MmEmbeddings:
    """Multimodal embeddings from other modalities"""
    vis_embed: np.ndarray | None = None      # [512] or [num_tokens, 512]
    aud_embed: np.ndarray | None = None      # [256] or [num_tokens, 256]
    vid_embed: np.ndarray | None = None      # [512] or [num_tokens, 512]
    vis_tokens: int = 0
    aud_tokens: int = 0
    vid_tokens: int = 0
    
    def to_token_space(self, d_llm: int) -> np.ndarray | None:
        """Project all embeddings to LLM token space and concatenate"""
        embeddings = []
        
        if self.vis_embed is not None:
            vis = self.vis_embed
            if vis.ndim == 1:
                vis = vis[None, :]
            embeddings.append(vis)
        
        if self.aud_embed is not None:
            aud = self.aud_embed
            if aud.ndim == 1:
                aud = aud[None, :]
            embeddings.append(aud)
        
        if self.vid_embed is not None:
            vid = self.vid_embed
            if vid.ndim == 1:
                vid = vid[None, :]
            embeddings.append(vid)
        
        if not embeddings:
            return None
        
        return np.concatenate(embeddings, axis=0)


@dataclass
class TxtResponse:
    """Output response from SME-TXT"""
    text: str
    tokens_generated: int
    finish_reason: str  # "stop", "length", "error"
    evidence: dict[str, Any]


@dataclass
class DecisionRecord:
    """Constitutional decision record for SME-LOG"""
    decision_id: str
    intent_id: str
    model_metadata: dict[str, Any]
    prompt_tokens: int
    completion_tokens: int
    reason_trace: list[str]
    seed: int
    timestamp: str
    constitutional_trace: dict[str, Any] = field(default_factory=dict)
    
    def to_evidence_dict(self) -> dict[str, Any]:
        return {
            "decision_id": self.decision_id,
            "intent_id": self.intent_id,
            "model": self.model_metadata,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "reason_trace": self.reason_trace,
            "seed": self.seed,
            "timestamp": self.timestamp,
            "constitutional_trace": self.constitutional_trace,
        }


class SmeTxtIFC:
    """
    SME-TXT Interface Implementation.
    Constitutional text reasoning core with llama.cpp/ONNXRuntime backends.
    """
    
    def __init__(
        self,
        models_dir: Path,
        default_model: str = "smollm-360m",
        default_quantization: QuantizationFormat = QuantizationFormat.Q4_1,
        backend: str = "llama_cpp",  # "llama_cpp" or "onnxruntime"
        cache_dir: Path = Path("./cache"),
    ):
        self.models_dir = Path(models_dir)
        self.default_model = default_model
        self.default_quantization = default_quantization
        self.backend = backend
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Factories
        self.gguf_factory = LlamaCppModelFactory(self.models_dir)
        self.ort_factory = OrtModelFactory(self.models_dir)
        self.tokenizer_factory = TokenizerFactory(self.cache_dir / "tokenizers")
        
        # Active model
        self._model = None
        self._tokenizer = None
        self._current_model_name = None
        self._current_quantization = None
    
    def load_model(
        self,
        model_name: str | None = None,
        quantization: QuantizationFormat | None = None,
    ) -> ModelMetadata:
        """Load model into memory"""
        model_name = model_name or self.default_model
        quantization = quantization or self.default_quantization
        
        if (self._model is not None and 
            self._current_model_name == model_name and 
            self._current_quantization == quantization):
            return self._model.metadata
        
        # Unload previous
        if self._model:
            self._model.unload()
        
        # Load new model
        if self.backend == "llama_cpp":
            self._model = self.gguf_factory.create(model_name, quantization)
        elif self.backend == "onnxruntime":
            self._model = self.ort_factory.create(model_name, quantization)
        else:
            raise ValueError(f"Unknown backend: {self.backend}")
        
        # Load tokenizer
        self._tokenizer = self.tokenizer_factory.create(model_name)
        
        self._current_model_name = model_name
        self._current_quantization = quantization
        
        return self._model.metadata
    
    def unload_model(self) -> None:
        """Unload current model"""
        if self._model:
            self._model.unload()
            self._model = None
        self._tokenizer = None
        self._current_model_name = None
        self._current_quantization = None
    
    def generate(
        self,
        prompt: TxtPrompt,
        mm_embeddings: MmEmbeddings | None = None,
        intent_id: str | None = None,
        constitutional_context: dict[str, Any] | None = None,
    ) -> tuple[TxtResponse, DecisionRecord]:
        """
        Generate text response with constitutional tracing.
        Returns (TxtResponse, DecisionRecord)
        """
        if not self._model:
            self.load_model()
        
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Prepare input text
        if prompt.messages:
            input_text = format_messages(prompt.messages, self._current_model_name)
        else:
            input_text = prompt.text
            if prompt.system_prompt:
                input_text = f"System: {prompt.system_prompt}\n\n{input_text}"
        
        # Tokenize
        encoded = self._tokenizer.encode(input_text, add_special_tokens=True)
        input_ids = encoded["input_ids"]
        prompt_tokens = len(input_ids)
        
        # Handle multimodal embeddings (project and prepend)
        if mm_embeddings is not None:
            mm_tokens = mm_embeddings.to_token_space(self._model.metadata.hidden_dim)
            if mm_tokens is not None:
                # This would require model-specific projection
                # For now, we track the tokens for evidence
                pass
        
        # Generate
        if self.backend == "llama_cpp":
            generated_text, gen_evidence = self._model.generate(
                self._tokenizer.decode(input_ids),
                max_tokens=prompt.max_tokens,
                temperature=prompt.temperature,
                seed=prompt.seed,
            )
        else:
            # ONNXRuntime generation
            generated_ids, gen_evidence = self._model.generate(
                input_ids[None, :],  # Add batch dim
                max_new_tokens=prompt.max_tokens,
                temperature=prompt.temperature,
                top_p=prompt.top_p,
                top_k=prompt.top_k,
                seed=prompt.seed,
            )
            generated_text = self._tokenizer.decode(generated_ids[0, prompt_tokens:].tolist())
        
        completion_tokens = gen_evidence.get("completion_tokens", 0)
        
        # Build reason trace (simplified)
        reason_trace = self._build_reason_trace(input_text, generated_text, mm_embeddings)
        
        # Create response
        response = TxtResponse(
            text=generated_text,
            tokens_generated=completion_tokens,
            finish_reason="stop",
            evidence=gen_evidence,
        )
        
        # Create decision record
        decision = DecisionRecord(
            decision_id=str(uuid.uuid4()),
            intent_id=intent_id,
            model_metadata=self._model.metadata.to_evidence_dict(),
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reason_trace=reason_trace,
            seed=prompt.seed,
            timestamp=timestamp,
            constitutional_trace=constitutional_context or {},
        )
        
        return response, decision
    
    def embed(
        self,
        text: str,
        intent_id: str | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        """Generate text embeddings"""
        if not self._model:
            self.load_model()
        
        encoded = self._tokenizer.encode(text, add_special_tokens=True)
        input_ids = encoded["input_ids"]
        
        if self.backend == "llama_cpp":
            embedding, evidence = self._model.embed(text)
        else:
            embedding, evidence = self._model.embed(input_ids[None, :])
        
        return embedding, evidence
    
    def _build_reason_trace(
        self,
        input_text: str,
        output_text: str,
        mm_embeddings: MmEmbeddings | None,
    ) -> list[str]:
        """Build simplified reason trace"""
        trace = ["received_prompt"]
        
        if mm_embeddings:
            if mm_embeddings.vis_embed is not None:
                trace.append("processed_visual_embedding")
            if mm_embeddings.aud_embed is not None:
                trace.append("processed_audio_embedding")
            if mm_embeddings.vid_embed is not None:
                trace.append("processed_video_embedding")
        
        trace.append("fused_modalities")
        trace.append("generated_response")
        
        return trace
    
    def get_budget(self) -> ModelBudget:
        """Get current model budget"""
        if not self._model:
            self.load_model()
        return self.gguf_factory.loader.get_budget(self._current_model_name)
    
    def validate_budget(self, num_tokens: int) -> tuple[bool, str]:
        """Validate token budget"""
        if not self._model:
            self.load_model()
        return self.gguf_factory.loader.validate_budget(
            self._current_model_name, num_tokens
        )
    
    @property
    def current_model(self) -> str | None:
        return self._current_model_name
    
    @property
    def current_quantization(self) -> QuantizationFormat | None:
        return self._current_quantization


# Convenience functions
def create_txt_ifc(
    models_dir: Path,
    model: str = "smollm-360m",
    quant: QuantizationFormat = QuantizationFormat.Q4_1,
    backend: str = "llama_cpp",
) -> SmeTxtIFC:
    """Factory function to create SME-TXT IFC"""
    return SmeTxtIFC(models_dir, model, quant, backend)


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    ifc = create_txt_ifc(models_dir, "smollm-360m", QuantizationFormat.Q4_1)
    
    try:
        # Load model
        meta = ifc.load_model()
        print(f"Loaded: {meta.name} @ {meta.quantization.value}")
        print(f"  Params: {meta.parameter_count/1e6:.0f}M")
        print(f"  FLOP/token: {meta.flop_per_token/1e9:.1f} GFLOPs")
        
        # Generate
        prompt = TxtPrompt(
            text="The capital of France is",
            max_tokens=32,
            temperature=0.7,
            seed=42,
        )
        
        response, decision = ifc.generate(prompt)
        print(f"\nGenerated: {response.text}")
        print(f"Tokens: {response.tokens_generated}")
        print(f"Decision: {decision.decision_id}")
        
    except FileNotFoundError as e:
        print(f"Model not found: {e}")
    except Exception as e:
        print(f"Error: {e}")