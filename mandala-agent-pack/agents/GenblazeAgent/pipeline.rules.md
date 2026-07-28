# Pipeline Rules

1. Pipeline: Genblaze → NIM → SceneSpec → CharacterSpec → RT4D
2. Genblaze is assist-only — never authoritative for print.
3. Determinism boundaries must be preserved across all pipeline stages.
4. Evidence chain must propagate through the entire pipeline.
5. SceneSpec generation from natural language must validate output against schema.
