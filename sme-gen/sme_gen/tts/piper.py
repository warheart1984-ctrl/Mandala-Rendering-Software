"""
SME-GEN — Piper TTS Wrapper
Constitutional Contract: contract.sme-gen.v1
Authority: generate
Status: declared
Mathematical Constraints (Appendix H §1.5):
- Audio generation: Feasible (<1s realtime factor)
- Piper TTS (vox-populi) ~50M params, INT8
"""
from __future__ import annotations

import hashlib
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import numpy as np


class PiperVoice(str):
    VOX_POPULI = "vox-populi"
    EN_US = "en_US-lessac-medium"
    EN_GB = "en_GB-alan-medium"


@dataclass(frozen=True)
class PiperVoiceMetadata:
    """Piper voice metadata"""
    name: str
    language: str
    quality: str  # "low", "medium", "high"
    sample_rate: int = 22050
    parameter_count: int = 50_000_000
    quantization: str = "INT8"


PIPER_VOICES = {
    PiperVoice.VOX_POPULI: PiperVoiceMetadata(
        name="vox-populi",
        language="multilingual",
        quality="medium",
        parameter_count=50_000_000,
    ),
    PiperVoice.EN_US: PiperVoiceMetadata(
        name="en_US-lessac-medium",
        language="en_US",
        quality="medium",
        parameter_count=40_000_000,
    ),
    PiperVoice.EN_GB: PiperVoiceMetadata(
        name="en_GB-alan-medium",
        language="en_GB",
        quality="medium",
        parameter_count=40_000_000,
    ),
}


@dataclass
class PiperConfig:
    """Piper TTS configuration"""
    length_scale: float = 1.0
    noise_scale: float = 0.667
    noise_w: float = 0.8
    sentence_silence: float = 0.2
    sample_rate: int = 22050


