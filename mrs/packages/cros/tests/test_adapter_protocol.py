"""IRenderAdapter Protocol shape and CI-006 isolation scan."""

from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from cros.adapter import (
    AdapterCapabilities,
    EnvironmentReport,
    IRenderAdapter,
    NullRenderAdapter,
    VerifyReport,
)
from cros.validation import check_ci006_adapter_isolation, scan_module_imports


REQUIRED_METHODS = (
    "discoverCapabilities",
    "validateEnvironment",
    "compilePlan",
    "execute",
    "streamProgress",
    "collectArtifacts",
    "verify",
    "shutdown",
)


def test_protocol_declares_eight_lifecycle_methods():
    for name in REQUIRED_METHODS:
        assert hasattr(IRenderAdapter, name), name
        # Protocol members are functions.
        assert callable(getattr(IRenderAdapter, name))


def test_null_adapter_is_runtime_checkable():
    adapter = NullRenderAdapter()
    assert isinstance(adapter, IRenderAdapter)


def test_null_adapter_lifecycle_shapes():
    adapter = NullRenderAdapter()
    caps = adapter.discoverCapabilities()
    assert isinstance(caps, AdapterCapabilities)
    assert caps.adapter.id == "cros.null"
    assert "cros.gen-ai-nim" in caps.profiles

    env = adapter.validateEnvironment()
    assert isinstance(env, EnvironmentReport)
    assert env.ok

    events = list(adapter.streamProgress("exec-x"))
    assert len(events) >= 1
    assert events[0].fraction == 0.0

    report = adapter.verify({})
    assert isinstance(report, VerifyReport)
    assert report.ok is False  # null verifies nothing

    with pytest.raises(NotImplementedError):
        adapter.compilePlan({})
    with pytest.raises(NotImplementedError):
        adapter.execute({})
    with pytest.raises(NotImplementedError):
        adapter.collectArtifacts({})

    adapter.shutdown()
    assert adapter._shut_down is True


def test_method_names_are_camel_case_by_design():
    """Architecture names the contract in camelCase; do not silently PEP8-rename.

    Single-token verbs (``execute``, ``verify``, ``shutdown``) are lowercase by
    construction. Multi-token names must contain an uppercase letter so they are
    camelCase rather than snake_case.
    """
    for name in REQUIRED_METHODS:
        assert name[0].islower()
        assert "_" not in name, f"{name} must not be snake_case"
        if len(name) > 8:  # multi-token methods are longer than a single verb
            assert any(c.isupper() for c in name), f"{name} should be camelCase"


def test_cros_package_has_no_banned_imports(package_root: Path):
    result = check_ci006_adapter_isolation(
        search_roots=[package_root / "src" / "cros"],
    )
    assert result.ok, result.findings


def test_scan_detects_banned_import(tmp_path: Path):
    offender = tmp_path / "bad_adapter.py"
    offender.write_text(
        "from story_forge.runtime import something\n"
        "import genblaze\n"
        "from app.pipeline import generate_image\n",
        encoding="utf-8",
    )
    hits = scan_module_imports(
        offender,
        ("story_forge", "storyforge", "app", "genblaze", "cros.adapters"),
    )
    names = {h.name for h in hits}
    assert "story_forge.runtime" in names
    assert "genblaze" in names
    assert "app.pipeline" in names


def test_no_story_forge_string_in_src(package_root: Path):
    """Belt-and-suspenders: source must not reference story_forge at all."""
    src = package_root / "src" / "cros"
    offenders: list[str] = []
    for path in src.rglob("*.py"):
        text = path.read_text(encoding="utf-8").lower()
        # Mentions in ban-list comments are fine; import statements are not.
        # The AST scan above is authoritative; this catches stringly-typed refs
        # that would indicate Soft coupling (e.g. lazy import by name).
        if "import story_forge" in text or "from story_forge" in text:
            offenders.append(str(path))
        if "import storyforge" in text or "from storyforge" in text:
            offenders.append(str(path))
    assert not offenders


def test_protocol_is_documented():
    assert IRenderAdapter.__doc__
    assert "CI-006" in (IRenderAdapter.__doc__ or "")
    # Null adapter must not pretend to be a backend.
    assert "not a backend" in (NullRenderAdapter.__doc__ or "").lower() or \
        "test double" in (NullRenderAdapter.__doc__ or "").lower()


def test_inspect_signatures_are_present():
    for name in REQUIRED_METHODS:
        sig = inspect.signature(getattr(IRenderAdapter, name))
        assert sig is not None
