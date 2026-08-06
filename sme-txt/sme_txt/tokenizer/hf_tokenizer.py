"""
SME-TXT — Tokenizer Wrapper (HuggingFace tokenizers)
Constitutional Contract: contract.sme-txt.v1
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import numpy as np
from tokenizers import Tokenizer as HFTokenizer
from tokenizers.models import BPE, Unigram, WordPiece
from tokenizers.pre_tokenizers import ByteLevel, Metaspace
from tokenizers.processors import TemplateProcessing


@dataclass
class TokenizerConfig:
    """Tokenizer configuration"""
    model_path: Path
    chat_template: Optional[str] = None
    add_bos: bool = True
    add_eos: bool = True
    max_length: int = 4096
    padding_side: str = "left"
    truncation_side: str = "right"


class SmeTokenizer:
    """
    Constitutional tokenizer wrapper.
    Supports SmolLM, Qwen2.5, Phi-3 tokenizers.
    """
    
    def __init__(self, config: TokenizerConfig):
        self.config = config
        self._tokenizer: Optional[HFTokenizer] = None
        self._loaded = False
    
    def load(self) -> None:
        """Load tokenizer from file"""
        if self._loaded:
            return
        
        self._tokenizer = HFTokenizer.from_file(str(self.config.model_path))
        
        # Configure post-processor for chat templates if available
        if self.config.chat_template:
            self._tokenizer.post_processor = TemplateProcessing(
                single=self.config.chat_template,
                pair=self.config.chat_template,
                special_tokens=[
                    ("<|im_start|>", self._tokenizer.token_to_id("<|im_start|>")),
                    ("<|im_end|>", self._tokenizer.token_to_id("<|im_end|>")),
                ],
            )
        
        # Enable padding/truncation
        self._tokenizer.enable_padding(
            pad_id=self._tokenizer.token_to_id("<|pad|>") or 0,
            pad_token="<|pad|>",
            length=self.config.max_length,
            direction=self.config.padding_side,
        )
        self._tokenizer.enable_truncation(
            max_length=self.config.max_length,
            direction=self.config.truncation_side,
        )
        
        self._loaded = True
    
    def encode(
        self,
        text: str,
        add_special_tokens: bool = True,
        return_tensors: str = "np",
    ) -> dict[str, Any]:
        """Encode text to token IDs"""
        if not self._loaded:
            self.load()
        
        encoding = self._tokenizer.encode(text, add_special_tokens=add_special_tokens)
        
        result = {
            "input_ids": encoding.ids,
            "attention_mask": encoding.attention_mask,
        }
        
        if return_tensors == "np":
            result = {k: np.array(v, dtype=np.int64) for k, v in result.items()}
        elif return_tensors == "pt":
            import torch
            result = {k: torch.tensor(v, dtype=torch.long) for k, v in result.items()}
        
        return result
    
    def decode(
        self,
        token_ids: list[int],
        skip_special_tokens: bool = True,
    ) -> str:
        """Decode token IDs to text"""
        if not self._loaded:
            self.load()
        
        return self._tokenizer.decode(token_ids, skip_special_tokens=skip_special_tokens)
    
    def apply_chat_template(
        self,
        messages: list[dict[str, str]],
        tokenize: bool = True,
        add_generation_prompt: bool = True,
    ) -> dict[str, Any] | str:
        """Apply chat template to messages"""
        if not self._loaded:
            self.load()
        
        # Use tokenizer's built-in chat template if available
        if hasattr(self._tokenizer, "apply_chat_template"):
            return self._tokenizer.apply_chat_template(
                messages,
                tokenize=tokenize,
                add_generation_prompt=add_generation_prompt,
            )
        
        # Fallback: simple concatenation
        text = ""
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            text += f"<|im_start|>{role}\n{content}<|im_end|>\n"
        
        if add_generation_prompt:
            text += "<|im_start|>assistant\n"
        
        if tokenize:
            return self.encode(text, add_special_tokens=False)
        return text
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        if not self._loaded:
            self.load()
        return len(self._tokenizer.encode(text).ids)
    
    @property
    def vocab_size(self) -> int:
        if not self._loaded:
            self.load()
        return self._tokenizer.get_vocab_size()
    
    @property
    def bos_token_id(self) -> Optional[int]:
        if not self._loaded:
            self.load()
        return self._tokenizer.token_to_id("<|im_start|>") or self._tokenizer.token_to_id("<s>")
    
    @property
    def eos_token_id(self) -> Optional[int]:
        if not self._loaded:
            self.load()
        return self._tokenizer.token_to_id("<|im_end|>") or self._tokenizer.token_to_id("</s>")
    
    @property
    def pad_token_id(self) -> Optional[int]:
        if not self._loaded:
            self.load()
        return self._tokenizer.token_to_id("<|pad|>") or self._tokenizer.token_to_id("<pad>")


class TokenizerFactory:
    """Factory for creating tokenizers for supported models"""
    
    TOKENIZER_CONFIGS = {
        "smollm-360m": {
            "repo": "HuggingFaceTB/SmolLM-360M",
            "chat_template": "{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\n'}}{% endif %}",
        },
        "qwen2.5-0.5b": {
            "repo": "Qwen/Qwen2.5-0.5B",
            "chat_template": "{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|im_start|>assistant\n'}}{% endif %}",
        },
        "phi-3-mini-pruned": {
            "repo": "microsoft/Phi-3-mini-4k-instruct",
            "chat_template": "{% for message in messages %}{{'<|user|>\n' + message['content'] + '<|end|>\n' if message['role'] == 'user' else '<|assistant|>\n' + message['content'] + '<|end|>\n'}}{% endfor %}{% if add_generation_prompt %}{{'<|assistant|>\n'}}{% endif %}",
        },
    }
    
    def __init__(self, cache_dir: Path = Path("./tokenizers")):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def create(self, model_name: str) -> SmeTokenizer:
        """Create tokenizer for model"""
        if model_name not in self.TOKENIZER_CONFIGS:
            raise ValueError(f"Unsupported model: {model_name}")
        
        config = self.TOKENIZER_CONFIGS[model_name]
        
        # Download tokenizer if needed
        tokenizer_path = self.cache_dir / model_name / "tokenizer.json"
        if not tokenizer_path.exists():
            self._download_tokenizer(config["repo"], tokenizer_path)
        
        tokenizer_config = TokenizerConfig(
            model_path=tokenizer_path,
            chat_template=config["chat_template"],
        )
        
        return SmeTokenizer(tokenizer_config)
    
    def _download_tokenizer(self, repo: str, output_path: Path) -> None:
        """Download tokenizer from Hugging Face Hub"""
        from huggingface_hub import hf_hub_download
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        print(f"Downloading tokenizer from {repo}...")
        hf_hub_download(
            repo_id=repo,
            filename="tokenizer.json",
            local_dir=output_path.parent,
            local_dir_use_symlinks=False,
        )
        
        # Also download tokenizer_config.json for reference
        try:
            hf_hub_download(
                repo_id=repo,
                filename="tokenizer_config.json",
                local_dir=output_path.parent,
                local_dir_use_symlinks=False,
            )
        except Exception:
            pass  # Optional file


if __name__ == "__main__":
    # Demo
    factory = TokenizerFactory()
    
    for model_name in ["smollm-360m", "qwen2.5-0.5b"]:
        try:
            tokenizer = factory.create(model_name)
            text = "Hello, world! This is a test."
            encoded = tokenizer.encode(text)
            decoded = tokenizer.decode(encoded["input_ids"])
            print(f"{model_name}: {tokenizer.count_tokens(text)} tokens")
            print(f"  Original: {text}")
            print(f"  Decoded:  {decoded}")
        except Exception as e:
            print(f"{model_name}: ERROR - {e}")