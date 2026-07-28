# CKL Rules

1. `recordPrecedent` stores verdicts as strings (`"deny"`, `"allow"`).
2. `resolveDecision` precedents filter: `p.decision === false || p.decision === "deny"`.
3. `recentDenials >= 2` AND truthy `intent.params` triggers precedent drift.
4. `loadDefault()` must resolve from `import.meta.url`, not a bare relative path.
5. `evalModifier()` must return `env.self ?? 1` on unparseable input.
6. 7 policies from `default.policies.json` must be loaded.
