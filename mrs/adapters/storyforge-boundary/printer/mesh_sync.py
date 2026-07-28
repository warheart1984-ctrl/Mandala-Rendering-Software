"""Verify Unity / Unreal host surface meshes match canonical engine SHA-256.

STATUS: **enforced** — print path records mesh sync verification in evidence.
Canonical source: engine/surfaces/meshes/
Hosts: unity/.../StreamingAssets/surfaces, unreal/.../Content/Surfaces
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

_BOUNDARY = Path(__file__).resolve().parents[1]
# Dual-layout: monorepo mrs/adapters/storyforge-boundary vs Docker /app/storyforge-boundary
if str(_BOUNDARY) not in sys.path:
    sys.path.insert(0, str(_BOUNDARY))
from paths import resolve_repo_root  # noqa: E402

_REPO = resolve_repo_root(_BOUNDARY)

CANONICAL_DIR = _REPO / "engine" / "surfaces" / "meshes"
HOST_DIRS = {
    "unity": _REPO
    / "unity"
    / "GovernedUnityProject"
    / "Assets"
    / "StreamingAssets"
    / "surfaces",
    "unreal": _REPO / "unreal" / "GovernedEnginePlugin" / "Content" / "Surfaces",
    "engine": CANONICAL_DIR,
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def list_mesh_files(directory: Path) -> list[str]:
    if not directory.is_dir():
        return []
    return sorted(
        p.name
        for p in directory.iterdir()
        if p.is_file() and (p.name.endswith(".mesh.json") or p.name == "index.json")
    )


def verify_host_mesh_sync(*, require_hosts: bool = True) -> dict[str, Any]:
    """Compare host mesh file SHA-256 to canonical engine/surfaces/meshes.

    Returns a report with statusTag **enforced** when all present hosts match.
    """
    if not CANONICAL_DIR.is_dir():
        return {
            "ok": False,
            "statusTag": "declared",
            "error": f"canonical mesh dir missing: {CANONICAL_DIR}",
            "hosts": {},
        }

    canonical_files = list_mesh_files(CANONICAL_DIR)
    canonical_hashes = {
        name: sha256_file(CANONICAL_DIR / name) for name in canonical_files
    }

    hosts: dict[str, Any] = {}
    mismatches: list[str] = []
    missing_hosts: list[str] = []

    for host, path in HOST_DIRS.items():
        if host == "engine":
            hosts[host] = {
                "path": str(path.as_posix()),
                "fileCount": len(canonical_files),
                "matched": True,
                "hashes": canonical_hashes,
            }
            continue
        if not path.is_dir():
            missing_hosts.append(host)
            hosts[host] = {
                "path": str(path.as_posix()),
                "present": False,
                "matched": False,
            }
            continue
        host_files = list_mesh_files(path)
        file_results: dict[str, Any] = {}
        matched = True
        for name, chash in canonical_hashes.items():
            hp = path / name
            if not hp.is_file():
                matched = False
                mismatches.append(f"{host}:{name}:missing")
                file_results[name] = {"ok": False, "reason": "missing"}
                continue
            hhash = sha256_file(hp)
            ok = hhash == chash
            if not ok:
                matched = False
                mismatches.append(f"{host}:{name}:sha_mismatch")
            file_results[name] = {
                "ok": ok,
                "sha256": hhash,
                "canonicalSha256": chash,
            }
        extra = [n for n in host_files if n not in canonical_hashes]
        hosts[host] = {
            "path": str(path.as_posix()),
            "present": True,
            "matched": matched and not extra,
            "files": file_results,
            "extraFiles": extra,
        }

    if require_hosts and missing_hosts:
        ok = False
        status = "partial"
        note = f"host dirs missing: {', '.join(missing_hosts)}"
    elif mismatches:
        ok = False
        status = "partial"
        note = f"sha mismatches: {len(mismatches)}"
    else:
        ok = True
        status = "enforced"
        note = (
            "Unity + Unreal StreamingAssets/Content mesh SHA-256 match "
            "engine/surfaces/meshes canonical set."
        )

    return {
        "ok": ok,
        "statusTag": status,
        "note": note,
        "canonicalDir": str(CANONICAL_DIR.as_posix()),
        "canonicalFileCount": len(canonical_files),
        "canonicalHashes": canonical_hashes,
        "hosts": hosts,
        "mismatches": mismatches,
        "missingHosts": missing_hosts,
    }


def write_mesh_sync_report(out_dir: Path, report: dict[str, Any] | None = None) -> dict[str, Any]:
    """Write mesh-sync-report.json into out_dir; return report."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = report or verify_host_mesh_sync()
    path = out_dir / "mesh-sync-report.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report["reportPath"] = str(path.resolve())
    return report
