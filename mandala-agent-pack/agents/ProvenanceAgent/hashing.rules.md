# Hashing Rules

1. Evidence hashes must be deterministic for identical inputs.
2. Hash must cover all evidence fields: intentId, timelineId, worldId, timeSeconds.
3. Hash collisions must be practically impossible (SHA-256 or equivalent).
4. Hash must change when any evidence field changes.
