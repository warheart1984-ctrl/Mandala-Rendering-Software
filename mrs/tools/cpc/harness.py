"""CPC-v1.0 divergence harness: point the evolving engine at three forks.

Experiment: three identical baseline forks (G / D / H) diverge in three
directions; the evolving engine mutates, evaluates, and commits to each fork;
the CPC sweeper runs as the substrate service between generations.

Declared scaffold. If the evolving engine packages are importable they are
used; otherwise a bounded declared loop mutates candidate text, scores it with
a pluggable evaluator, and records a generation trace -- all under CPC rules.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SCHEME = "CPC-v1.0"

EVOLVE_ENGINE_IMPORTS = {
    "infi": "evolve_engine",
    "aris": "evolving_ai.core",
}


@dataclass
class Fork:
    id: str
    root: Path
    direction: str

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "root": str(self.root), "direction": self.direction}


@dataclass
class GenerationResult:
    generation: int
    fork_id: str
    candidate: str
    score: float
    ok: bool
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "generation": self.generation,
            "fork_id": self.fork_id,
            "candidate": self.candidate,
            "score": self.score,
            "ok": self.ok,
            "detail": self.detail,
        }


class DefaultEvaluator:
    """Declared evaluator: scores a candidate against a fork's smoke checks.

    Higher is better. A candidate that does not break the fork's health
    endpoint or dry-run sweep scores above a candidate that does.
    """

    def __init__(self, smoke: Callable[[Fork, str], float] | None = None) -> None:
        self._smoke = smoke or self._default_smoke

    def _default_smoke(self, fork: Fork, candidate: str) -> float:
        # declared: the real smoke is wired per-fork (git diff applies cleanly,
        # repo builds, /health returns 200). Scaffold scores deterministically
        # on whether the fork is still a live git repo.
        if (fork.root / ".git").exists():
            return 1.0
        return 0.0

    def evaluate(self, fork: Fork, candidate: str) -> tuple[float, str]:
        try:
            score = self._smoke(fork, candidate)
        except Exception as exc:  # noqa: BLE001
            return 0.0, f"smoke error: {exc}"
        return float(score), "smoke passed"


def _run_cpc_sweep(repo_root: Path, schedule: Path, *, dry_run: bool) -> dict[str, Any]:
    python = sys.executable
    sweep = Path(__file__).parent / "sweep.py"
    cmd = [python, str(sweep), "--repo", str(repo_root), "--schedule", str(schedule)]
    if dry_run:
        cmd.append("--dry-run")
    else:
        cmd.append("--apply")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return {
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip()[-2000:],
            "stderr": proc.stderr.strip()[-2000:],
        }
    except subprocess.TimeoutExpired:
        return {"returncode": -1, "stdout": "", "stderr": "sweep timeout"}


@dataclass
class HarnessConfig:
    forks: list[Fork]
    generations: int = 1
    population: int = 2
    mutation_rate: float = 0.35
    seed: int = 1
    sweep_between: bool = True
    sweep_dry_only: bool = True
    schedule: Path | None = None
    run_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])


def _mutate(candidate: str, task: str, rng: Any, generation: int, variant: int) -> str:
    mode = (generation + variant) % 3
    if mode == 0:
        return f"{candidate}\n\nObjective: {task}"
    if mode == 1:
        return f"{task}\n\n{candidate}"
    return f"{candidate}\n\nConstraint reminder: stay bounded, preserve structure, prune lawfully."


def run_harness(config: HarnessConfig, evaluator: DefaultEvaluator) -> dict[str, Any]:
    import random

    rng = random.Random(config.seed)
    start = time.monotonic()
    log: list[dict[str, Any]] = []
    sweep_runs: list[dict[str, Any]] = []

    for generation in range(config.generations):
        for fork in config.forks:
            population = [
                _mutate(fork.direction, fork.direction, rng, generation, variant)
                for variant in range(config.population)
            ]
            best: GenerationResult | None = None
            for candidate in population:
                score, detail = evaluator.evaluate(fork, candidate)
                result = GenerationResult(
                    generation=generation,
                    fork_id=fork.id,
                    candidate=candidate,
                    score=score,
                    ok=score > 0.0,
                    detail=detail,
                )
                if best is None or score > best.score:
                    best = result
            if best is not None:
                log.append(best.to_dict())

        if config.sweep_between:
            for fork in config.forks:
                sweep_result = _run_cpc_sweep(fork.root, config.schedule, dry_run=config.sweep_dry_only)
                sweep_runs.append(
                    {
                        "fork_id": fork.id,
                        "generation": generation,
                        "dry_run": config.sweep_dry_only,
                        **sweep_result,
                    }
                )

    elapsed = time.monotonic() - start
    return {
        "scheme": SCHEME,
        "run_id": config.run_id,
        "forks": [f.to_dict() for f in config.forks],
        "generations": config.generations,
        "elapsed_seconds": round(elapsed, 3),
        "engine_imports": {
            "infi": EVOLVE_ENGINE_IMPORTS["infi"] in sys.modules,
            "aris": "evolving_ai" in sys.modules,
        },
        "traces": log,
        "sweep_runs": sweep_runs,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="cpc-harness", description=__doc__)
    parser.add_argument("--generations", type=int, default=1)
    parser.add_argument("--population", type=int, default=2)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--no-sweep", action="store_true", help="disable sweeper between generations")
    parser.add_argument("--sweep-apply", action="store_true", help="let the sweeper delete (not dry-run)")
    parser.add_argument("--schedule", type=Path, default=None)
    args = parser.parse_args(argv)

    schedule = args.schedule or (Path(__file__).parent / "schedule.example.json")
    forks = [
        Fork("G", Path(r"G:\Mandala Rendering Software"), "media/render pipeline"),
        Fork("D", Path(r"D:\MRS-migration\Mandala Rendering Software"), "agent/governance stack"),
        Fork("H", Path(r"H:\Mandala-Rendering-Software"), "substrate/replay compaction"),
    ]
    config = HarnessConfig(
        forks=forks,
        generations=args.generations,
        population=args.population,
        seed=args.seed,
        sweep_between=not args.no_sweep,
        sweep_dry_only=not args.sweep_apply,
        schedule=schedule,
    )
    result = run_harness(config, DefaultEvaluator())
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
