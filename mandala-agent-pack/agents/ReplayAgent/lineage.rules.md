# Lineage Rules

1. Every replay execution must produce a lineage record.
2. Lineage must include source evidence refs and target parameters.
3. Lineage must be deterministic and reproducible.
4. Evidence bundles must have id, worldId, timelineId fields.
5. Dual evidence required when `require[]` evidence IDs are present.
