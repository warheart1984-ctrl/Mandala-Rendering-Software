from __future__ import annotations

from pipeline.inference.base import InferenceProvider, InferenceRequest, InferenceResponse


def _stub(provider_id: str, request: InferenceRequest) -> InferenceResponse:
    return InferenceResponse(
        provider_id=provider_id,
        text=f"[stub:{provider_id}] no network call; task={request.task}",
        stub=True,
        details={"prompt_chars": len(request.prompt)},
    )


class OpenAIStubProvider(InferenceProvider):
    provider_id = "openai"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class AnthropicStubProvider(InferenceProvider):
    provider_id = "anthropic"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class GoogleStubProvider(InferenceProvider):
    provider_id = "google"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class MistralStubProvider(InferenceProvider):
    provider_id = "mistral"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class OllamaStubProvider(InferenceProvider):
    provider_id = "ollama"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class VLLMStubProvider(InferenceProvider):
    provider_id = "vllm"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)


class AAISStubProvider(InferenceProvider):
    """Optional local runtime adapter. Not a core AIKI dependency."""

    provider_id = "aais"

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        return _stub(self.provider_id, request)
