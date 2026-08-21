"""Deterministic canonical JSON hashing for the production contract.

Status: **partial**. Detects identity drift; does not prove diffusion obedience.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

CONTRACT_VERSION = "storyforge-mandala-contract/1.1"
HASH_ALG = "sha256:canonical-json-v1"


def canonical_dumps(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def digest(obj: Any) -> str:
    return f"sha256:{sha256_hex(canonical_dumps(obj))}"
