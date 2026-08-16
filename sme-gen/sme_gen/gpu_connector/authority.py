"""
SME-GEN — Governed GPU Connector
Constitutional Contract: contract.sme-gen.v1
Authority: generate
Status: declared
"""
from __future__ import annotations

import uuid
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np


@dataclass
class AuthorityGrant:
    """Authorization for GPU generation"""
    grant_id: str
    intent_id: str
    modality: str  # "image", "audio", "video"
    model: str
    max_steps: int
    max_resolution: tuple[int, int]
    expires_at: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class GPUOffloadRequest:
    """Request for GPU offload"""
    prompt: str
    negative_prompt: str = ""
    modality: str = "image"
    model: str = "sdxl"
    steps: int = 20
    guidance_scale: float = 7.5
    width: int = 512
    height: int = 512
    seed: int = 42
    authority_grant: Optional[AuthorityGrant] = None


@dataclass
class GPUOffloadResponse:
    """Response from GPU offload"""
    artifact_path: Path
    evidence: dict[str, Any]


class GPUConnector:
    """
    Governed GPU offload connector.
    Requires explicit AuthorityGrant from SME-Core.
    Supports NVIDIA NIM, local GPU containers, or cloud endpoints.
    """
    
    def __init__(
        self,
        endpoint: str,
        auth_token: Optional[str] = None,
        timeout: int = 300,
    ):
        self.endpoint = endpoint
        self.auth_token = auth_token
        self.timeout = timeout
    
    def generate(
        self,
        request: GPUOffloadRequest,
    ) -> GPUOffloadResponse:
        """
        Offload generation to GPU endpoint.
        Requires valid AuthorityGrant.
        """
        if not request.authority_grant:
            raise PermissionError(
                "GPU generation requires explicit AuthorityGrant from SME-Core"
            )
        
        # Validate grant
        self._validate_grant(request.authority_grant, request)
        
        start = time.perf_counter()
        
        # In production: call NIM API, local GPU container, or cloud endpoint
        # This is a placeholder
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            output_path = Path(tmp.name)
        
        # Create placeholder image
        from PIL import Image
        img = Image.new("RGB", (request.width, request.height), color="gray")
        img.save(output_path)
        
        latency_s = time.perf_counter() - start
        
        evidence = {
            "endpoint": self.endpoint,
            "model": request.model,
            "modality": request.modality,
            "authority_grant_id": request.authority_grant.grant_id,
            "prompt": request.prompt,
            "steps": request.steps,
            "guidance_scale": request.guidance_scale,
            "resolution": [request.width, request.height],
            "seed": request.seed,
            "latency_seconds": latency_s,
            "note": "Placeholder - implement actual GPU endpoint call",
        }
        
        return GPUOffloadResponse(
            artifact_path=output_path,
            evidence=evidence,
        )
    
    def _validate_grant(
        self,
        grant: AuthorityGrant,
        request: GPUOffloadRequest,
    ) -> None:
        """Validate authority grant matches request"""
        from datetime import datetime, timezone
        
        # Check expiration
        expires = datetime.fromisoformat(grant.expires_at.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > expires:
            raise PermissionError(f"Authority grant expired: {grant.grant_id}")
        
        # Check modality
        if grant.modality != request.modality:
            raise PermissionError(
                f"Grant modality {grant.modality} != request {request.modality}"
            )
        
        # Check model
        if grant.model != request.model:
            raise PermissionError(
                f"Grant model {grant.model} != request {request.model}"
            )
        
        # Check steps
        if request.steps > grant.max_steps:
            raise PermissionError(
                f"Steps {request.steps} exceeds grant max {grant.max_steps}"
            )
        
        # Check resolution
        if request.width > grant.max_resolution[0] or request.height > grant.max_resolution[1]:
            raise PermissionError(
                f"Resolution {request.width}x{request.height} exceeds grant max "
                f"{grant.max_resolution[0]}x{grant.max_resolution[1]}"
            )


class NIMConnector(GPUConnector):
    """NVIDIA NIM API connector"""
    
    def generate(self, request: GPUOffloadRequest) -> GPUOffloadResponse:
        # Validate grant
        self._validate_grant(request.authority_grant, request)
        
        # In production: call NIM API
        # headers = {"Authorization": f"Bearer {self.auth_token}"}
        # payload = {"prompt": request.prompt, ...}
        # response = requests.post(f"{self.endpoint}/v1/generate", json=payload, headers=headers)
        
        return super().generate(request)


class LocalGPUConnector(GPUConnector):
    """Local GPU container connector (Docker/Podman)"""

    def __init__(
        self,
        container_image: str,
        gpu_ids: list[int] = None,
        **kwargs,
    ):
        super().__init__("local", **kwargs)
        self.container_image = container_image
        self.gpu_ids = gpu_ids or [0]
    
    def generate(self, request: GPUOffloadRequest) -> GPUOffloadResponse:
        self._validate_grant(request.authority_grant, request)
        
        # In production: run docker with --gpus
        # docker run --gpus '"device=0"' ${container_image} generate ...
        
        return super().generate(request)


class LemonadeConnector(GPUConnector):
    """
    Governed GPU offload via Lemonade Server (OpenAI-compatible images API).

    Posts to <endpoint>/api/v1/images/generations and decodes the returned
    base64 image artifact. Requires an explicit AuthorityGrant from SME-Core.
    """

    def __init__(
        self,
        endpoint: str = "http://127.0.0.1:13307",
        model: str = "Anything-V5",
        auth_token: Optional[str] = None,
        timeout: int = 600,
    ):
        super().__init__(endpoint, auth_token=auth_token, timeout=timeout)
        self.model = model

    def generate(self, request: GPUOffloadRequest) -> GPUOffloadResponse:
        self._validate_grant(request.authority_grant, request)

        import base64
        import json

        import requests

        start = time.perf_counter()

        url = f"{self.endpoint}/api/v1/images/generations"
        payload = {
            "model": self.model,
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "size": f"{request.width}x{request.height}",
            "steps": request.steps,
            "cfg_scale": request.guidance_scale,
            "n": 1,
            "response_format": "b64_json",
        }
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        resp = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
        resp.raise_for_status()

        data = resp.json()
        items = data.get("data", [])
        if not items:
            raise RuntimeError(f"Lemonade returned no images: {data}")

        b64 = items[0].get("b64_json") or items[0].get("url")
        if b64 is None:
            raise RuntimeError(f"Lemonade image has no b64_json/url: {items[0]}")

        if isinstance(b64, str) and b64.startswith("http"):
            img_bytes = requests.get(b64, timeout=self.timeout).content
        else:
            img_bytes = base64.b64decode(b64)

        import tempfile
        with tempfile.NamedTemporaryFile(
            suffix=".png", prefix=f"gen_{request.seed}_", delete=False
        ) as tmp:
            output_path = Path(tmp.name)
        output_path.write_bytes(img_bytes)

        latency_s = time.perf_counter() - start

        evidence = {
            "endpoint": self.endpoint,
            "backend": "lemonade",
            "model": request.model,
            "modality": request.modality,
            "authority_grant_id": request.authority_grant.grant_id,
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "steps": request.steps,
            "guidance_scale": request.guidance_scale,
            "resolution": [request.width, request.height],
            "seed": request.seed,
            "latency_seconds": round(latency_s, 3),
            "bytes": len(img_bytes),
        }

        return GPUOffloadResponse(
            artifact_path=output_path,
            evidence=evidence,
        )


def create_authority_grant(
    intent_id: str,
    modality: str,
    model: str,
    max_steps: int = 20,
    max_resolution: tuple[int, int] = (512, 512),
    ttl_seconds: int = 300,
) -> AuthorityGrant:
    """Create an authority grant for GPU generation"""
    from datetime import datetime, timedelta
    
    return AuthorityGrant(
        grant_id=f"grant-{uuid.uuid4().hex[:12]}",
        intent_id=intent_id,
        modality=modality,
        model=model,
        max_steps=max_steps,
        max_resolution=max_resolution,
        expires_at=(datetime.utcnow() + timedelta(seconds=ttl_seconds)).isoformat() + "Z",
    )


if __name__ == "__main__":
    # Demo
    grant = create_authority_grant(
        intent_id="test-intent",
        modality="image",
        model="sdxl",
        max_steps=20,
        max_resolution=(512, 512),
    )
    print(f"Grant: {grant.grant_id}")
    print(f"Expires: {grant.expires_at}")