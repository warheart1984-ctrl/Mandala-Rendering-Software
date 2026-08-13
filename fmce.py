"""
FMCE (Free Model Choice Engine) — Unified AI Router with Role-Based Model Assignment

Features:
- Role-based model assignment (chat, code, vision, reasoning, embeddings, images, audio, transcription)
- BYOK (Bring Your Own Key) + free tier fallbacks
- Local-first (Ollama, Lemonade) with cloud free tiers (OpenRouter, Groq, Together, DeepInfra, NVIDIA, HF)
- Chat screen / ingest interface
- SME (Subject Matter Expert) role configuration per task
- Persistent config (JSON + env overrides)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Literal
from urllib.parse import urlparse

try:
    from openai import OpenAI, AsyncOpenAI
except ImportError:
    raise ImportError("Install openai: pip install openai")


# =============================================================================
# CONFIGURATION & ROLES
# =============================================================================

class ModelRole(str, Enum):
    """Roles a model can be assigned to."""
    CHAT = "chat"                    # General conversation
    CODE = "code"                    # Code generation/review
    REASONING = "reasoning"          # Complex reasoning, planning
    VISION = "vision"                # Image/video understanding
    EMBEDDINGS = "embeddings"        # Text embeddings
    IMAGES = "images"                # Image generation
    AUDIO_TTS = "audio_tts"          # Text-to-speech
    AUDIO_STT = "audio_stt"          # Speech-to-text


@dataclass
class EndpointConfig:
    """Configuration for a single provider endpoint."""
    name: str
    base_url: str
    api_key: str = ""
    supports_chat: bool = True
    supports_images: bool = False
    supports_embeddings: bool = False
    supports_audio: bool = False
    requires_key: bool = True
    is_local: bool = False
    models: Dict[ModelRole, List[str]] = field(default_factory=dict)
    priority: int = 100  # Lower = preferred


@dataclass
class RoleAssignment:
    """Which model handles which role."""
    role: ModelRole
    model: str  # e.g., "openrouter/nvidia/nemotron-3-ultra-550b-a55b"
    fallback: Optional[str] = None  # Fallback model if primary fails
    temperature: float = 0.7
    max_tokens: int = 8192
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FMCEConfig:
    """Complete FMCE configuration."""
    endpoints: Dict[str, EndpointConfig] = field(default_factory=dict)
    roles: Dict[ModelRole, RoleAssignment] = field(default_factory=dict)
    default_role: ModelRole = ModelRole.CHAT
    config_path: str = ""


# =============================================================================
# DEFAULT ENDPOINTS & MODEL CATALOG
# =============================================================================

DEFAULT_ENDPOINTS = {
    "ollama": EndpointConfig(
        name="Ollama (Local)",
        base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
        api_key=os.getenv("OLLAMA_API_KEY", "ollama"),
        supports_chat=True,
        supports_embeddings=True,
        requires_key=False,
        is_local=True,
        priority=10,
        models={
            ModelRole.CHAT: ["llama3.2:3b", "llama3.2:1b", "qwen2.5:7b", "phi3.5:3.8b", "gemma2:2b", "mistral:7b"],
            ModelRole.CODE: ["codellama:7b", "qwen2.5-coder:7b", "deepseek-coder:6.7b"],
            ModelRole.REASONING: ["llama3.2:3b", "qwen2.5:7b"],
            ModelRole.VISION: ["llava:7b", "llava:13b", "bakllava:7b"],
            ModelRole.EMBEDDINGS: ["nomic-embed-text", "mxbai-embed-large"],
        }
    ),
    "lemonade": EndpointConfig(
        name="Lemonade (Local)",
        base_url=os.getenv("LEMONADE_BASE_URL", "http://localhost:13305/api/v1"),
        api_key=os.getenv("LEMONADE_API_KEY", "lemonade"),
        supports_chat=True,
        supports_images=True,
        supports_embeddings=True,
        supports_audio=True,
        requires_key=False,
        is_local=True,
        priority=5,
        models={
            ModelRole.CHAT: ["Llama-3.2-1B-Instruct-GGUF"],
            ModelRole.IMAGES: ["SD-Turbo", "SD-Turbo-GGUF"],
            ModelRole.EMBEDDINGS: ["Llama-3.2-1B-Instruct-GGUF"],
            ModelRole.AUDIO_STT: ["Whisper-Tiny"],
            ModelRole.AUDIO_TTS: ["kokoro-v1"],
        }
    ),
    "openrouter": EndpointConfig(
        name="OpenRouter (Free Tier)",
        base_url="https://openrouter.ai/api/v1",
        api_key=os.getenv("OPENROUTER_API_KEY", ""),
        supports_chat=True,
        supports_images=True,
        supports_embeddings=False,
        requires_key=True,
        is_local=False,
        priority=20,
        models={
            ModelRole.CHAT: [
                "meta-llama/llama-3.1-70b-instruct",
                "meta-llama/llama-3.1-8b-instruct",
                "mistralai/mixtral-8x7b-instruct",
                "qwen/qwen-2.5-72b-instruct",
                "google/gemma-2-9b-it",
                "microsoft/phi-3.5-mini-instruct",
            ],
            ModelRole.CODE: [
                "deepseek/deepseek-coder",
                "meta-llama/llama-3.1-70b-instruct",
                "qwen/qwen-2.5-72b-instruct",
            ],
            ModelRole.REASONING: [
                "nvidia/nemotron-3-ultra-550b-a55b",
                "nvidia/nemotron-3-super-120b-a12b",
                "deepseek/deepseek-chat",
            ],
            ModelRole.VISION: [
                "meta-llama/llama-3.2-11b-vision-instruct",
                "meta-llama/llama-3.2-90b-vision-instruct",
            ],
            ModelRole.IMAGES: [
                "stability-ai/sd-turbo",
                "stability-ai/sdxl-turbo",
            ],
        }
    ),
    "groq": EndpointConfig(
        name="Groq (Free Tier)",
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY", ""),
        supports_chat=True,
        requires_key=True,
        is_local=False,
        priority=15,
        models={
            ModelRole.CHAT: [
                "llama-3.1-70b-versatile",
                "llama-3.1-8b-instant",
                "gemma2-9b-it",
            ],
            ModelRole.CODE: [
                "llama-3.1-70b-versatile",
                "deepseek-coder",
            ],
            ModelRole.REASONING: [
                "llama-3.1-70b-versatile",
                "mixtral-8x7b-32768",
            ],
        }
    ),
    "together": EndpointConfig(
        name="Together AI (Free Tier)",
        base_url="https://api.together.xyz/v1",
        api_key=os.getenv("TOGETHER_API_KEY", ""),
        supports_chat=True,
        supports_images=True,
        supports_embeddings=True,
        requires_key=True,
        is_local=False,
        priority=25,
        models={
            ModelRole.CHAT: [
                "meta-llama/Llama-3.1-70B-Instruct-Turbo",
                "meta-llama/Llama-3.1-8B-Instruct-Turbo",
                "mistralai/Mixtral-8x7B-Instruct-v0.1",
                "Qwen/Qwen2.5-72B-Instruct-Turbo",
            ],
            ModelRole.CODE: [
                "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
                "meta-llama/Llama-3.1-70B-Instruct-Turbo",
            ],
            ModelRole.REASONING: [
                "deepseek-ai/DeepSeek-V3",
                "meta-llama/Llama-3.1-70B-Instruct-Turbo",
            ],
            ModelRole.VISION: [
                "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
                "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
            ],
            ModelRole.IMAGES: [
                "stability-ai/SDXL-Turbo",
                "stability-ai/Stable-Diffusion-XL-Base-1.0",
            ],
            ModelRole.EMBEDDINGS: [
                "BAAI/bge-large-en-v1.5",
                "togethercomputer/m2-bert-80M-8k-retrieval",
            ],
        }
    ),
    "deepinfra": EndpointConfig(
        name="DeepInfra (Free Tier)",
        base_url="https://api.deepinfra.com/v1/openai",
        api_key=os.getenv("DEEPINFRA_API_KEY", ""),
        supports_chat=True,
        supports_images=True,
        supports_embeddings=True,
        requires_key=True,
        is_local=False,
        priority=30,
        models={
            ModelRole.CHAT: [
                "meta-llama/Meta-Llama-3.1-70B-Instruct",
                "meta-llama/Meta-Llama-3.1-8B-Instruct",
                "mistralai/Mixtral-8x7B-Instruct-v0.1",
                "Qwen/Qwen2.5-72B-Instruct",
            ],
            ModelRole.CODE: [
                "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct",
            ],
            ModelRole.REASONING: [
                "meta-llama/Meta-Llama-3.1-70B-Instruct",
            ],
            ModelRole.VISION: [
                "meta-llama/Llama-3.2-11B-Vision-Instruct",
            ],
            ModelRole.IMAGES: [
                "stability-ai/SDXL-Turbo",
            ],
            ModelRole.EMBEDDINGS: [
                "BAAI/bge-large-en-v1.5",
            ],
        }
    ),
    "nvidia": EndpointConfig(
        name="NVIDIA NIM (Free Tier)",
        base_url=os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        api_key=os.getenv("NVIDIA_API_KEY", ""),
        supports_chat=True,
        supports_embeddings=True,
        requires_key=True,
        is_local=False,
        priority=20,
        models={
            ModelRole.CHAT: [
                "meta/llama-3.1-70b-instruct",
                "meta/llama-3.1-8b-instruct",
            ],
            ModelRole.CODE: [
                "nvidia/nemotron-3-ultra-550b-a55b",
            ],
            ModelRole.REASONING: [
                "nvidia/nemotron-3-ultra-550b-a55b",
                "nvidia/nemotron-3-super-120b-a12b",
                "nvidia/nemotron-3-nano-30b-a3b",
            ],
            ModelRole.VISION: [
                "meta/llama-3.2-11b-vision-instruct",
                "meta/llama-3.2-90b-vision-instruct",
                "nvidia/neva-22b",
            ],
            ModelRole.EMBEDDINGS: [
                "nvidia/nv-embed-v1",
                "nvidia/nv-embedqa-e5-v5",
            ],
        }
    ),
    "hf": EndpointConfig(
        name="Hugging Face Inference (Free Tier)",
        base_url="https://api-inference.huggingface.co/v1",
        api_key=os.getenv("HF_API_KEY", ""),
        supports_chat=True,
        supports_images=True,
        supports_embeddings=True,
        requires_key=True,
        is_local=False,
        priority=40,
        models={
            ModelRole.CHAT: [
                "meta-llama/Meta-Llama-3.1-70B-Instruct",
                "mistralai/Mixtral-8x7B-Instruct-v0.1",
            ],
            ModelRole.CODE: [
                "bigcode/starcoder2-15b",
            ],
            ModelRole.IMAGES: [
                "stabilityai/stable-diffusion-xl-base-1.0",
            ],
            ModelRole.EMBEDDINGS: [
                "BAAI/bge-large-en-v1.5",
            ],
        }
    ),
}

# Default role assignments (best available for each role)
DEFAULT_ROLES = {
    ModelRole.CHAT: RoleAssignment(ModelRole.CHAT, "openrouter/meta-llama/llama-3.1-70b-instruct", fallback="ollama/llama3.2:3b"),
    ModelRole.CODE: RoleAssignment(ModelRole.CODE, "openrouter/deepseek/deepseek-coder", fallback="ollama/codellama:7b"),
    ModelRole.REASONING: RoleAssignment(ModelRole.REASONING, "openrouter/nvidia/nemotron-3-ultra-550b-a55b", fallback="openrouter/nvidia/nemotron-3-super-120b-a12b"),
    ModelRole.VISION: RoleAssignment(ModelRole.VISION, "openrouter/meta-llama/llama-3.2-11b-vision-instruct", fallback="ollama/llava:7b"),
    ModelRole.EMBEDDINGS: RoleAssignment(ModelRole.EMBEDDINGS, "openrouter/BAAI/bge-large-en-v1.5", fallback="ollama/nomic-embed-text"),
    ModelRole.IMAGES: RoleAssignment(ModelRole.IMAGES, "lemonade/SD-Turbo", fallback="openrouter/stability-ai/sd-turbo"),
    ModelRole.AUDIO_TTS: RoleAssignment(ModelRole.AUDIO_TTS, "lemonade/kokoro-v1", fallback="openrouter/openai/tts-1"),
    ModelRole.AUDIO_STT: RoleAssignment(ModelRole.AUDIO_STT, "lemonade/Whisper-Tiny", fallback="openrouter/openai/whisper-1"),
}


# =============================================================================
# FMCE ENGINE
# =============================================================================

class FMCE:
    """
    Free Model Choice Engine — Unified router with role-based model assignment.
    
    Usage:
        fmce = FMCE()
        
        # Quick chat with role
        resp = fmce.chat("Hello, explain quantum computing", role=ModelRole.REASONING)
        
        # Or use specific model
        resp = fmce.chat("Write a Python function", model="openrouter/deepseek/deepseek-coder")
        
        # Image generation
        img = fmce.generate_image("mandala pattern, 4k")
        
        # Configure roles
        fmce.set_role(ModelRole.CODE, "ollama/codellama:7b")
    """
    
    def __init__(
        self,
        config: Optional[FMCEConfig] = None,
        config_path: Optional[str] = None,
        auto_load: bool = True,
    ):
        self.config = config or FMCEConfig()
        self.config_path = config_path or os.getenv("FMCE_CONFIG", "./fmce_config.json")
        self._clients: Dict[str, OpenAI] = {}
        self._async_clients: Dict[str, AsyncOpenAI] = {}
        self._model_cache: Dict[str, List[str]] = {}
        
        if auto_load:
            self.load_config()
        
        # Ensure defaults are populated
        self._ensure_defaults()
    
    def _ensure_defaults(self):
        """Populate endpoints and roles with defaults if empty."""
        if not self.config.endpoints:
            self.config.endpoints = {k: v for k, v in DEFAULT_ENDPOINTS.items()}
        
        for role, assignment in DEFAULT_ROLES.items():
            if role not in self.config.roles:
                self.config.roles[role] = assignment
    
    def load_config(self, path: Optional[str] = None) -> bool:
        """Load config from JSON file."""
        path = path or self.config_path
        if not os.path.exists(path):
            return False
        
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            
            # Load endpoints
            if "endpoints" in data:
                for name, ep_data in data["endpoints"].items():
                    self.config.endpoints[name] = EndpointConfig(**ep_data)
            
            # Load roles
            if "roles" in data:
                for role_str, role_data in data["roles"].items():
                    role = ModelRole(role_str)
                    self.config.roles[role] = RoleAssignment(**role_data)
            
            if "default_role" in data:
                self.config.default_role = ModelRole(data["default_role"])
            
            self.config.config_path = path
            return True
        except Exception as e:
            print(f"Failed to load config: {e}")
            return False
    
    def save_config(self, path: Optional[str] = None):
        """Save config to JSON file."""
        path = path or self.config_path
        
        # Convert to serializable dict
        data = {
            "endpoints": {},
            "roles": {},
            "default_role": self.config.default_role.value,
        }
        
        for name, ep in self.config.endpoints.items():
            data["endpoints"][name] = asdict(ep)
        
        for role, assignment in self.config.roles.items():
            data["roles"][role.value] = asdict(assignment)
            data["roles"][role.value]["role"] = role.value
        
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.config.config_path = path
    
    # -------------------------------------------------------------------------
    # Client management
    # -------------------------------------------------------------------------
    
    def _get_client(self, endpoint_name: str, async_: bool = False) -> OpenAI:
        """Get or create OpenAI client for endpoint."""
        cache = self._async_clients if async_ else self._clients
        if endpoint_name not in cache:
            ep = self.config.endpoints.get(endpoint_name)
            if not ep:
                raise ValueError(f"Unknown endpoint: {endpoint_name}")
            
            if ep.requires_key and not ep.api_key:
                raise ValueError(f"Endpoint {endpoint_name} requires API key. Set {endpoint_name.upper()}_API_KEY env var or configure in FMCE.")
            
            client_class = AsyncOpenAI if async_ else OpenAI
            cache[endpoint_name] = client_class(
                base_url=ep.base_url,
                api_key=ep.api_key,
                timeout=60.0,
            )
        return cache[endpoint_name]
    
    def _parse_model(self, model: str) -> tuple[str, str]:
        """Parse 'endpoint/model-id' → (endpoint, model_id)."""
        if "/" not in model:
            raise ValueError(f"Model must be 'endpoint/model-id', got: {model}")
        endpoint, model_id = model.split("/", 1)
        if endpoint not in self.config.endpoints:
            raise ValueError(f"Unknown endpoint: {endpoint}. Available: {list(self.config.endpoints.keys())}")
        return endpoint, model_id
    
    def _resolve_role_model(self, role: ModelRole) -> tuple[str, RoleAssignment]:
        """Get the assigned model for a role."""
        assignment = self.config.roles.get(role)
        if not assignment:
            # Try default role
            assignment = self.config.roles.get(self.config.default_role)
        if not assignment:
            raise ValueError(f"No model assigned for role: {role}")
        return assignment.model, assignment
    
    # -------------------------------------------------------------------------
    # Chat / Completions
    # -------------------------------------------------------------------------
    
    def chat(
        self,
        message: str,
        role: Optional[ModelRole] = None,
        model: Optional[str] = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """Simple chat completion."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            role = role or self.config.default_role
            model, assignment = self._resolve_role_model(role)
            endpoint, model_id = self._parse_model(model)
            temperature = temperature or assignment.temperature
            max_tokens = max_tokens or assignment.max_tokens
        
        ep = self.config.endpoints[endpoint]
        if not ep.supports_chat:
            raise ValueError(f"Endpoint {endpoint} does not support chat")
        
        client = self._get_client(endpoint)
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": message})
        
        resp = client.chat.completions.create(
            model=model_id,
            messages=messages,
            temperature=temperature or 0.7,
            max_tokens=max_tokens or 8192,
            **kwargs
        )
        return resp.choices[0].message.content or ""
    
    async def achat(self, *args, **kwargs) -> str:
        """Async version of chat."""
        # ... similar implementation
        pass
    
    def chat_stream(
        self,
        message: str,
        role: Optional[ModelRole] = None,
        model: Optional[str] = None,
        system: Optional[str] = None,
        **kwargs
    ):
        """Streaming chat completion."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            role = role or self.config.default_role
            model, assignment = self._resolve_role_model(role)
            endpoint, model_id = self._parse_model(model)
        
        client = self._get_client(endpoint)
        
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": message})
        
        stream = client.chat.completions.create(
            model=model_id,
            messages=messages,
            stream=True,
            **kwargs
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    # -------------------------------------------------------------------------
    # Image Generation
    # -------------------------------------------------------------------------
    
    def generate_image(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: str = "512x512",
        steps: int = 4,
        **kwargs
    ) -> Any:
        """Generate image using assigned or specified model."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            model, assignment = self._resolve_role_model(ModelRole.IMAGES)
            endpoint, model_id = self._parse_model(model)
        
        ep = self.config.endpoints[endpoint]
        if not ep.supports_images:
            raise ValueError(f"Endpoint {endpoint} does not support image generation")
        
        client = self._get_client(endpoint)
        return client.images.generate(
            model=model_id,
            prompt=prompt,
            size=size,
            steps=steps,
            response_format="b64_json",
            **kwargs
        )
    
    # -------------------------------------------------------------------------
    # Embeddings
    # -------------------------------------------------------------------------
    
    def embed(self, texts: List[str], model: Optional[str] = None) -> List[List[float]]:
        """Generate embeddings."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            model, assignment = self._resolve_role_model(ModelRole.EMBEDDINGS)
            endpoint, model_id = self._parse_model(model)
        
        ep = self.config.endpoints[endpoint]
        if not ep.supports_embeddings:
            raise ValueError(f"Endpoint {endpoint} does not support embeddings")
        
        client = self._get_client(endpoint)
        resp = client.embeddings.create(model=model_id, input=texts)
        return [d.embedding for d in resp.data]
    
    # -------------------------------------------------------------------------
    # Audio (TTS/STT)
    # -------------------------------------------------------------------------
    
    def transcribe(self, audio_file: str, model: Optional[str] = None) -> str:
        """Speech to text."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            model, assignment = self._resolve_role_model(ModelRole.AUDIO_STT)
            endpoint, model_id = self._parse_model(model)
        
        ep = self.config.endpoints[endpoint]
        if not ep.supports_audio:
            raise ValueError(f"Endpoint {endpoint} does not support audio")
        
        client = self._get_client(endpoint)
        with open(audio_file, "rb") as f:
            resp = client.audio.transcriptions.create(model=model_id, file=f)
        return resp.text
    
    def speak(self, text: str, model: Optional[str] = None, voice: str = "shimmer") -> bytes:
        """Text to speech."""
        if model:
            endpoint, model_id = self._parse_model(model)
        else:
            model, assignment = self._resolve_role_model(ModelRole.AUDIO_TTS)
            endpoint, model_id = self._parse_model(model)
        
        ep = self.config.endpoints[endpoint]
        if not ep.supports_audio:
            raise ValueError(f"Endpoint {endpoint} does not support audio")
        
        client = self._get_client(endpoint)
        resp = client.audio.speech.create(model=model_id, input=text, voice=voice)
        return resp.content
    
    # -------------------------------------------------------------------------
    # Role Management (SME Configuration)
    # -------------------------------------------------------------------------
    
    def set_role(self, role: ModelRole, model: str, fallback: Optional[str] = None, **params):
        """Assign a model to a role (SME configuration)."""
        self.config.roles[role] = RoleAssignment(
            role=role,
            model=model,
            fallback=fallback,
            temperature=params.get("temperature", 0.7),
            max_tokens=params.get("max_tokens", 8192),
            extra_params={k: v for k, v in params.items() if k not in ("temperature", "max_tokens")},
        )
    
    def get_role(self, role: ModelRole) -> Optional[RoleAssignment]:
        """Get current role assignment."""
        return self.config.roles.get(role)
    
    def list_roles(self) -> Dict[ModelRole, RoleAssignment]:
        """List all role assignments."""
        return dict(self.config.roles)
    
    def suggest_models_for_role(self, role: ModelRole) -> List[str]:
        """Suggest available models for a role across all endpoints."""
        suggestions = []
        for ep_name, ep in self.config.endpoints.items():
            if self._endpoint_supports_role(ep, role):
                for model_id in ep.models.get(role, []):
                    suggestions.append(f"{ep_name}/{model_id}")
        return suggestions
    
    def _endpoint_supports_role(self, ep: EndpointConfig, role: ModelRole) -> bool:
        if role in (ModelRole.CHAT, ModelRole.CODE, ModelRole.REASONING, ModelRole.VISION):
            return ep.supports_chat
        if role == ModelRole.IMAGES:
            return ep.supports_images
        if role == ModelRole.EMBEDDINGS:
            return ep.supports_embeddings
        if role in (ModelRole.AUDIO_TTS, ModelRole.AUDIO_STT):
            return ep.supports_audio
        return False
    
    # -------------------------------------------------------------------------
    # Discovery & Status
    # -------------------------------------------------------------------------
    
    def list_endpoints(self) -> Dict[str, EndpointConfig]:
        """List all configured endpoints."""
        return dict(self.config.endpoints)
    
    def list_available_models(self, endpoint: Optional[str] = None) -> Dict[str, List[str]]:
        """Fetch available models from endpoint(s)."""
        results = {}
        endpoints = [endpoint] if endpoint else self.config.endpoints.keys()
        
        for ep_name in endpoints:
            if ep_name in self._model_cache:
                results[ep_name] = self._model_cache[ep_name]
                continue
            
            try:
                client = self._get_client(ep_name)
                resp = client.models.list()
                models = [m.id for m in resp.data]
                self._model_cache[ep_name] = models
                results[ep_name] = models
            except Exception as e:
                results[ep_name] = [f"Error: {e}"]
        
        return results
    
    def test_endpoint(self, endpoint: str) -> bool:
        """Test if endpoint is reachable."""
        try:
            client = self._get_client(endpoint)
            client.models.list()
            return True
        except Exception:
            return False
    
    def status(self) -> Dict[str, Any]:
        """Get FMCE status summary."""
        return {
            "config_path": self.config_path,
            "endpoints": {
                name: {
                    "name": ep.name,
                    "base_url": ep.base_url,
                    "is_local": ep.is_local,
                    "has_key": bool(ep.api_key) or not ep.requires_key,
                    "supports": {
                        "chat": ep.supports_chat,
                        "images": ep.supports_images,
                        "embeddings": ep.supports_embeddings,
                        "audio": ep.supports_audio,
                    },
                    "reachable": self.test_endpoint(name),
                }
                for name, ep in self.config.endpoints.items()
            },
            "roles": {
                role.value: {
                    "model": assignment.model,
                    "fallback": assignment.fallback,
                    "temperature": assignment.temperature,
                }
                for role, assignment in self.config.roles.items()
            },
        }


