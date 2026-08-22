# Pitch deck (text) — HoloRT4D Spatial Tokens

## Slide 1 — Title
**HoloRT4D Spatial Tokens**  
LLMs have a brain. Give them eyes.

## Slide 2 — Problem
Multimodal models see pixels and text.  
They do not get a compact, **replayable** spatial prior.  
Depth APIs are opaque; chat wrappers are not evidence.

## Slide 3 — Product
`HoloRT4D-Spatial-V1`: 16×16 grid of depth (0–255), curvature, normals (+ optional object / motion).  
Canonical JSON → SHA-256. Deterministic.

## Slide 4 — Truth model
**Enforced:** chamber / opticalLength / landmark-z → token.  
**Partial:** API stub, face labels, motion.  
**Declared:** `$1` billing, photo→metric depth without ML.

## Slide 5 — How it works
1. Depth field in  
2. Bin + gradients  
3. Hash out → LLM / planner / agent

## Slide 6 — Use cases
Interior · Robotics · Dermatology (assistive) · Fashion

## Slide 7 — Pricing (declared)
$1 / call documented stub · local CLI free for depth grids · no Stripe in scaffold

## Slide 8 — Why Mandala
Spatial tokens sit on HoloRT4D evidence — constitutional, replayable, not a vaporware vision wrapper.

## Slide 9 — Ask
Ship Spatial-V1 as the eyes layer for agents on Mandala depth.
