# 02 — Builder scaffold manifest

**Trail:** `sovereign-x-gpu-assist-2026-07`  
**Role:** Builder (+ Blueprint / Protocol)  
**Date:** 2026-07-28  
**Status:** **skeleton** → handed to Implementor

## Scaffold created

| Path | Kind | Notes |
|------|------|-------|
| `src/GpuDispatchContract.js` | module stub→impl | validate + resolveAssistBinding |
| `src/GpuAssistModule.js` | module stub→impl | three route exports |
| `src/lookdev/SovereignLookDevEngine.js` | skeleton | planLookDevPipeline |
| `test/gpu-assist.test.js` | tests | contract + assist + lookdev |
| registry JSON | schema 1.1.0 | aliases + canonicalCapabilityClasses |
| charter + lookdev spec | docs | declared |

## Non-goals (Builder)

- No vendor SDK installs
- No printer path edits
- No protected constitutional path edits

## Handoff to Implementor

Fill validation rules, cascade, provenance flags, alias resolution, and make
tests green.
