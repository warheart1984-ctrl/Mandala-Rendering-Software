"""
SME-Core — Validation Engine (SME-VAL)
Constitutional Contract: contract.sme-val.v1
Authority: validate
Status: declared
"""
from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from ..auth.policies import (
    ConstitutionalKnowledgeLayer,
    EvaluationContext,
    PolicyEvaluation,
)


@dataclass
class ValidationConfig:
    """Validation configuration"""
    max_image_bytes: int = 10_485_760  # 10 MB
    max_audio_bytes: int = 52_428_800  # 50 MB
    max_video_bytes: int = 524_288_000  # 500 MB
    max_audio_seconds: float = 300.0
    max_video_seconds: float = 300.0
    max_video_frames: int = 45
    safety_threshold: float = 0.5


@dataclass
class ValidationCheck:
    """Individual validation check result"""
    check: str
    modality: str
    result: str  # "pass", "fail", "warning"
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResourceQuota:
    """Resource quota for request"""
    cpu_seconds: float = 30.0
    memory_bytes: int = 4_294_967_296  # 4 GB
    granted: bool = True
    reason: str = ""


@dataclass
class ValidationRecord:
    """Validation record for evidence"""
    validation_id: str
    intent_id: str
    checks: list[ValidationCheck]
    resource_quota: ResourceQuota
    policy_results: list[PolicyEvaluation]
    granted: bool
    timestamp: str


