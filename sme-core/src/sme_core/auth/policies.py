"""
SME-Core — Constitutional Knowledge Layer (CKL) — Policy evaluation engine for constitutional governance.
This is a re-export from the governance module for backwards compatibility.
"""
from __future__ import annotations

from ..governance import (
    Policy,
    PolicyEvaluation,
    EvaluationContext,
    ConstitutionalKnowledgeLayer,
)

__all__ = [
    "Policy",
    "PolicyEvaluation",
    "EvaluationContext",
    "ConstitutionalKnowledgeLayer",
]