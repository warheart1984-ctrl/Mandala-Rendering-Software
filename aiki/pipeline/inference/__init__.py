"""Inference Provider Interface (IPI) — skeleton.

Status: skeleton. Adapters do not call networks or read secrets.
"""

from .base import InferenceProvider, InferenceRequest, InferenceResponse
from .registry import get_provider, list_provider_ids

__all__ = [
    "InferenceProvider",
    "InferenceRequest",
    "InferenceResponse",
    "get_provider",
    "list_provider_ids",
]
