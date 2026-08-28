"""Repeatable EMR evaluation over real Continuity Ledger records.

The evaluator is intentionally read-only with respect to the supplied ledger
and dynamics sidecar. Recall/graph metrics use weak labels derived from historic
RAG replays and deterministic ledger metadata. Contradiction and reinforcement
safety metrics use controlled in-memory probes with definite ground truth.

Run:
    python -m app.emr_eval --ledger data/jarvis-store.json \
        --rag-log data/amul-rag-log.jsonl --dynamics data/emr-dynamics.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import statistics
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

import app.emr as emr
from app.continuity import ensure_content_hash
from app.emr import (
    AbstentionConfig,
    ExciteRequest,
    GraphExpansionConfig,
    PositiveOutcomeSignal,
    RetrievalWeights,
    bond_strength,
    excite,
)
from app.models import MemoryRecord, migrate_legacy_record

EVAL_SCHEMA = "emr-evaluation-v1"
DEFAULT_K = 5
DEFAULT_MAX_CASES = 48
DEFAULT_CONTRADICTION_PROBES = 12
DEFAULT_REINFORCEMENT_PROBES = 12
DEFAULT_REINFORCEMENT_USES = 20
DEFAULT_TOKEN_BUDGET = 2048
DEFAULT_THETA = 0.04

_WORD_RE = re.compile(r"[a-z][a-z0-9_-]{2,}", re.I)
_STOPWORDS = {
    "about", "after", "again", "against", "also", "been", "before",
    "being", "between", "build", "built", "could", "does", "from",
    "have", "into", "jarvis", "memory", "memoryboard", "project", "session",
    "should", "that", "their", "there", "these", "this", "through", "using",
    "what", "when", "where", "which", "with", "would", "your",
}


@dataclass(frozen=True)
class EvalCase:
    case_id: str
    query: str
    relevant_ids: frozenset[str]
    relevant_hashes: frozenset[str]
    source: str
    label_quality: str
    session_id: str | None = None
    expected_empty: bool = False
    notes: str = ""


@dataclass
class RankedCase:
    case: EvalCase
    graph_enabled: bool
    entries: list[Any] = field(default_factory=list)
    excluded_conflicts: list[str] = field(default_factory=list)
    graph_expanded: int = 0
    abstained: bool = False
    abstention_reason: str | None = None
    top_evidence_score: float | None = None
    score_margin: float | None = None

    @property
    def ids(self) -> list[str]:
        return [entry.memory_id for entry in self.entries]


def _sha256_file(path: Path | None) -> str | None:
    if path is None or not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _case_id(source: str, query: str, session_id: str | None = None) -> str:
    raw = f"{source}\0{session_id or ''}\0{query}".encode("utf-8")
    return "eval-" + hashlib.sha256(raw).hexdigest()[:12]


def _tokens(text: str) -> set[str]:
    return {match.group(0).casefold() for match in _WORD_RE.finditer(text or "")}


def _useful_term(token: str) -> bool:
    if token in _STOPWORDS or not (4 <= len(token) <= 24):
        return False
    if sum(ch.isdigit() for ch in token) > len(token) * 0.45:
        return False
    if len(token) >= 12 and all(ch in "0123456789abcdef-_" for ch in token):
        return False
    return True


def load_records(path: str | Path) -> list[MemoryRecord]:
    """Read ledger records without triggering store migration writes."""

    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    records: list[MemoryRecord] = []
    for item in raw.get("memories", []):
        if not isinstance(item, dict) or not item.get("id"):
            continue
        try:
            record = MemoryRecord(**migrate_legacy_record(item))
            records.append(ensure_content_hash(record))
        except Exception:
            continue
    return records


def _related_ids(target: MemoryRecord, records: list[MemoryRecord]) -> set[str]:
    related = {target.id}
    for record in records:
        if record.status == "archived":
            continue
        if record.content_sha256 == target.content_sha256:
            related.add(record.id)
        if record.id == target.supersedes or record.supersedes == target.id:
            related.add(record.id)
    return related


def _expand_equivalent_ids(ids: set[str], by_id: dict[str, MemoryRecord]) -> set[str]:
    hashes = {by_id[mid].content_sha256 for mid in ids if mid in by_id}
    return {
        record.id
        for record in by_id.values()
        if record.status != "archived" and record.content_sha256 in hashes
    }


def build_replay_cases(
    path: str | Path | None,
    records: list[MemoryRecord],
) -> list[EvalCase]:
    """Use latest historic RAG outcome per query as a weak replay label."""

    if path is None or not Path(path).exists():
        return []
    latest: dict[str, dict[str, Any]] = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            continue
        query = str(row.get("query") or "").strip()
        if query:
            latest[query] = row

    by_id = {record.id: record for record in records}
    cases: list[EvalCase] = []
    for query, row in sorted(latest.items()):
        status = str(row.get("status") or "")
        if status == "chatty":
            continue
        ids = {
            str(doc.get("id"))
            for doc in row.get("docs_used", [])
            if isinstance(doc, dict) and str(doc.get("id")) in by_id
        }
        ids = _expand_equivalent_ids(ids, by_id)
        expected_empty = status == "insufficient_evidence" and not ids
        if not ids and not expected_empty:
            continue
        hashes = {by_id[mid].content_sha256 for mid in ids}
        cases.append(
            EvalCase(
                case_id=_case_id("rag-replay", query),
                query=query,
                relevant_ids=frozenset(ids),
                relevant_hashes=frozenset(hashes),
                source="rag-replay",
                label_quality="historic-system-label",
                expected_empty=expected_empty,
                notes="Latest recorded RAG outcome; not human-adjudicated.",
            )
        )
    return cases


def build_ledger_cases(
    records: list[MemoryRecord],
    *,
    max_cases: int = DEFAULT_MAX_CASES,
) -> list[EvalCase]:
    """Build one deterministic metadata/content probe per real session."""

    active = [record for record in records if record.status != "archived"]
    by_id = {record.id: record for record in active}
    document_frequency: dict[str, int] = {}
    for record in active:
        for token in _tokens(record.content):
            if _useful_term(token):
                document_frequency[token] = document_frequency.get(token, 0) + 1

    by_session: dict[str, list[MemoryRecord]] = {}
    for record in active:
        if not record.subject and not record.tags:
            continue
        by_session.setdefault(record.session_id, []).append(record)

    cases: list[EvalCase] = []
    used_queries: set[str] = set()
    for session_id in sorted(by_session):
        cohort = by_session[session_id]
        cohort.sort(
            key=lambda record: (
                record.status == "verified",
                bool(record.subject),
                bool(record.tags),
                bool(record.evidence),
                record.confidence,
                record.updated_at,
                record.id,
            ),
            reverse=True,
        )
        target = cohort[0]
        subject = (target.subject or "").replace("-", " ").strip()
        tags = [tag.replace("-", " ") for tag in target.tags[:3]]
        content_terms = sorted(
            (token for token in _tokens(target.content) if _useful_term(token)),
            key=lambda token: (document_frequency.get(token, math.inf), token),
        )[:3]
        parts = [part for part in [subject, *tags, *content_terms] if part]
        query = " ".join(dict.fromkeys(parts)).strip()
        if not query or query.casefold() in used_queries:
            continue
        used_queries.add(query.casefold())

        relevant_ids = _related_ids(target, active)
        relevant_hashes = {
            by_id[mid].content_sha256 for mid in relevant_ids if mid in by_id
        }
        cases.append(
            EvalCase(
                case_id=_case_id("ledger-probe", query, session_id),
                query=query,
                relevant_ids=frozenset(relevant_ids),
                relevant_hashes=frozenset(relevant_hashes),
                source="ledger-probe",
                label_quality="metadata-lineage-proxy",
                session_id=session_id,
                notes=(
                    "Expected set is the selected real record, identical-content "
                    "copies, and direct supersession neighbors."
                ),
            )
        )
        if len(cases) >= max_cases:
            break
    return cases


def load_human_cases(
    path: str | Path | None,
    records: list[MemoryRecord],
) -> list[EvalCase]:
    """Load optional human-adjudicated JSONL labels."""

    if path is None or not Path(path).exists():
        return []
    by_id = {record.id: record for record in records}
    cases: list[EvalCase] = []
    for line_no, line in enumerate(
        Path(path).read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        row = json.loads(line)
        query = str(row.get("query") or "").strip()
        if not query:
            raise ValueError(f"human label line {line_no}: query is required")
        ids = {str(mid) for mid in row.get("relevant_ids", []) if str(mid) in by_id}
        ids = _expand_equivalent_ids(ids, by_id)
        hashes = {by_id[mid].content_sha256 for mid in ids}
        cases.append(
            EvalCase(
                case_id=str(row.get("case_id") or _case_id("human", query)),
                query=query,
                relevant_ids=frozenset(ids),
                relevant_hashes=frozenset(hashes),
                source=str(row.get("source") or "human-label"),
                label_quality=str(
                    row.get("label_quality") or "human-adjudicated"
                ),
                session_id=row.get("session_id"),
                expected_empty=bool(row.get("expected_empty", False)),
                notes=str(row.get("notes") or ""),
            )
        )
    return cases


@contextmanager
def _preserve_emr_state(dynamics_path: str | Path | None) -> Iterator[None]:
    saved_path = emr.DYNAMICS_PATH
    saved_loaded = emr._dynamics_loaded
    saved_reinforcement = {
        key: value.model_copy(deep=True) for key, value in emr._REINFORCEMENT.items()
    }
    saved_stm = {
        key: [entry.model_copy(deep=True) for entry in entries]
        for key, entries in emr._STM.items()
    }
    try:
        emr.DYNAMICS_PATH = str(dynamics_path) if dynamics_path else ""
        emr._dynamics_loaded = False
        emr._REINFORCEMENT.clear()
        emr._STM.clear()
        yield
    finally:
        emr.DYNAMICS_PATH = saved_path
        emr._dynamics_loaded = saved_loaded
        emr._REINFORCEMENT.clear()
        emr._REINFORCEMENT.update(saved_reinforcement)
        emr._STM.clear()
        emr._STM.update(saved_stm)


def _rank_case(
    records: list[MemoryRecord],
    case: EvalCase,
    *,
    graph_enabled: bool,
    suffix: str,
    contradiction_policy: str = "exclude",
    token_budget: int = DEFAULT_TOKEN_BUDGET,
    theta: float = DEFAULT_THETA,
    abstention_enabled: bool = True,
) -> RankedCase:
    session_key = f"emr-eval-{case.case_id}-{suffix}"
    emr.clear_stm(session_key)
    result = excite(
        records,
        ExciteRequest(
            query=case.query,
            token_budget=token_budget,
            theta_promote=theta,
            theta_evict=max(0.0, theta / 3),
            candidate_limit=min(2000, max(1, len(records))),
            session_key=session_key,
            graph=GraphExpansionConfig(enabled=graph_enabled),
            weights=RetrievalWeights(),
            abstention=AbstentionConfig(),
            contradiction_policy=contradiction_policy,
            reinforce_selected=False,
        ),
        enforce_abstention=abstention_enabled,
    )
    emr.clear_stm(session_key)
    return RankedCase(
        case=case,
        graph_enabled=graph_enabled,
        entries=result.stm,
        excluded_conflicts=result.excluded_conflicts,
        graph_expanded=result.graph_expanded,
        abstained=result.abstained,
        abstention_reason=result.abstention_reason,
        top_evidence_score=result.top_evidence_score,
        score_margin=result.score_margin,
    )


def _retrieval_metrics(
    ranked: list[RankedCase],
    by_id: dict[str, MemoryRecord],
    *,
    k: int,
) -> dict[str, Any]:
    precision: list[float] = []
    recall: list[float] = []
    reciprocal_ranks: list[float] = []
    top1: list[float] = []
    negative_hits = 0
    abstentions = 0
    correct_negative_abstentions = 0
    positive_cases = 0
    per_case: list[dict[str, Any]] = []

    for result in ranked:
        abstentions += int(result.abstained)
        top_ids = result.ids[:k]
        top_hashes = [by_id[mid].content_sha256 for mid in top_ids if mid in by_id]
        expected = set(result.case.relevant_hashes)
        if result.case.expected_empty:
            negative_hits += int(bool(top_ids))
            correct_negative_abstentions += int(result.abstained)
            per_case.append(
                {
                    "case_id": result.case.case_id,
                    "query": result.case.query,
                    "source": result.case.source,
                    "label_quality": result.case.label_quality,
                    "expected_empty": True,
                    "returned": top_ids,
                    "false_positive": bool(top_ids),
                    "abstained": result.abstained,
                    "abstention_reason": result.abstention_reason,
                }
            )
            continue
        if not expected:
            continue
        positive_cases += 1
        seen_relevant: set[str] = set()
        first_rank = 0
        for rank, content_hash in enumerate(top_hashes, start=1):
            if content_hash in expected:
                seen_relevant.add(content_hash)
                if first_rank == 0:
                    first_rank = rank
        p_at_k = len(seen_relevant) / k
        r_at_k = len(seen_relevant) / len(expected)
        rr = 1.0 / first_rank if first_rank else 0.0
        precision.append(p_at_k)
        recall.append(r_at_k)
        reciprocal_ranks.append(rr)
        top1.append(float(first_rank == 1))
        per_case.append(
            {
                "case_id": result.case.case_id,
                "query": result.case.query,
                "source": result.case.source,
                "label_quality": result.case.label_quality,
                "expected_hashes": len(expected),
                "returned": top_ids,
                "precision_at_k": round(p_at_k, 6),
                "recall_at_k": round(r_at_k, 6),
                "reciprocal_rank": round(rr, 6),
                "top1_hit": first_rank == 1,
                "abstained": result.abstained,
                "abstention_reason": result.abstention_reason,
            }
        )

    negative_cases = sum(item.case.expected_empty for item in ranked)
    return {
        "k": k,
        "positive_cases": positive_cases,
        "negative_cases": negative_cases,
        "precision_at_k": round(statistics.fmean(precision), 6) if precision else None,
        "recall_at_k": round(statistics.fmean(recall), 6) if recall else None,
        "mrr": round(statistics.fmean(reciprocal_ranks), 6)
        if reciprocal_ranks
        else None,
        "top1_accuracy": round(statistics.fmean(top1), 6) if top1 else None,
        "negative_false_positive_rate": round(negative_hits / negative_cases, 6)
        if negative_cases
        else None,
        "abstention_rate": round(abstentions / len(ranked), 6) if ranked else None,
        "correct_negative_abstention_rate": round(
            correct_negative_abstentions / negative_cases, 6
        )
        if negative_cases
        else None,
        "per_case": per_case,
    }


def _edge_is_valid(
    left: MemoryRecord,
    right: MemoryRecord,
    by_id: dict[str, MemoryRecord],
    *,
    min_weight: float,
) -> bool:
    if left.supersedes == right.id or right.supersedes == left.id:
        return True
    known = set(by_id)
    if right.id in emr._evidence_memory_ids(left, known):
        return True
    if left.id in emr._evidence_memory_ids(right, known):
        return True
    return bond_strength(left, right) >= min_weight


def _graph_metrics(
    baseline: list[RankedCase],
    graph: list[RankedCase],
    by_id: dict[str, MemoryRecord],
    *,
    k: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    baseline_by_case = {result.case.case_id: result for result in baseline}
    added_total = 0
    relevant_added = 0
    redundant_added = 0
    boosted_total = 0
    valid_paths = 0
    invalid_paths: list[dict[str, Any]] = []
    boosts: list[float] = []
    hit_gain = 0
    adjudication: list[dict[str, Any]] = []

    for graph_result in graph:
        base = baseline_by_case[graph_result.case.case_id]
        base_ids = base.ids[:k]
        graph_ids = graph_result.ids[:k]
        base_hashes = {
            by_id[mid].content_sha256 for mid in base_ids if mid in by_id
        }
        expected = set(graph_result.case.relevant_hashes)
        base_hits = len(base_hashes & expected)
        graph_hashes = {
            by_id[mid].content_sha256 for mid in graph_ids if mid in by_id
        }
        graph_hits = len(graph_hashes & expected)
        hit_gain += graph_hits - base_hits

        for memory_id in graph_ids:
            if memory_id in base_ids or memory_id not in by_id:
                continue
            added_total += 1
            content_hash = by_id[memory_id].content_sha256
            is_relevant = content_hash in expected
            relevant_added += int(is_relevant)
            redundant_added += int(content_hash in base_hashes)
            if not is_relevant and len(adjudication) < 25:
                record = by_id[memory_id]
                adjudication.append(
                    {
                        "case_id": graph_result.case.case_id,
                        "query": graph_result.case.query,
                        "candidate_id": memory_id,
                        "summary": emr.make_summary(record.content),
                        "reason": "graph-added item is outside weak-label expected set",
                    }
                )

        for entry in graph_result.entries:
            components = entry.components
            if components.graph_boost <= 0:
                continue
            boosted_total += 1
            boosts.append(components.graph_boost)
            path = components.graph_path
            structurally_valid = (
                len(path) == components.graph_hops + 1
                and bool(path)
                and path[-1] == entry.memory_id
                and len(components.graph_edges) == components.graph_hops
            )
            edges_valid = structurally_valid and all(
                left in by_id
                and right in by_id
                and _edge_is_valid(
                    by_id[left],
                    by_id[right],
                    by_id,
                    min_weight=GraphExpansionConfig().min_edge_weight,
                )
                for left, right in zip(path, path[1:])
            )
            if edges_valid:
                valid_paths += 1
            else:
                invalid_paths.append(
                    {
                        "case_id": graph_result.case.case_id,
                        "memory_id": entry.memory_id,
                        "path": path,
                    }
                )

    return (
        {
            "paired_cases": len(graph),
            "top_k_added": added_total,
            "top_k_relevant_added_proxy": relevant_added,
            "top_k_noise_rate_proxy": round(
                (added_total - relevant_added) / added_total, 6
            )
            if added_total
            else None,
            "top_k_redundant_addition_rate": round(redundant_added / added_total, 6)
            if added_total
            else None,
            "relevant_hash_hit_gain": hit_gain,
            "boosted_entries": boosted_total,
            "path_integrity_rate": round(valid_paths / boosted_total, 6)
            if boosted_total
            else 1.0,
            "invalid_paths": invalid_paths,
            "mean_graph_boost": round(statistics.fmean(boosts), 6) if boosts else 0.0,
            "max_graph_boost": round(max(boosts), 6) if boosts else 0.0,
            "label_notice": (
                "Noise and relevance are weak-label proxies. Path integrity is a "
                "direct structural measurement."
            ),
        },
        adjudication,
    )


def _contradiction_metrics(
    records: list[MemoryRecord],
    cases: list[EvalCase],
    by_id: dict[str, MemoryRecord],
    *,
    max_probes: int,
) -> dict[str, Any]:
    probes = 0
    leaks = 0
    exclusions_observed = 0
    allow_controls = 0
    details: list[dict[str, Any]] = []

    for case in cases:
        target = next(
            (
                by_id[mid]
                for mid in sorted(case.relevant_ids)
                if mid in by_id and by_id[mid].subject
            ),
            None,
        )
        if target is None:
            continue
        probes += 1
        conflict_id = f"eval-conflict-{probes:03d}"
        conflict_content = (
            f"Controlled contradiction for {target.subject}: the recorded claim "
            f"is explicitly denied for evaluation only. {target.content[:180]}"
        )
        conflict = target.model_copy(
            update={
                "id": conflict_id,
                "content": conflict_content,
                "content_sha256": hashlib.sha256(
                    conflict_content.encode("utf-8")
                ).hexdigest(),
                "status": "verified",
                "confidence": max(0.9, target.confidence),
            }
        )
        distractors = [
            record
            for record in records
            if record.id != target.id and record.subject != target.subject
        ][:4]
        # Keep the control small enough that both claims are reachable under
        # `allow`; otherwise a budget/ranking miss can masquerade as membrane
        # success. Targets still span real sessions and retain real metadata.
        cohort = [target, conflict, *distractors]
        excluded = _rank_case(
            cohort,
            case,
            graph_enabled=True,
            suffix=f"conflict-exclude-{probes}",
            contradiction_policy="exclude",
            token_budget=8000,
            theta=0.0,
            abstention_enabled=False,
        )
        excluded_ids = set(excluded.ids)
        leak = target.id in excluded_ids and conflict_id in excluded_ids
        leaks += int(leak)
        exclusions_observed += int(
            (target.id in excluded_ids or conflict_id in excluded_ids)
            and (target.id in excluded.excluded_conflicts or conflict_id in excluded.excluded_conflicts)
        )

        allowed = _rank_case(
            cohort,
            case,
            graph_enabled=True,
            suffix=f"conflict-allow-{probes}",
            contradiction_policy="allow",
            token_budget=8000,
            theta=0.0,
            abstention_enabled=False,
        )
        allow_both = target.id in allowed.ids and conflict_id in allowed.ids
        allow_controls += int(allow_both)
        details.append(
            {
                "case_id": case.case_id,
                "subject": target.subject,
                "exclude_leak": leak,
                "exclusion_reported": target.id in excluded.excluded_conflicts
                or conflict_id in excluded.excluded_conflicts,
                "allow_control_admitted_both": allow_both,
            }
        )
        if probes >= max_probes:
            break

    return {
        "probes": probes,
        "validated_probes": allow_controls,
        "inconclusive_probes": probes - allow_controls,
        "exclude_leaks": leaks,
        "exclude_leak_rate": round(leaks / allow_controls, 6)
        if allow_controls
        else None,
        "exclusion_report_rate": round(exclusions_observed / probes, 6)
        if probes
        else None,
        "allow_control_rate": round(allow_controls / probes, 6) if probes else None,
        "ground_truth": "controlled same-subject, different-hash contradiction",
        "details": details,
    }


def _quality_findings(
    baseline: dict[str, Any],
    graph: dict[str, Any],
    reinforcement: dict[str, Any],
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    negative_rate = baseline.get("negative_false_positive_rate")
    if negative_rate is not None and negative_rate > 0:
        findings.append(
            {
                "code": "UNSUPPORTED_QUERY_PROMOTION",
                "severity": "high",
                "claim_strength": "historic-system-label",
                "observation": (
                    f"Unsupported-query false-positive rate was {negative_rate:.3f}."
                ),
                "recommended_action": (
                    "Add an abstention/margin gate and expand the human-labeled "
                    "negative-query set before tuning relevance weights."
                ),
            }
        )
    graph_noise = graph.get("top_k_noise_rate_proxy")
    if graph.get("top_k_added", 0) > 0 and graph_noise is not None and graph_noise > 0.5:
        findings.append(
            {
                "code": "GRAPH_NOISE_PROXY_HIGH",
                "severity": "medium",
                "claim_strength": "weak-label-proxy",
                "observation": (
                    f"{graph_noise:.3f} of graph-added top-k results were outside "
                    "the proxy expected set."
                ),
                "recommended_action": (
                    "Human-review the adjudication queue, then tune graph weight, "
                    "edge threshold, and duplicate handling against those labels."
                ),
            }
        )
    top1_flips = reinforcement.get("irrelevant_top1_flip_rate")
    if top1_flips is not None and top1_flips > 0:
        findings.append(
            {
                "code": "REINFORCEMENT_TOP1_BIAS",
                "severity": "high",
                "claim_strength": "controlled-measurement",
                "observation": (
                    f"A repeatedly reinforced non-relevant memory became top-1 in "
                    f"{top1_flips:.3f} of controlled probes."
                ),
                "recommended_action": (
                    "Require an explicit positive outcome signal before reinforcement "
                    "and cap total reinforcement contribution to activation/rank."
                ),
            }
        )
    multiplier = reinforcement.get("max_irrelevant_activation_multiplier")
    if multiplier is not None and multiplier > 1.0 + emr.SALIENCE_CAP + 1e-6:
        findings.append(
            {
                "code": "DECAY_DAMP_COMPOUNDING",
                "severity": "medium",
                "claim_strength": "controlled-measurement",
                "observation": (
                    f"Maximum irrelevant activation multiplier was {multiplier:.3f}; "
                    "decay damping compounds beyond the salience-only 1.5x ceiling."
                ),
                "recommended_action": (
                    "Add a combined reinforcement multiplier ceiling, not only "
                    "separate salience and decay-damping caps."
                ),
            }
        )
    return findings


def _rank_of(ids: list[str], memory_id: str) -> int:
    try:
        return ids.index(memory_id) + 1
    except ValueError:
        return len(ids) + 1


def _reinforcement_metrics(
    records: list[MemoryRecord],
    cases: list[EvalCase],
    by_id: dict[str, MemoryRecord],
    *,
    max_probes: int,
    uses: int,
) -> dict[str, Any]:
    saved_path = emr.DYNAMICS_PATH
    saved_loaded = emr._dynamics_loaded
    saved_reinforcement = {
        key: value.model_copy(deep=True) for key, value in emr._REINFORCEMENT.items()
    }
    saved_stm = {
        key: [entry.model_copy(deep=True) for entry in entries]
        for key, entries in emr._STM.items()
    }

    probes = 0
    relevant_rank_gains: list[float] = []
    irrelevant_rank_gains: list[float] = []
    irrelevant_top1_flips = 0
    irrelevant_promotions = 0
    cap_violations = 0
    truth_mutations = 0
    activation_multipliers: list[float] = []
    positive_activation_multipliers: list[float] = []
    outcome_gate_attempts = 0
    outcome_gate_rejections = 0
    outcome_gate_mutations = 0
    details: list[dict[str, Any]] = []

    def reset_overlay(path: Path) -> None:
        path.unlink(missing_ok=True)
        emr.DYNAMICS_PATH = str(path)
        emr._dynamics_loaded = False
        emr._REINFORCEMENT.clear()
        emr._STM.clear()
        emr._ensure_dynamics()

    try:
        with tempfile.TemporaryDirectory(prefix="emr-eval-") as tmp:
            sidecar = Path(tmp) / "isolated-dynamics.json"
            for case in cases:
                reset_overlay(sidecar)
                baseline = _rank_case(
                    records,
                    case,
                    graph_enabled=False,
                    suffix=f"reinforce-base-{probes}",
                    token_budget=8000,
                    theta=0.001,
                    abstention_enabled=False,
                )
                target = next(
                    (
                        memory_id
                        for memory_id in baseline.ids
                        if memory_id in case.relevant_ids
                        or by_id[memory_id].content_sha256 in case.relevant_hashes
                    ),
                    None,
                )
                distractor = next(
                    (
                        memory_id
                        for memory_id in baseline.ids
                        if memory_id != target
                        and by_id[memory_id].content_sha256 not in case.relevant_hashes
                    ),
                    None,
                )
                if target is None or distractor is None:
                    continue
                probes += 1
                truth_before = {
                    target: by_id[target].model_dump(),
                    distractor: by_id[distractor].model_dump(),
                }
                base_target_rank = _rank_of(baseline.ids, target)
                base_distractor_rank = _rank_of(baseline.ids, distractor)
                base_activation = next(
                    entry.activation
                    for entry in baseline.entries
                    if entry.memory_id == distractor
                )

                for use_index in range(uses):
                    emr.reinforce_ids(
                        set(by_id),
                        [target],
                        outcome=PositiveOutcomeSignal(
                            signal="positive",
                            source="task",
                            outcome_id=f"eval-positive-{probes}-{use_index}",
                        ),
                    )
                relevant = _rank_case(
                    records,
                    case,
                    graph_enabled=False,
                    suffix=f"reinforce-relevant-{probes}",
                    token_budget=8000,
                    theta=0.001,
                    abstention_enabled=False,
                )
                relevant_rank = _rank_of(relevant.ids, target)
                relevant_rank_gains.append(base_target_rank - relevant_rank)
                relevant_state = emr.get_reinforcement(target)
                relevant_entry = next(
                    entry for entry in relevant.entries if entry.memory_id == target
                )
                positive_activation_multipliers.append(
                    relevant_entry.components.reinforcement_multiplier
                )
                if (
                    relevant_state is None
                    or relevant_state.salience > emr.SALIENCE_CAP
                    or relevant_state.decay_damp > emr.DAMP_CAP
                    or relevant_entry.components.reinforcement_multiplier
                    > emr.TOTAL_REINFORCEMENT_CAP + 1e-6
                ):
                    cap_violations += 1

                reset_overlay(sidecar)
                for _ in range(uses):
                    outcome_gate_attempts += 1
                    try:
                        emr.reinforce_ids(
                            set(by_id),
                            [distractor],
                            outcome=None,
                        )
                    except ValueError:
                        outcome_gate_rejections += 1
                outcome_gate_mutations += int(
                    emr.get_reinforcement(distractor) is not None
                )
                biased = _rank_case(
                    records,
                    case,
                    graph_enabled=False,
                    suffix=f"reinforce-irrelevant-{probes}",
                    token_budget=8000,
                    theta=0.001,
                    abstention_enabled=False,
                )
                biased_rank = _rank_of(biased.ids, distractor)
                irrelevant_rank_gains.append(base_distractor_rank - biased_rank)
                top1_flip = (
                    bool(baseline.ids)
                    and by_id[baseline.ids[0]].content_sha256 in case.relevant_hashes
                    and bool(biased.ids)
                    and biased.ids[0] == distractor
                )
                irrelevant_top1_flips += int(top1_flip)
                irrelevant_promotions += int(
                    base_distractor_rank > DEFAULT_K and biased_rank <= DEFAULT_K
                )
                biased_activation = next(
                    entry.activation
                    for entry in biased.entries
                    if entry.memory_id == distractor
                )
                if base_activation > 0:
                    activation_multipliers.append(biased_activation / base_activation)
                truth_after = {
                    target: by_id[target].model_dump(),
                    distractor: by_id[distractor].model_dump(),
                }
                truth_mutations += int(truth_after != truth_before)
                details.append(
                    {
                        "case_id": case.case_id,
                        "target_id": target,
                        "distractor_id": distractor,
                        "target_rank_before": base_target_rank,
                        "target_rank_after_relevant_reinforcement": relevant_rank,
                        "distractor_rank_before": base_distractor_rank,
                        "distractor_rank_after_reinforcement": biased_rank,
                        "irrelevant_top1_flip": top1_flip,
                        "distractor_activation_multiplier": round(
                            biased_activation / base_activation, 6
                        )
                        if base_activation > 0
                        else None,
                    }
                )
                if probes >= max_probes:
                    break
    finally:
        emr.DYNAMICS_PATH = saved_path
        emr._dynamics_loaded = saved_loaded
        emr._REINFORCEMENT.clear()
        emr._REINFORCEMENT.update(saved_reinforcement)
        emr._STM.clear()
        emr._STM.update(saved_stm)

    return {
        "probes": probes,
        "uses_per_probe": uses,
        "sidecar_isolated": True,
        "positive_outcome_required": True,
        "outcome_gate_attempts": outcome_gate_attempts,
        "outcome_gate_rejections": outcome_gate_rejections,
        "outcome_gate_mutations": outcome_gate_mutations,
        "mean_relevant_rank_gain": round(statistics.fmean(relevant_rank_gains), 6)
        if relevant_rank_gains
        else None,
        "mean_irrelevant_rank_gain": round(
            statistics.fmean(irrelevant_rank_gains), 6
        )
        if irrelevant_rank_gains
        else None,
        "irrelevant_top1_flip_rate": round(irrelevant_top1_flips / probes, 6)
        if probes
        else None,
        "irrelevant_top_k_promotion_rate": round(irrelevant_promotions / probes, 6)
        if probes
        else None,
        "max_irrelevant_activation_multiplier": round(
            max(activation_multipliers), 6
        )
        if activation_multipliers
        else None,
        "max_positive_activation_multiplier": round(
            max(positive_activation_multipliers), 6
        )
        if positive_activation_multipliers
        else None,
        "total_reinforcement_multiplier_cap": emr.TOTAL_REINFORCEMENT_CAP,
        "cap_violations": cap_violations,
        "truth_mutations": truth_mutations,
        "details": details,
    }


def run_evaluation(
    *,
    ledger_path: str | Path,
    rag_log_path: str | Path | None = None,
    dynamics_path: str | Path | None = None,
    human_labels_path: str | Path | None = None,
    k: int = DEFAULT_K,
    max_cases: int = DEFAULT_MAX_CASES,
    contradiction_probes: int = DEFAULT_CONTRADICTION_PROBES,
    reinforcement_probes: int = DEFAULT_REINFORCEMENT_PROBES,
    reinforcement_uses: int = DEFAULT_REINFORCEMENT_USES,
) -> dict[str, Any]:
    ledger = Path(ledger_path)
    dynamics = Path(dynamics_path) if dynamics_path else None
    ledger_before = _sha256_file(ledger)
    dynamics_before = _sha256_file(dynamics)
    records = load_records(ledger)
    by_id = {record.id: record for record in records}

    human = load_human_cases(human_labels_path, records)
    replay = build_replay_cases(rag_log_path, records)
    ledger_cases = build_ledger_cases(records, max_cases=max_cases)
    cases = [*human, *replay, *ledger_cases]
    # Human cases lead and override matching query proxies.
    deduped: list[EvalCase] = []
    seen_queries: set[str] = set()
    for case in cases:
        key = case.query.casefold()
        if key in seen_queries:
            continue
        seen_queries.add(key)
        deduped.append(case)
        if len(deduped) >= max_cases:
            break
    cases = deduped

    with _preserve_emr_state(dynamics):
        baseline = [
            _rank_case(records, case, graph_enabled=False, suffix="baseline")
            for case in cases
        ]
        graph = [
            _rank_case(records, case, graph_enabled=True, suffix="graph")
            for case in cases
        ]
        baseline_metrics = _retrieval_metrics(baseline, by_id, k=k)
        graph_retrieval_metrics = _retrieval_metrics(graph, by_id, k=k)
        graph_metrics, adjudication = _graph_metrics(
            baseline, graph, by_id, k=k
        )
        contradiction = _contradiction_metrics(
            records,
            cases,
            by_id,
            max_probes=contradiction_probes,
        )
        reinforcement = _reinforcement_metrics(
            records,
            cases,
            by_id,
            max_probes=reinforcement_probes,
            uses=reinforcement_uses,
        )

    ledger_after = _sha256_file(ledger)
    dynamics_after = _sha256_file(dynamics)
    live_files_unchanged = (
        ledger_before == ledger_after and dynamics_before == dynamics_after
    )
    gates = {
        "graph_paths_structurally_valid": graph_metrics["path_integrity_rate"] == 1.0,
        "contradiction_membrane_no_leak": (
            contradiction["validated_probes"] > 0
            and contradiction["exclude_leaks"] == 0
        ),
        "reinforcement_caps_respected": reinforcement["cap_violations"] == 0,
        "reinforcement_requires_positive_outcome": (
            reinforcement["outcome_gate_attempts"] > 0
            and reinforcement["outcome_gate_rejections"]
            == reinforcement["outcome_gate_attempts"]
            and reinforcement["outcome_gate_mutations"] == 0
        ),
        "reinforcement_did_not_mutate_truth": reinforcement["truth_mutations"] == 0,
        "live_files_unchanged": live_files_unchanged,
    }
    findings = _quality_findings(
        graph_retrieval_metrics,
        graph_metrics,
        reinforcement,
    )
    safety_status = "pass" if all(gates.values()) else "fail"
    status = (
        "fail"
        if safety_status == "fail"
        else ("pass_with_findings" if findings else "pass")
    )

    source_counts: dict[str, int] = {}
    quality_counts: dict[str, int] = {}
    for case in cases:
        source_counts[case.source] = source_counts.get(case.source, 0) + 1
        quality_counts[case.label_quality] = quality_counts.get(case.label_quality, 0) + 1

    return {
        "schema": EVAL_SCHEMA,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "safety_status": safety_status,
        "dataset": {
            "ledger_path": str(ledger.resolve()),
            "rag_log_path": str(Path(rag_log_path).resolve())
            if rag_log_path
            else None,
            "dynamics_path": str(dynamics.resolve()) if dynamics else None,
            "memory_count": len(records),
            "active_memory_count": sum(record.status != "archived" for record in records),
            "session_count": len({record.session_id for record in records}),
            "unique_content_hashes": len({record.content_sha256 for record in records}),
            "case_count": len(cases),
            "case_sources": source_counts,
            "label_quality": quality_counts,
        },
        "config": {
            "k": k,
            "max_cases": max_cases,
            "token_budget": DEFAULT_TOKEN_BUDGET,
            "theta_promote": DEFAULT_THETA,
            "contradiction_probes": contradiction_probes,
            "reinforcement_probes": reinforcement_probes,
            "reinforcement_uses": reinforcement_uses,
            "abstention": AbstentionConfig().model_dump(),
            "graph": GraphExpansionConfig().model_dump(),
            "retrieval_weights": RetrievalWeights().model_dump(),
        },
        "metrics": {
            "recall_without_graph": baseline_metrics,
            "recall_with_graph": graph_retrieval_metrics,
            "graph": graph_metrics,
            "contradiction": contradiction,
            "reinforcement_bias": reinforcement,
        },
        "safety_gates": gates,
        "findings": findings,
        "file_integrity": {
            "ledger_before": ledger_before,
            "ledger_after": ledger_after,
            "dynamics_before": dynamics_before,
            "dynamics_after": dynamics_after,
            "unchanged": live_files_unchanged,
        },
        "adjudication_queue": adjudication,
        "claim_boundary": {
            "observational": (
                "Recall precision/recall/MRR and graph noise use weak labels unless "
                "human-label cases are supplied."
            ),
            "measured": (
                "Graph path integrity, controlled contradiction leakage, caps, "
                "truth immutability, and file hashes are directly measured."
            ),
        },
    }


def _fmt(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def render_markdown(report: dict[str, Any]) -> str:
    dataset = report["dataset"]
    metrics = report["metrics"]
    base = metrics["recall_without_graph"]
    graph_recall = metrics["recall_with_graph"]
    graph = metrics["graph"]
    contradiction = metrics["contradiction"]
    reinforcement = metrics["reinforcement_bias"]
    gates = report["safety_gates"]

    lines = [
        "# Jarvis EMR Evaluation Report",
        "",
        f"- Schema: `{report['schema']}`",
        f"- Evaluated: `{report['evaluated_at']}`",
        f"- Overall evaluation status: **{report['status'].upper()}**",
        f"- Hard safety-gate status: **{report['safety_status'].upper()}**",
        f"- Corpus: {dataset['memory_count']} memories / {dataset['session_count']} sessions / {dataset['case_count']} cases",
        f"- Label quality: `{json.dumps(dataset['label_quality'], sort_keys=True)}`",
        "",
        "## Retrieval observations",
        "",
        "| Metric | Graph off | Graph on |",
        "|---|---:|---:|",
        f"| Precision@{base['k']} | {_fmt(base['precision_at_k'])} | {_fmt(graph_recall['precision_at_k'])} |",
        f"| Recall@{base['k']} | {_fmt(base['recall_at_k'])} | {_fmt(graph_recall['recall_at_k'])} |",
        f"| MRR | {_fmt(base['mrr'])} | {_fmt(graph_recall['mrr'])} |",
        f"| Top-1 accuracy | {_fmt(base['top1_accuracy'])} | {_fmt(graph_recall['top1_accuracy'])} |",
        f"| Abstention rate | {_fmt(base['abstention_rate'])} | {_fmt(graph_recall['abstention_rate'])} |",
        f"| Negative-query abstention | {_fmt(base['correct_negative_abstention_rate'])} | {_fmt(graph_recall['correct_negative_abstention_rate'])} |",
        "",
        "> These retrieval metrics are observational proxies unless the case source is `human-label`.",
        "",
        "## Graph expansion",
        "",
        f"- Top-k additions: **{graph['top_k_added']}**",
        f"- Proxy noise rate: **{_fmt(graph['top_k_noise_rate_proxy'])}**",
        f"- Redundant-addition rate: **{_fmt(graph['top_k_redundant_addition_rate'])}**",
        f"- Relevant-hash hit gain: **{graph['relevant_hash_hit_gain']}**",
        f"- Path integrity: **{_fmt(graph['path_integrity_rate'])}** ({graph['boosted_entries']} boosted entries)",
        "",
        "## Contradiction handling",
        "",
        f"- Controlled probes: **{contradiction['probes']}**",
        f"- Co-admission leaks under `exclude`: **{contradiction['exclude_leaks']}**",
        f"- Leak rate: **{_fmt(contradiction['exclude_leak_rate'])}**",
        f"- `allow` policy control rate: **{_fmt(contradiction['allow_control_rate'])}**",
        "",
        "## Reinforcement bias",
        "",
        f"- Isolated probes: **{reinforcement['probes']}** × {reinforcement['uses_per_probe']} reinforcements",
        f"- Missing-outcome attempts rejected: **{reinforcement['outcome_gate_rejections']}/{reinforcement['outcome_gate_attempts']}**",
        f"- Mean relevant rank gain: **{_fmt(reinforcement['mean_relevant_rank_gain'])}**",
        f"- Mean irrelevant rank gain: **{_fmt(reinforcement['mean_irrelevant_rank_gain'])}**",
        f"- Irrelevant top-1 flip rate: **{_fmt(reinforcement['irrelevant_top1_flip_rate'])}**",
        f"- Irrelevant top-k promotion rate: **{_fmt(reinforcement['irrelevant_top_k_promotion_rate'])}**",
        f"- Maximum positive reinforcement multiplier: **{_fmt(reinforcement['max_positive_activation_multiplier'])}** / cap **{_fmt(reinforcement['total_reinforcement_multiplier_cap'])}**",
        f"- Cap violations: **{reinforcement['cap_violations']}**",
        f"- Truth mutations: **{reinforcement['truth_mutations']}**",
        "",
        "## Safety gates",
        "",
    ]
    for name, passed in gates.items():
        lines.append(f"- {'PASS' if passed else 'FAIL'} — `{name}`")
    lines.extend(["", "## Findings", ""])
    if report["findings"]:
        for finding in report["findings"]:
            lines.append(
                f"- **{finding['severity'].upper()} — {finding['code']}**: "
                f"{finding['observation']} Action: {finding['recommended_action']}"
            )
    else:
        lines.append("- No configured quality finding thresholds were crossed.")
    lines.extend(
        [
            "",
            "## Scientific claim boundary",
            "",
            f"- Observational: {report['claim_boundary']['observational']}",
            f"- Directly measured: {report['claim_boundary']['measured']}",
            f"- Human adjudication queue: {len(report['adjudication_queue'])} cases",
            "",
        ]
    )
    if report["adjudication_queue"]:
        lines.extend(["## Adjudication queue", ""])
        for item in report["adjudication_queue"][:10]:
            lines.append(
                f"- `{item['case_id']}` / `{item['candidate_id']}` — "
                f"Query: {item['query']} — Candidate: {item['summary']}"
            )
        lines.append("")
    if dataset["label_quality"].get("assistant-adjudicated-provisional", 0):
        lines.extend(
            [
                "The two semantic judgments are assistant-adjudicated and provisional. An operator should confirm or override them before they are called human ground truth.",
                "",
            ]
        )
    elif report["adjudication_queue"]:
        lines.extend(
            [
                "The next evidence upgrade is to review the adjudication queue and rerun with a human-label JSONL file.",
                "",
            ]
        )
    return "\n".join(lines)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate Jarvis EMR recall dynamics")
    parser.add_argument("--ledger", default="data/jarvis-store.json")
    parser.add_argument("--rag-log", default="data/amul-rag-log.jsonl")
    parser.add_argument("--dynamics", default="data/emr-dynamics.json")
    parser.add_argument("--human-labels")
    parser.add_argument("--k", type=int, default=DEFAULT_K)
    parser.add_argument("--max-cases", type=int, default=DEFAULT_MAX_CASES)
    parser.add_argument(
        "--contradiction-probes", type=int, default=DEFAULT_CONTRADICTION_PROBES
    )
    parser.add_argument(
        "--reinforcement-probes", type=int, default=DEFAULT_REINFORCEMENT_PROBES
    )
    parser.add_argument(
        "--reinforcement-uses", type=int, default=DEFAULT_REINFORCEMENT_USES
    )
    parser.add_argument("--json-out")
    parser.add_argument("--markdown-out")
    parser.add_argument("--fail-on-safety-regression", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = run_evaluation(
        ledger_path=args.ledger,
        rag_log_path=args.rag_log,
        dynamics_path=args.dynamics,
        human_labels_path=args.human_labels,
        k=args.k,
        max_cases=args.max_cases,
        contradiction_probes=args.contradiction_probes,
        reinforcement_probes=args.reinforcement_probes,
        reinforcement_uses=args.reinforcement_uses,
    )
    if args.json_out:
        output = Path(args.json_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.markdown_out:
        output = Path(args.markdown_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps(report, indent=2))
    if args.fail_on_safety_regression and report["safety_status"] != "pass":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
