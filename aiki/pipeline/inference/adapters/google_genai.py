"""Google GenAI Provider for AIKI Pipeline — Real Implementation using google-genai SDK.

This provider uses Google's Generative AI SDK with Vertex AI authentication (ADC).
Supports:
- Text generation (gemini-3.5-flash, gemini-1.5-pro, etc.)
- Image generation (gemini-3.1-flash-image / imagen-3.0)
- Vision/Image understanding
- Streaming responses
"""

from __future__ import annotations

import os
from typing import Any, Mapping, Optional

from pipeline.inference.base import InferenceProvider, InferenceRequest, InferenceResponse


class GoogleGenAIProvider(InferenceProvider):
    """Google Generative AI provider using google-genai SDK with Vertex AI / ADC auth.

    Configuration (environment variables):
    - GOOGLE_CLOUD_PROJECT: GCP project ID (required)
    - GOOGLE_CLOUD_LOCATION: GCP region (default: "us-central1")
    - GOOGLE_GENAI_USE_ENTERPRISE: Use Vertex AI endpoint (default: "true")
    - GOOGLE_GENAI_MODEL: Default text model (default: "gemini-1.5-flash")
    - GOOGLE_GENAI_IMAGE_MODEL: Default image model (default: "gemini-3.1-flash-image")
    """

    provider_id = "google"

    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self._client = None
        self._project = None
        self._location = None
        self._use_vertex = None
        self._text_model = None
        self._image_model = None

    def _init_client(self) -> None:
        """Lazy-initialize the google-genai client."""
        if self._client is not None:
            return

        try:
            from google import genai
            from google.genai.types import GenerateContentConfig
        except ImportError:
            raise RuntimeError(
                "google-genai SDK not installed. Install with: pip install google-genai"
            )

        # Resolve configuration
        project = (
            self.config.get("project")
            or os.getenv("GOOGLE_CLOUD_PROJECT")
            or os.getenv("GCP_PROJECT")
        )
        location = (
            self.config.get("location")
            or os.getenv("GOOGLE_CLOUD_LOCATION")
            or os.getenv("GCP_REGION")
            or "us-central1"
        )
        use_vertex = (
            self.config.get("use_vertex")
            or os.getenv("GOOGLE_GENAI_USE_ENTERPRISE", "true").lower() in {"1", "true", "yes", "on"}
        )

        if not project and use_vertex:
            raise RuntimeError(
                "GOOGLE_CLOUD_PROJECT required for Vertex AI. "
                "Set GOOGLE_CLOUD_PROJECT or GOOGLE_GENAI_USE_ENTERPRISE=false for public endpoint."
            )

        self._project = project
        self._location = location
        self._use_vertex = use_vertex
        self._text_model = self.config.get("text_model", os.getenv("GOOGLE_GENAI_MODEL", "gemini-1.5-flash"))
        self._image_model = self.config.get("image_model", os.getenv("GOOGLE_GENAI_IMAGE_MODEL", "gemini-3.1-flash-image"))

        if use_vertex:
            self._client = genai.Client(vertexai=True, project=project, location=location)
        else:
            # Public endpoint requires API key
            api_key = self.config.get("api_key") or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise RuntimeError("GOOGLE_API_KEY required for public endpoint (GOOGLE_GENAI_USE_ENTERPRISE=false)")
            self._client = genai.Client(api_key=api_key)

    def complete(self, request: InferenceRequest) -> InferenceResponse:
        """Complete an inference request."""
        self._init_client()

        task = request.task.lower()
        prompt = request.prompt
        metadata = request.metadata

        try:
            if task in ("text", "chat", "reasoning", "generation"):
                return self._complete_text(prompt, metadata)
            elif task in ("image", "image_generation", "img2img", "edit"):
                return self._complete_image(prompt, metadata)
            elif task in ("vision", "image_understanding", "describe"):
                return self._complete_vision(prompt, metadata)
            else:
                return InferenceResponse(
                    provider_id=self.provider_id,
                    text=f"[google] Unknown task: {task}",
                    stub=False,
                    details={"error": f"Unsupported task: {task}"},
                )
        except Exception as exc:
            return InferenceResponse(
                provider_id=self.provider_id,
                text=f"[google] Error: {type(exc).__name__}: {exc}",
                stub=False,
                details={"error": str(exc), "task": task},
            )

    def _complete_text(self, prompt: str, metadata: Mapping[str, Any]) -> InferenceResponse:
        """Text generation using configured text model."""
        model = metadata.get("model") or self._text_model
        temperature = metadata.get("temperature", 0.7)
        max_tokens = metadata.get("max_tokens", 8192)

        from google.genai.types import GenerateContentConfig

        config = GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        resp = self._client.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )

        text = resp.text if resp and resp.text else ""

        return InferenceResponse(
            provider_id=self.provider_id,
            text=text,
            stub=False,
            details={
                "model": model,
                "usage": {
                    "prompt_tokens": getattr(resp, "usage_metadata", {}).get("prompt_token_count", 0),
                    "completion_tokens": getattr(resp, "usage_metadata", {}).get("candidates_token_count", 0),
                } if hasattr(resp, "usage_metadata") else {},
            },
        )

    def _complete_image(self, prompt: str, metadata: Mapping[str, Any]) -> InferenceResponse:
        """Image generation using configured image model (gemini-3.1-flash-image / imagen)."""
        model = metadata.get("model") or self._image_model
        image_bytes = metadata.get("image_bytes")  # For img2img/edit

        from google.genai.types import GenerateContentConfig, Modality, Part

        if isinstance(image_bytes, (bytes, bytearray)):
            # img2img / edit mode
            structure_part = Part.from_bytes(data=image_bytes, mime_type="image/png")
            contents = [metadata.get("edit_prompt", ""), structure_part]
        else:
            # Text-to-image
            contents = [prompt]

        config = GenerateContentConfig(
            response_modalities=[Modality.TEXT, Modality.IMAGE],
        )

        resp = self._client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )

        if not resp.candidates:
            return InferenceResponse(
                provider_id=self.provider_id,
                text="No candidates in response",
                stub=False,
                details={"error": "no_candidates"},
            )

        for part in resp.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                import base64
                return InferenceResponse(
                    provider_id=self.provider_id,
                    text="Image generated successfully",
                    stub=False,
                    details={
                        "model": model,
                        "image_base64": base64.b64encode(part.inline_data.data).decode(),
                        "mime_type": part.inline_data.mime_type or "image/png",
                    },
                )

        return InferenceResponse(
            provider_id=self.provider_id,
            text="No image data in response",
            stub=False,
            details={"error": "no_image_data"},
        )

    def _complete_vision(self, prompt: str, metadata: Mapping[str, Any]) -> InferenceResponse:
        """Vision/Image understanding - describe or analyze an image."""
        model = metadata.get("model") or self._text_model
        image_bytes = metadata.get("image_bytes")

        if not image_bytes:
            return InferenceResponse(
                provider_id=self.provider_id,
                text="No image provided for vision task",
                stub=False,
                details={"error": "no_image"},
            )

        from google.genai.types import GenerateContentConfig, Part

        image_part = Part.from_bytes(data=image_bytes, mime_type="image/png")
        config = GenerateContentConfig(max_output_tokens=1024)

        resp = self._client.models.generate_content(
            model=model,
            contents=[prompt, image_part],
            config=config,
        )

        text = resp.text if resp and resp.text else ""

        return InferenceResponse(
            provider_id=self.provider_id,
            text=text,
            stub=False,
            details={"model": model},
        )


def create_google_provider(config: Optional[dict] = None) -> GoogleGenAIProvider:
    """Factory function to create Google GenAI provider."""
    return GoogleGenAIProvider(config)