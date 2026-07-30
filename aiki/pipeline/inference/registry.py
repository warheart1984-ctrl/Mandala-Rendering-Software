"""Provider registry (config-driven placeholders). Status: skeleton."""
from __future__ import annotations

from pipeline.inference.adapters.aais_stub import AAISStubProvider
from pipeline.inference.adapters.anthropic_stub import AnthropicStubProvider
from pipeline.inference.adapters.google_stub import GoogleStubProvider
from pipeline.inference.adapters.mistral_stub import MistralStubProvider
from pipeline.inference.adapters.ollama_stub import OllamaStubProvider
from pipeline.inference.adapters.openai_stub import OpenAIStubProvider
from pipeline.inference.adapters.vllm_stub import VLLMStubProvider
from pipeline.inference.base import InferenceProvider

_PROVIDERS: dict[str, InferenceProvider] = {
    "openai": OpenAIStubProvider(),
    "anthropic": AnthropicStubProvider(),
    "google": GoogleStubProvider(),
    "mistral": MistralStubProvider(),
    "ollama": OllamaStubProvider(),
    "vllm": VLLMStubProvider(),
    "aais": AAISStubProvider(),
}


def list_provider_ids() -> list[str]:
    return sorted(_PROVIDERS)


def get_provider(provider_id: str) -> InferenceProvider:
    try:
        return _PROVIDERS[provider_id]
    except KeyError as exc:
        raise KeyError(f"Unknown inference provider: {provider_id}") from exc
