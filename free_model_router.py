"""
FreeModelRouter — unified OpenAI-compatible client for free LLM/image endpoints.

Routes by model prefix:
  - ollama/...        → local Ollama (default: http://localhost:11434/v1)
  - lemonade/...      → local Lemonade (default: http://localhost:13305/api/v1)
  - openrouter/...    → OpenRouter free tier (needs OPENROUTER_API_KEY)
  - nvidia/...        → NVIDIA NIM free tier (needs NVIDIA_API_KEY)
  - hf/...            → Hugging Face Inference API free (needs HF_API_KEY)
  - groq/...          → Groq free tier (needs GROQ_API_KEY)
  - together/...      → Together AI free tier (needs TOGETHER_API_KEY)
  - deepinfra/...     → DeepInfra free tier (needs DEEPINFRA_API_KEY)

Usage:
    from free_model_router import FreeModelRouter
    router = FreeModelRouter()
    
    # Chat
    resp = router.chat.completions.create(
        model="ollama/llama3.2:3b",
        messages=[{"role": "user", "content": "Hello"}]
    )
    
    # Image generation (Lemonade, NVIDIA, OpenRouter)
    img = router.images.generate(
        model="lemonade/SD-Turbo",
        prompt="mandala pattern",
        size="512x512"
    )
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.parse import urlparse

try:
    from openai import OpenAI, AsyncOpenAI
except ImportError:
    raise ImportError("Install openai: pip install openai")


@dataclass
class EndpointConfig:
    base_url: str
    api_key: str
    supports_chat: bool = True
    supports_images: bool = False
    supports_embeddings: bool = False
    supports_audio: bool = False


class FreeModelRouter:
    """
    Unified router for free LLM/image endpoints.
    All endpoints expose OpenAI-compatible /v1 APIs.
    """
    
    DEFAULT_ENDPOINTS = {
        "ollama": EndpointConfig(
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
            api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
            supports_chat=True,
            supports_embeddings=True,
        ),
        "lemonade": EndpointConfig(
            base_url=os.getenv("LEMONADE_BASE_URL", "http://localhost:13305/api/v1"),
            api_key=os.getenv("LEMONADE_API_KEY", "lemonade"),
            supports_chat=True,
            supports_images=True,
            supports_embeddings=True,
            supports_audio=True,
        ),
        "openrouter": EndpointConfig(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY", ""),
            supports_chat=True,
            supports_images=True,
        ),
        "nvidia": EndpointConfig(
            base_url=os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            api_key=os.getenv("NVIDIA_API_KEY", ""),
            supports_chat=True,
            supports_images=False,
            supports_embeddings=True,
        ),
        "hf": EndpointConfig(
            base_url="https://api-inference.huggingface.co/v1",
            api_key=os.getenv("HF_API_KEY", ""),
            supports_chat=True,
            supports_images=True,
            supports_embeddings=True,
        ),
        "groq": EndpointConfig(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY", ""),
            supports_chat=True,
        ),
        "together": EndpointConfig(
            base_url="https://api.together.xyz/v1",
            api_key=os.getenv("TOGETHER_API_KEY", ""),
            supports_chat=True,
            supports_images=True,
            supports_embeddings=True,
        ),
        "deepinfra": EndpointConfig(
            base_url="https://api.deepinfra.com/v1/openai",
            api_key=os.getenv("DEEPINFRA_API_KEY", ""),
            supports_chat=True,
            supports_images=True,
            supports_embeddings=True,
        ),
    }
    
    # Free model aliases (user-friendly names → actual model IDs)
    MODEL_ALIASES = {
        # Ollama
        "llama3.2:3b": "ollama/llama3.2:3b",
        "llama3.2:1b": "ollama/llama3.2:1b",
        "qwen2.5:7b": "ollama/qwen2.5:7b",
        "qwen2.5:3b": "ollama/qwen2.5:3b",
        "phi3.5:3.8b": "ollama/phi3.5:3.8b",
        "gemma2:2b": "ollama/gemma2:2b",
        "mistral:7b": "ollama/mistral:7b",
        "codellama:7b": "ollama/codellama:7b",
        "nomic-embed-text": "ollama/nomic-embed-text",
        
        # Lemonade (local)
        "llama3.2-1b": "lemonade/Llama-3.2-1B-Instruct-GGUF",
        "sd-turbo": "lemonade/SD-Turbo",
        "sd-turbo-gguf": "lemonade/SD-Turbo-GGUF",
        "whisper-tiny": "lemonade/Whisper-Tiny",
        "kokoro": "lemonade/kokoro-v1",
        
        # OpenRouter free models
        "nemotron-3-ultra": "openrouter/nvidia/nemotron-3-ultra-550b-a55b",
        "nemotron-3-super": "openrouter/nvidia/nemotron-3-super-120b-a12b",
        "nemotron-3-nano": "openrouter/nvidia/nemotron-3-nano-30b-a3b",
        "llama-3.1-70b": "openrouter/meta-llama/llama-3.1-70b-instruct",
        "llama-3.1-8b": "openrouter/meta-llama/llama-3.1-8b-instruct",
        "llama-3.2-11b-vision": "openrouter/meta-llama/llama-3.2-11b-vision-instruct",
        "llama-3.2-90b-vision": "openrouter/meta-llama/llama-3.2-90b-vision-instruct",
        "mixtral-8x7b": "openrouter/mistralai/mixtral-8x7b-instruct",
        "qwen-2.5-72b": "openrouter/qwen/qwen-2.5-72b-instruct",
        "deepseek-v3": "openrouter/deepseek/deepseek-chat",
        "deepseek-coder": "openrouter/deepseek/deepseek-coder",
        "phi-3.5-mini": "openrouter/microsoft/phi-3.5-mini-instruct",
        "gemma-2-9b": "openrouter/google/gemma-2-9b-it",
        
        # NVIDIA direct
        "nvidia-nemotron-3-ultra": "nvidia/nvidia/nemotron-3-ultra-550b-a55b",
        "nvidia-nemotron-3-super": "nvidia/nvidia/nemotron-3-super-120b-a12b",
        "nvidia-nemotron-3-nano": "nvidia/nvidia/nemotron-3-nano-30b-a3b",
        "nvidia-llama-3.1-70b": "nvidia/meta/llama-3.1-70b-instruct",
        "nvidia-llama-3.1-8b": "nvidia/meta/llama-3.1-8b-instruct",
        "nvidia-muse-glimmer": "nvidia/meta/muse-glimmer-30b",
        
        # Groq free
        "groq-llama-3.1-70b": "groq/llama-3.1-70b-versatile",
        "groq-llama-3.1-8b": "groq/llama-3.1-8b-instant",
        "groq-mixtral": "groq/mixtral-8x7b-32768",
        "groq-gemma2-9b": "groq/gemma2-9b-it",
        "groq-qwen-2.5-72b": "groq/qwen-2.5-72b-instruct",
        
        # Together AI free
        "together-llama-3.1-70b": "together/meta-llama/Llama-3.1-70B-Instruct-Turbo",
        "together-llama-3.1-8b": "together/meta-llama/Llama-3.1-8B-Instruct-Turbo",
        "together-mixtral": "together/mistralai/Mixtral-8x7B-Instruct-v0.1",
        "together-qwen-2.5-72b": "together/Qwen/Qwen2.5-72B-Instruct-Turbo",
        "together-deepseek": "together/deepseek-ai/DeepSeek-V3",
        
        # DeepInfra free
        "deepinfra-llama-3.1-70b": "deepinfra/meta-llama/Meta-Llama-3.1-70B-Instruct",
        "deepinfra-llama-3.1-8b": "deepinfra/meta-llama/Meta-Llama-3.1-8B-Instruct",
        "deepinfra-mixtral": "deepinfra/mistralai/Mixtral-8x7B-Instruct-v0.1",
        "deepinfra-qwen-2.5-72b": "deepinfra/Qwen/Qwen2.5-72B-Instruct",
    }
    
    def __init__(
        self,
        custom_endpoints: Optional[Dict[str, EndpointConfig]] = None,
        custom_aliases: Optional[Dict[str, str]] = None,
        timeout: float = 60.0,
    ):
        self.endpoints = {**self.DEFAULT_ENDPOINTS, **(custom_endpoints or {})}
        self.aliases = {**self.MODEL_ALIASES, **(custom_aliases or {})}
        self.timeout = timeout
        self._clients: Dict[str, OpenAI] = {}
        self._async_clients: Dict[str, AsyncOpenAI] = {}
    
    def _parse_model(self, model: str) -> tuple[str, str]:
        """Parse 'provider/model-id' → (provider, model_id). Supports aliases."""
        # Resolve alias first
        model = self.aliases.get(model, model)
        
        if "/" not in model:
            raise ValueError(f"Model must be 'provider/model-id', got: {model}")
        
        provider, model_id = model.split("/", 1)
        if provider not in self.endpoints:
            raise ValueError(f"Unknown provider: {provider}. Available: {list(self.endpoints.keys())}")
        
        return provider, model_id
    
    def _get_client(self, provider: str, async_: bool = False) -> OpenAI:
        """Get or create OpenAI client for provider."""
        cache = self._async_clients if async_ else self._clients
        if provider not in cache:
            cfg = self.endpoints[provider]
            if not cfg.api_key and provider != "ollama":
                raise ValueError(f"No API key for {provider}. Set {provider.upper()}_API_KEY env var.")
            
            client_class = AsyncOpenAI if async_ else OpenAI
            cache[provider] = client_class(
                base_url=cfg.base_url,
                api_key=cfg.api_key,
                timeout=self.timeout,
            )
        return cache[provider]
    
    @property
    def chat(self) -> "ChatRouter":
        return ChatRouter(self)
    
    @property
    def images(self) -> "ImagesRouter":
        return ImagesRouter(self)
    
    @property
    def embeddings(self) -> "EmbeddingsRouter":
        return EmbeddingsRouter(self)
    
    @property
    def audio(self) -> "AudioRouter":
        return AudioRouter(self)
    
    def list_models(self, provider: Optional[str] = None) -> Dict[str, list]:
        """List available models from provider(s)."""
        results = {}
        providers = [provider] if provider else self.endpoints.keys()
        
        for p in providers:
            try:
                client = self._get_client(p)
                resp = client.models.list()
                models = [m.id for m in resp.data]
                results[p] = models
            except Exception as e:
                results[p] = [f"Error: {e}"]
        return results
    
    def resolve_model(self, model: str) -> tuple[str, str]:
        """Resolve alias to (provider, model_id)."""
        return self._parse_model(model)


class ChatRouter:
    def __init__(self, router: FreeModelRouter):
        self.router = router
    
    def completions(self) -> "CompletionsProxy":
        return CompletionsProxy(self.router)
    
    @property
    def completions(self) -> "CompletionsProxy":
        return self.completions()


class CompletionsProxy:
    """Proxy that routes chat.completions.create to the right provider."""
    
    def __init__(self, router: FreeModelRouter):
        self.router = router
    
    def create(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_chat:
            raise ValueError(f"Provider {provider} does not support chat")
        
        client = router._get_client(provider)
        return client.chat.completions.create(model=model_id, **kwargs)
    
    async def acreate(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_chat:
            raise ValueError(f"Provider {provider} does not support chat")
        
        client = router._get_client(provider, async_=True)
        return await client.chat.completions.create(model=model_id, **kwargs)


class ImagesRouter:
    def __init__(self, router: FreeModelRouter):
        self.router = router
    
    def generate(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_images:
            raise ValueError(f"Provider {provider} does not support image generation")
        
        client = router._get_client(provider)
        return client.images.generate(model=model_id, **kwargs)
    
    async def agenerate(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_images:
            raise ValueError(f"Provider {provider} does not support image generation")
        
        client = router._get_client(provider, async_=True)
        return await client.images.generate(model=model_id, **kwargs)


class EmbeddingsRouter:
    def __init__(self, router: FreeModelRouter):
        self.router = router
    
    def create(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_embeddings:
            raise ValueError(f"Provider {provider} does not support embeddings")
        
        client = router._get_client(provider)
        return client.embeddings.create(model=model_id, **kwargs)


class AudioRouter:
    def __init__(self, router: FreeModelRouter):
        self.router = router
    
    def transcribe(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_audio:
            raise ValueError(f"Provider {provider} does not support audio")
        
        client = router._get_client(provider)
        return client.audio.transcriptions.create(model=model_id, **kwargs)
    
    def speak(self, model: str, **kwargs) -> Any:
        provider, model_id = router._parse_model(model)
        cfg = router.endpoints[provider]
        
        if not cfg.supports_audio:
            raise ValueError(f"Provider {provider} does not support audio")
        
        client = router._get_client(provider)
        return client.audio.speech.create(model=model_id, **kwargs)


# Convenience: global instance
router = FreeModelRouter()

# Back-compat exports
chat = router.chat
images = router.images
embeddings = router.embeddings
audio = router.audio


if __name__ == "__main__":
    # Quick test
    r = FreeModelRouter()
    print("=== Available endpoints ===")
    for name, cfg in r.endpoints.items():
        print(f"  {name}: {cfg.base_url} (chat={cfg.supports_chat}, images={cfg.supports_images})")
    
    print("\n=== Model aliases ===")
    for alias, target in sorted(r.aliases.items()):
        print(f"  {alias} → {target}")
    
    print("\n=== Testing model list (requires running services) ===")
    try:
        models = r.list_models("lemonade")
        print(f"Lemonade models: {models}")
    except Exception as e:
        print(f"Lemonade not reachable: {e}")