# EMR Evaluation Protocol

**Status:** enforced harness; semantic-quality conclusions remain provisional
until human labels exist.  
**Implementation:** `app/emr_eval.py`  
**Schema:** `emr-evaluation-v1`

## Purpose

Measure four separate questions without allowing one result to conceal another:

1. Does EMR retrieve the expected memory content?
2. Does graph expansion add useful context or noise?
3. Does the contradiction membrane prevent silent co-admission?
4. Can reinforcement distort ranking or mutate truth?
5. Does the abstention gate decline unsupported or ambiguous recall?

The evaluator reads the real Continuity Ledger and optional historical RAG log.
It never writes the supplied ledger or EMR dynamics sidecar. Reinforcement
experiments use a temporary sidecar that is destroyed after the run.

## Evidence tiers

| Tier | Source | Claim strength |
|---|---|---|
| Human label | Operator-reviewed JSONL | Ground truth for the reviewed query |
| Historic system label | Latest `amul-rag-log.jsonl` outcome | Weak replay label; may preserve old retriever errors |
| Metadata/lineage proxy | One deterministic probe per real session | Weak label derived from exact content hashes and direct supersession |
| Controlled probe | Injected in-memory contradiction or reinforcement treatment | Ground truth for the tested safety invariant |

Reports always include label counts and mark recall precision, recall, MRR, and
graph noise as observational unless human labels were supplied.

## Retrieval metrics

- **Precision@k:** distinct expected content hashes retrieved in the first `k`,
  divided by `k`. Duplicate ledger rows do not count as extra correct answers.
- **Recall@k:** distinct expected content hashes retrieved, divided by expected
  content hashes.
- **MRR:** reciprocal rank of the first expected content hash.
- **Top-1 accuracy:** proportion of positive cases whose first result is expected.
- **Negative false-positive rate:** unsupported historical queries that still
  promote any memory above the evaluation threshold.
- **Abstention rate:** cases declined by the evidence-only floor/margin gate.
- **Correct negative abstention:** unsupported cases explicitly declined.

The benchmark runs each case with graph expansion off and on under the same
weights, decay state, threshold, and token budget.

## Graph measurements

- top-k additions relative to graph-off retrieval;
- weak-label relevance/noise rate for those additions;
- redundant-addition rate by exact content hash;
- change in relevant content-hash hits;
- path integrity for every boosted entry;
- mean and maximum graph boost.

Path integrity is directly measured. Every hop must correspond to an actual
`supersedes` edge, explicit memory evidence reference, shared subject, or shared
tag bond above the configured threshold.

## Contradiction protocol

For a real, subject-bearing memory, the harness creates an in-memory verified
record with the same subject and a different content hash. It runs two controls:

- `contradiction_policy=exclude`: both records must never enter STM together;
- `contradiction_policy=allow`: both should enter when budget and threshold permit.

The second control proves that a passing exclusion result came from the membrane,
not merely from an unreachable injected record.

## Reinforcement-bias protocol

Each probe starts from a fresh temporary dynamics overlay:

1. measure baseline ranks;
2. repeatedly reinforce an expected memory with unique positive outcome receipts
   and measure its rank change;
3. reset the overlay;
4. attempt to reinforce a non-relevant memory without a positive outcome and
   require every attempt to be rejected without state mutation;
5. measure rank gain, top-k promotion, top-1 flips, and activation multiplier;
6. verify separate caps, the combined `1.25x` influence cap, and byte-equivalent
   ledger models.

This measures retrievability bias. It does not treat successful reinforcement as
evidence that a claim is true.

## Safety gates

A run fails when any of these directly measured invariants fail:

- graph paths are structurally invalid;
- a controlled contradiction leaks through `exclude`;
- reinforcement exceeds configured caps;
- reinforcement without a positive outcome is accepted or mutates dynamics;
- reinforcement mutates ledger truth fields;
- the supplied ledger or live dynamics file changes during evaluation.

Weak-label precision and graph-noise observations are reported but do not fail
the safety gate. Thresholds for those metrics require a human-reviewed dataset.
The overall status becomes `pass_with_findings` when safety gates pass but the
configured quality checks detect unsupported-query promotion, high proxy graph
noise, reinforcement top-1 flips, or combined decay/salience amplification.

## Run

```bash
python -m app.emr_eval \
  --ledger data/jarvis-store.json \
  --rag-log data/amul-rag-log.jsonl \
  --dynamics data/emr-dynamics.json \
  --human-labels evaluation/emr-provisional-adjudication-2026-08-24.jsonl \
  --json-out emr-evaluation.json \
  --markdown-out emr-evaluation.md \
  --fail-on-safety-regression
```

Optional human labels use JSONL:

```json
{"case_id":"operator-001","query":"What governs EMR reinforcement?","relevant_ids":["mem-c5d758710221"],"expected_empty":false,"notes":"Reviewed by operator"}
```

Pass the file with `--human-labels labels.jsonl`. Human cases take precedence
over generated cases with the same query.

Rows may explicitly set `source` and `label_quality`. The checked-in two-case
adjudication uses `assistant-adjudicated-provisional`; it must not be described
as human ground truth until an operator confirms or overrides the judgments.

## Interpretation boundary

A green safety gate demonstrates bounded mechanics on the tested corpus. It does
not establish universal semantic correctness. “Memory science” becomes a strong
empirical claim only after repeated runs over stable human labels, held-out
queries, and tracked metric confidence intervals.
