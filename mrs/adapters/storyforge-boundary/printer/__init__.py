"""MRS Digital Printer mode — deterministic print of declared surfaces.

Governing invariant: Rendering = deterministic printing of declared surfaces.
No SF Story→PromptSpec inside MRS.
"""

from printer.errors import PrintError, PrintErrorState, assert_ok
from printer.evidence import write_evidence_bundle
from printer.pipeline import run_digital_print
from printer.print_request import normalize_print_request, apply_print_request_to_render_request
from printer.sovereignty import check_render_request_surfaces, load_surface_contract

__all__ = [
    "PrintError",
    "PrintErrorState",
    "assert_ok",
    "write_evidence_bundle",
    "run_digital_print",
    "normalize_print_request",
    "apply_print_request_to_render_request",
    "check_render_request_surfaces",
    "load_surface_contract",
]
