"""Regression: Genblaze static UI inline script must parse and POST generate."""

from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

STATIC_INDEX = Path(__file__).resolve().parents[1] / "app" / "static" / "index.html"

# Merge-corruption markers that previously aborted the entire script block.
CORRUPT_NESTED_STATUS = "MRS full-frame path trace"
CORRUPT_DUP_BODY = "const body = { render: true };"


def _inline_script_body(html: str) -> str:
    match = re.search(r"<script>(.*?)</script>", html, flags=re.DOTALL | re.IGNORECASE)
    assert match is not None, "expected an inline script block in static/index.html"
    return match.group(1)


def test_static_index_inline_script_parses_and_posts_generate() -> None:
    html = STATIC_INDEX.read_text(encoding="utf-8")
    script = _inline_script_body(html)

    assert 'fetch("/api/generate"' in script
    assert "ev.preventDefault()" in script

    assert CORRUPT_NESTED_STATUS not in script
    # Duplicate body without quality was left after a nested setStatus merge; reject that alone.
    assert CORRUPT_DUP_BODY not in script
    # Quality path must keep the intended body shape.
    assert "const body = { render: true, quality };" in script

    if shutil.which("node") is None:
        pytest.skip("node not available for --check")

    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".js",
        encoding="utf-8",
        delete=False,
    ) as tmp:
        tmp.write(script)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["node", "--check", tmp_path],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    assert result.returncode == 0, (
        "node --check failed:\n" + (result.stdout or "") + "\n" + (result.stderr or "")
    )