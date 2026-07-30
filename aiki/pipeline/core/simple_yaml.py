"""Tiny YAML subset loader for AIKI CKOs when PyYAML is absent. Status: skeleton."""
from __future__ import annotations

from pathlib import Path
from typing import Any


def load_mapping(path: Path) -> dict[str, Any]:
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except ImportError:
        return _minimal_load(path.read_text(encoding="utf-8"))


def _minimal_load(text: str) -> dict[str, Any]:
    """Parse a shallow subset: top-level scalars + a few nested blocks used by validators."""
    result: dict[str, Any] = {}
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        if line.startswith(" ") or line.startswith("\t"):
            i += 1
            continue
        if ":" not in line:
            i += 1
            continue
        key, _, rest = line.partition(":")
        key = key.strip()
        rest = rest.strip().strip('"').strip("'")
        if rest:
            result[key] = rest
            i += 1
            continue
        # nested block
        if key == "pedagogy":
            pedagogy: dict[str, Any] = {}
            i += 1
            while i < len(lines) and (lines[i].startswith("  ") or not lines[i].strip() or lines[i].lstrip().startswith("#")):
                sub = lines[i]
                i += 1
                if not sub.strip() or sub.lstrip().startswith("#"):
                    continue
                if not sub.startswith("  "):
                    i -= 1
                    break
                if sub.startswith("  ") and not sub.startswith("    ") and ":" in sub:
                    sk, _, sv = sub.strip().partition(":")
                    sv = sv.strip()
                    if sk == "learning_objectives":
                        objs = []
                        while i < len(lines) and lines[i].startswith("    -"):
                            objs.append(lines[i].split("-", 1)[1].strip().strip('"').strip("'"))
                            i += 1
                        pedagogy[sk] = objs
                    elif sk == "narrative_arc":
                        arc: dict[str, Any] = {}
                        while i < len(lines) and lines[i].startswith("    "):
                            al = lines[i]
                            i += 1
                            if al.strip().startswith("hook:"):
                                arc["hook"] = al.split(":", 1)[1].strip().strip('"').strip("'")
                            elif al.strip().startswith("sections:"):
                                arc["sections"] = []
                        pedagogy[sk] = arc
                    elif sv:
                        pedagogy[sk] = sv.strip('"').strip("'")
            result["pedagogy"] = pedagogy
            continue
        if key in ("formats", "status"):
            block: dict[str, Any] = {}
            i += 1
            while i < len(lines) and (lines[i].startswith("  ") or not lines[i].strip()):
                sub = lines[i]
                i += 1
                if not sub.strip():
                    continue
                if not sub.startswith("  "):
                    i -= 1
                    break
                if sub.startswith("  ") and not sub.startswith("    ") and ":" in sub:
                    sk, _, sv = sub.strip().partition(":")
                    sv = sv.strip().strip('"').strip("'")
                    if sv:
                        block[sk] = sv
                    elif sk == "primary":
                        items = []
                        while i < len(lines) and lines[i].startswith("    -"):
                            items.append(lines[i].split("-", 1)[1].strip().strip('"').strip("'"))
                            i += 1
                        block[sk] = items
            result[key] = block
            continue
        result[key] = {}
        i += 1
    return result
