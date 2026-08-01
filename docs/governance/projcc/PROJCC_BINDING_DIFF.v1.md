# ProjCC Binding Diff (v1)

| Field | Value |
| --- | --- |
| Status | **declared** governance declaration — not a live JSON patch |
| Note | No `projcc/projection.contract.json` SoT file exists in-repo; this documents the binding ProjCC must adopt |

This diff describes the constitutional changes required for ProjCC to formally bind the Anime-Structure Plate Projector Lane.

```diff
--- a/projcc/projection.contract.json
+++ b/projcc/projection.contract.json
+  "projection_lanes": {
+    "anime-structure": {
+      "method": "projector4d-sot",
+      "reference_model": "(x',y',z') = (d4/(d4+w)) * (x,y,z)",
+      "provenance": "StructurePlateProjectionProvenance.v1.schema.json",
+      "replay": "deterministic",
+      "promotion_status": "declared"
+    },
+    "literal-xyz": {
+      "method": "drop_w",
+      "reference_model": "(x',y',z') = (x,y,z)",
+      "provenance": "StructurePlateProjectionProvenance.v1.schema.json",
+      "replay": "deterministic",
+      "promotion_status": "baseline"
+    }
+  }
+  "promotion_gate": {
+    "pole_stress_thresholds": "required",
+    "ink_cel_evidence": "required",
+    "ci_provenance_validator": "required",
+    "shading_space_alignment": "required",
+    "constitutional_review": "required"
+  }
```

This is a governance-level declaration of what ProjCC must adopt — **not** an enforced runtime edit.
