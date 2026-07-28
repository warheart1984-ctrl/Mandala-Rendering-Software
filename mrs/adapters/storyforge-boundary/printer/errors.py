"""Print error state machine — fail loudly on surface gaps.

STATUS: **enforced** (unit tests in test_printer_mode.py).
"""

from __future__ import annotations

from enum import Enum
from typing import Any


class PrintErrorState(str, Enum):
    OK = "OK"
    SURFACE_MISSING = "SURFACE_MISSING"
    SURFACE_INVALID = "SURFACE_INVALID"
    AOV_MISMATCH = "AOV_MISMATCH"
    SCENESPEC_GAP = "SCENESPEC_GAP"
    ENGINE3D_BOUNDARY_FAIL = "ENGINE3D_BOUNDARY_FAIL"
    GENBLAZE_SMOKE_FAIL = "GENBLAZE_SMOKE_FAIL"


class PrintError(RuntimeError):
    """Loud print failure with machine-readable state."""

    def __init__(self, state: PrintErrorState, message: str):
        if state == PrintErrorState.OK:
            raise ValueError("PrintError cannot use OK state")
        self.state = state
        super().__init__(f"{state.value}: {message}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "printState": self.state.value,
            "code": self.state.value,
            "message": str(self).split(": ", 1)[-1],
        }


def assert_ok(state: PrintErrorState, message: str = "") -> None:
    if state != PrintErrorState.OK:
        raise PrintError(state, message or state.value)
