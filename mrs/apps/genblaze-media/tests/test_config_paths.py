"""Smoke: config path helpers are unique and Docker-layout aware."""

from __future__ import annotations

from pathlib import Path

from app.config import (
    scene_spec_default_script_path,
    validate_scene_spec_default_script_path,
)


def test_scene_spec_default_script_path_is_unique_and_docker_aware(tmp_path: Path) -> None:
    """The Docker-aware definition must win (no later monorepo-only overwrite)."""
    app_dir = tmp_path / "app"
    scripts = app_dir / "renderer-core" / "scripts"
    scripts.mkdir(parents=True)
    target = scripts / "render-scene.mjs"
    target.write_text("// docker\n", encoding="utf-8")

    # Import the resolver used by the kept definition.
    from app.config import _resolve_renderer_core_script

    resolved = _resolve_renderer_core_script(
        "render-scene.mjs",
        repo_root=app_dir,
        app_dir=app_dir,
    )
    assert resolved == target
    # Public helpers still resolve under the real monorepo when present.
    path = scene_spec_default_script_path()
    assert path.name == "render-scene.mjs"
    assert "renderer-core" in str(path).replace("\\", "/")
    validate = validate_scene_spec_default_script_path()
    assert validate.name == "validate-scene-spec.mjs"