class PiperTTSWrapper:
    """
    Wrapper around Piper TTS for CPU speech synthesis.
    Uses piper-tts library or piper binary.
    """
    
    def __init__(
        self,
        voice_path: Path,
        config_path: Path,
        metadata: PiperVoiceMetadata,
        config: Optional[PiperConfig] = None,
    ):
        self.voice_path = Path(voice_path)
        self.config_path = Path(config_path)
        self.metadata = metadata
        self.config = config or PiperConfig()
        self._loaded = False
        self._piper_binary = None
    
    def load(self) -> None:
        if self._loaded:
            return
        
        # Check for piper binary
        possible_paths = [
            Path("piper"),
            Path("piper/piper"),
            Path("/usr/local/bin/piper"),
        ]
        
        for path in possible_paths:
            if path.exists() and os.access(path, os.X_OK):
                self._piper_binary = path
                break
        
        # Also try python package
        try:
            import piper
            self._piper_module = piper
        except ImportError:
            self._piper_module = None
        
        if not self._piper_binary and not self._piper_module:
            raise RuntimeError(
                "Piper TTS not found. Install piper-tts package or download piper binary."
            )
        
        if not self.voice_path.exists():
            raise FileNotFoundError(f"Voice model not found: {self.voice_path}")
        
        if not self.config_path.exists():
            raise FileNotFoundError(f"Voice config not found: {self.config_path}")
        
        self._loaded = True
    
    def unload(self) -> None:
        self._loaded = False
    
    def synthesize(
        self,
        text: str,
        output_path: Optional[Path] = None,
    ) -> tuple[np.ndarray, int, dict[str, Any]]:
        """
        Synthesize speech from text.
        
        Returns:
            audio: np.ndarray [samples] float32
            sample_rate: int
            evidence: dict
        """
        if not self._loaded:
            self.load()
        
        start = time.perf_counter()
        
        if output_path is None:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                output_path = Path(tmp.name)
            cleanup = True
        else:
            output_path = Path(output_path)
            cleanup = False
        
        try:
            if self._piper_module:
                # Use Python package
                import piper
                voice = piper.PiperVoice.load(
                    str(self.voice_path),
                    config_path=str(self.config_path),
                )
                
                audio_chunks = []
                for chunk in voice.synthesize_stream_raw(
                    text,
                    length_scale=self.config.length_scale,
                    noise_scale=self.config.noise_scale,
                    noise_w=self.config.noise_w,
                    sentence_silence=self.config.sentence_silence,
                ):
                    audio_chunks.append(chunk)
                
                audio = np.concatenate(audio_chunks).astype(np.float32) / 32768.0
                sample_rate = voice.config.sample_rate
                
            elif self._piper_binary:
                # Use binary
                import json
                with open(self.config_path) as f:
                    voice_config = json.load(f)
                sample_rate = voice_config.get("audio", {}).get("sample_rate", 22050)
                
                cmd = [
                    str(self._piper_binary),
                    "--model", str(self.voice_path),
                    "--config", str(self.config_path),
                    "--output_file", str(output_path),
                    "--length_scale", str(self.config.length_scale),
                    "--noise_scale", str(self.config.noise_scale),
                    "--noise_w", str(self.config.noise_w),
                ]
                
                # Pass text via stdin
                result = subprocess.run(
                    cmd,
                    input=text.encode(),
                    capture_output=True,
                )
                
                if result.returncode != 0:
                    raise RuntimeError(f"Piper synthesis failed: {result.stderr.decode()}")
                
                # Load generated audio
                import soundfile as sf
                audio, sr = sf.read(output_path)
                audio = audio.astype(np.float32)
                sample_rate = sr
            
            latency_s = time.perf_counter() - start
            
            # Calculate realtime factor
            audio_duration = len(audio) / sample_rate
            rtf = latency_s / audio_duration if audio_duration > 0 else 0
            
            evidence = {
                "model": {
                    "name": self.metadata.name,
                    "language": self.metadata.language,
                    "parameter_count": self.metadata.parameter_count,
                    "quantization": self.metadata.quantization,
                },
                "text": text,
                "length_scale": self.config.length_scale,
                "noise_scale": self.config.noise_scale,
                "latency_seconds": latency_s,
                "audio_duration_seconds": audio_duration,
                "realtime_factor": rtf,
                "sample_rate": sample_rate,
            }
            
            return audio, sample_rate, evidence
            
        finally:
            if cleanup and output_path.exists():
                output_path.unlink(missing_ok=True)
    
    def synthesize_to_file(
        self,
        text: str,
        output_path: Path,
    ) -> dict[str, Any]:
        """Synthesize and save to file"""
        _, _, evidence = self.synthesize(text, output_path)
        return evidence


class PiperFactory:
    """Factory for creating PiperTTSWrapper instances"""
    
    def __init__(self, models_dir: Path):
        self.models_dir = Path(models_dir)
    
    def create(
        self,
        voice_name: PiperVoice,
        config: Optional[PiperConfig] = None,
    ) -> PiperTTSWrapper:
        if voice_name not in PIPER_VOICES:
            raise ValueError(f"Unsupported voice: {voice_name}")
        
        voice_dir = self.models_dir / voice_name.value
        voice_path = voice_dir / f"{voice_name.value}.onnx"
        config_path = voice_dir / f"{voice_name.value}.onnx.json"
        
        if not voice_path.exists():
            raise FileNotFoundError(f"Voice ONNX not found: {voice_path}")
        
        if not config_path.exists():
            raise FileNotFoundError(f"Voice config not found: {config_path}")
        
        metadata = PIPER_VOICES[voice_name]
        
        return PiperTTSWrapper(voice_path, config_path, metadata, config)


if __name__ == "__main__":
    import os
    
    # Demo
    models_dir = Path("./models")
    factory = PiperFactory(models_dir)
    
    for voice in [PiperVoice.VOX_POPULI, PiperVoice.EN_US]:
        try:
            tts = factory.create(voice)
            print(f"Loaded {voice.value}: {tts.metadata.parameter_count/1e6:.0f}M params")
        except FileNotFoundError as e:
            print(f"{voice.value}: NOT FOUND - {e}")
        except Exception as e:
            print(f"{voice.value}: ERROR - {e}")