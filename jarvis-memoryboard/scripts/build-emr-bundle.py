#!/usr/bin/env python3
"""Assemble EMR release bundle with tests, eval, MANIFEST.json, and SHA-256."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
STAGING = REPO / "dist" / "bundle-staging"
DIST = REPO / "dist"
BUNDLE_NAME = "EMR-bundle-2026-08-28"
ZIP_PATH = DIST / f"{BUNDLE_NAME}.zip"
SHA_PATH = DIST / f"{BUNDLE_NAME}.zip.sha256"

TEST_COMMAND = "pytest tests/test_emr*.py -v"

DOC_FILES = (
    "CONSTITUTIONAL_MEMORY_CONTRACT.md",
    "EMR_EVALUATION_PROTOCOL.md",
    "EMR_RECALL_PROTOCOL.md",
    "MCP_EMR_SETUP.md",
    "EMR_WHITEPAPER.md",
)

SOURCE_MANIFEST = """# EMR Release — Key Source Files
# Bundle: EMR-bundle-2026-08-28
# Repository: jarvis-memoryboard/

## Core EMR engine
app/emr.py                    — Electrom-Matic Recall: excite, STM, graph, abstention, reinforcement
app/emr_tool.py               — emr_recall read-only tool boundary (agent function calling)
app/emr_eval.py               — Repeatable evaluation harness (read-only on ledger)
app/emr_baselines.py          — Baseline retriever comparators

## Memoryboard API
app/main.py                   — FastAPI routes including /api/jarvis/tools/emr_recall
app/store.py                  — Continuity Ledger store
app/models.py                 — MemoryRecord schema
app/continuity.py             — Content hashing, migration helpers

## MCP adapter (stdio → HTTP proxy)
mcp_server/__init__.py
mcp_server/__main__.py
mcp_server/emr_stdio.py       — JSON-RPC stdio MCP server (emr_recall only)
scripts/run-emr-mcp.sh        — Launcher helper

## MCP host config examples
config/mcp-cursor.example.json
config/mcp-opencode.example.json

## Test suite (EMR scope)
tests/test_emr.py
tests/test_emr_dynamics.py
tests/test_emr_reinforce.py
tests/test_emr_tool.py
tests/test_emr_tool_adversarial.py
tests/test_emr_mcp.py
tests/test_emr_eval.py
tests/test_emr_correct.py
tests/test_emr_baselines.py

