"""
SME-VIS — Vision Module Interface (SME-VIS-IFC)
Constitutional Contract: contract.sme-vis.v1
Authority: encode
Status: declared
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from ..encoder.onnx_encoder import (
    VisionEncoder,
    VisionEncoderFactory,
    VisionModelMetadata,
    VisionModelName,
    OrtVisionConfig,
)
from ..preprocess.pipeline import ImagePreprocessor, PreprocessorFactory


@dataclass
class ImgRaw:
    """Raw image input"""
    data: bytes
    format: str  # "png", "jpeg", "webp"
    source: str = "upload"


@dataclass
class ImgMeta:
    """Image metadata"""
    width: int
    height: int
    color_space: str = "RGB"
    source: str = "unknown"
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class VisEmbed:
    """Vision embedding output"""
    embedding: np.ndarray  # [512] or [B, 512]
    evidence: dict[str, Any]


@dataclass
class VisFeatures:
    """Optional extracted features"""
    tags: list[str] = field(default_factory=list)
    attributes: dict[str, float] = field(default_factory=dict)
    objects: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class VisEvidence:
    """Vision evidence for audit trail"""
    evidence_id: str
    image_hash: str
    model_metadata: dict[str, Any]
    preprocessing: dict[str, Any]
    embedding_shape: list[int]
    latency_ms: float
    timestamp: str


@dataclass
class VisEncodeRequest:
    """Request to encode image"""
    image: ImgRaw
    metadata: Optional[ImgMeta] = None
    extract_features: bool = False
    safety_check: bool = True


@dataclass
class VisEncodeResponse:
    """Response from vision encoding"""
    embed: VisEmbed
    features: Optional[VisFeatures] = None
    evidence: VisEvidence = None


class SmeVisIFC:
    """
    SME-VIS Interface Implementation.
    Constitutional vision encoder with ONNXRuntime backend.
    """
    
    def __init__(
        self,
        models_dir: Path,
        default_model: VisionModelName = VisionModelName.MOBILEVIT_XXS,
        cache_dir: Path = Path("./cache"),
    ):
        self.models_dir = Path(models_dir)
        self.default_model = default_model
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Factory and active encoder
        self.factory = VisionEncoderFactory(self.models_dir)
        self.preprocessor_factory = PreprocessorFactory()
        self._encoder: Optional[VisionEncoder] = None
        self._current_model: Optional[VisionModelName] = None
    
    def load_model(
        self,
        model_name: Optional[VisionModelName] = None,
        config: Optional[OrtVisionConfig] = None,
    ) -> VisionModelMetadata:
        """Load vision encoder model"""
        model_name = model_name or self.default_model
        
        if self._encoder is not None and self._current_model == model_name:
            return self._encoder.metadata
        
        if self._encoder:
            self._encoder.unload()
        
        self._encoder = self.factory.create(model_name, config)
        self._current_model = model_name
        
        return self._encoder.metadata
    
    def unload_model(self) -> None:
        """Unload current model"""
        if self._encoder:
            self._encoder.unload()
            self._encoder = None
        self._current_model = None
    
    def encode(
        self,
        request: VisEncodeRequest,
        intent_id: Optional[str] = None,
    ) -> VisEncodeResponse:
        """
        Encode image to embedding with constitutional evidence.
        """
        if not self._encoder:
            self.load_model()
        
        intent_id = intent_id or str(uuid.uuid4())
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        # Load and preprocess image
        preprocessor = self.preprocessor_factory.create(self._current_model.value)
        image_tensor, preprocess_evidence = preprocessor.preprocess(request.image.data)
        
        # Safety check (placeholder - integrate with SME-VAL)
        safety_score = 0.0
        if request.safety_check:
            safety_score = self._safety_check(image_tensor)
            if safety_score > 0.5:
                # Would raise or route to validation per SME-VIS-CON
                pass
        
        # Encode
        embedding, encode_evidence = self._encoder.encode(image_tensor)
        
        # Compute image hash for evidence
        import hashlib
        image_hash = hashlib.sha256(request.image.data).hexdigest()
        
        # Extract features if requested
        features = None
        if request.extract_features:
            features = self._extract_features(embedding)
        
        # Build evidence
        evidence = VisEvidence(
            evidence_id=f"ev-vis-{uuid.uuid4().hex[:12]}",
            image_hash=image_hash,
            model_metadata=self._encoder.metadata.to_evidence_dict(),
            preprocessing=preprocess_evidence,
            embedding_shape=list(embedding.shape),
            latency_ms=encode_evidence["latency_ms"],
            timestamp=timestamp,
        )
        
        response = VisEncodeResponse(
            embed=VisEmbed(
                embedding=embedding,
                evidence=encode_evidence,
            ),
            features=features,
            evidence=evidence,
        )
        
        return response
    
    def encode_batch(
        self,
        images: list[ImgRaw],
        metadata_list: Optional[list[ImgMeta]] = None,
        intent_id: Optional[str] = None,
    ) -> list[VisEncodeResponse]:
        """Encode batch of images"""
        if not self._encoder:
            self.load_model()
        
        preprocessor = self.preprocessor_factory.create(self._current_model.value)
        image_tensors = []
        preprocess_evidences = []
        
        for img in images:
            tensor, evidence = preprocessor.preprocess(img.data)
            image_tensors.append(tensor)
            preprocess_evidences.append(evidence)
        
        batch = np.concatenate(image_tensors, axis=0)
        embeddings, encode_evidence = self._encoder.encode(batch)
        
        responses = []
        for i, (img, preproc_ev) in enumerate(zip(images, preprocess_evidences)):
            import hashlib
            image_hash = hashlib.sha256(img.data).hexdigest()
            
            evidence = VisEvidence(
                evidence_id=f"ev-vis-{uuid.uuid4().hex[:12]}",
                image_hash=image_hash,
                model_metadata=self._encoder.metadata.to_evidence_dict(),
                preprocessing=preproc_ev,
                embedding_shape=[embeddings.shape[-1]],
                latency_ms=encode_evidence["latency_ms"] / len(images),
                timestamp=datetime.utcnow().isoformat() + "Z",
            )
            
            responses.append(VisEncodeResponse(
                embed=VisEmbed(
                    embedding=embeddings[i:i+1],
                    evidence=encode_evidence,
                ),
                evidence=evidence,
            ))
        
        return responses
    
    def _safety_check(self, image_tensor: np.ndarray) -> float:
        """
        Safety check for image content.
        Placeholder - integrate with actual safety classifier.
        Returns score 0.0-1.0 (higher = more unsafe).
        """
        # In production: run NSFW/violence/PII classifier
        return 0.0
    
    def _extract_features(self, embedding: np.ndarray) -> VisFeatures:
        """
        Extract semantic features from embedding.
        Placeholder - integrate with feature classifier.
        """
        # In production: run lightweight classifier on embedding
        return VisFeatures(
            tags=[],
            attributes={},
            objects=[],
        )
    
    def project_to_llm(
        self,
        embedding: np.ndarray,
        d_llm: int,
    ) -> np.ndarray:
        """
        Project vision embedding to LLM token space.
        VIS_TOKEN = W_proj · VIS_EMBED
        
        This would use a learned projection matrix W_proj ∈ ℝ^{d_LLM × 512}
        quantized to Q4 per Appendix H §1.2.
        """
        # In production: load and apply Q4 projection matrix
        if embedding.shape[-1] == d_llm:
            return embedding
        elif embedding.shape[-1] > d_llm:
            return embedding[..., :d_llm]
        else:
            pad_width = [(0, 0)] * (embedding.ndim - 1) + [(0, d_llm - embedding.shape[-1])]
            return np.pad(embedding, pad_width, mode="constant")
    
    @property
    def current_model(self) -> Optional[VisionModelName]:
        return self._current_model
    
    @property
    def embedding_dim(self) -> int:
        return 512  # Fixed per Appendix H §1.2


def create_vis_ifc(
    models_dir: Path,
    model: VisionModelName = VisionModelName.MOBILEVIT_XXS,
) -> SmeVisIFC:
    """Factory function to create SME-VIS IFC"""
    return SmeVisIFC(models_dir, model)


if __name__ == "__main__":
    # Demo
    models_dir = Path("./models")
    ifc = create_vis_ifc(models_dir, VisionModelName.MOBILEVIT_XXS)
    
    try:
        meta = ifc.load_model()
        print(f"Loaded: {meta.name}")
        print(f"  Params: {meta.parameter_count/1e6:.1f}M")
        print(f"  Embedding dim: {meta.embedding_dim}")
        
        # Create test image
        from PIL import Image
        test_img = Image.new("RGB", (224, 224), color="blue")
        
        # Encode
        import io
        buf = io.BytesIO()
        test_img.save(buf, format="PNG")
        
        request = VisEncodeRequest(
            image=ImgRaw(data=buf.getvalue(), format="png"),
            metadata=ImgMeta(width=224, height=224),
        )
        
        response = ifc.encode(request)
        print(f"\nEmbedding shape: {response.embed.embedding.shape}")
        print(f"Evidence ID: {response.evidence.evidence_id}")
        print(f"Latency: {response.evidence.latency_ms:.1f}ms")
        
    except FileNotFoundError as e:
        print(f"Model not found: {e}")
    except Exception as e:
        print(f"Error: {e}")