"""CROS — Cinematic Render Operating System (reference architecture scaffold).

Maturity (Drive-G-2, package-local):

- Constitutional model: design complete for v0.1 scope
- Governance methodology: partial (validators exist; no runtime invokes them)
- Reference implementation: skeleton
- Platform engineering: absent
- Commercial operations: absent

This package does **not** claim that any MRS application implements CROS.
``mrs/apps/genblaze-media`` is specifically out of scope: no imports, no
shared process, no Story Forge lineage.
"""

from __future__ import annotations

from cros.artifacts import CROS_VERSION, LINEAGE_ORDER
from cros.resources import PROFILE_IDS, load_invariants, load_profile, load_schema
from cros.validation import constitution_summary

__all__ = [
    "CROS_VERSION",
    "LINEAGE_ORDER",
    "PROFILE_IDS",
    "constitution_summary",
    "load_invariants",
    "load_profile",
    "load_schema",
]

__version__ = CROS_VERSION