## Documentation
docs/EMR_RECALL_PROTOCOL.md
docs/CONSTITUTIONAL_MEMORY_CONTRACT.md
docs/EMR_EVALUATION_PROTOCOL.md
docs/MCP_EMR_SETUP.md
docs/EMR_WHITEPAPER.md
docs/EMR_GRAPH_ADJUDICATION_2026-08-24.md
"""


def git_commit() -> tuple[str, bool]:
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO, text=True
        ).strip()
        dirty = bool(
            subprocess.check_output(
                ["git", "status", "--porcelain"], cwd=REPO, text=True
            ).strip()
        )
        return sha, dirty
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown", True


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_files(root: Path) -> list[Path]:
    return sorted(p.relative_to(root) for p in root.rglob("*") if p.is_file())


def parse_test_counts(results_path: Path) -> dict[str, int]:
    text = results_path.read_text(encoding="utf-8")
    passed = failed = skipped = 0
    for line in text.splitlines():
        if " passed" in line and " in " in line:
            m = re.search(r"(\d+) passed", line)
            if m:
                passed = int(m.group(1))
            m = re.search(r"(\d+) failed", line)
            if m:
                failed = int(m.group(1))
            m = re.search(r"(\d+) skipped", line)
            if m:
                skipped = int(m.group(1))
    return {
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "total": passed + failed + skipped,
    }


def load_eval_summary() -> tuple[str, dict | None]:
    eval_json = STAGING / "results" / "emr-eval-summary.json"
    if not eval_json.exists():
        return "skipped", None
    data = json.loads(eval_json.read_text(encoding="utf-8"))
    ledger = data.get("dataset", {}).get("ledger_path", "")
    if "jarvis-store.json" in ledger:
        mode = "live_ledger"
    elif ledger:
        mode = "fixtures"
    else:
        mode = "skipped"
    return mode, data


def claims_index() -> list[dict[str, str]]:
    return [
        {
            "claim": "Conflicts are not silently co-admitted under exclude policy",
            "test_ref": "tests/test_emr_dynamics.py::test_contradiction_membrane_excludes_disputing_particle",
            "status_tag": "enforced",
        },
        {
            "claim": "Subject-targeted recall abstains without evidence",
            "test_ref": "tests/test_emr_tool_adversarial.py::test_unknown_subject_abstains_or_empty",
            "status_tag": "enforced",
        },
        {
            "claim": "Named subject does not force recall on unrelated query",
            "test_ref": "tests/test_emr_tool_adversarial.py::test_known_subject_unrelated_query_does_not_force_recall",
            "status_tag": "enforced",
        },
        {
            "claim": "Abstention floor cannot be disabled by request",
            "test_ref": "tests/test_emr_dynamics.py::test_abstention_floor_cannot_be_disabled_or_weakened_by_request",
            "status_tag": "enforced",
        },
        {
            "claim": "Reinforcement requires positive outcome signal",
            "test_ref": "tests/test_emr_reinforce.py::test_route_rejects_reinforcement_without_positive_outcome",
            "status_tag": "enforced",
        },
        {
            "claim": "Ledger bytes unchanged during reinforce route",
            "test_ref": "tests/test_emr_reinforce.py::test_route_reinforce_preserves_ledger_bytes",
            "status_tag": "enforced",
        },
        {
            "claim": "STM eviction is dormancy not deletion",
            "test_ref": "tests/test_emr.py::test_eviction_is_dormancy_not_delete",
            "status_tag": "enforced",
        },
        {
            "claim": "MCP stdio adapter proxies emr_recall to HTTP",
            "test_ref": "tests/test_emr_mcp.py::test_tools_call_proxies_to_http",
            "status_tag": "enforced",
        },
        {
            "claim": "Controlled contradiction eval: zero exclude leaks",
            "test_ref": "results/emr-eval-summary.json#metrics.contradiction.exclude_leaks",
            "status_tag": "measured",
        },
        {
            "claim": "ChatGPT Secure MCP Tunnel remote access",
            "test_ref": "docs/MCP_EMR_SETUP.md",
            "status_tag": "declared",
        },
    ]


def prepare_staging(*, skip_tests: bool, skip_eval: bool) -> tuple[str, bool]:
    commit_sha, uncommitted = git_commit()
    run_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    if STAGING.exists():
        shutil.rmtree(STAGING)
    (STAGING / "docs").mkdir(parents=True)
    (STAGING / "results").mkdir(parents=True)

    for name in DOC_FILES:
        src = REPO / "docs" / name
        if not src.exists():
            raise FileNotFoundError(f"Missing doc for bundle: {src}")
        shutil.copy2(src, STAGING / "docs" / name)

    (STAGING / "SOURCE_MANIFEST.txt").write_text(SOURCE_MANIFEST, encoding="utf-8")

    results_path = STAGING / "results" / "emr-test-results.txt"
    header = (
        "# EMR test run provenance\n"
        f"# git_commit_sha: {commit_sha}\n"
        f"# git_uncommitted_changes: {uncommitted}\n"
        f"# test_command: {TEST_COMMAND}\n"
        f"# run_at_utc: {run_at}\n"
        "# --- pytest output below ---\n"
    )
    test_files = sorted(str(p) for p in (REPO / "tests").glob("test_emr*.py"))
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *test_files, "-v"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    body = proc.stdout
    if proc.stderr:
        body += "\n--- stderr ---\n" + proc.stderr
    footer = (
        "\n# --- provenance footer ---\n"
        f"# git_commit_sha: {commit_sha}\n"
        f"# test_command: {TEST_COMMAND}\n"
        f"# exit_code: {proc.returncode}\n"
    )
    results_path.write_text(header + body + footer, encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(
            f"pytest failed (exit {proc.returncode}); see {results_path}"
        )

    eval_json = STAGING / "results" / "emr-eval-summary.json"
    eval_md = STAGING / "results" / "emr-eval-summary.md"
    if not skip_eval:
        ledger = REPO / "data" / "jarvis-store.json"
        if ledger.exists():
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "app.emr_eval",
                    "--ledger",
                    str(ledger),
                    "--rag-log",
                    str(REPO / "data" / "amul-rag-log.jsonl"),
                    "--dynamics",
                    str(REPO / "data" / "emr-dynamics.json"),
                    "--json-out",
                    str(eval_json),
                    "--markdown-out",
                    str(eval_md),
                ],
                cwd=REPO,
                check=True,
                stdout=subprocess.DEVNULL,
            )
        else:
            eval_json.write_text(
                json.dumps({"status": "skipped", "reason": "ledger missing"}, indent=2)
                + "\n",
                encoding="utf-8",
            )
            eval_md.write_text(
                "# EMR evaluation skipped\n\nLedger file not found.\n",
                encoding="utf-8",
            )

    render_whitepaper(commit_sha, run_at)
    return commit_sha, uncommitted


def _gate_pass(report: dict | None, gate: str) -> str:
    if not report:
        return "SKIPPED"
    gates = report.get("safety_gates") or {}
    item = gates.get(gate)
    if isinstance(item, bool):
        return "PASS" if item else "FAIL"
    if isinstance(item, dict):
        return "PASS" if item.get("passed") else "FAIL"
    return "SKIPPED"


def render_whitepaper(commit_sha: str, run_at: str) -> None:
    template_path = REPO / "docs" / "EMR_WHITEPAPER.md"
    template = template_path.read_text(encoding="utf-8")
    _, eval_data = load_eval_summary()
    counts = parse_test_counts(STAGING / "results" / "emr-test-results.txt")
    eval_mode, _ = load_eval_summary()

    metrics = (eval_data or {}).get("metrics") or {}
    dataset = (eval_data or {}).get("dataset") or {}
    graph = metrics.get("graph") or {}
    contradiction = metrics.get("contradiction") or {}
    reinforcement = metrics.get("reinforcement_bias") or {}
    retrieval = metrics.get("retrieval_graph_on") or metrics.get("retrieval") or {}

    replacements = {
        "{{GENERATION_DATE}}": run_at[:10],
        "{{GIT_COMMIT_SHA}}": commit_sha,
        "{{NEGATIVE_ABSTENTION_RATE}}": f"{retrieval.get('negative_query_abstention_rate', 'n/a')}",
        "{{NEGATIVE_CASE_COUNT}}": str(
            retrieval.get("negative_query_cases", dataset.get("negative_cases", 0))
        ),
        "{{EXCLUDE_LEAKS}}": str(contradiction.get("exclude_leaks", "n/a")),
        "{{CONTRADICTION_PROBES}}": str(
            contradiction.get("controlled_probes", "n/a")
        ),
        "{{CAP_VIOLATIONS}}": str(reinforcement.get("cap_violations", "n/a")),
        "{{TRUTH_MUTATIONS}}": str(reinforcement.get("truth_mutations", "n/a")),
        "{{PATH_INTEGRITY_RATE}}": str(graph.get("path_integrity_rate", "n/a")),
        "{{GRAPH_NOISE_RATE}}": str(graph.get("proxy_noise_rate", "n/a")),
        "{{GRAPH_NOISE_ADDITIONS}}": str(graph.get("top_k_additions", "n/a")),
        "{{EVALUATION_MODE}}": eval_mode.replace("_", " "),
        "{{LEDGER_PATH}}": dataset.get("ledger_path", "n/a"),
        "{{MEMORY_COUNT}}": str(dataset.get("memory_count", "n/a")),
        "{{CASE_COUNT}}": str(dataset.get("case_count", "n/a")),
        "{{SAFETY_GRAPH_PATHS}}": _gate_pass(eval_data, "graph_paths_structurally_valid"),
        "{{SAFETY_CONTRADICTION}}": _gate_pass(eval_data, "contradiction_membrane_no_leak"),
        "{{SAFETY_CAPS}}": _gate_pass(eval_data, "reinforcement_caps_respected"),
        "{{SAFETY_OUTCOME}}": _gate_pass(
            eval_data, "reinforcement_requires_positive_outcome"
        ),
        "{{SAFETY_TRUTH}}": _gate_pass(eval_data, "reinforcement_did_not_mutate_truth"),
        "{{SAFETY_LIVE_FILES}}": _gate_pass(eval_data, "live_files_unchanged"),
        "{{SAFETY_STATUS}}": (eval_data or {}).get("safety_status", "skipped"),
        "{{EVAL_STATUS}}": (eval_data or {}).get("status", "skipped"),
        "{{PASSED}}": str(counts["passed"]),
        "{{FAILED}}": str(counts["failed"]),
        "{{SKIPPED}}": str(counts["skipped"]),
    }
    rendered = template
    for key, value in replacements.items():
        rendered = rendered.replace(key, value)
    (STAGING / "docs" / "EMR_WHITEPAPER.md").write_text(rendered, encoding="utf-8")


def build_archive(commit_sha: str, uncommitted: bool) -> dict[str, object]:
    generation_date = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    test_counts = parse_test_counts(STAGING / "results" / "emr-test-results.txt")
    eval_mode, eval_data = load_eval_summary()

    manifest: dict[str, object] = {
        "bundle": BUNDLE_NAME,
        "generation_date": generation_date,
        "git_commit_sha": commit_sha,
        "git_uncommitted_changes": uncommitted,
        "test_command": TEST_COMMAND,
        "test_counts": test_counts,
        "evaluation_mode": eval_mode,
        "evaluation_metrics": None,
        "files": [],
        "claims_evidence_index": claims_index(),
    }

    if eval_data:
        manifest["evaluation_metrics"] = {
            "status": eval_data.get("status"),
            "safety_status": eval_data.get("safety_status"),
            "memory_count": eval_data.get("dataset", {}).get("memory_count"),
            "case_count": eval_data.get("dataset", {}).get("case_count"),
            "contradiction_exclude_leaks": eval_data.get("metrics", {})
            .get("contradiction", {})
            .get("exclude_leaks"),
            "graph_path_integrity_rate": eval_data.get("metrics", {})
            .get("graph", {})
            .get("path_integrity_rate"),
            "reinforcement_cap_violations": eval_data.get("metrics", {})
            .get("reinforcement_bias", {})
            .get("cap_violations"),
            "reinforcement_truth_mutations": eval_data.get("metrics", {})
            .get("reinforcement_bias", {})
            .get("truth_mutations"),
            "ledger_sha256": eval_data.get("file_integrity", {}).get("ledger_before"),
        }

    manifest_path = STAGING / "MANIFEST.json"

    def write_manifest(files: list[dict[str, object]]) -> None:
        manifest["files"] = files
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    file_entries: list[dict[str, object]] = []
    for rel in collect_files(STAGING):
        if rel.as_posix() == "MANIFEST.json":
            continue
        path = STAGING / rel
        file_entries.append(
            {
                "path": rel.as_posix(),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
        )

    manifest["manifest_self_hash_method"] = (
        "sha256 of canonical JSON with MANIFEST.json sha256 and bytes set to null"
    )

    write_manifest(file_entries)

    def manifest_self_hash(files: list[dict[str, object]]) -> str:
        canonical_files: list[dict[str, object]] = []
        for entry in files:
            item = dict(entry)
            if item.get("path") == "MANIFEST.json":
                item["sha256"] = None
                item["bytes"] = None
            canonical_files.append(item)
        payload = {**manifest, "files": canonical_files}
        text = json.dumps(payload, indent=2) + "\n"
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    self_digest = manifest_self_hash(
        [
            *file_entries,
            {"path": "MANIFEST.json", "sha256": None, "bytes": 0},
        ]
    )
    final_files = [
        *file_entries,
        {
            "path": "MANIFEST.json",
            "sha256": self_digest,
            "bytes": 0,
        },
    ]
    write_manifest(final_files)
    final_files[-1]["bytes"] = manifest_path.stat().st_size
    write_manifest(final_files)

    final_entries = json.loads(manifest_path.read_text(encoding="utf-8"))["files"]

    DIST.mkdir(parents=True, exist_ok=True)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel in collect_files(STAGING):
            zf.write(STAGING / rel, arcname=rel.as_posix())

    zip_hash = sha256_file(ZIP_PATH)
    SHA_PATH.write_text(f"{zip_hash}  {ZIP_PATH.name}\n", encoding="utf-8")

    return {
        "zip": str(ZIP_PATH),
        "sha256_file": str(SHA_PATH),
        "zip_sha256": zip_hash,
        "commit": commit_sha,
        "uncommitted": uncommitted,
        "test_counts": test_counts,
        "evaluation_mode": eval_mode,
        "files_in_zip": len(final_entries),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build EMR release bundle")
    parser.add_argument("--skip-tests", action="store_true")
    parser.add_argument("--skip-eval", action="store_true")
    parser.add_argument("--pack-only", action="store_true", help="Only zip existing staging")
    args = parser.parse_args()

    if args.pack_only:
        commit_sha, uncommitted = git_commit()
        summary = build_archive(commit_sha, uncommitted)
    else:
        commit_sha, uncommitted = prepare_staging(
            skip_tests=args.skip_tests,
            skip_eval=args.skip_eval,
        )
        summary = build_archive(commit_sha, uncommitted)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
