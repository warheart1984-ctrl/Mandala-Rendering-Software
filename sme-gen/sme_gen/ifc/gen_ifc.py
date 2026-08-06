"""
SME-GEN — Generative Media Module Interface (SME-GEN-IFC)
Constitutional Contract: contract.sme-gen.v1
Authority: generate
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from ..diffusion.onnx_pipeline import (
    DiffusionPipeline,
    DiffusionFactory,
    DiffusionModelName,
    DiffusionModelMetadata,
    OrtDiffusionConfig,
)
from ..tts.piper import (
    PiperTTSWrapper,
    PiperFactory,
    PiperVoice,
    PiperVoiceMetadata,
    PiperConfig,
)
from ..ffmpeg.stitch import FFmpegStitcher, VideoEncodingConfig, StitchConfig
from ..gpu_connector.authority import (
    GPUConnector,
    NIMConnector,
    LocalGPUConnector,
    AuthorityGrant,
    GPUOffloadRequest,
    create_authority_grant,
)


@dataclass
class GenRequest:
    """Generation request"""
    modality: str  # "image", "audio", "video"
    prompt: str
    negative_prompt: str = ""
    
    # Image params
    model: str = "sd15-pruned"
    steps: int = 20
    guidance_scale: float = 7.5
    width: int = 512
    height: int = 512
    seed: int = 42
    
    # Audio params
    voice: str = "vox-populi"
    length_scale: float = 1.0
    
    # Video params
    images: list[Any] = field(default_factory=list)  # PIL Images
    audio_path: Optional[Path] = None
    framerate: int = 30
    
    # Offload
    use_gpu_offload: bool = False
    authority_grant: Optional[AuthorityGrant] = None


@dataclass
class GenArtifact:
    """Generated artifact"""
    path: Path
    modality: str
    metadata: dict[str, Any]


@dataclass
class GenTrace:
    """Generation trace for evidence"""
    model: str
    modality: str
    parameters: dict[str, Any]
    seed: int
    latency_seconds: float
    device: str  # "cpu" or "gpu"
    authority_grant_id: Optional[str] = None
    offload_endpoint: Optional[str] = None


@dataclass
class GenEvidence:
    """Generation evidence"""
    evidence_id: str
    trace: GenTrace
    timestamp: str


@dataclass
class GenResponse:
    """Generation response"""
    artifact: GenArtifact
    trace: GenTrace
    evidence: GenEvidence


class SmeGenIFC:
    """
    SME-GEN Interface Implementation.
    Constitutional generative media module with CPU + governed GPU offload.
    """
    
    def __init__(
        self,
        models_dir: Path,
        cache_dir: Path = Path("./cache"),
    ):
        self.models_dir = Path(models_dir)
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Factories
        self.diffusion_factory = DiffusionFactory(self.models_dir)
        self.piper_factory = PiperFactory(self.models_dir)
        
        # Components
        self.stitcher = FFmpegStitcher()
        
        # GPU connectors (configured via environment or config)
        self.gpu_connectors: dict[str, GPUConnector] = {}
    
    def register_gpu_connector(self, name: str, connector: GPUConnector) -> None:
        """Register GPU offload connector"""
        self.gpu_connectors[name] = connector
    
    def generate(
        self,
        request: GenRequest,
        intent_id: Optional[str] = None,
    ) -> GenResponse:
        """
        Generate media with constitutional evidence.
        Enforces AuthorityGrant for GPU offload.
        """
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        start = time.perf_counter()
        
        # Route by modality
        if request.modality == "image":
            artifact, trace = self._generate_image(request, intent_id)
        elif request.modality == "audio":
            artifact, trace = self._generate_audio(request, intent_id)
        elif request.modality == "video":
            artifact, trace = self._generate_video(request, intent_id)
        else:
            raise ValueError(f"Unsupported modality: {request.modality}")
        
        latency = time.perf_counter() - start
        trace.latency_seconds = latency
        
        evidence = GenEvidence(
            evidence_id=f"ev-gen-{uuid.uuid4().hex[:12]}",
            trace=trace,
            timestamp=timestamp,
        )
        
        return GenResponse(
            artifact=artifact,
            trace=trace,
            evidence=evidence,
        )
    
    def _generate_image(
        self,
        request: GenRequest,
        intent_id: str,
    ) -> tuple[GenArtifact, GenTrace]:
        """Generate image via CPU diffusion or GPU offload"""
        use_gpu = request.use_gpu_offload and "gpu" in self.gpu_connectors
        
        if use_gpu:
            return self._generate_image_gpu(request, intent_id)
        else:
            return self._generate_image_cpu(request, intent_id)
    
    def _generate_image_cpu(
        self,
        request: GenRequest,
        intent_id: str,
    ) -> tuple[GenArtifact, GenTrace]:
        """CPU image generation via ONNX diffusion"""
        # Validate CPU budget per Appendix H §1.5
        model_name = DiffusionModelName(request.model)
        spec = DIFFUSION_MODEL_SPECS.get(model_name)
        
        if not spec:
            raise ValueError(f"Unsupported model: {request.model}")
        
        if request.steps > spec["max_steps"]:
            raise ValueError(
                f"Steps {request.steps} exceeds CPU max {spec['max_steps']} "
                f"for {request.model}"
            )
        
        pipeline = self.diffusion_factory.create(model_name)
        
        output_path = self.cache_dir / f"gen_{intent_id}_{request.seed}.png"
        
        image, diff_evidence = pipeline.generate(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            num_inference_steps=request.steps,
            guidance_scale=request.guidance_scale,
            seed=request.seed,
            width=request.width,
            height=request.height,
        )
        
        image.save(output_path)
        
        trace = GenTrace(
            model=request.model,
            modality="image",
            parameters={
                "prompt": request.prompt,
                "negative_prompt": request.negative_prompt,
                "steps": request.steps,
                "guidance_scale": request.guidance_scale,
                "width": request.width,
                "height": request.height,
            },
            seed=request.seed,
            latency_seconds=0,  # Will be set by caller
            device="cpu",
        )
        
        return GenArtifact(
            path=output_path,
            modality="image",
            metadata=diff_evidence,
        ), trace
    
    def _generate_image_gpu(
        self,
        request: GenRequest,
        intent_id: str,
    ) -> tuple[GenArtifact, GenTrace]:
        """GPU image generation via governed offload"""
        if not request.authority_grant:
            raise PermissionError("GPU generation requires AuthorityGrant")
        
        connector = self.gpu_connectors.get("gpu")
        if not connector:
            raise RuntimeError("No GPU connector registered")
        
        offload_request = GPUOffloadRequest(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            modality="image",
            model=request.model,
            steps=request.steps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed,
            authority_grant=request.authority_grant,
        )
        
        response = connector.generate(offload_request)
        
        trace = GenTrace(
            model=request.model,
            modality="image",
            parameters={
                "prompt": request.prompt,
                "steps": request.steps,
                "guidance_scale": request.guidance_scale,
                "width": request.width,
                "height": request.height,
            },
            seed=request.seed,
            latency_seconds=0,
            device="gpu",
            authority_grant_id=request.authority_grant.grant_id,
            offload_endpoint=connector.endpoint,
        )
        
        return GenArtifact(
            path=response.artifact_path,
            modality="image",
            metadata=response.evidence,
        ), trace
    
    def _generate_audio(
        self,
        request: GenRequest,
        intent_id: str,
    ) -> tuple[GenArtifact, GenTrace]:
        """Audio generation via Piper TTS (CPU)"""
        voice_name = PiperVoice(request.voice)
        tts = self.piper_factory.create(voice_name)
        
        output_path = self.cache_dir / f"gen_{intent_id}_{request.seed}.wav"
        
        tts.config.length_scale = request.length_scale
        evidence = tts.synthesize_to_file(request.prompt, output_path)
        
        trace = GenTrace(
            model=request.voice,
            modality="audio",
            parameters={
                "text": request.prompt,
                "voice": request.voice,
                "length_scale": request.length_scale,
            },
            seed=request.seed,
            latency_seconds=0,
            device="cpu",
        )
        
        return GenArtifact(
            path=output_path,
            modality="audio",
            metadata=evidence,
        ), trace
    
    def _generate_video(
        self,
        request: GenRequest,
        intent_id: str,
    ) -> tuple[GenArtifact, GenTrace]:
        """Video generation via FFmpeg stitching (CPU only)"""
        if not request.images:
            raise ValueError("Video generation requires input images")
        
        output_path = self.cache_dir / f"gen_{intent_id}_{request.seed}.mp4"
        
        evidence = self.stitcher.stitch_images(
            images=request.images,
            output_path=output_path,
            audio_path=request.audio_path,
            stitch_config=StitchConfig(framerate=request.framerate),
        )
        
        trace = GenTrace(
            model="ffmpeg",
            modality="video",
            parameters={
                "num_frames": len(request.images),
                "framerate": request.framerate,
                "has_audio": request.audio_path is not None,
            },
            seed=request.seed,
            latency_seconds=0,
            device="cpu",
        )
        
        return GenArtifact(
            path=output_path,
            modality="video",
            metadata=evidence,
        ), trace
    
    def create_authority_grant(
        self,
        intent_id: str,
        modality: str,
        model: str,
        max_steps: int = 20,
        max_resolution: tuple[int, int] = (512, 512),
    ) -> AuthorityGrant:
        """Create authority grant for GPU generation"""
        return create_authority_grant(
            intent_id=intent_id,
            modality=modality,
            model=model,
            max_steps=max_steps,
            max_resolution=max_resolution,
        )


# Need to import DIFFUSION_MODEL_SPECS
from ..diffusion.onnx_pipeline import DIFFUSION_MODEL_SPECS
import time


def create_gen_ifc(
    models_dir: Path,
) -> SmeGenIFC:
    """Factory function to create SME-GEN IFC"""
    return SmeGenIFC(models_dir)


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    ifc = create_gen_ifc(models_dir)
    
    print("SME-GEN IFC created")
    print("Register GPU connector with: ifc.register_gpu_connector('gpu', connector)")