class ValidationEngine:
    """
    SME-VAL — Validation Engine.
    Performs input validation, safety checks, resource limits.
    Integrates CKL for policy evaluation (modify_param, attach_provenance).
    """
    
    def __init__(
        self,
        config: Optional[ValidationConfig] = None,
        ckl: Optional[ConstitutionalKnowledgeLayer] = None,
    ):
        self.config = config or ValidationConfig()
        self.ckl = ckl or ConstitutionalKnowledgeLayer()
    
    def validate(
        self,
        intent_id: str,
        modalities: list[str],
        media_data: dict[str, bytes],
        media_meta: dict[str, dict[str, Any]],
        actor: str = "user:anonymous",
    ) -> ValidationRecord:
        """
        Validate request inputs against constitutional limits.
        """
        validation_id = f"val-{uuid.uuid4().hex[:12]}"
        timestamp = datetime.utcnow().isoformat() + "Z"
        
        checks = []
        
        # Validate each modality
        for modality in modalities:
            data = media_data.get(modality, b"")
            meta = media_meta.get(modality, {})
            
            if modality == "image":
                checks.extend(self._validate_image(data, meta))
            elif modality == "audio":
                checks.extend(self._validate_audio(data, meta))
            elif modality == "video":
                checks.extend(self._validate_video(data, meta))
            elif modality == "text":
                checks.extend(self._validate_text(data, meta))
        
        # Resource quota check
        resource_quota = self._check_resource_quota(modalities, media_data, media_meta)
        
        # Policy evaluation via CKL
        context = EvaluationContext(
            intent={"intentId": intent_id, "modality": modalities},
            actor=actor,
            action="validate",
            modality=modalities[0] if modalities else "text",
            parameters={"media_sizes": {k: len(v) for k, v in media_data.items()}},
        )
        
        policy_results = self.ckl.evaluate_all(context)
        
        # Apply modifications (e.g., throttle)
        modifications = self.ckl.collect_modifications(policy_results)
        if modifications:
            # Adjust resource quota based on modifications
            if "speed_factor" in modifications:
                resource_quota.cpu_seconds *= modifications["speed_factor"]
        
        # Determine overall grant
        granted = (
            resource_quota.granted and
            all(c.result != "fail" for c in checks) and
            self.ckl.check_critical_denials(policy_results) is None
        )
        
        return ValidationRecord(
            validation_id=validation_id,
            intent_id=intent_id,
            checks=checks,
            resource_quota=resource_quota,
            policy_results=policy_results,
            granted=granted,
            timestamp=timestamp,
        )
    
    def _validate_image(
        self,
        data: bytes,
        meta: dict[str, Any],
    ) -> list[ValidationCheck]:
        """Validate image input"""
        checks = []
        
        # Size check
        if len(data) > self.config.max_image_bytes:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="image",
                result="fail",
                details={
                    "size_bytes": len(data),
                    "max_bytes": self.config.max_image_bytes,
                },
            ))
        else:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="image",
                result="pass",
                details={"size_bytes": len(data)},
            ))
        
        # Format check
        valid_formats = ["png", "jpeg", "jpg", "webp"]
        fmt = meta.get("format", "").lower().replace(".", "")
        if fmt and fmt not in valid_formats:
            checks.append(ValidationCheck(
                check="format",
                modality="image",
                result="warning",
                details={"format": fmt, "valid_formats": valid_formats},
            ))
        else:
            checks.append(ValidationCheck(
                check="format",
                modality="image",
                result="pass",
                details={"format": fmt},
            ))
        
        # Safety check (placeholder for NSFW/violence classifier)
        safety_score = self._safety_check_image(data)
        if safety_score > self.config.safety_threshold:
            checks.append(ValidationCheck(
                check="safety_classifier",
                modality="image",
                result="fail",
                details={"score": safety_score, "threshold": self.config.safety_threshold},
            ))
        else:
            checks.append(ValidationCheck(
                check="safety_classifier",
                modality="image",
                result="pass",
                details={"score": safety_score},
            ))
        
        return checks
    
    def _validate_audio(
        self,
        data: bytes,
        meta: dict[str, Any],
    ) -> list[ValidationCheck]:
        """Validate audio input"""
        checks = []
        
        # Size check
        if len(data) > self.config.max_audio_bytes:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="audio",
                result="fail",
                details={
                    "size_bytes": len(data),
                    "max_bytes": self.config.max_audio_bytes,
                },
            ))
        else:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="audio",
                result="pass",
                details={"size_bytes": len(data)},
            ))
        
        # Duration check
        duration = meta.get("duration_seconds", 0)
        if duration > self.config.max_audio_seconds:
            checks.append(ValidationCheck(
                check="duration_limit",
                modality="audio",
                result="fail",
                details={
                    "duration_seconds": duration,
                    "max_seconds": self.config.max_audio_seconds,
                },
            ))
        else:
            checks.append(ValidationCheck(
                check="duration_limit",
                modality="audio",
                result="pass",
                details={"duration_seconds": duration},
            ))
        
        # Format check
        valid_formats = ["wav", "ogg", "mp3", "flac"]
        fmt = meta.get("format", "").lower().replace(".", "")
        if fmt and fmt not in valid_formats:
            checks.append(ValidationCheck(
                check="format",
                modality="audio",
                result="warning",
                details={"format": fmt, "valid_formats": valid_formats},
            ))
        else:
            checks.append(ValidationCheck(
                check="format",
                modality="audio",
                result="pass",
                details={"format": fmt},
            ))
        
        return checks
    
    def _validate_video(
        self,
        data: bytes,
        meta: dict[str, Any],
    ) -> list[ValidationCheck]:
        """Validate video input"""
        checks = []
        
        # Size check
        if len(data) > self.config.max_video_bytes:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="video",
                result="fail",
                details={
                    "size_bytes": len(data),
                    "max_bytes": self.config.max_video_bytes,
                },
            ))
        else:
            checks.append(ValidationCheck(
                check="size_limit",
                modality="video",
                result="pass",
                details={"size_bytes": len(data)},
            ))
        
        # Duration check
        duration = meta.get("duration_seconds", 0)
        if duration > self.config.max_video_seconds:
            checks.append(ValidationCheck(
                check="duration_limit",
                modality="video",
                result="fail",
                details={
                    "duration_seconds": duration,
                    "max_seconds": self.config.max_video_seconds,
                },
            ))
        else:
            checks.append(ValidationCheck(
                check="duration_limit",
                modality="video",
                result="pass",
                details={"duration_seconds": duration},
            ))
        
        # Frame count check (estimated)
        fps = meta.get("fps", 30)
        estimated_frames = int(duration * fps)
        if estimated_frames > self.config.max_video_frames * 10:  # Before sampling
            checks.append(ValidationCheck(
                check="frame_limit",
                modality="video",
                result="warning",
                details={
                    "estimated_frames": estimated_frames,
                    "max_after_sampling": self.config.max_video_frames,
                },
            ))
        
        return checks
    
    def _validate_text(
        self,
        data: bytes,
        meta: dict[str, Any],
    ) -> list[ValidationCheck]:
        """Validate text input"""
        checks = []
        
        text = data.decode("utf-8", errors="replace")
        
        # Length check
        max_chars = 100_000
        if len(text) > max_chars:
            checks.append(ValidationCheck(
                check="length_limit",
                modality="text",
                result="fail",
                details={"length": len(text), "max": max_chars},
            ))
        else:
            checks.append(ValidationCheck(
                check="length_limit",
                modality="text",
                result="pass",
                details={"length": len(text)},
            ))
        
        # Safety check (placeholder)
        safety_score = self._safety_check_text(text)
        if safety_score > self.config.safety_threshold:
            checks.append(ValidationCheck(
                check="safety_classifier",
                modality="text",
                result="fail",
                details={"score": safety_score},
            ))
        else:
            checks.append(ValidationCheck(
                check="safety_classifier",
                modality="text",
                result="pass",
                details={"score": safety_score},
            ))
        
        return checks
    
    def _check_resource_quota(
        self,
        modalities: list[str],
        media_data: dict[str, bytes],
        media_meta: dict[str, dict[str, Any]],
    ) -> ResourceQuota:
        """Check resource quotas"""
        # Estimate CPU time based on modalities and sizes
        estimated_cpu = 0.0
        
        for modality in modalities:
            if modality == "text":
                estimated_cpu += 2.0  # Base LLM inference
            elif modality == "image":
                estimated_cpu += 0.5  # Vision encoder
            elif modality == "audio":
                estimated_cpu += 3.0  # Whisper transcription
            elif modality == "video":
                estimated_cpu += 10.0  # Frame sampling + encoding
        
        # Estimate memory
        total_bytes = sum(len(d) for d in media_data.values())
        estimated_memory = total_bytes * 10 + 1_000_000_000  # 1GB base + 10x media
        
        granted = (
            estimated_cpu <= self.config.max_image_bytes / 1_000_000 * 30 and  # Rough heuristic
            estimated_memory <= self.config.memory_bytes
        )
        
        return ResourceQuota(
            cpu_seconds=estimated_cpu,
            memory_bytes=estimated_memory,
            granted=granted,
            reason="OK" if granted else "Resource quota exceeded",
        )
    
    def _safety_check_image(self, data: bytes) -> float:
        """Safety check for images (placeholder)"""
        # In production: run NSFW/violence/PII classifier
        # Return score 0.0-1.0 (higher = more unsafe)
        return 0.0
    
    def _safety_check_text(self, text: str) -> float:
        """Safety check for text (placeholder)"""
        # In production: run content safety classifier
        return 0.0


if __name__ == "__main__":
    # Demo
    engine = ValidationEngine()
    
    record = engine.validate(
        intent_id="test-123",
        modalities=["text", "image"],
        media_data={
            "text": b"Hello world",
            "image": b"fake_image_data" * 1000,
        },
        media_meta={
            "text": {},
            "image": {"format": "png"},
        },
    )
    
    print(f"Validation: {record.validation_id}")
    print(f"Granted: {record.granted}")
    for check in record.checks:
        print(f"  {check.check} ({check.modality}): {check.result}")
    print(f"CPU: {record.resource_quota.cpu_seconds:.1f}s, Mem: {record.resource_quota.memory_bytes/1e9:.1f}GB")