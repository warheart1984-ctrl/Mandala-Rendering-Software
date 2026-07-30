# CKO-0001 Script Outline — LLM Evaluation Basics

**Status:** ready-for-script (draft content)  
**Source CKO:** `knowledge/objects/CKO-0001.yaml`  
**Series:** Research Decoded · ~12 minutes

## Hook (0:00–0:20)

Everyone says their model is better—how do we actually know?

## 1. Context — Why evaluation matters (0:20–2:00)

- Product and research decisions hang on evaluation claims.
- “SOTA” without a measurement story is marketing, not evidence.
- Goal for viewers: leave with a sharper question, not a single magic metric.

## 2. Methods — Common approaches (2:00–6:00)

### Intrinsic

- Benchmarks and held-out task accuracy
- Preference judgments / pairwise wins
- Automated metrics (useful, limited)

### Extrinsic

- Downstream job success (tickets, edits, time saved)
- Human-in-the-loop outcomes

**Key contrast:** intrinsic screens cheaply; extrinsic answers “does it help the job?”

## 3. Limits — Where evaluations fail (6:00–9:00)

- Contamination and data leakage
- Benchmark saturation / gaming
- Wrong proxy for the real user job
- Demo fluency ≠ domain reliability

## 4. Practice — Real projects (9:00–11:00)

Checklist:

1. What decision will this evaluation change?
2. What failure would be unacceptable?
3. What cheap intrinsic screen can we run first?
4. What small extrinsic test proves the job?

## Takeaway + CTA (11:00–12:00)

Evaluation is a design choice—measure what the decision needs.  
CTA: subscribe; comment with your stuck evaluation question.