# =============================================================================
# CHAT SCREEN / INGEST INTERFACE
# =============================================================================

class ChatScreen:
    """
    Interactive chat interface with role awareness.
    
    Usage:
        fmce = FMCE()
        screen = ChatScreen(fmce)
        screen.run()
    """
    
    def __init__(self, fmce: FMCE):
        self.fmce = fmce
        self.history: List[Dict[str, str]] = []
        self.current_role = fmce.config.default_role
    
    def run(self):
        """Run interactive chat loop."""
        print(self._banner())
        print("Commands: /role <role>, /model <endpoint/model>, /endpoints, /roles, /save, /quit")
        print()
        
        while True:
            try:
                user_input = input(f"[{self.current_role.value}] > ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                break
            
            if not user_input:
                continue
            
            if user_input.startswith("/"):
                self._handle_command(user_input)
                continue
            
            # Regular chat
            self._chat(user_input)
    
    def _banner(self) -> str:
        return """
╔══════════════════════════════════════════════════════════════╗
║  FMCE Chat Screen — Free Model Choice Engine                 ║
║  Local-first + Cloud free tiers | BYOK supported             ║
╚══════════════════════════════════════════════════════════════╝
        """
    
    def _handle_command(self, cmd: str):
        parts = cmd.split()
        c = parts[0].lower()
        
        if c in ("/quit", "/exit", "/q"):
            raise KeyboardInterrupt()
        
        elif c == "/role":
            if len(parts) < 2:
                print(f"Current role: {self.current_role.value}")
                print(f"Available roles: {[r.value for r in ModelRole]}")
            else:
                try:
                    self.current_role = ModelRole(parts[1].lower())
                    print(f"Role set to: {self.current_role.value}")
                except ValueError:
                    print(f"Invalid role. Available: {[r.value for r in ModelRole]}")
        
        elif c == "/model":
            if len(parts) < 2:
                assignment = self.fmce.get_role(self.current_role)
                print(f"Current model for {self.current_role.value}: {assignment.model if assignment else 'none'}")
            else:
                model = parts[1]
                self.fmce.set_role(self.current_role, model)
                print(f"Set {self.current_role.value} model to: {model}")
        
        elif c == "/endpoints":
            status = self.fmce.status()
            for name, info in status["endpoints"].items():
                reachable = "✓" if info["reachable"] else "✗"
                local = " (local)" if info["is_local"] else ""
                print(f"  {reachable} {name}{local}: {info['base_url']}")
                print(f"       Chat:{info['supports']['chat']} Images:{info['supports']['images']} Embed:{info['supports']['embeddings']} Audio:{info['supports']['audio']}")
        
        elif c == "/roles":
            for role, assignment in self.fmce.list_roles().items():
                print(f"  {role.value}: {assignment.model} (fallback: {assignment.fallback or 'none'})")
        
        elif c == "/suggest":
            if len(parts) < 2:
                print("Usage: /suggest <role>")
            else:
                try:
                    role = ModelRole(parts[1].lower())
                    suggestions = self.fmce.suggest_models_for_role(role)
                    print(f"Suggested models for {role.value}:")
                    for m in suggestions[:20]:
                        print(f"  {m}")
                except ValueError:
                    print(f"Invalid role. Available: {[r.value for r in ModelRole]}")
        
        elif c == "/save":
            self.fmce.save_config()
            print(f"Config saved to {self.fmce.config_path}")
        
        elif c == "/history":
            for i, msg in enumerate(self.history):
                print(f"  {i}: [{msg['role']}] {msg['content'][:80]}...")
        
        elif c == "/help":
            print("Commands:")
            print("  /role <role>          - Set current role (chat, code, reasoning, vision, embeddings, images, audio_tts, audio_stt)")
            print("  /model <endpoint/model> - Set model for current role")
            print("  /suggest <role>       - Show suggested models for role")
            print("  /endpoints            - List configured endpoints")
            print("  /roles                - List role assignments")
            print("  /save                 - Save config to disk")
            print("  /history              - Show chat history")
            print("  /quit                 - Exit")
        
        else:
            print(f"Unknown command: {c}. Type /help for help.")
    
    def _chat(self, message: str):
        self.history.append({"role": "user", "content": message})
        
        try:
            print(f"[{self.current_role.value}] ", end="", flush=True)
            response = ""
            for chunk in self.fmce.chat_stream(message, role=self.current_role):
                print(chunk, end="", flush=True)
                response += chunk
            print()
            
            self.history.append({"role": "assistant", "content": response})
        except Exception as e:
            print(f"\nError: {e}")
            
            # Try fallback
            assignment = self.fmce.get_role(self.current_role)
            if assignment and assignment.fallback:
                print(f"Trying fallback: {assignment.fallback}...")
                try:
                    response = self.fmce.chat(message, model=assignment.fallback)
                    print(f"[{self.current_role.value}] {response}")
                    self.history.append({"role": "assistant", "content": response})
                except Exception as e2:
                    print(f"Fallback also failed: {e2}")


# =============================================================================
# CONVENIENCE FACTORY
# =============================================================================

def create_fmce(
    config_path: Optional[str] = None,
    auto_load: bool = True,
    **overrides
) -> FMCE:
    """Factory function to create FMCE with optional overrides."""
    fmce = FMCE(config_path=config_path, auto_load=auto_load)
    
    # Apply endpoint overrides (e.g., api_key="sk-...")
    for ep_name, ep_overrides in overrides.items():
        if ep_name in fmce.config.endpoints:
            ep = fmce.config.endpoints[ep_name]
            for key, value in ep_overrides.items():
                if hasattr(ep, key):
                    setattr(ep, key, value)
    
    return fmce


# =============================================================================
# MAIN / DEMO
# =============================================================================

if __name__ == "__main__":
    import sys
    
    # Quick demo
    fmce = create_fmce()
    
    print("=== FMCE Status ===")
    status = fmce.status()
    print(json.dumps(status, indent=2, default=str))
    
    print("\n=== Suggested models for REASONING ===")
    for m in fmce.suggest_models_for_role(ModelRole.REASONING):
        print(f"  {m}")
    
    print("\n=== Test chat (reasoning) ===")
    try:
        resp = fmce.chat("What is 2+2?", role=ModelRole.REASONING)
        print(f"Response: {resp}")
    except Exception as e:
        print(f"Chat failed (expected if no endpoints running): {e}")
    
    # Uncomment to run interactive chat screen:
    # screen = ChatScreen(fmce)
    # screen.run()