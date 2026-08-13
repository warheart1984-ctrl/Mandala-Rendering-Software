"""Axiom-X Tuning Cache — persistent storage for workgroup autotuning decisions.

STATUS: **partial** — JSON file backend; SQLite/Redis declared for multi-process.

Stores tuning evidence with full provenance so decisions are auditable and replayable.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .tuning_key import TuningKey


@dataclass
class CandidateResult:
    """Result for a single workgroup candidate."""
    workgroup_size: List[int]  # e.g., [64], [16, 16], [8, 8, 4]
    median_ns: float
    mean_ns: float
    min_ns: float
    max_ns: float
    p95_ns: float
    stddev_ns: float
    samples: int
    warmup_samples: int
    outlier_rejected: int
    # Evidence
    raw_times_ns: List[float] = field(default_factory=list)
    raw_warmup_ns: List[float] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "CandidateResult":
        return cls(**d)


@dataclass
class TuningEvidence:
    """Complete evidence record for a tuning decision."""
    tuning_key: TuningKey
    candidates: List[CandidateResult]
    selected_workgroup: List[int]
    selection_policy: str  # "MIN_MEDIAN_RUNTIME" | "MIN_MEAN_RUNTIME" | "MIN_P95_RUNTIME"
    timestamp: str
    runtime_fingerprint: str  # hash of tuner version + selection logic
    # Metadata
    benchmark_duration_ms: float
    device_temperature_c: Optional[float] = None
    power_draw_w: Optional[float] = None
    notes: str = ""

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["tuning_key"] = json.loads(self.tuning_key.to_json())
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TuningEvidence":
        from .tuning_key import TuningKey
        tk = TuningKey.from_json(json.dumps(d["tuning_key"]))
        candidates = [CandidateResult.from_dict(c) for c in d["candidates"]]
        return cls(
            tuning_key=tk,
            candidates=candidates,
            selected_workgroup=d["selected_workgroup"],
            selection_policy=d["selection_policy"],
            timestamp=d["timestamp"],
            runtime_fingerprint=d["runtime_fingerprint"],
            benchmark_duration_ms=d["benchmark_duration_ms"],
            device_temperature_c=d.get("device_temperature_c"),
            power_draw_w=d.get("power_draw_w"),
            notes=d.get("notes", ""),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    def save(self, path: Path) -> None:
        path.write_text(self.to_json())

    @classmethod
    def load(cls, path: Path) -> "TuningEvidence":
        return cls.from_dict(json.loads(path.read_text()))


class TuningCache:
    """Persistent cache for workgroup tuning decisions.

    Backend: JSON files in a directory tree keyed by TuningKey.cache_key().
    Each entry is a TuningEvidence record.
    """

    def __init__(self, cache_dir: Path, enable: bool = True):
        self.cache_dir = Path(cache_dir)
        self.enable = enable
        if enable:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _entry_path(self, key: str) -> Path:
        # Two-level sharding for filesystem performance
        return self.cache_dir / key[:2] / f"{key}.json"

    def get(self, tuning_key: TuningKey) -> Optional[TuningEvidence]:
        """Retrieve cached tuning evidence, or None if miss."""
        if not self.enable:
            return None
        key = tuning_key.cache_key()
        path = self._entry_path(key)
        if not path.exists():
            return None
        try:
            return TuningEvidence.load(path)
        except Exception:
            # Corrupted cache entry — treat as miss
            return None

    def put(self, evidence: TuningEvidence) -> None:
        """Store tuning evidence."""
        if not self.enable:
            return
        key = evidence.tuning_key.cache_key()
        path = self._entry_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Atomic write
        tmp = path.with_suffix(".tmp")
        evidence.save(tmp)
        tmp.replace(path)

    def has(self, tuning_key: TuningKey) -> bool:
        """Check if cache has entry (without loading full evidence)."""
        if not self.enable:
            return False
        key = tuning_key.cache_key()
        return self._entry_path(key).exists()

    def list_entries(self) -> List[str]:
        """List all cache keys."""
        keys = []
        if not self.cache_dir.exists():
            return keys
        for subdir in self.cache_dir.iterdir():
            if subdir.is_dir():
                for f in subdir.glob("*.json"):
                    keys.append(f.stem)
        return keys

    def clear(self) -> int:
        """Clear all cache entries. Returns count removed."""
        count = 0
        for key in self.list_entries():
            path = self._entry_path(key)
            try:
                path.unlink()
                count += 1
            except Exception:
                pass
        return count

    def stats(self) -> Dict[str, Any]:
        """Cache statistics."""
        keys = self.list_entries()
        total_size = sum(self._entry_path(k).stat().st_size for k in keys)
        return {
            "entries": len(keys),
            "total_bytes": total_size,
            "cache_dir": str(self.cache_dir),
        }


# Runtime fingerprint for evidence provenance
def compute_runtime_fingerprint() -> str:
    """Hash of the tuner implementation for reproducibility."""
    import inspect
    from . import workgroup_tuner, benchmark_workgroups
    sources = [
        inspect.getsource(workgroup_tuner),
        inspect.getsource(benchmark_workgroups),
    ]
    combined = "\n".join(sources).encode("utf-8")
    return f"sha256:{hashlib.sha256(combined).hexdigest()[:32]}"